import * as replicad from "replicad";
import { BooleanOpCache } from "./booleanOpCache";
import { AbundanceBounds, boundsOverlap } from "./util";
import type { ReplicadObject, RequestContext } from "./geometryProvider";

/**
 * Layered prefilter for boolean operations.
 * Boolean operations between breps take time. This class is responsible
 * for doing prefiltering to avoid performing unnecessary boolean
 * operations inside of geometryProvider.
 *
 * To do this BooleanOpPrefilter stores information about shapes in
 * each active project and surfaces some key output for clients.
 *
 * fastDisjointCheck(shapeId1, shapeId2, context) - return true
 *   if these shapes are known to be disjoint.
 * fastOcclusionCheck(occludedId, containerId, context) - return
 *   true if containerId is known to fully occlude occludedId.
 *
 * registerShape(shapeId, shapeInstance, context)
 *   record information about an instantiated shape so it can be
 *   checked later.
 *
 * Bounding boxes and manifold meshes are memoized per (project, shapeId) the
 * first time a shape is seen via `registerShape`. If a shape hasn't been
 * registered yet, the corresponding check is simply skipped (fails open) -
 * geometryProvider is expected to call `registerShape` once it has
 * deserialized/produced the shape in question, so the next check can use it.
 */
class BooleanOpPrefilter {
  // Coarse tolerance used for the prefilter's memoized manifold meshes. This
  // is intentionally loose (fast to compute) since these meshes are only
  // used to answer yes/no disjointness questions, not for precision geometry.
  private static MESH_TOLERANCE = 0.01;

  private booleanOpCache = new BooleanOpCache();
  private boundingBoxes: Map<string, Map<string, AbundanceBounds>> = new Map();
  private manifoldMeshes: Map<string, Map<string, replicad.MeshShape>> =
    new Map();

  private _toAbundanceBounds(shape: replicad.Shape3D): AbundanceBounds {
    const bounds = shape.boundingBox.bounds;
    return {
      min: bounds[0] as [number, number, number],
      max: bounds[1] as [number, number, number],
    };
  }

  // Mirrors GeometryProvider.isShape3D. Kept local (rather than
  // `replicad.isShape3D`, which is typed to take `AnyShape`) since
  // `ReplicadObject` also includes Drawing/Wire/Vertex/Face.
  private _isShape3D(obj: ReplicadObject): obj is replicad.Shape3D {
    return (
      obj instanceof replicad.CompSolid ||
      obj instanceof replicad.Solid ||
      obj instanceof replicad.Shell ||
      obj instanceof replicad.Compound
    );
  }

  /** True if `a` and `b` are known (or newly provable) to be disjoint. */
  fastDisjointCheck(
    shapeId1: string,
    shapeId2: string,
    context: RequestContext,
  ): boolean {
    const start = performance.now();
    if (this.booleanOpCache.isDisjoint(shapeId1, shapeId2, context.project)) {
      console.warn(
        `[prefilter] noop cache disjoint hit. ${performance.now() - start}`,
      );
      return true;
    }

    const boxes = this.boundingBoxes.get(context.project);
    const box1 = boxes?.get(shapeId1);
    const box2 = boxes?.get(shapeId2);
    if (box1 && box2 && !boundsOverlap(box1, box2)) {
      this.registerDisjoint(shapeId1, shapeId2, context);
      console.warn(`[prefilter] bbox disjoint. ${performance.now() - start}`);
      return true;
    }

    const meshes = this.manifoldMeshes.get(context.project);
    const mesh1 = meshes?.get(shapeId1);
    const mesh2 = meshes?.get(shapeId2);
    if (mesh1 && mesh2 && mesh1.intersect(mesh2).isEmpty) {
      this.registerDisjoint(shapeId1, shapeId2, context);
      console.warn(`[prefilter] mesh disjoint. ${performance.now() - start}`);
      return true;
    }
    console.warn(
      `[prefilter] not disjoint. in memcache? ${mesh1 != undefined && mesh2 != undefined}. took: ${performance.now() - start}`,
    );
    return false;
  }

