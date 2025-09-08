import * as replicad from "replicad";
import * as crypto from "crypto";
import { number } from "mathjs";
import shrinkWrap from "replicad-shrink-wrap";

/**
 * Manages a cache of geometries. Making a new geometry with identical arguments will
 * result in a cache hit.
 *
 * Each operation here returns an ID which can be used to perform further operations,
 * or retrieve the geometry via `get(id)`.
 */
class GeometryProvider {
  constructor() {
    this._cache = {}; // dictionary of string to geom. Acts as standin for indexeddb + serialized geoms
    this._nextId = 0;
    this._cacheHitMetrics = {};
    this._evictionCount = 0;

    this._finalizers = new FinalizationRegistry((geomKey) => {
      if (this._cache[geomKey.value]) {
        delete this._cache[geomKey.value];
        this._evictionCount++;
        // This is where we'd delete the file from indexeddb or similar
        console.log("Geometry gc'd: ", geomKey.value);
      }
    });

    setInterval(() => {
      console.log(this._cacheHitMetrics);
      console.log(
        `cache size: ${Object.keys(this._cache).length} and evictions so far: ${
          this._evictionCount
        }`
      );
    }, 10000);
  }

  // TODO: these 4 are simple memoize wrappers. Should we refactor in some way?

  drawRectangle(x, y) {
    const id = this._makeId("rectangle", x, y);
    this._getOrCreate(id, () => {
      return replicad.drawRectangle(x, y);
    });
    return id;
  }

  drawCircle(radius) {
    const id = this._makeId("circle", radius);
    this._getOrCreate(id, () => {
      return replicad.drawCircle(radius);
    });
    return id;
  }

  drawPolysides(radius, numberOfSides) {
    const id = this._makeId("polysides", radius, numberOfSides);
    this._getOrCreate(id, () => {
      return replicad.drawPolysides(radius, numberOfSides);
    });
    return id;
  }

  drawText(text, options) {
    const id = this._makeId("text", text, options);
    this._getOrCreate(id, () => {
      return replicad.drawText(text, options);
    });
    return id;
  }

  extrude(inputId, plane, height) {
    // todo we need a stringifyer for planes or they need ids themselves
    const extrudedId = this._makeId("extrude", inputId, plane, height);
    this._getOrCreate(extrudedId, () => {
      const geometry = this.get(inputId);
      return geometry
        .clone()
        .sketchOnPlane(plane.asReplicadPlane())
        .extrude(height);
    });
    return extrudedId;
  }

  move(id, dx, dy, dz) {
    const movedId = this._makeId("move", id, dx, dy, dz);
    this._getOrCreate(movedId, () => {
      const geometry = this.get(id);
      return geometry.clone().translate(dx, dy, dz);
    });
    return movedId;
  }

  move(id, dx, dy) {
    const movedId = this._makeId("move", id, dx, dy);
    this._getOrCreate(movedId, () => {
      const geometry = this.get(id);
      return geometry.clone().translate(dx, dy);
    });
    return movedId;
  }

  rotate(id, x, y, z) {
    const rotateId = this._makeId("rotate", id, x, y, z);
    this._getOrCreate(rotateId, () => {
      return this.get(id)
        .clone()
        .rotate(x, [0, 0, 0], [1, 0, 0]) // TODO: consider explicit no-op for each arg which is 0
        .rotate(y, [0, 0, 0], [0, 1, 0])
        .rotate(z, [0, 0, 0], [0, 0, 1]);
    });
    return rotateId;
  }

  scale(id, scaleFactor) {
    const scaleId = this._makeId("scale", id, scaleFactor);
    this._getOrCreate(scaleId, () => {
      return this.get(id).clone().scale(scaleFactor);
    });
    return scaleId;
  }

  fillet(id, radius) {
    const filletId = this._makeId("fillet", id, radius);
    this._getOrCreate(filletId, () => {
      const geometry = this.get(id);
      return geometry.clone().fillet(radius);
    });
    return filletId;
  }

  chamfer(id, size) {
    const chamferId = this._makeId("chamfer", id, size);
    this._getOrCreate(chamferId, () => {
      return this.get(id).clone().chamfer(size);
    });
    return chamferId;
  }

  intersect(input1ID, inputID2) {
    const id = this._makeId("intersect", input1ID, inputID2);
    this._getOrCreate(id, () => {
      const geometry1 = this.get(input1ID);
      const geometry2 = this.get(inputID2);
      return geometry1.clone().intersect(geometry2);
    });
    return id;
  }

