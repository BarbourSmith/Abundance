import * as replicad from "replicad";
import shrinkWrap from "replicad-shrink-wrap";
import { AbundanceObject, asReplicadPlane, SimplePlane } from "./util";
import {
  getShape,
  putShape,
  deleteProjectCache,
  shapeExists,
  deleteShape,
  getAllProjectIds,
} from "./indexeddbUtils";

type ReplicadObject = replicad.Shape3D | replicad.Drawing | replicad.Wire;

type RequestContext = {
  project: string;
  operationId?: string;
};

/*

TODO: Add functionality for batch operations where we expect to deal with
the same shapes over and over. Eg assemblies.

Impl plan(?):
- open a batch operation has two possible results
   1. you need to do the work - return a new context obj to use
   2. this batch has actually already been cached - return the AbundanceObj
- using the operation context do whatever you're doing
  - impl side we create a warm cache with each input and transient result
  - all transient results are also stored in the main cache (for now?)
- closeBatch(AbundanceObject result)
  - put the result in the main cache under the op id and reject any future
    operations which use this op id.
*/

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
  private MAX_PROJECTS = 4;
  private projectLRU: string[] = [];
  private cacheHitMetrics: Record<string, [number, number, number]>; // hits, misses, total-miss-duration-ms
  private nextId: number;
  private warmCache: Map<string, Map<string, ReplicadObject>> = new Map();
  private batchMetrics: [number, number] = [0, 0];

  constructor() {
    this.cacheHitMetrics = {};
    this.nextId = 0;

    setInterval(() => {
      console.log(this.cacheHitMetrics);
    }, 10000);
  }

  private cacheHit(id: string): void {
    const type = id.split("-")[0];
    if (!this.cacheHitMetrics[type]) {
      this.cacheHitMetrics[type] = [0, 0, 0];
    }
    this.cacheHitMetrics[type][0]++;
  }

  private cacheMiss(id: string, durationMs: number = 0): void {
    const type = id.split("-")[0];
    if (!this.cacheHitMetrics[type]) {
      this.cacheHitMetrics[type] = [0, 0, 0];
    }
    this.cacheHitMetrics[type][1]++;
    this.cacheHitMetrics[type][2] += durationMs;
  }

  private updateLRU(projectId: string) {
    const idx = this.projectLRU.indexOf(projectId);
    const newProject = idx === -1;
    if (!newProject) {
      this.projectLRU.splice(idx, 1);
    }
    this.projectLRU.push(projectId);
    if (newProject) {
      if (this.projectLRU.length > this.MAX_PROJECTS) {
        this.projectLRU.shift();
      }
      getAllProjectIds().then(async (allIds) => {
        if (allIds.size <= this.MAX_PROJECTS) {
          return;
        }
        const evictIds = Array.from(allIds).filter(
          (id) => !this.projectLRU.includes(id)
        );
        console.log("Evicting projects from cache:", evictIds);
        for (const evictId of evictIds) {
          await deleteProjectCache(evictId);
        }
        console.log("Eviction complete");
      });
    }
  }

  // Returns the id of the geometry once it's been added to the cache.
  private async createIfAbsent(
    id: string,
    context: RequestContext,
    builder: () => Promise<ReplicadObject>
  ): Promise<string> {
    this.updateLRU(context.project);
    if (
      this.getFromWarmCache(id, context) ||
      (await shapeExists(context.project, id))
    ) {
      this.cacheHit(id);
    } else {
      const start = performance.now();
      const geometry = await builder();
      await putShape(context.project, id, geometry.serialize());
      if (context.operationId) {
        this.putInWarmCache(id, context.operationId, geometry);
      }
      const duration = performance.now() - start;
      this.cacheMiss(id, duration);
    }
    return id;
  }

  private getFromWarmCache(
    id: string,
    context: RequestContext
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
    result ? this.batchMetrics[0]++ : this.batchMetrics[1]++;
    return result;
  }

  private putInWarmCache(
    id: string,
    operationId: string,
    geometry: ReplicadObject
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
    const warmCached = this.getFromWarmCache(id, context);
    if (warmCached) {
      this.cacheHit("deserialize");
      return Promise.resolve(warmCached);
    }

    // else use disk cache.

    const shape = await getShape(context.project, id);
    if (shape == undefined) {
      console.trace("Cache miss for id:", id);
      throw new Error(`Geometry with ID ${id} not found in cache`);
    }
    let result = undefined;
    try {
      result = replicad.deserializeDrawing(shape.serialized);
      this.cacheMiss("deserialize");
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
    console.log("Clearing cache for project", context.project);
    this.projectLRU = this.projectLRU.filter((id) => id !== context.project);
    await deleteProjectCache(context.project);
    return true;
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
    context: RequestContext
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

  async drawPolysides(
    radius: number,
    numberOfSides: number,
    context: RequestContext
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
    context: RequestContext
  ): Promise<string> {
    const id = this._makeId("text", text, options);
    await this.createIfAbsent(id, context, async () => {
      return Promise.resolve(replicad.drawText(text, options));
    });
    return id;
  }

  async expandCompoundShape(
    id: string,
    context: RequestContext
  ): Promise<string[]> {
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
    context: RequestContext
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

  async move(
    id: string,
    dx: number,
    dy: number,
    dz: number,
    context: RequestContext
  ): Promise<string> {
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
    context: RequestContext
  ): Promise<string> {
    const rotateId = this._makeId("rotate", id, x, y, z);
    await this.createIfAbsent(rotateId, context, async () => {
      const geometry = await this.get(id, context);
      if (geometry instanceof replicad.Drawing) {
        // TODO(tristan): should this rotate around center of bounding box?
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
    context: RequestContext
  ): Promise<string> {
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
    context: RequestContext
  ): Promise<string> {
    const filletId = this._makeId("fillet", id, radius);
    await this.createIfAbsent(filletId, context, async () => {
      const geometry = await this.get(id, context);
      if (geometry instanceof replicad.Wire) {
        throw new Error("Cannot fillet a wire");
      }
      return geometry.fillet(radius);
    });
    return filletId;
  }

  async chamfer(
    id: string,
    size: number,
    context: RequestContext
  ): Promise<string> {
    const chamferId = this._makeId("chamfer", id, size);
    await this.createIfAbsent(chamferId, context, async () => {
      const geometry = await this.get(id, context);
      if (geometry instanceof replicad.Wire) {
        throw new Error("Cannot chamfer a wire");
      }
      return geometry.chamfer(size);
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
    input1ID: string,
    inputID2: string,
    context: RequestContext
  ): Promise<string> {
    const id = this._makeId("intersect", input1ID, inputID2);
    await this.createIfAbsent(id, context, async () => {
      const args = [
        await this.get(input1ID, context),
        await this.get(inputID2, context),
      ];
      // Intersect only allowed between matching types. 2 drawings or 2 3d shapes.

      if (this.areAllDrawings(args)) {
        return args[0].intersect(args[1]);
      } else if (this.areAll3DShapes(args)) {
        return this.as3dShapeOrThrow(args[0].intersect(args[1]));
      } else {
        throw new Error(
          "Invalid types for intersection: " +
            typeof args[0] +
            " and " +
            typeof args[1]
        );
      }
    });
    return id;
  }

  // Fuse 1 or more geometries together.
  async fuse(
    input1ID: string,
    inputID2: string,
    context: RequestContext
  ): Promise<string> {
    const sortedArgs = [input1ID, inputID2].sort();
    const resultId = this._makeId("fuse", sortedArgs[0], sortedArgs[1]);

    await this.createIfAbsent(resultId, context, async () => {
      const args = [
        await this.get(input1ID, context),
        await this.get(inputID2, context),
      ];
      // Fuse only allowed between matching types. 2 drawings or 2 3d shapes.
      if (this.areAllDrawings(args)) {
        return args[0].fuse(args[1]);
      } else if (this.areAll3DShapes(args)) {
        return this.as3dShapeOrThrow(args[0].fuse(args[1]));
      } else {
        throw new Error(
          "Invalid types for fusion: " +
            typeof args[0] +
            " and " +
            typeof args[1]
        );
      }
    });
    return resultId;
  }

  async cut(
    toCut: string,
    cutter: string,
    context: RequestContext
  ): Promise<string> {
    const toCutGeom = await this.get(toCut, context);
    if (toCutGeom instanceof replicad.Wire) {
      return toCut; // cutting wire is a no-op.
    }
    const cutterGeom = await this.get(cutter, context);
    if (cutterGeom instanceof replicad.Wire) {
      return toCut; // cutting with a wire is a no-op.
    }

    let args = [toCutGeom, cutterGeom];
    const resultId = this._makeId("cut", toCut, cutter);
    if (this.areAllDrawings(args) || this.areAll3DShapes(args)) {
      await this.createIfAbsent(resultId, context, async () => {
        //@ts-ignore
        return args[0].cut(args[1]);
      });
      return resultId;
    }
    return toCut;
  }

  async startBatchOperation(
    context: RequestContext,
    id: string
  ): Promise<AbundanceObject | RequestContext> {
    const batchId = "batch-" + id;

    const preparedResult = await this.getAssembly(batchId, context);
    if (preparedResult) {
      console.log("Using pre-computed batch operation result: " + batchId);
      return preparedResult;
    }

    this.warmCache.set(batchId, new Map());
    return { ...context, operationId: batchId };
  }

  async endBatchOperation(
    context: RequestContext,
    result: AbundanceObject
  ): Promise<void> {
    if (!context.operationId) {
      throw new Error("provided context is not a batch operation " + context);
    }
    console.log(
      `End of batch ${context.operationId}. hit/miss: ${
        this.batchMetrics
      }. size: ${this.warmCache.get(context.operationId)?.size}`
    );
    this.batchMetrics = [0, 0];
    await this.cacheAssembly(context.operationId, result, context);
    this.warmCache.delete(context.operationId);
  }

  async shrinkWrapSketches(
    compositeSketchId: string,
    points: number,
    context: RequestContext
  ) {
    const shrinkWrapId = this._makeId("shrinkWrap", compositeSketchId, points);
    await this.createIfAbsent(shrinkWrapId, context, async () => {
      const geometry = await this.get(compositeSketchId, context);
      //@ts-ignore
      return shrinkWrap(geometry, points);
    });
    return shrinkWrapId;
  }

  async loftSketches(
    sketchIds: string[],
    planes: SimplePlane[],
    context: RequestContext
  ): Promise<string> {
    if (sketchIds.length != planes.length) {
      throw new Error("Number of sketches and planes must match");
    }
    const loftId = this._makeId("loft", ...sketchIds);
    await this.createIfAbsent(loftId, context, async () => {
      const sketches = [];
      for (let i = 0; i < sketchIds.length; i++) {
        let partObj = (await this.get(
          sketchIds[i],
          context
        )) as replicad.Drawing;
        let sketchedpart = partObj.sketchOnPlane(asReplicadPlane(planes[i]));
        if (!("sketches" in sketchedpart)) {
          sketches.push(sketchedpart);
        } else {
          throw new Error(
            "Sketches to be lofted can't have interior geometries"
          );
        }
      }
      return sketches[0].loftWith(sketches.slice(1), {});
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
    id: string | undefined = undefined
  ) {
    id = id || this._makeId("singular", this.nextId++);
    await this.createIfAbsent(id, context, () => Promise.resolve(geometry));
    return id;
  }

  async cacheAssembly(
    id: string,
    assembly: AbundanceObject,
    context: RequestContext
  ): Promise<void> {
    return await putShape(context.project, id, JSON.stringify(assembly), true);
  }

  async getAssembly(
    id: string,
    context: RequestContext
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
    return key;
  }
}

export { GeometryProvider, ReplicadObject, RequestContext };
