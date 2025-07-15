import * as replicad from "replicad";
import * as crypto from "crypto";

/**
 * TODO: should use indexeddb instead of a dictionary
 */
class GeometryProvider {

  constructor() {
    this._library = {};
    this._counter = {};
    this._defaultColor = "#aad7f2";
    this._defaultPlane = new replicad.Plane().pivot(0, "Y");
   // this._hash = crypto.createHash("sha256");
  }

  rectangle(x, y) {
    const id = this._getId("rectangle", x, y);
    console.log(this._counter);

    const geometry = this._getOr(id, () => {return replicad.drawRectangle(x, y)});
    return [id, geometry]
  }

  extrude(inputId, plane, height) {
    // todo we need a stringifyer for planes or they need ids themselves
    const extrudedId = this._getId("extrude", inputId, plane, height);
    const extrudedGeometry = this._getOr(extrudedId, () => {
      const geometry = this.get(inputId);
      return geometry.clone().sketchOnPlane(plane).extrude(height);
    });
    return [extrudedId, extrudedGeometry];
  }

  move(id, dx, dy, dz) {
    const movedId = this._getId("move", id, dx, dy, dz);
    const movedGeometry = this._getOr(movedId, () => {
      const geometry = this.get(id);
      return geometry.clone().translate(dx, dy, dz);
    });
    return [movedId, movedGeometry];
  }

  // Fuse 1 or more geometries together.
  fuse(...ids) {
    if (ids.length == 0) {
      throw new Error("At least one ID is required for fusion");
    } else if (ids.length == 1) {
      return [ids[0], this.get(ids[0])];
    } else { // More than one ID, perform fusion
      const id = this._getId("fuse", ...ids);
      const fusedGeometry = this._getOr(id, () => {
        let geometry = this.get(ids[0]);
        for (let i = 1; i < ids.length; i++) {
          geometry = geometry.clone().fuse(this.get(ids[i]));
        }
        return geometry;
      });

      return [id, fusedGeometry];
    }
  }

  cut(toCut, ...cutterIds) {
    const toCutBB = this.get(toCut).boundingBox;
    // only include cutters which actually affect the result
    const affectingCutterIds = cutterIds.filter((cutter) => {
      return this.get(cutter).geometry.some((g) => g.boundingBox.intersects(toCutBB));
    });
    const id = this._getId("cut", toCut, ...affectingCutterIds);

    if (affectingCutterIds.length == 0) {
      // This cut is actually a no-op, return original geometry
      return [toCut, this.get(toCut)];
    } else {
      const resultId = this._getId("cut", toCut, ...affectingCutterIds);
      const cutGeometry = this._getOr(resultId, () => {
        let result = this.get(toCut);
        affectingCutterIds.forEach((cutterId) => {
          const cutter = this.get(cutterId);
          result = result.clone().cut(cutter);
        });
        return result;
      });
      return [resultId, cutGeometry];
    }
  }



  get(id) {
    if (!this._library[id]) {
      throw new Error(`Geometry with ID ${id} not found`);
    }
    return this._library[id];
  }


  _getOr(id, builder) {
    if (!this._library[id]) {
      this._library[id] = builder();
    }
    return this._library[id];
  }

  _incrementCounter(type, id) {
    if (!this._counter[type]) {
      this._counter[type] = [0, 0];
    }
    if (this._library[id]) {
      this._counter[type][0]++;
    } else {
      this._counter[type][1]++;
    }
  }

  _getId(type, ...params) {
   // const id = this._hash.update(`${type}-${params.join('-')}`).digest('hex');
    const id = `${type}-${params.join('-')}`
    this._incrementCounter(type, id);
    return id;
  }
}

export { GeometryProvider };
