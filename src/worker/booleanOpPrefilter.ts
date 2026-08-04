import { Manifold } from "manifold-3d/manifold.js";
import { BooleanOpCache } from "./booleanOpCache";
import { getPairCache, putPairCache } from "./indexeddbUtils";
import { AbundanceBounds } from "./util";
import { RequestContext } from "./geometryProvider";
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
 * fastOcclusionCheck(smallShapeId, bigShapeId, context) - return
 *   true if bigShape is known to fully occlude smallShape.
 *
 * registerShape(shapeId, shapeInstance)
 *   record information about an instantiated shape so it can be
 *   checked later.
 *
 * Impl notes:
 * to determine the relationship between shapes this class considers
 * the following criteria in order:
 *   - present in booleanOpCache - a cached result from earlier checks
 *   - bounding box overlap (disjoint only) - check of simple bounding boxes overlap
 *   - manifold mesh overlap - check if a meshed version of these shapes have overlap
 */
class BooleanOpPrefilter {
  private BooleanOpCache = new BooleanOpCache();
  private boundingBoxes: Map<string, Map<string, AbundanceBounds>> = new Map();
  private manifoldBoundary: Map<string, Map<string, Manifold>> = new Map();

  fastDisjointCheck(
    shapeId1: string,
    shapeId2: string,
    context: RequestContext,
  ): boolean {
    // todo
  }

  fastOcclusionCheck(
    shapeId1: string,
    shapeId2: string,
    context: RequestContext,
  ): boolean {
    // todo
  }

  registerShape(
    shapeId1: string,
    shapeInstance: replicad.Shape3D,
    context: RequestContext,
  ): void {}

  registerDisjoint(
    shapeId1: string,
    shapeId2: string,
    context: RequestContext,
  ): void {}

  registerOccluded(
    shapeId1: string,
    shapeId2: string,
    context: RequestContext,
  ): void {}

  dropProject(context: RequestContext) {}

  async sweep(idsToKeep: string[], context: RequestContext) {}
}

export { BooleanOpPrefilter };
