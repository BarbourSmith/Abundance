import * as replicad from "replicad";
import shrinkWrap from "replicad-shrink-wrap";
import { getReplicadLiveCounts } from "./replicadInstrument";
import {
  AbundanceObject,
  asReplicadPlane,
  flattenAssembly,
  hashStringWide,
  hashString,
  SimplePlane,
} from "./util";
import {
  getShape,
  putShape,
  deleteProjectCache,
  shapeExists,
  getAllProjectIds,
  StoredGeometryRecord,
  filter,
} from "./indexeddbUtils";
import { reportBooleanInflight } from "./progress";
import { BooleanOpCache } from "./booleanOpCache";

type ReplicadObject =
  | replicad.Shape3D
  | replicad.Drawing
  | replicad.Wire
  | replicad.Vertex
  | replicad.Face;

type RequestContext = {
  project: string;
  operationId?: string;
  persistIntermediates?: boolean;
  [key: string]: any; // Allows for additional props
};

/**
 * Possible outcome types of a boolean operation. No-op implies the
 * input is == to the output. EmptyShape implies the output is an
 * empty shape, eg intersection of disjoint shapes. NewShape is
 * the typical case where the operation produces a non-empty shape
 * distinct from it's inputs.
 */
enum BooleanOutcome {
  EmptyShape,
  InputShape,
  NewShape,
}

type BooleanResult = {
  outcome: BooleanOutcome;
  inputIndexAsResult?: number; // if outcome is InputShape, which input shape is it.
  resultId: string; // id string of the result
};

/**
 * Manages a cache of geometries. This class provides a list of basic operations
 * that produce new geometries. Calling for a geometry which has already been
 * produced (ie: same operation with same arguments) will result in a cache hit
 * and the cached geometry will be returned instead of re-computing it.
 *
 * Each operation here returns an ID which can be used to perform further operations,
 * or retrieve the geometry via `get(id)`.
 */
class GeometryProvider {
  public EMPTY_SHAPE_SENTINEL = "emptyshape";
  // Ids longer than this are collapsed to a fixed-length digest in `_makeId`.
  // Keeps typical ids human-readable while bounding pathological nested-boolean
  // recipes (observed at 65-78KB) that otherwise dominate large assemblies.
  private static MAX_ID_LENGTH = 512;
  // tolerance under which a boolean result is considered to be equivalent to
  // an input. Ie, indicator of a boolean no-op.
  private static BOOLEAN_TOLERANCE = 1e-5;

  // Set of `toCut\u0000cutter` keys for boolean cuts that previously hung the
  // worker (>watchdog). `recursiveCut` consults `isBadCut` and, rather than
  // re-running a cut that will hang again, surfaces the two failing parts in red.
  // Seeded from the main thread via `setBadCuts` on every (re)start.
  private badCuts: Set<string> = new Set();
  private MAX_PROJECTS = 4;
  private projectLRU: string[] = [];
  private cacheHitMetrics: Record<string, [number, number, number]>; // hits, misses, total-miss-duration-ms
  private warmCache: Map<string, Map<string, ReplicadObject>> = new Map();

  // Persistent (per-project) cache of shape-id pairs with known special
  // boolean outcomes (disjoint / occlusion). Since such outcomes don't create
  // a new shape in the cache they get special handling here to avoid eternally
  // recomputing booleans with no-op outcomes.
  private booleanOpCache: BooleanOpCache = new BooleanOpCache();

  // Tracks batch operations that are currently running so that concurrent
  // requests for an identical batch (same content-hashed id) share the first
  // one's result instead of racing and throwing "already exists".
  private inFlightBatches: Map<
    string,
    { promise: Promise<void>; resolve: () => void }
  > = new Map();
  private batchMetrics: [number, number] = [0, 0];

