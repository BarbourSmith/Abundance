import * as replicad from "replicad";
import * as crypto from "crypto";
import { number } from "mathjs";

/**
 * A class which specifies a particular geometry. All GeometryProvider operations
 * return a GeomKey which can be used to perform further operations,
 * or retrieve the geometry via `get(id)`.
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
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash;
  }

  // Static factory method for convenience
  static from(type, ...args) {
    return new GeomKey(type + '-' + args.join('-'));
  }
}

/**
 * Keeps a cache of all geometries created in the worker.
 * 
 * Each operation here returns an ID which can be used to perform further operations,
 * or retrieve the geometry via `get(id)`.
 */
class GeometryProvider {

  constructor() {    
    this._fsstandin = {}; // dictionary of string to geom as standin for indexeddb
    this._idBuffer = 0;
    this._counter = {};
    this._defaultColor = "#aad7f2";
    this._defaultPlane = new replicad.Plane().pivot(0, "Y");
    this._registry = new FinalizationRegistry((geomKey) => {
      // Clean up cache entry when geometry is garbage collected
      if (this._cache[geomKey.value]) {
        delete this._cache[geomKey.value];
        // This is where we'd delete the file from indexeddb or similar
        console.log("Geometry gc'd: ", geomKey.value);
      }
    })
   // this._hash = crypto.createHash("sha256");
  }

  rectangle(x, y) {
    const id = this._makeId("rectangle", x, y);
    this._setIfMissing(id, () => {return replicad.drawRectangle(x, y)});
    return id;
  }

  circle(radius) {
    const id = this._makeId("circle", radius);
    this._setIfMissing(id, () => {return replicad.drawCircle(radius)});
    return id;
  }

  polygon(radius, numberOfSides) {
    const id = this._makeId("polygon", radius, numberOfSides);
    this._setIfMissing(id, () => {return replicad.drawPolysides(radius, numberOfSides)});
    return id;
  }
  
  text(text, fontSize, fontFamily) {
    const id = this._makeId("text", text, fontSize, fontFamily);
    this._setIfMissing(id, () => {
              return replicad.drawText(text, {
                startX: 0,
                startY: 0,
                fontSize: fontSize,
                font: fontFamily,
              });
            });
    return id;
  }



  extrude(inputId, plane, height) {
    // todo we need a stringifyer for planes or they need ids themselves
    const extrudedId = this._makeId("extrude", inputId, plane, height);
    this._setIfMissing(extrudedId, () => {
      const geometry = this.get(inputId);
      return geometry.clone().sketchOnPlane(plane).extrude(height);
    });
    return extrudedId;
  }

  move(id, dx, dy, dz) {
    const movedId = this._makeId("move", id, dx, dy, dz);
    this._setIfMissing(movedId, () => {
      const geometry = this.get(id);
      return geometry.clone().translate(dx, dy, dz);
    });
    return movedId;
  }

  rotate(id, x, y, z) {
    const rotateId = this._makeId("rotate", id, x, y, z);
    this._setIfMissing(rotateId, () => {
        return this.get(id)
            .clone()
            .rotate(x, [0, 0, 0], [1, 0, 0])
            .rotate(y, [0, 0, 0], [0, 1, 0])
            .rotate(z, [0, 0, 0], [0, 0, 1]);
    });
    return rotateId;
  }

  scale(id, scaleFactor) {
    const scaleId = this._makeId("scale", id, scaleFactor);
    this._setIfMissing(scaleId, () => {
      return this.get(id).clone().scale(scaleFactor);
    });
    return scaleId;
  }

  fillet(id, radius) {
    const filletId = this._makeId("fillet", id, radius);
    this._setIfMissing(filletId, () => {
      const geometry = this.get(id);
      return geometry.clone().fillet(radius);
    });
    return filletId;
  }

  chamfer(id, size) {
    const chamferId = this._makeId("chamfer", id, size);
    this._setIfMissing(chamferId, () => {
      this.get(id).clone().chamfer(size)
    });
    return chamferId;
  }

  intersect(input1ID, inputID2) {
    const id = this._makeId("intersect", input1ID, inputID2);
    this._setIfMissing(id, () => {
      const geometry1 = this.get(input1ID);
      const geometry2 = this.get(inputID2);
      return geometry1.clone().intersect(geometry2);
    });
    return id;
  }

  // Fuse 1 or more geometries together.
  fuse(...ids) {
    if (ids.length == 0) {
      throw new Error("At least one ID is required for fusion");
    } else if (ids.length == 1) {
      return ids[0]; // No fusion needed, return the single ID
    } else { // More than one ID, perform fusion
      const id = this._makeId("fuse", ...ids);
      this._setIfMissing(id, () => {
        let geometry = this.get(ids[0]);
        for (let i = 1; i < ids.length; i++) {
          geometry = geometry.clone().fuse(this.get(ids[i]));
        }
        return geometry;
      });

      return id;
    }
  }

  cut(toCut, ...cutterIds) {
    const toCutGeom = this.get(toCut);
    if (toCutGeom instanceof replicad.Wire) {
      return toCut; // no cutting needed for wires
    }
    const toCutBB = this.get(toCut).boundingBox;

    // only include cutters which aren't wires and actually affect the result
    const affectingCutterIds = cutterIds.filter((cutter) => {
      const cutterGeom = this.get(cutter);
      return !(cutterGeom instanceof replicad.Wire) && !toCutBB.isOut(cutterGeom.boundingBox);
    });

    if (affectingCutterIds.length == 0) {
      // This cut is actually a no-op, return original geometry
      return toCut;
    } else {
      const resultId = this._makeId("cut", toCut, ...affectingCutterIds);
      this._setIfMissing(resultId, () => {
        let result = this.get(toCut);
        affectingCutterIds.forEach((cutterId) => {
          const cutter = this.get(cutterId);
          result = result.clone().cut(cutter);
        });
        return result;
      });
      return resultId;
    }
  }

  /**
   * Adds the given geometry to the cache and returns the ID for it.
   * Note this method should be avoided becuase it guarantees there will never
   * be re-use of this cached geometry.
   * 
   * @param {*} geometry - geometry to be added to cache.
   * @returns key for this geometry.
   */
  addSingularToCache(geometry) {
    const id = this._makeId("singular", this._idBuffer++);
    this._setIfMissing(id, () => geometry);
    return id;
  }

  get(geomKey) {
    return this._cache[geomKey.value];
  }

  _makeId(type, ...args) {
    const key = GeomKey.from(type, ...args);
    this._incrementCounter(type, key);
    this._registry.register(this, key);
    return key;
  }


  _setIfMissing(id, builder) {
    if (!this._cache[id.value]) {
      this._cache[id.value] = builder();
    }
  }

  _incrementCounter(type, id) {
    if (!this._counter[type]) {
      this._counter[type] = [0, 0];
    }
    if (this._cache[id]) {
      this._counter[type][0]++;
    } else {
      this._counter[type][1]++;
    }
  }
}

export { GeometryProvider, GeomKey };
