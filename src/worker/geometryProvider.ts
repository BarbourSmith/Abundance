import * as replicad from "replicad";
import shrinkWrap from "replicad-shrink-wrap";
import { asReplicadPlane, SimplePlane } from "./util";
import { i } from "mathjs";

type ReplicadObject = replicad.Shape3D | replicad.Drawing | replicad.Wire;

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
  private cache = new Map<string, ReplicadObject>();
  private cacheHitMetrics: Record<string, [number, number]>;
  private nextId: number;

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
      this.cacheHitMetrics[type] = [0, 0];
    }
    this.cacheHitMetrics[type][0]++;
  }

  private cacheMiss(id: string): void {
    const type = id.split("-")[0];
    if (!this.cacheHitMetrics[type]) {
      this.cacheHitMetrics[type] = [0, 0];
    }
    this.cacheHitMetrics[type][1]++;
  }

  // Returns the id of the geometry once it's been added to the cache.
  private async createIfAbsent(
    id: string,
    builder: () => Promise<ReplicadObject>
  ): Promise<string> {
    if (!(id in this.cache)) {
      let value = await builder();
      this.cache.set(id, value);
      this.cacheMiss(id);
    } else {
      this.cacheHit(id);
    }
    // TODO(tristan): faking async behavior here because this will
    // eventually be an indexedDB call, which is async by necessity.
    return Promise.resolve(id);
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
  async get(id: string): Promise<ReplicadObject> {
    const value = this.cache.get(id);
    if (value == undefined) {
      console.warn("Cache miss for id:", id);
      throw new Error(`Geometry with ID ${id} not found in cache`);
    }
    return Promise.resolve(value);
  }

  /**
   * Draws a rectangle with the given dimensions.
   * @param x - The width of the rectangle
   * @param y - The height of the rectangle
   * @returns The ID of the created rectangle
   */
  async drawRectangle(x: number, y: number): Promise<string> {
    const id = this._makeId("rectangle", x, y);
    await this.createIfAbsent(id, () => {
      return Promise.resolve(replicad.drawRectangle(x, y));
    });
    return id;
  }

  async drawCircle(radius: number): Promise<string> {
    const id = this._makeId("circle", radius);
    await this.createIfAbsent(id, () => {
      return Promise.resolve(replicad.drawCircle(radius));
    });
    return id;
  }

  async drawPolysides(radius: number, numberOfSides: number): Promise<string> {
    const id = this._makeId("polysides", radius, numberOfSides);
    await this.createIfAbsent(id, () => {
      return Promise.resolve(replicad.drawPolysides(radius, numberOfSides));
    });
    return id;
  }

  async drawText(text: string, options: any): Promise<string> {
    const id = this._makeId("text", text, options);
    this.createIfAbsent(id, async () => {
      return Promise.resolve(replicad.drawText(text, options));
    });
    return id;
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
    height: number
  ): Promise<string> {
    const extrudedId = this._makeId("extrude", inputId, plane, height);
    await this.createIfAbsent(extrudedId, async () => {
      const geometry = (await this.get(inputId)) as replicad.Drawing;
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
    dz: number = 0
  ): Promise<string> {
    const movedId = this._makeId("move", id, dx, dy, dz);
    await this.createIfAbsent(movedId, async () => {
      const geometry = await this.get(id);
      return geometry.translate(dx, dy, dz);
    });
    return movedId;
  }

  async rotate(id: string, x: number, y: number, z: number): Promise<string> {
    const rotateId = this._makeId("rotate", id, x, y, z);
    await this.createIfAbsent(rotateId, async () => {
      const geometry = await this.get(id);
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

  async scale(id: string, scaleFactor: number): Promise<string> {
    const scaleId = this._makeId("scale", id, scaleFactor);
    await this.createIfAbsent(scaleId, async () => {
      const geometry = await this.get(id);
      return geometry.scale(scaleFactor);
    });
    return scaleId;
  }

  async fillet(id: string, radius: number): Promise<string> {
    const filletId = this._makeId("fillet", id, radius);
    await this.createIfAbsent(filletId, async () => {
      const geometry = await this.get(id);
      if (geometry instanceof replicad.Wire) {
        throw new Error("Cannot fillet a wire");
      }
      return geometry.fillet(radius);
    });
    return filletId;
  }

  async chamfer(id: string, size: number): Promise<string> {
    const chamferId = this._makeId("chamfer", id, size);
    await this.createIfAbsent(chamferId, async () => {
      const geometry = await this.get(id);
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

  async intersect(input1ID: string, inputID2: string): Promise<string> {
    const id = this._makeId("intersect", input1ID, inputID2);
    await this.createIfAbsent(id, async () => {
      const args = [await this.get(input1ID), await this.get(inputID2)];
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
  async fuse(...ids: string[]): Promise<string> {
    ids = ids.flat(Infinity);
    if (ids.length == 0) {
      throw new Error("At least one ID is required for fusion");
    } else if (ids.length == 1) {
      return ids[0]; // No fusion needed, return the single ID
    } else {
      // More than one ID, perform fusion or get from cache.

      const fuseBuilder = async () => {
        let args: ReplicadObject[] = await Promise.all(
          ids.map((id) => this.get(id))
        );
        if (!this.areAllDrawings(args) || !this.areAll3DShapes(args)) {
          throw new Error(
            "Received a mix of 2D and 3D types for fusion. All must be the same."
          );
        }
        let geometry: replicad.Drawing | replicad.Shape3D = args[0];
        for (let i = 1; i < args.length; i++) {
          geometry = geometry.fuse(args[i]);
        }
        return geometry;
      };

      const id = this._makeId("fuse", ...ids);
      this.createIfAbsent(id, fuseBuilder);

      return id;
    }
  }

  /**
   * Cuts `toCut` with each entry in `cutterIds` in order. Note that will ignore
   * any parts which are wires, and will be considered cache-equivalent to any other
   * cut operations with the same set (and order) of non-wire cutters.
   */
  async cut(toCut: string, ...cutterIds: string[]) {
    cutterIds = cutterIds.flat(Infinity);
    const toCutGeom = await this.get(toCut);
    if (toCutGeom instanceof replicad.Wire) {
      return toCut; // cutting wire is a no-op. Maybe should be an error?
    }
    const toCutBB: replicad.BoundingBox | replicad.BoundingBox2d =
      toCutGeom.boundingBox;

    // TODO(tristan): I'm not sure if this is actually a good optimization since
    // it requires materializing all the cutter geometries. Might just be better
    // to take the input ids as gospel?
    let cutterGeoms = await Promise.all(
      cutterIds.map(async (id) => [id, await this.get(id)])
    );

    // only include cutters which aren't wires and actually affect the result
    const affectingCutters = cutterGeoms.filter(
      async ([cutterId, cutterGeom]) => {
        if (cutterGeom instanceof replicad.Wire) return false;

        // if we're cutting a 2d shape then only include cutters which are also 2d
        // and whose bounding boxes overlap.
        if (toCutBB instanceof replicad.BoundingBox2d) {
          return (
            cutterGeom instanceof replicad.Drawing &&
            !toCutBB.isOut(cutterGeom.boundingBox as replicad.BoundingBox2d)
          );
        } else {
          // toCutBB is 3d
          return (
            this.isShape3D(cutterGeom) &&
            !toCutBB.isOut(cutterGeom.boundingBox as replicad.BoundingBox)
          );
        }
      }
    );

    if (affectingCutters.length == 0) {
      // This cut is actually a no-op, return original geometry
      return toCut;
    } else {
      const resultId = this._makeId(
        "cut",
        toCut,
        ...affectingCutters.map(([id, _]) => id)
      );
      this.createIfAbsent(resultId, async () => {
        let result = toCutGeom;
        for (const [cutterId, cutter] of affectingCutters) {
          // @ts-ignore - TODO: restructuring this code will be required to fix the ts compilers
          // confusion here.
          result = result.clone().cut(cutter);
        }
        return result;
      });
      return resultId;
    }
  }

  async shrinkWrapSketches(compositeSketchId: string, points: number) {
    const shrinkWrapId = this._makeId("shrinkWrap", compositeSketchId, points);
    this.createIfAbsent(shrinkWrapId, async () => {
      const geometry = await this.get(compositeSketchId);
      //@ts-ignore
      return shrinkWrap(geometry, points);
    });
    return shrinkWrapId;
  }

  /**
   * Adds the given geometry to the cache and returns the ID for it.
   * Note this method should be avoided because it guarantees there will never
   * be re-use of this cached geometry.
   *
   * @param {*} geometry - geometry to be added to cache.
   * @returns key for this geometry.
   */
  addSingularToCache(geometry: any, id: string | undefined = undefined) {
    id = id || this._makeId("singular", this.nextId++);
    this.createIfAbsent(id, () => geometry);
    return id;
  }

  private _makeId(type: string, ...args: any[]) {
    args = args.map((arg) => {
      return JSON.stringify(arg);
    });
    const key = [type, ...args].flat(Infinity).join("-");
    return key;
  }
}

export { GeometryProvider };