  constructor(logMetrics: boolean = true) {
    this.cacheHitMetrics = {};

    if (logMetrics) {
      setInterval(() => {
        console.warn("[GeometryProvider] cache metrics:", this.cacheHitMetrics);
        console.warn(
          "[GeometryProvider] replicad live shapes:",
          getReplicadLiveCounts(),
        );
      }, 10000);
    }
  }
  private cacheHit(id: string): void {
    const type = id.split(/[-#]/)[0];
    if (!this.cacheHitMetrics[type]) {
      this.cacheHitMetrics[type] = [0, 0, 0];
    }
    this.cacheHitMetrics[type][0]++;
  }

  private cacheMiss(id: string, durationMs: number = 0): void {
    const type = id.split(/[-#]/)[0];
    if (!this.cacheHitMetrics[type]) {
      this.cacheHitMetrics[type] = [0, 0, 0];
    }
    this.cacheHitMetrics[type][1]++;
    this.cacheHitMetrics[type][2] += durationMs;
  }

  private _badCutKey(toCut: string, cutter: string): string {
    return toCut + "\u0000" + cutter;
  }

  /**
   * Replace the set of known-hanging boolean cuts. Called from the main thread
   * (CadWorkerManager) on every worker (re)start with the cuts that previously
   * timed out, so this fresh worker skips them instead of hanging again.
   */
  setBadCuts(pairs: Array<{ toCut: string; cutter: string }>): void {
    this.badCuts = new Set(
      (pairs || []).map((p) => this._badCutKey(p.toCut, p.cutter)),
    );
  }

  /** True if cutting `toCut` by `cutter` previously hung the worker. */
  isBadCut(toCut: string, cutter: string): boolean {
    return this.badCuts.has(this._badCutKey(toCut, cutter));
  }

  private updateLRU(projectId: string) {
    const idx = this.projectLRU.indexOf(projectId);
    const newProject = idx === -1;
    if (!newProject) {
      this.projectLRU.splice(idx, 1);
    }
    this.projectLRU.push(projectId);
    if (newProject) {
      this.booleanOpCache.loadProject(projectId);
      if (this.projectLRU.length > this.MAX_PROJECTS) {
        this.projectLRU.shift();
      }
      // We specifically don't await this async task since cleanup
      // of old projects can happen slowly in the back ground and
      // doesn't need to block other cache operations.
      void this.evictProjectsBesides(new Set(this.projectLRU));
    }
  }

  private evictProjectsBesides(projectIds: Set<string>) {
    return getAllProjectIds()
      .then(async (allIds) => {
        if (allIds.size <= this.MAX_PROJECTS) {
          return;
        }
        const evictIds = Array.from(allIds).filter((id) => !projectIds.has(id));
        for (const evictId of evictIds) {
          await deleteProjectCache(evictId);
          this.booleanOpCache.forgetProject(evictId);
        }
      })
      .catch((error) => {
        console.error("Evict projects failed.");
        console.error(error);
      });
  }

  /**
   * An alternative to createIfAbsent which allows for the case where
   * this operation is a no-op and in fact doesn't need to put a
   * new entry into the cache. Generally should be used for boolean
   * operations.
   *
   * @param resultId
   * @param args
   * @param context
   * @param operation
   * @returns
   */
  private async maybeOp(
    resultId: string,
    args: string[],
    context: RequestContext,
    operation: (
      inputs: replicad.Shape3D[] | replicad.Drawing[],
    ) => replicad.Shape3D | replicad.Drawing,
  ): Promise<BooleanResult> {
    // check shape cache
    if (
      this.getFromWarmCache(resultId, context) ||
      (await shapeExists(context.project, resultId))
    ) {
      this.cacheHit(resultId);
      return { outcome: BooleanOutcome.NewShape, resultId: resultId };
    }

    // Start actual computation of the op. No cache had the result ready for us.
    const start = performance.now();
    console.warn(
      `[boolean] ${resultId.split("-")[0]} starting for ${resultId}`,
    );
    // deserialize args
    const geoms = await Promise.all(
      args.map((shapeid) => this.get(shapeid, context)),
    );
    console.warn(
      `[boolean] ${resultId.split("-")[0]} deserialize finished at ${performance.now() - start}`,
    );

    // case 2D
    if (this.areAllDrawings(geoms)) {
      // Skip all no-op style optimizations here. Boolean operations on drawings are faster and
      // drawings are smaller in the cache so the more complicated logic we use for 3d operations
      // isn't worthwhile.
      const result = operation(geoms);
      await putShape(context.project, resultId, result.serialize());
      this.cacheMiss(resultId, start - performance.now());
      console.warn(
        `[boolean] ${resultId.split("-")[0]} drawings. done at ${performance.now() - start}`,
      );
      return { outcome: BooleanOutcome.NewShape, resultId: resultId };
    }

    // case 3D
    if (this.areAll3DShapes(geoms)) {
      const volumes = geoms.map(replicad.measureVolume);
      console.warn(
        `[boolean] ${resultId.split("-")[0]} arg volumes measured at: ${performance.now() - start}`,
      );
      const result = this.as3dShapeOrThrow(
        operation(geoms) as replicad.AnyShape,
      );
      console.warn(
        `[boolean] ${resultId.split("-")[0]} operation finished at: ${performance.now() - start}`,
      );

      // use volume measurements to identify possible no-op conditions.
      const resVol = replicad.measureVolume(result);
      let toReturn = undefined;
      if (resVol < GeometryProvider.BOOLEAN_TOLERANCE) {
        toReturn = {
          outcome: BooleanOutcome.EmptyShape,
          resultId: this.EMPTY_SHAPE_SENTINEL,
        };
      } else {
        const volumeMatchIndex = volumes.findIndex(
          (inputVol) =>
            Math.abs(resVol - inputVol) < GeometryProvider.BOOLEAN_TOLERANCE,
        );
        if (volumeMatchIndex >= 0) {
          toReturn = {
            outcome: BooleanOutcome.InputShape,
            inputIndexAsResult: volumeMatchIndex,
            resultId: args[volumeMatchIndex],
          };
        } else {
          await putShape(context.project, resultId, result.serialize());
          console.warn(
            `[boolean] ${resultId.split("-")[0]} new shape serialized at: ${performance.now() - start}`,
          );
          toReturn = {
            outcome: BooleanOutcome.NewShape,
            resultId: resultId,
          };
        }
      }
      this.cacheMiss(resultId, performance.now() - start);
      console.warn(
        `[boolean] ${resultId.split("-")[0]} outcome: ${BooleanOutcome[toReturn.outcome]}. done at: ${performance.now() - start}`,
      );

      return toReturn;
    }

    // no mix matching for boolean operations
    throw new Error("Boolean args were not all 2D nor all 3D");
  }

  // Returns the id of the geometry once it's been added to the cache.
  // Or undefined if builder results in an empty object.
  private async createIfAbsent(
    id: string,
    context: RequestContext,
    builder: () => Promise<ReplicadObject | undefined>,
  ): Promise<string | undefined> {
    this.updateLRU(context.project);
    if (
      this.getFromWarmCache(id, context) ||
      (await shapeExists(context.project, id))
    ) {
      this.cacheHit(id);
    } else {
      const start = performance.now();
      // Begin-marker for a single-shape op (rotate/move/fuse/extrude/fillet/
      // shrinkWrap/...). Mirrors booleanOperation's markers so that a single
      // synchronous OCCT primitive that blocks the worker >90s is identifiable
      // as the last "[op] ... starting" line before the inactivity watchdog
      // fires. `id` encodes the op type + input ids.
      console.warn(`[op] ${id} starting`);
      let geometry: ReplicadObject | undefined;
      try {
        geometry = await builder();
      } catch (err) {
        const e = err as any;
        console.warn(
          `[op] ${id} threw: ${e?.name || "Error"}: ${e?.message ?? String(e)}`,
        );
        throw err;
      }
      if (geometry === undefined) {
        // builder produced nonexistent geometry (eg: intersect of nonoverlapping shapes)
        return undefined;
      }
      const builderMs = Math.round(performance.now() - start);
      if (builderMs > 1000) {
        console.warn(`[op] ${id} builder took ${builderMs}ms`);
      }
      if (context.operationId) {
        this.putInWarmCache(id, context.operationId, geometry);
        if (context.persistIntermediates) {
          await putShape(context.project, id, geometry.serialize());
        }
      } else {
        const serializeStart = performance.now();
        await putShape(context.project, id, geometry.serialize());
        const serializeMs = Math.round(performance.now() - serializeStart);
        if (serializeMs > 1000) {
          console.warn(`[op] ${id} serialize+persist took ${serializeMs}ms`);
        }
      }
      const duration = performance.now() - start;
      this.cacheMiss(id, duration);
    }
    return id;
  }

  private getFromWarmCache(
    id: string,
    context: RequestContext,
  ): ReplicadObject | undefined {
    if (!context.operationId) {
      return undefined;
    }
    const operationCache = this.warmCache.get(context.operationId);
    if (!operationCache) {
      console.error("No warm cache for operation " + context.operationId);
      throw new Error("No warm cache for operation " + context.operationId);
    }
    const result = operationCache.get(id);
    if (result) {
      this.batchMetrics[0]++;
    } else {
      this.batchMetrics[1]++;
    }
    return result?.clone();
  }

  private putInWarmCache(
    id: string,
    operationId: string,
    geometry: ReplicadObject,
  ) {
    const operationCache = this.warmCache.get(operationId);
    if (!operationCache) {
      throw new Error("No warm cache for operation " + operationId);
    }
    operationCache.set(id, geometry);
  }

  /**
   * Retrieves a real geometry from the cache. This should only be used when
   * the caller needs to perform operations which aren't supported by this class,
   * or wants to perform a series of operations whose intervening values won't
   * be cached (this is atypical).
   *
   * @param id - ID of the geometry to retrieve
   * @returns The geometry object itself (ie ReplicadObject)
   */
  async get(id: string, context: RequestContext): Promise<ReplicadObject> {
    if (id === this.EMPTY_SHAPE_SENTINEL) {
      console.warn("Attempting to retrieve empty sentinel from the cache");
      return replicad.makeCompound([]) as replicad.Shape3D;
    }
    const warmCached = this.getFromWarmCache(id, context);
    if (warmCached) {
      this.cacheHit("deserialize");
      return Promise.resolve(warmCached);
    }

    // else use disk cache.

    const shape = await getShape(context.project, id);
    if (shape == undefined) {
      console.trace("Cache miss for id:", id);
      throw new Error(
        `Geometry with ID ${id} not found in cache, context: ${JSON.stringify(
          context,
        )}`,
      );
    }
    let result = undefined;
    try {
      result = replicad.deserializeDrawing(shape.serialized);
      this.cacheMiss("deserialize");
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (e) {
      // Not a Drawing, try Shape3D
      try {
        result = replicad.deserializeShape(shape.serialized) as ReplicadObject;
        this.cacheMiss("deserialize");
      } catch (e2) {
        throw new Error("Failed to deserialize geometry: " + e2);
      }
    }

    if (context.operationId) {
      // stash in warm cache to avoid repeated deserialization
      this.putInWarmCache(id, context.operationId, result);
    }
    return Promise.resolve(result);
  }

  async clearCache(context: RequestContext): Promise<boolean> {
    this.projectLRU = this.projectLRU.filter((id) => id !== context.project);
    await deleteProjectCache(context.project);
    this.booleanOpCache.forgetProject(context.project);
    return true;
  }

  /**
   * In the given context, removes all saved geometries except those which are
   * in the provided set of IDs to retain.
   */
  async sweepCache(
    idsToRetain: Set<string>,
    context: RequestContext,
  ): Promise<number> {
    // Step 1: filter geometries based on key since that's a much faster approach
    // and we don't need access to the geom values.
    const deletedGeoms = await filter(
      context.project,
      "ReplicadObject",
      (shapeKey: string) => {
        return idsToRetain.has(shapeKey);
      },
    );

    // Step 2: filter AbundanceObjects based on whether all their geometries
    // are in the idsToRetain set, here we need access to their values.
    const deletedAssemblies = await filter(
      context.project,
      "AbundanceObject",
      (shapeKey: string, value?: StoredGeometryRecord) => {
        if (value) {
          try {
            const assembly: AbundanceObject = JSON.parse(value.serialized);
            for (const leaf of flattenAssembly(assembly)) {
              if (!idsToRetain.has(leaf.geometry)) {
                return false;
              }
            }
          } catch (e) {
            console.error(
              "Failed to parse AbundanceObject. Deleting from cache: ",
              e,
            );
            return false; // delete malformed assemblies
          }
          return true;
        }
        console.warn("Received no value for AbundanceObject:", shapeKey);
        return false;
      },
      true,
    );

    const prunedPairs = await this.booleanOpCache.sweep(
      idsToRetain,
      context.project,
    );
    if (prunedPairs > 0) {
      console.warn(
        `[GeometryProvider] sweepCache pruned ${prunedPairs} stale disjoint/occlusion pairs for project ${context.project}`,
      );
    }

    return deletedGeoms + deletedAssemblies;
  }

  /**
   * Draws a rectangle with the given dimensions.
   * @param x - The width of the rectangle
   * @param y - The height of the rectangle
   * @returns The ID of the created rectangle
   */
  async drawRectangle(
    x: number,
    y: number,
    context: RequestContext,
  ): Promise<string> {
    const id = this._makeId("rectangle", x, y);
    await this.createIfAbsent(id, context, () => {
      return Promise.resolve(replicad.drawRectangle(x, y));
    });
    return id;
  }

  async drawCircle(radius: number, context: RequestContext): Promise<string> {
    const id = this._makeId("circle", radius);
    await this.createIfAbsent(id, context, () => {
      return Promise.resolve(replicad.drawCircle(radius));
    });
    return id;
  }

  async drawVertex(
    x: number,
    y: number,
    z: number,
    context: RequestContext,
  ): Promise<string> {
    const id = this._makeId("vertex", x, y, z);
    await this.createIfAbsent(id, context, () => {
      return Promise.resolve(replicad.makeVertex([x, y, z]));
    });
    return id;
  }

  async drawPolysides(
    radius: number,
    numberOfSides: number,
    context: RequestContext,
  ): Promise<string> {
    const id = this._makeId("polysides", radius, numberOfSides);
    await this.createIfAbsent(id, context, () => {
      return Promise.resolve(replicad.drawPolysides(radius, numberOfSides));
    });
    return id;
  }

  async drawText(
    text: string,
    options: any,
    context: RequestContext,
  ): Promise<string> {
    const id = this._makeId("text", text, options);
    await this.createIfAbsent(id, context, async () => {
      return Promise.resolve(replicad.drawText(text, options));
    });
    return id;
  }

  async expandCompoundShape(
    id: string,
    context: RequestContext,
  ): Promise<string[]> {
    if (id === this.EMPTY_SHAPE_SENTINEL) {
      return [this.EMPTY_SHAPE_SENTINEL];
    }
    const compound = await this.get(id, context);
    if (!(compound instanceof replicad.Compound)) {
      return [id];
    }
    const ids = [];
    for (const solid of replicad.iterTopo(compound.wrapped, "solid")) {
      const partId = this._makeId("expand", ids.length, id);
      await this.createIfAbsent(partId, context, async () => {
        return this.as3dShapeOrThrow(new replicad.Solid(solid));
      });
      ids.push(partId);
    }
    return ids;
  }

  /**
   * Extrudes a 2D shape into a 3D volume.
   * @param inputId - The ID of the 2D geometry to extrude
   * @param plane - The plane to sketch the shape on
   * @param height - The height of the extrusion
   * @returns The ID of the created extruded geometry
   */
  async extrude(
    inputId: string,
    plane: SimplePlane,
    height: number,
    context: RequestContext,
  ): Promise<string> {
    const extrudedId = this._makeId("extrude", inputId, plane, height);
    await this.createIfAbsent(extrudedId, context, async () => {
      const geometry = (await this.get(inputId, context)) as replicad.Drawing;
      const result = geometry
        .sketchOnPlane(asReplicadPlane(plane))
        .extrude(height);
      if (!replicad.isShape3D(result)) {
        throw new Error("Extrusion did not produce a Shape3D");
      }
      return result;
    });
    return extrudedId;
  }

  /**
   * Extrudes a 2D shape into a 3D volume.
   * @param inputId - The ID of the 2D geometry to extrude
   * @param plane - The plane to sketch the shape on
   * @param height - The height of the extrusion
   * @returns The ID of the created extruded geometry
   */
  async extrudeFace(
    inputId: string,
    height: number,
    context: RequestContext,
  ): Promise<string> {
    const extrudedId = this._makeId("extrudeFace", inputId, height);
    await this.createIfAbsent(extrudedId, context, async () => {
      const geometry = (await this.get(inputId, context)) as replicad.Face;
      const midpoint = [
        geometry.UVBounds.uMin + geometry.UVBounds.uMax,
        geometry.UVBounds.vMin + geometry.UVBounds.vMax,
      ].map((v) => v / 2) as [number, number];
      const extVec = geometry.normalAt(midpoint).normalize().multiply(height);
      const result = replicad.basicFaceExtrusion(geometry, extVec);
      if (!replicad.isShape3D(result)) {
        throw new Error("Face Extrude did not produce a Shape3D");
      }
      return result;
    });
    return extrudedId;
  }

  async move(
    id: string,
    dx: number,
    dy: number,
    dz: number,
    context: RequestContext,
  ): Promise<string> {
    if (id === this.EMPTY_SHAPE_SENTINEL) {
      return this.EMPTY_SHAPE_SENTINEL;
    }
    const movedId = this._makeId("move", id, dx, dy, dz);
    await this.createIfAbsent(movedId, context, async () => {
      const geometry = await this.get(id, context);
      return geometry.translate(dx, dy, dz);
    });
    return movedId;
  }

  async rotate(
    id: string,
    x: number,
    y: number,
    z: number,
    context: RequestContext,
  ): Promise<string> {
    if (id === this.EMPTY_SHAPE_SENTINEL) {
      return this.EMPTY_SHAPE_SENTINEL;
    }
    const rotateId = this._makeId("rotate", id, x, y, z);
    await this.createIfAbsent(rotateId, context, async () => {
      const geometry = await this.get(id, context);
      if (geometry instanceof replicad.Drawing) {
        return geometry.rotate(z, [0, 0]);
      } else {
        return geometry
          .rotate(x, [0, 0, 0], [1, 0, 0])
          .rotate(y, [0, 0, 0], [0, 1, 0])
          .rotate(z, [0, 0, 0], [0, 0, 1]);
      }
    });
    return rotateId;
  }

  async scale(
    id: string,
    scaleFactor: number,
    context: RequestContext,
  ): Promise<string> {
    if (id === this.EMPTY_SHAPE_SENTINEL) {
      return this.EMPTY_SHAPE_SENTINEL;
    }
    const scaleId = this._makeId("scale", id, scaleFactor);
    await this.createIfAbsent(scaleId, context, async () => {
      const geometry = await this.get(id, context);
      return geometry.scale(scaleFactor);
    });
    return scaleId;
  }

  async fillet(
    id: string,
    radius: number,
    context: RequestContext,
  ): Promise<string> {
    if (id === this.EMPTY_SHAPE_SENTINEL) {
      return this.EMPTY_SHAPE_SENTINEL;
    }
    const filletId = this._makeId("fillet", id, radius);
    await this.createIfAbsent(filletId, context, async () => {
      const geometry = await this.get(id, context);
      if (
        geometry instanceof replicad.Wire ||
        geometry instanceof replicad.Vertex
      ) {
        throw new Error("Cannot fillet a wire or Point3D");
      }
      return (geometry as replicad.Shape3D | replicad.Drawing).fillet(radius);
    });
    return filletId;
  }

  async chamfer(
    id: string,
    size: number,
    context: RequestContext,
  ): Promise<string> {
    if (id === this.EMPTY_SHAPE_SENTINEL) {
      return this.EMPTY_SHAPE_SENTINEL;
    }
    const chamferId = this._makeId("chamfer", id, size);
    await this.createIfAbsent(chamferId, context, async () => {
      const geometry = await this.get(id, context);
      if (
        geometry instanceof replicad.Wire ||
        geometry instanceof replicad.Vertex
      ) {
        throw new Error("Cannot chamfer a wire or Point3D");
      }
      return (geometry as replicad.Shape3D | replicad.Drawing).chamfer(size);
    });
    return chamferId;
  }

  // TODO(tristan): this isn't ideal since it could fall out of sync with
  // replicad definitions of Shape3D
  isShape3D(obj: any): obj is replicad.Shape3D {
    return (
      obj instanceof replicad.CompSolid ||
      obj instanceof replicad.Solid ||
      obj instanceof replicad.Shell ||
      obj instanceof replicad.Compound
    );
  }

  areAllDrawings(objs: ReplicadObject[]): objs is replicad.Drawing[] {
    return objs.every((obj) => obj instanceof replicad.Drawing);
  }

  areAll3DShapes(objs: ReplicadObject[]): objs is replicad.Shape3D[] {
    return objs.every((obj) => this.isShape3D(obj));
  }

  as3dShapeOrThrow(obj: replicad.AnyShape): replicad.Shape3D {
    if (this.isShape3D(obj)) {
      return obj;
    } else {
      throw new Error("Expected a Shape3D but got a " + typeof obj);
    }
  }

  async intersect(
    inputId1: string,
    inputId2: string,
    context: RequestContext,
  ): Promise<string | undefined> {
    if (
      inputId1 === this.EMPTY_SHAPE_SENTINEL ||
      inputId2 === this.EMPTY_SHAPE_SENTINEL
    ) {
      return this.EMPTY_SHAPE_SENTINEL;
    }

    const id = this._makeId("intersect", inputId1, inputId2);
    if (this.booleanOpCache.isDisjoint(inputId1, inputId2, context.project)) {
      this.cacheHit("disjoint" + id);
      return this.EMPTY_SHAPE_SENTINEL;
    }
    if (this.booleanOpCache.isOccluded(inputId1, inputId2, context.project)) {
      this.cacheHit("occluded" + id);
      return inputId1;
    }
    if (this.booleanOpCache.isOccluded(inputId2, inputId1, context.project)) {
      this.cacheHit("occluded" + id);
      return inputId2;
    }

    const boolResult = await this.maybeOp(
      id,
      [inputId1, inputId2],
      context,
      (args) => {
        // @ts-expect-error Type coercion happens inside of maybeOp.
        return args[0].intersect(args[1]);
      },
    );
    if (boolResult.outcome == BooleanOutcome.EmptyShape) {
      this.booleanOpCache.recordDisjoint(inputId1, inputId2, context.project);
    }
    if (boolResult.outcome == BooleanOutcome.InputShape) {
      if (boolResult.inputIndexAsResult == 0) {
        this.booleanOpCache.recordOcclusion(
          inputId1,
          inputId2,
          context.project,
        );
      } else if (boolResult.inputIndexAsResult == 1) {
        // Flip args since inputId2 was identical to result.
        this.booleanOpCache.recordOcclusion(
          inputId2,
          inputId1,
          context.project,
        );
      }
    }
    return boolResult.resultId;
  }

  // Fuse 1 or more geometries together.
  async fuse(
    inputId1: string,
    inputId2: string,
    context: RequestContext,
  ): Promise<string> {
    if (inputId1 === this.EMPTY_SHAPE_SENTINEL) {
      return inputId2;
    }
    if (inputId2 === this.EMPTY_SHAPE_SENTINEL) {
      return inputId1;
    }
    const sortedArgs = [inputId1, inputId2].sort();
    const resultId = this._makeId("fuse", sortedArgs[0], sortedArgs[1]);

    if (this.booleanOpCache.isOccluded(inputId1, inputId2, context.project)) {
      this.cacheHit("occluded" + resultId);
      return inputId2;
    }
    if (this.booleanOpCache.isOccluded(inputId2, inputId1, context.project)) {
      this.cacheHit("occluded" + resultId);
      return inputId1;
    }

    const boolResult = await this.maybeOp(
      resultId,
      sortedArgs,
      context,
      //@ts-expect-error type coercion done in maybeop.
      (args) => args[0].fuse(args[1]),
    );
    if (boolResult.outcome == BooleanOutcome.InputShape) {
      if (boolResult.inputIndexAsResult == 0) {
        this.booleanOpCache.recordOcclusion(
          sortedArgs[1],
          sortedArgs[0],
          context.project,
        );
      } else if (boolResult.inputIndexAsResult == 1) {
        this.booleanOpCache.recordOcclusion(
          sortedArgs[0],
          sortedArgs[1],
          context.project,
        );
      }
    }
    return boolResult.resultId;
  }

  async assemblyFuse(
    assembly: AbundanceObject,
    context: RequestContext,
  ): Promise<string> {
    const partIds = flattenAssembly(assembly)
      .map((part) => part.geometry)
      .filter((id) => id !== this.EMPTY_SHAPE_SENTINEL);
    if (partIds.length === 1) {
      return partIds[0];
    }
    const id = this._makeId("assemblyFuse", ...partIds.sort());
    await this.createIfAbsent(id, context, async () => {
      const shapes = await Promise.all(
        partIds.map((partId) => this.get(partId, context)),
      );

      let result = undefined;
      for (let i = 0; i < shapes.length; i++) {
        const shape = shapes[i];
        if (shape instanceof replicad.Wire) {
          continue; // fusing a wire is a no-op.
        }
        if (!result) {
          result = shape;
        } else {
          if (this.isShape3D(result) && this.isShape3D(shape)) {
            // Optimized fuse since we know assembly components don't intersect
            result = result.fuse(shape, { optimisation: "commonFace" });
          } else {
            //@ts-ignore
            result = result.fuse(shape); // both drawings
          }
        }
      }
      if (!result) {
        throw new Error("assembly was all wires. Cannot be fused");
      }
      return result;
    });
    return id;
  }

  async cut(
    toCut: string,
    cutter: string,
    context: RequestContext,
  ): Promise<string | undefined> {
    if (
      toCut === this.EMPTY_SHAPE_SENTINEL ||
      cutter === this.EMPTY_SHAPE_SENTINEL
    ) {
      return toCut;
    }
    const resultId = this._makeId("cut", toCut, cutter);

    // Fast no op checks
    if (this.booleanOpCache.isDisjoint(toCut, cutter, context.project)) {
      this.cacheHit("disjoint" + resultId);
      return toCut;
    }
    if (this.booleanOpCache.isOccluded(toCut, cutter, context.project)) {
      this.cacheHit("occluded" + resultId);
      return this.EMPTY_SHAPE_SENTINEL;
    }

    const boolResult = await this.maybeOp(
      resultId,
      [toCut, cutter],
      context,
      //@ts-expect-error type checking happens in maybeop
      (args) => args[0].cut(args[1]),
    );

    if (boolResult.outcome == BooleanOutcome.EmptyShape) {
      this.booleanOpCache.recordOcclusion(toCut, cutter, context.project);
    }
    if (boolResult.outcome == BooleanOutcome.InputShape) {
      if (boolResult.inputIndexAsResult == 0) {
        this.booleanOpCache.recordDisjoint(toCut, cutter, context.project);
      } else if (boolResult.inputIndexAsResult == 1) {
        // Special case. This volume-match is erronious since the cutter
        // cannot be the result. Return resultId instead.
        return resultId;
      }
    }
    if (boolResult.outcome == BooleanOutcome.NewShape) {
      this.booleanOpCache.recordDisjoint(resultId, cutter, context.project);
    }
    return boolResult.resultId;
  }

  /**
   * Start a batch operation. Batch operations are appropriate to use
   * when you expect to perform a lot of geometric operations but don't
   * want to persist the intermediate results. Eg: for assemblies.
   *
   * This method may return an AbundanceObject if the result of this batch
   * operation already exists in the cache. For this reason it is important
   * that the id param be chose carefully.
   *
   * Otherwise this method returns a new RequestContext which should
   * be passed to any operation which is part of this batch. Complete the
   * batch operation by calling endBatchOperation() with the result.
   *
   * Optional: pass persistIntermediates=true to keep all intermediate
   * results in the cache after the batch is ended.
   */
  async startBatchOperation(
    context: RequestContext,
    id: string,
    persistIntermediates: boolean = false,
  ): Promise<AbundanceObject | RequestContext> {
    const batchId = "batch-" + id;

    const preparedResult = await this.getAssembly(batchId, context);
    if (preparedResult) {
      return preparedResult;
    }

    // If an identical batch is already running, wait for it to finish and
    // reuse its cached result rather than racing it. Many identical
    // sub-assemblies (e.g. repeated bolts) hash to the same batch id and are
    // dispatched concurrently; without this the second caller would throw
    // "already exists".
    const existing = this.inFlightBatches.get(batchId);
    if (existing) {
      // Prevent self-deadlock if a batch tries to start itself again before settling.
      if (context.operationId === batchId) {
        throw new Error(
          "Batch operation with id " + batchId + " is already in flight",
        );
      }
      await existing.promise;
      const afterWait = await this.getAssembly(batchId, context);
      if (afterWait) {
        return afterWait;
      }
      // The in-flight batch failed and cached nothing. Fall through and run
      // the batch ourselves.
    }

    if (this.warmCache.has(batchId)) {
      throw new Error("Batch operation with id " + batchId + " already exists");
    }
    this.warmCache.set(batchId, new Map());
    let resolveInFlight!: () => void;
    const promise = new Promise<void>((resolve) => {
      resolveInFlight = resolve;
    });
    this.inFlightBatches.set(batchId, { promise, resolve: resolveInFlight });
    return {
      ...context,
      operationId: batchId,
      persistIntermediates: persistIntermediates,
    };
  }

  /**
   * Explicitly free every replicad/OC handle stored in a warm-cache bucket.
   * Without this, handles are freed lazily by the JS GC finalizer — but the GC
   * fires on JS heap pressure, not WASM heap pressure, so OC memory can grow
   * unboundedly between collections. Calling .delete() here synchronously
   * releases the WASM-side allocation before the JS wrapper becomes unreachable.
   *
   * Cloned copies handed out by getFromWarmCache() are owned by the callers;
   * we only delete the canonical copy stored here.
   */
  private deleteWarmCacheEntries(operationId: string): void {
    const bucket = this.warmCache.get(operationId);
    if (!bucket) return;
    for (const geom of bucket.values()) {
      try {
        geom.delete();
      } catch (e) {
        // Ignore double-delete or already-freed handles.
      }
    }
  }

  /**
   * Resolve and remove the in-flight tracking entry for a batch so any
   * concurrent waiters can proceed (and pick up the cached result if the
   * batch succeeded).
   */
  private settleInFlightBatch(batchId: string): void {
    const inFlight = this.inFlightBatches.get(batchId);
    if (inFlight) {
      this.inFlightBatches.delete(batchId);
      inFlight.resolve();
    }
  }

  async endBatchOperation(
    context: RequestContext,
    result: AbundanceObject,
  ): Promise<void> {
    if (!context.operationId) {
      throw new Error("provided context is not a batch operation " + context);
    }
    this.batchMetrics = [0, 0];
    try {
      if (!context.persistIntermediates) {
        // For all intermediate shapes which are part of the result assembly,
        // promote them to the serialized cache.
        for (const leaf of flattenAssembly(result)) {
          if (leaf.geometry === this.EMPTY_SHAPE_SENTINEL) {
            continue; // Empty shapes don't exist in the cache
          }
          const geom = this.getFromWarmCache(leaf.geometry, context);
          if (geom) {
            await putShape(
              context.project,
              leaf.geometry,
              this.getFromWarmCache(leaf.geometry, context)!.serialize(),
            );
          } else {
            // check that it's already in the serialized cache
            const exists = await shapeExists(context.project, leaf.geometry);
            if (!exists) {
              throw new Error(
                "Batch operation references unknown geometry: " + leaf.geometry,
              );
            }
          }
        }
      }
      await this.cacheAssemblyStructure(context.operationId, result, context);
    } finally {
      // Always clear the warm-cache entry so retries cannot get stuck behind
      // stale "already exists" state after a failed end-batch path.
      this.deleteWarmCacheEntries(context.operationId);
      this.warmCache.delete(context.operationId);
      this.settleInFlightBatch(context.operationId);
    }
  }

  /**
   * Clean up a batch operation without caching its result.
   * Used when code atoms return primitive values (numbers, strings, etc.)
   * instead of geometry - we just discard the warm cache without persisting anything.
   */
  cleanupBatchWithoutCaching(context: RequestContext): void {
    if (!context.operationId) {
      throw new Error("provided context is not a batch operation " + context);
    }
    this.batchMetrics = [0, 0];
    this.deleteWarmCacheEntries(context.operationId);
    this.warmCache.delete(context.operationId);
    this.settleInFlightBatch(context.operationId);
  }

  async shrinkWrapSketches(
    compositeSketchId: string,
    points: number,
    context: RequestContext,
  ) {
    const shrinkWrapId = this._makeId("shrinkWrap", compositeSketchId, points);
    await this.createIfAbsent(shrinkWrapId, context, async () => {
      const geometry = await this.get(compositeSketchId, context);
      return shrinkWrap(geometry, points);
    });
    return shrinkWrapId;
  }

  async _getAsPoint(
    id: string,
    context: RequestContext,
  ): Promise<replicad.Vertex> {
    const geom = await this.get(id, context);
    if (geom instanceof replicad.Vertex) {
      return geom;
    } else {
      throw new Error("Expected a Point3D but got " + typeof geom);
    }
  }

  async loftSketches(
    sketchIds: string[],
    planes: SimplePlane[],
    startPoint: string | undefined,
    endPoint: string | undefined,
    context: RequestContext,
  ): Promise<string> {
    if (sketchIds.length != planes.length) {
      throw new Error("Number of sketches and planes must match");
    }
    const loftId = this._makeId(
      "loft",
      ...sketchIds,
      ...planes,
      startPoint,
      endPoint,
    );
    await this.createIfAbsent(loftId, context, async () => {
      const sketches = [];
      for (let i = 0; i < sketchIds.length; i++) {
        const partObj = (await this.get(
          sketchIds[i],
          context,
        )) as replicad.Drawing;
        const sketchedpart = partObj.sketchOnPlane(asReplicadPlane(planes[i]));
        if (!("sketches" in sketchedpart)) {
          sketches.push(sketchedpart);
        } else {
          throw new Error(
            "Sketches to be lofted can't have interior geometries",
          );
        }
      }
      const config = {
        startPoint: startPoint
          ? (await this._getAsPoint(startPoint, context)).asTuple()
          : undefined,
        endPoint: endPoint
          ? (await this._getAsPoint(endPoint, context)).asTuple()
          : undefined,
      };
      return sketches[0].loftWith(sketches.slice(1), config);
    });
    return loftId;
  }

  async loftWires(
    wireIds: string[],
    startPoint: string | undefined,
    endPoint: string | undefined,
    context: RequestContext,
  ): Promise<string> {
    const loftId = this._makeId("loftWire", ...wireIds, startPoint, endPoint);
    await this.createIfAbsent(loftId, context, async () => {
      const wires = [];
      for (let i = 0; i < wireIds.length; i++) {
        const partObj = (await this.get(wireIds[i], context)) as replicad.Wire;
        if (!partObj.isClosed) {
          throw new Error("Only closed wires may be lofted");
        }
        wires.push(partObj);
      }
      const config = {
        startPoint: startPoint
          ? (await this._getAsPoint(startPoint, context)).asTuple()
          : undefined,
        endPoint: endPoint
          ? (await this._getAsPoint(endPoint, context)).asTuple()
          : undefined,
      };
      const result = replicad.loft(wires, config);
      return result;
    });
    return loftId;
  }

  /**
   * Adds the given geometry to the cache and returns the ID for it.
   * Note this method should be avoided because it guarantees there will never
   * be re-use of this cached geometry.
   *
   * @param {*} geometry - geometry to be added to cache.
   * @returns key for this geometry.
   */
  async addSingularToCache(
    geometry: ReplicadObject,
    context: RequestContext,
    operationName: string,
    operationArgs: any[],
  ) {
    if (
      replicad.isShape3D(geometry) &&
      replicad.measureVolume(geometry) === 0
    ) {
      return this.EMPTY_SHAPE_SENTINEL;
    }
    const id: string = this._makeId(operationName, ...operationArgs);
    await this.createIfAbsent(id, context, () => Promise.resolve(geometry));
    return id;
  }

  /**
   * Store an AbundanceObject structure in the cache. The geometries referenced
   * in this structure must already be present in the cache.
   */
  async cacheAssemblyStructure(
    id: string,
    assembly: AbundanceObject,
    context: RequestContext,
  ): Promise<void> {
    return await putShape(context.project, id, JSON.stringify(assembly), true);
  }

  async getAssembly(
    id: string,
    context: RequestContext,
  ): Promise<AbundanceObject | undefined> {
    return await getShape(context.project, id).then((shape) => {
      if (shape && shape.type == "AbundanceObject") {
        return JSON.parse(shape.serialized) as AbundanceObject;
      }
      return undefined;
    });
  }

  _makeId(type: string, ...args: any[]) {
    args = args.map((arg) => {
      return typeof arg === "string" ? arg : JSON.stringify(arg);
    });
    const key = [type, ...args].flat(Infinity).join("-");
    // Boolean recipes nest their inputs' full ids (e.g. a cut result becomes the
    // input to the next cut), so ids can grow without bound — multi-kilobyte
    // `cut-cut-cut-...` strings whose building and Map/IndexedDB keying cost
    // dominates large assemblies. Collapse over-long ids to a fixed-length,
    // deterministic, collision-resistant digest. The `#` delimiter can never
    // appear in a plain id (which always has `-` immediately after `type`), so a
    // collapsed id can never collide with a non-collapsed one, and identical
    // recipes always collapse identically — preserving cache correctness.
    if (key.length > GeometryProvider.MAX_ID_LENGTH) {
      return type + "-#" + hashStringWide(key);
    }
    return key;
  }
}

export { GeometryProvider, ReplicadObject, RequestContext };
