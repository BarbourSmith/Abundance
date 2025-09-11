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
        reject((event.target as IDBOpenDBRequest).error);
      };
    });
  }

  private async _getFromDB(id: string): Promise<any> {
    const db = await this._dbPromise;
    return new Promise((resolve, reject) => {
      const transaction = db.transaction("geometries", "readonly");
      const store = transaction.objectStore("geometries");
      const request = store.get(id);

      request.onsuccess = (event: Event) => {
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

  drawCircle(radius: number) {
    const id = this._makeId("circle", radius);
    this._createIfAbsent(id, () => {
      return replicad.drawCircle(radius);
    });
    return id;
  }

  drawPolysides(radius: number, numberOfSides: number) {
    const id = this._makeId("polysides", radius, numberOfSides);
    this._createIfAbsent(id, () => {
      return replicad.drawPolysides(radius, numberOfSides);
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
    await this._createIfAbsent(extrudedId, async () => {
      const geometry = await this.get(inputId);
      return geometry
        .clone()
        .sketchOnPlane(asReplicadPlane(plane))
        .extrude(height);
    });
    return extrudedId;
  }

  move(id: string, dx: number, dy: number, dz: number = 0) {
    const movedId = this._makeId("move", id, dx, dy, dz);
    this._createIfAbsent(movedId, () => {
      const geometry = this.get(id);
      return geometry.clone().translate(dx, dy, dz);
    });
    return movedId;
  }

  rotate(id: string, x: number, y: number, z: number) {
    const rotateId = this._makeId("rotate", id, x, y, z);
    this._createIfAbsent(rotateId, () => {
      return this.get(id)
        .clone()
        .rotate(x, [0, 0, 0], [1, 0, 0]) // TODO: consider explicit no-op for each arg which is 0
        .rotate(y, [0, 0, 0], [0, 1, 0])
        .rotate(z, [0, 0, 0], [0, 0, 1]);
    });
    return rotateId;
  }

  scale(id: string, scaleFactor: number) {
    const scaleId = this._makeId("scale", id, scaleFactor);
    this._createIfAbsent(scaleId, () => {
      return this.get(id).clone().scale(scaleFactor);
    });
    return scaleId;
  }

  fillet(id: string, radius: number) {
    const filletId = this._makeId("fillet", id, radius);
    this._createIfAbsent(filletId, () => {
      const geometry = this.get(id);
      return geometry.clone().fillet(radius);
    });
    return filletId;
  }

  chamfer(id: string, size: number) {
    const chamferId = this._makeId("chamfer", id, size);
    this._createIfAbsent(chamferId, () => {
      return this.get(id).clone().chamfer(size);
    });
    return chamferId;
  }

  intersect(input1ID: string, inputID2: string) {
    const id = this._makeId("intersect", input1ID, inputID2);
    this._createIfAbsent(id, () => {
      const geometry1 = this.get(input1ID);
      const geometry2 = this.get(inputID2);
      return geometry1.clone().intersect(geometry2);
    });
    return id;
  }

  // Fuse 1 or more geometries together.
  fuse(...ids: string[]) {
    ids = ids.flat(Infinity);
    if (ids.length == 0) {
      throw new Error("At least one ID is required for fusion");
    } else if (ids.length == 1) {
      return ids[0]; // No fusion needed, return the single ID
    } else {
      // More than one ID, perform fusion
      const id = this._makeId("fuse", ...ids);
      this._createIfAbsent(id, () => {
        let geometry = this.get(ids[0]).clone();
        for (let i = 1; i < ids.length; i++) {
          geometry = geometry.fuse(this.get(ids[i]));
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
  cut(toCut: string, ...cutterIds: string[]) {
    cutterIds = cutterIds.flat(Infinity);
    const toCutGeom = this.get(toCut);
    if (toCutGeom instanceof replicad.Wire) {
      return toCut; // no cutting needed for wires
    }
    const toCutBB = toCutGeom.boundingBox;

    // only include cutters which aren't wires and actually affect the result
    const affectingCutterIds = cutterIds.filter((cutter) => {
      const cutterGeom = this.get(cutter);
      return (
        !(cutterGeom instanceof replicad.Wire) &&
        !toCutBB.isOut(cutterGeom.boundingBox)
      );
    });

    if (affectingCutterIds.length == 0) {
      // This cut is actually a no-op, return original geometry
      return toCut;
    } else {
      const resultId = this._makeId("cut", toCut, ...affectingCutterIds);
      this._createIfAbsent(resultId, () => {
        let result = toCutGeom;
        affectingCutterIds.forEach((cutterId) => {
          const cutter = this.get(cutterId);
          result = result.clone().cut(cutter);
        });
        return result;
      });
      return resultId;
    }
  }

  shrinkWrap(inputShapeId: string, points: number) {
    const shrinkWrapId = this._makeId("shrinkWrap", inputShapeId, points);
    this._createIfAbsent(shrinkWrapId, () => {
      const geometry = this.get(inputShapeId);
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

  async get(key: string) {
    if (typeof key === "string") {
      const value = await this._getFromDB(key);
      if (value === undefined) {
        console.warn("Cache miss for id:", key);
        throw new Error(`Geometry with ID ${key} not found in cache`);
      }
      return value;
    } else {
      console.trace("geometryProvider.get called with non-string:", key);
      return key;
    }
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