  /** True if `containerId` is known to fully occlude `occludedId`. */
  fastOcclusionCheck(
    occludedId: string,
    containerId: string,
    context: RequestContext,
  ): boolean {
    // TODO(tristan): we can potentially check this with meshes but unclear
    // if it's worthwhile.
    return this.booleanOpCache.isOccluded(
      occludedId,
      containerId,
      context.project,
    );
  }

  /**
   * Records information (bounding box + manifold mesh) about an instantiated
   * shape so later `fastDisjointCheck` calls involving it can short-circuit
   * without needing to deserialize/recompute it. Cheap to call repeatedly -
   * a no-op for a shape id already registered for this project. Non-3D
   * geometries (drawings, wires, vertices, faces) are ignored since bounding
   * boxes/manifold meshes only apply to Shape3D.
   */
  registerShape(
    shapeId: string,
    shapeInstance: ReplicadObject,
    context: RequestContext,
  ): void {
    const start = performance.now();
    // Ensure this project's persisted disjoint/occlusion pairs are loading;
    // registerShape runs early and often, so this is a cheap insurance kick.
    this.booleanOpCache.loadProject(context.project);

    if (!this._isShape3D(shapeInstance)) {
      return;
    }

    let boxes = this.boundingBoxes.get(context.project);
    if (!boxes) {
      boxes = new Map();
      this.boundingBoxes.set(context.project, boxes);
    }
    if (!boxes.has(shapeId)) {
      boxes.set(shapeId, this._toAbundanceBounds(shapeInstance));
    }

    let meshes = this.manifoldMeshes.get(context.project);
    if (!meshes) {
      meshes = new Map();
      this.manifoldMeshes.set(context.project, meshes);
    }
    if (!meshes.has(shapeId)) {
      try {
        meshes.set(
          shapeId,
          shapeInstance.meshShape({
            tolerance: BooleanOpPrefilter.MESH_TOLERANCE,
          }),
        );
      } catch (error) {
        console.error(
          "Tried and failed to generate manifold for shape: ",
          replicad.shapeType(shapeInstance.wrapped),
        );
      }
      console.warn(
        `[prefilter] register shape took ${performance.now() - start}`,
      );
    }
  }

  /** Records that `a` and `b` are disjoint (commutative). */
  registerDisjoint(
    shapeId1: string,
    shapeId2: string,
    context: RequestContext,
  ): void {
    this.booleanOpCache.recordDisjoint(shapeId1, shapeId2, context.project);
  }

  /** Records that `containerId` fully occludes `occludedId` (directional). */
  registerOccluded(
    occludedId: string,
    containerId: string,
    context: RequestContext,
  ): void {
    this.booleanOpCache.recordOcclusion(
      occludedId,
      containerId,
      context.project,
    );
  }

  /** Starts (without awaiting) loading a project's persisted pairs. */
  loadProject(projectId: string): void {
    this.booleanOpCache.loadProject(projectId);
  }

  /** Drops all in-memory state (bounding boxes, meshes, pairs) for a project. */
  dropProject(projectId: string): void {
    this.boundingBoxes.delete(projectId);
    this.manifoldMeshes.delete(projectId);
    this.booleanOpCache.forgetProject(projectId);
  }

  /**
   * Prunes memoized bounding boxes/meshes and cached pairs referencing ids
   * not in `idsToRetain`. Returns the number of pruned disjoint/occlusion
   * pairs (bounding box/mesh entries are cheap to just recompute, so their
   * count isn't included).
   */
  async sweep(
    idsToRetain: Set<string>,
    context: RequestContext,
  ): Promise<number> {
    const boxes = this.boundingBoxes.get(context.project);
    if (boxes) {
      for (const shapeId of boxes.keys()) {
        if (!idsToRetain.has(shapeId)) {
          boxes.delete(shapeId);
        }
      }
    }
    const meshes = this.manifoldMeshes.get(context.project);
    if (meshes) {
      for (const shapeId of meshes.keys()) {
        if (!idsToRetain.has(shapeId)) {
          meshes.delete(shapeId);
        }
      }
    }
    return await this.booleanOpCache.sweep(idsToRetain, context.project);
  }
}

export { BooleanOpPrefilter };