  // Fuse 1 or more geometries together.
  fuse(...ids) {
    ids = ids.flat(Infinity);
    if (ids.length == 0) {
      throw new Error("At least one ID is required for fusion");
    } else if (ids.length == 1) {
      return ids[0]; // No fusion needed, return the single ID
    } else {
      // More than one ID, perform fusion
      const id = this._makeId("fuse", ...ids);
      this._getOrCreate(id, () => {
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
  cut(toCut, ...cutterIds) {
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
      this._getOrCreate(resultId, () => {
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

  shrinkWrap(inputShapeId, points) {
    const shrinkWrapId = this._makeId("shrinkWrap", inputShapeId, points);
    this._getOrCreate(shrinkWrapId, () => {
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
  addSingularToCache(geometry, id = undefined) {
    id = id || this._makeId("singular", this._nextId++);
    this._getOrCreate(id, () => geometry);
    return id;
  }

  get(geomKey) {
    if (geomKey instanceof GeomKey) {
      if (this._cache[geomKey.value] === undefined) {
        throw new Error(`Geometry with ID ${geomKey.value} not found in cache`);
      }
      return this._cache[geomKey.value];
    } else {
      console.trace("geometryProvider.get called with non-GeomKey:", geomKey);
      return geomKey;
    }
  }

  _makeId(type, ...args) {
    const key = GeomKey.from(type, ...args);
    this._incrementCounter(type, key);
    this._finalizers.register(this, key);
    return key;
  }

  _getOrCreate(id, builder) {
    if (!this._cache[id.value]) {
      this._cache[id.value] = builder();
    }
    return this._cache[id.value]
  }

  _incrementCounter(type, id) {
    if (!this._cacheHitMetrics[type]) {
      this._cacheHitMetrics[type] = [0, 0];
    }
    if (this._cache[id]) {
      this._cacheHitMetrics[type][0]++;
    } else {
      this._cacheHitMetrics[type][1]++;
    }
  }
}

/** Simple serializable representation of a Plane */
class Plane {
  constructor(origin, xDir, normal) {
    this.origin = origin;
    this.xDir = xDir;
    this.normal = normal;
    this.replicadRepr = null;
  }

  asReplicadPlane() {
    if (!this.replicadRepr) {
      this.replicadRepr = new replicad.Plane(
        [this.origin[0], this.origin[1], this.origin[2]],
        [this.xDir[0], this.xDir[1], this.xDir[2]],
        [this.normal[0], this.normal[1], this.normal[2]]
      );
    }
    return this.replicadRepr;
  }

  static fromReplicadPlane(plane) {
    return new Plane(
      plane.origin.toTuple(),
      plane.xDir.toTuple(),
      plane.zDir.toTuple()
    );
  }

  toJSON() {
    return {
      origin: this.origin,
      xDir: this.xDir,
      normal: this.normal,
    };
  }
}

const XYPlane = new Plane([0, 0, 0], [1, 0, 0], [0, 1, 0]);

/**
 * GeomKey is a class which specifies a particular geometry. All
 * GeometryProvider operations return a GeomKey which can be used to
 * perform further operations, or retrieve the geometry via `get(geomKey)`.
 *
 * Implementation note: This is thin wrapper around a string value. However, it
 * needs to be an object so that it gets correct garbage collection behavior.
 */
class GeomKey {
  constructor(value) {
    this._value = String(value);
  }

  get value() {
    return this._value;
  }

  equals(other) {
    return other instanceof GeomKey && this._value === other._value;
  }

  toString() {
    return this._value;
  }

  valueOf() {
    return this._value;
  }

  // For use with JSON.stringify
  toJSON() {
    return this._value;
  }

  hashCode() {
    let hash = 0;
    if (this._value.length === 0) return hash;
    for (let i = 0; i < this._value.length; i++) {
      const char = this._value.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash;
  }

  // Static factory which returns a new GeomKey based on the type of geometry being
  // created and the args used to create it. Note that some of the args may themselves
  // be GeomKey strings.
  static from(type, ...args) {
    // TODO: add some type specific serializations here, esp for planes
    for (let i = 0; i < args.length; i++) {
      if (args[i] instanceof replicad.Plane) {
        // Convert Plane to a string representation
        args[i] =
          "plane(" +
          args[i].origin.repr +
          "-" +
          args[i].xDir.repr +
          args[i].zDir.repr +
          ")";
      }
    }
    return new GeomKey(type + "-" + args.join("-"));
  }
}

export { GeometryProvider, GeomKey, Plane, XYPlane };
