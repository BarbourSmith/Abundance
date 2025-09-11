import * as replicad from "replicad";
import * as crypto from "crypto";
import { number } from "mathjs";
import shrinkWrap from "replicad-shrink-wrap";
import { AbundanceObject, asReplicadPlane } from "./util";

type ReplicadObject = replicad.Shape3D | replicad.Drawing | replicad.Wire;

/**
 * Manages a cache of geometries. Making a new geometry with identical arguments will
 * result in a cache hit.
 *
 * Each operation here returns an ID which can be used to perform further operations,
 * or retrieve the geometry via `get(id)`.
 */
class GeometryProvider {
  private _dbPromise: Promise<IDBDatabase>;
  private _cacheHitMetrics: Record<string, [number, number]>;
  private _nextId: number;

  constructor() {
    this._dbPromise = this._initDB(); // Initialize IndexedDB
    this._cacheHitMetrics = {};
    this._nextId = 0;

    setInterval(() => {
      console.log(this._cacheHitMetrics);
    }, 10000);
  }

  private async _initDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open("geometryCache", 1);

      request.onupgradeneeded = (event: IDBVersionChangeEvent) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains("geometries")) {
          db.createObjectStore("geometries", { keyPath: "id" });
        }
      };

      request.onsuccess = (event: Event) => {
        resolve((event.target as IDBOpenDBRequest).result);
      };

      request.onerror = (event: Event) => {
        console.error(
          "Error opening IndexedDB:",
          (event.target as IDBOpenDBRequest).error
        );
        reject((event.target as IDBOpenDBRequest).error);
      };
    });
  }

  private async _getFromDB(id: string): Promise<any> {
    const db = await this._dbPromise;
    return new Promise((resolve, reject) => {
      const transaction = db.transaction("geometries", "readonly");
      transaction.onerror = (event: Event) => {
        console.error("Transaction error");
        reject((event.target as IDBRequest).error);
      };
      const store = transaction.objectStore("geometries");
      const request = store.get(id);

      request.onsuccess = (event: Event) => {
        console.log("got onsuccess callback from the db");
        // TODO: Deserialize the geometry value after retrieving from DB
        let result = (event.target as IDBRequest).result;
        result = result ? result.value : undefined;

        if (!result) {
          resolve(undefined);
        } else {
          try {
            result = replicad.deserializeShape(result);
            resolve(result);
          } catch (error) {
            try {
              result = replicad.deserializeDrawing(result);
              resolve(result);
            } catch (error) {
              reject("Failed to deserialize geometry for id " + id);
            }
          }
        }
      };

      request.onerror = (event: Event) => {
        console.error("failed to get id");
        reject((event.target as IDBRequest).error);
      };
    });
  }

  private async _saveToDB(id: string, value: any): Promise<void> {
    const db = await this._dbPromise;
    return new Promise((resolve, reject) => {
      const transaction = db.transaction("geometries", "readwrite");
      const store = transaction.objectStore("geometries");

      // Check if the key already exists
      const getRequest = store.get(id);
      getRequest.onsuccess = (event: Event) => {
        if ((event.target as IDBRequest).result) {
          resolve();
        } else {
          const putRequest = store.put({ id, value });
          putRequest.onsuccess = () => resolve();
          putRequest.onerror = (event: Event) =>
            reject((event.target as IDBRequest).error);
        }
      };

      getRequest.onerror = (event: Event) =>
        reject((event.target as IDBRequest).error);
    });
  }

  private async _deleteFromDB(id: string): Promise<void> {
    const db = await this._dbPromise;
    return new Promise((resolve, reject) => {
      const transaction = db.transaction("geometries", "readwrite");
      const store = transaction.objectStore("geometries");
      const request = store.delete(id);

      request.onsuccess = () => resolve();
      request.onerror = (event: Event) =>
        reject((event.target as IDBRequest).error);
    });
  }

  private cacheHit(id: string): void {
    const type = id.split("-")[0];
    if (!this._cacheHitMetrics[type]) {
      this._cacheHitMetrics[type] = [0, 0];
    }
    this._cacheHitMetrics[type][0]++;
  }

  private cacheMiss(id: string): void {
    const type = id.split("-")[0];
    if (!this._cacheHitMetrics[type]) {
      this._cacheHitMetrics[type] = [0, 0];
    }
    this._cacheHitMetrics[type][1]++;
  }

  private async _createIfAbsent(
    id: string,
    builder: () => Promise<ReplicadObject>
  ): Promise<string> {
    let value = await this._getFromDB(id);
    if (!value) {
      value = await builder();
      await this._saveToDB(id, value.serialize());
      this.cacheMiss(id);
    } else {
      this.cacheHit(id);
    }
    return value;
  }

  /**
   * Draws a rectangle with the given dimensions.
   * @param x - The width of the rectangle
   * @param y - The height of the rectangle
   * @returns The ID of the created rectangle
   */
  async drawRectangle(x: number, y: number): Promise<string> {
    const id = this._makeId("rectangle", x, y);
    await this._createIfAbsent(id, () => {
      return Promise.resolve(replicad.drawRectangle(x, y));
    });
    return id;
  }

  async drawCircle(radius: number): Promise<string> {
    const id = this._makeId("circle", radius);
    await this._createIfAbsent(id, () => {
      return Promise.resolve(replicad.drawCircle(radius));
    });
    return id;
  }

  async drawPolysides(radius: number, numberOfSides: number): Promise<string> {
    const id = this._makeId("polysides", radius, numberOfSides);
    await this._createIfAbsent(id, () => {
      return Promise.resolve(replicad.drawPolysides(radius, numberOfSides));
    });
    return id;
  }

  async drawText(text: string, options: any): Promise<string> {
    const id = this._makeId("text", text, options);
    this._createIfAbsent(id, async () => {
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
  async extrude(inputId: string, plane: any, height: number): Promise<string> {
    const extrudedId = this._makeId("extrude", inputId, plane, height);
    // @ts-ignore - TODO: add a check that extrude produces a Shape3d (ie: extruding an open wire should fail)
    await this._createIfAbsent(extrudedId, async () => {
      const geometry = (await this.get(inputId)) as replicad.Drawing;
      return geometry.sketchOnPlane(asReplicadPlane(plane)).extrude(height);
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
    await this._createIfAbsent(movedId, async () => {
      const geometry = await this.get(id);
      return geometry.translate(dx, dy, dz);
    });
    return movedId;
  }

  async rotate(id: string, x: number, y: number, z: number): Promise<string> {
    const rotateId = this._makeId("rotate", id, x, y, z);
    await this._createIfAbsent(rotateId, async () => {
      const geometry = await this.get(id);
      if (geometry instanceof replicad.Drawing) {
        // TODO: should this rotate around center of bounding box?
        return geometry.rotate(z, [0, 0]);
      } else {
        return geometry
          .rotate(x, [0, 0, 0], [1, 0, 0]) // TODO: consider explicit no-op for each arg which is 0
          .rotate(y, [0, 0, 0], [0, 1, 0])
          .rotate(z, [0, 0, 0], [0, 0, 1]);
      }
    });
    return rotateId;
  }

  async scale(id: string, scaleFactor: number): Promise<string> {
    const scaleId = this._makeId("scale", id, scaleFactor);
    await this._createIfAbsent(scaleId, async () => {
      const geometry = await this.get(id);
      return geometry.scale(scaleFactor);
    });
    return scaleId;
  }

  async fillet(id: string, radius: number): Promise<string> {
    const filletId = this._makeId("fillet", id, radius);
    await this._createIfAbsent(filletId, async () => {
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
    await this._createIfAbsent(chamferId, async () => {
      const geometry = await this.get(id);
      if (geometry instanceof replicad.Wire) {
        throw new Error("Cannot chamfer a wire");
      }
      return geometry.chamfer(size);
    });
    return chamferId;
  }

  async intersect(input1ID: string, inputID2: string): Promise<string> {
    const id = this._makeId("intersect", input1ID, inputID2);
    // @ts-ignore - TODO: this needs some typescript massaging. Eg: drawing intersect shape3d is disallowed
    await this._createIfAbsent(id, async () => {
      const geometry1 = await this.get(input1ID);
      const geometry2 = await this.get(inputID2);
      if (
        geometry1 instanceof replicad.Wire ||
        geometry2 instanceof replicad.Wire
      ) {
        throw new Error("Cannot intersect wires");
      }
      //@ts-ignore
      return geometry1.intersect(geometry2);
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
      // More than one ID, perform fusion
      const id = this._makeId("fuse", ...ids);
      this._createIfAbsent(id, async () => {
        let geometry = await this.get(ids[0]);
        for (let i = 1; i < ids.length; i++) {
          // @ts-ignore - once again there's dimensional compatibility which needs to be
          // checked here.
          geometry = geometry.fuse(await this.get(ids[i]));
        }
        return geometry;
      });

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
      return toCut; // no cutting needed for wires
    }
    const toCutBB = toCutGeom.boundingBox;

    // only include cutters which aren't wires and actually affect the result
    const affectingCutterIds = cutterIds.filter(async (cutter) => {
      const cutterGeom = await this.get(cutter);
      return (
        !(cutterGeom instanceof replicad.Wire) &&
        //@ts-ignore - I'm not actually sure why this is failing typechecks
        !toCutBB.isOut(cutterGeom.boundingBox)
      );
    });

    if (affectingCutterIds.length == 0) {
      // This cut is actually a no-op, return original geometry
      return toCut;
    } else {
      const resultId = this._makeId("cut", toCut, ...affectingCutterIds);
      this._createIfAbsent(resultId, async () => {
        let result = toCutGeom;
        for (const cutterId of affectingCutterIds) {
          const cutter = await this.get(cutterId);
          // @ts-ignore - blep.
          result = result.clone().cut(cutter);
        }
        return result;
      });
      return resultId;
    }
  }

  async shrinkWrapShapes(inputShapeId: string, points: number) {
    const shrinkWrapId = this._makeId("shrinkWrap", inputShapeId, points);
    this._createIfAbsent(shrinkWrapId, async () => {
      const geometry = await this.get(inputShapeId);
      //@ts-ignore - TODO: this might be borked.
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
    id = id || this._makeId("singular", this._nextId++);
    this._createIfAbsent(id, () => geometry);
    return id;
  }

  async get(key: string): Promise<ReplicadObject> {
    const value = await this._getFromDB(key);
    if (value === undefined) {
      console.warn("Cache miss for id:", key);
      throw new Error(`Geometry with ID ${key} not found in cache`);
    }
    return value;
  }

  _makeId(type: string, ...args: any[]) {
    args = args.map((arg) => {
      return JSON.stringify(arg);
    });
    const key = [type, ...args].flat(Infinity).join("-");
    return key;
  }
}

export { GeometryProvider };
