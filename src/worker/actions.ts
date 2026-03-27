import * as util from "./util";
import { AbundanceLeaf, AbundanceObject } from "./util";
import { RequestContext } from "./geometryProvider";

/**
 * Methods in this file act on a single geometry and return a modified copy of it.
 */

/**
 * Extrudes a 2D sketch to create a 3D geometry with the specified height and returns the result.
 */
async function extrude(
  toExtrude: AbundanceObject,
  height: number,
  context: RequestContext,
): Promise<AbundanceObject> {
  if (util.is3D(toExtrude)) {
    throw new Error("Cannot extrude a 3D geometry.");
  }
  await util.init();
  return util.actOnLeafs(toExtrude, async (leaf: AbundanceLeaf) => {
    return {
      ...leaf,
      geometry: await util.geometryProvider!.extrude(
        leaf.geometry,
        leaf.plane,
        height,
        context,
      ),
      dimension: "3D",
    };
  });
}

function handleNonReplicadMove(
  toMove: AbundanceObject,
  x: number,
  y: number,
  z: number,
  context: RequestContext,
) {
  const nrs = toMove.nonReplicadSerialized;
  if (Array.isArray(nrs) && nrs.length > 0 && nrs[0].type === "Label") {
    const moveVec = [x, y, z];
    const addVec = (arr: number[], vec: number[]) =>
      arr.map((val, idx) => val + vec[idx]);
    return nrs.map((label) => ({
      ...label,
      line: {
        ...label.line,
        start: addVec(label.line.start, moveVec),
        end: addVec(label.line.end, moveVec),
      },
      text: {
        ...label.text,
        position: addVec(label.text.position, moveVec),
      },
      movement: {
        x: (label.movement?.x || 0) + x,
        y: (label.movement?.y || 0) + y,
        z: (label.movement?.z || 0) + z,
      },
    }));
  } else if (nrs && nrs.type === "Label") {
    const moveVec = [x, y, z];
    const addVec = (arr: number[], vec: number[]) =>
      arr.map((val, idx) => val + vec[idx]);
    return {
      ...nrs,
      line: {
        ...nrs.line,
        start: addVec(nrs.line.start, moveVec),
        end: addVec(nrs.line.end, moveVec),
      },
      text: {
        ...nrs.text,
        position: addVec(nrs.text.position, moveVec),
      },
      movement: {
        x: (nrs.movement?.x || 0) + x,
        y: (nrs.movement?.y || 0) + y,
        z: (nrs.movement?.z || 0) + z,
      },
    };
  }
}

/**
 * Moves a geometry by the specified x, y, and z distances. If the geometry is 2D, then its plane
 * will be translated by the specified z distance.
 */
async function move(
  toMove: AbundanceObject,
  x: number,
  y: number,
  z: number,
  context: RequestContext,
): Promise<AbundanceObject> {
  await util.init();
  toMove.nonReplicadSerialized = handleNonReplicadMove(
    toMove,
    x,
    y,
    z,
    context,
  );
  if (util.is3D(toMove)) {
    return util.actOnLeafs(
      toMove,
      async (leaf: AbundanceLeaf) => {
        return {
          ...leaf,
          geometry: await util.geometryProvider!.move(
            leaf.geometry,
            x,
            y,
            z,
            context,
          ),
        };
      },
      toMove.plane,
      toMove.nonReplicadSerialized,
    );
  } else {
    const zTranslate = (plane: any, z: number) => {
      const repPlane = util.asReplicadPlane(plane);
      const normalArr = repPlane.zDir.toTuple();
      const originArr = repPlane.origin.toTuple();
      const newOrigin = [
        originArr[0] + normalArr[0] * z,
        originArr[1] + normalArr[1] * z,
        originArr[2] + normalArr[2] * z,
      ] as [number, number, number];
      return util.asSimplePlane(
        new util.replicad.Plane(newOrigin, repPlane.xDir.toTuple(), normalArr),
      );
    };
    return util.actOnLeafs(
      toMove,
      async (leaf: AbundanceLeaf) => {
        return {
          ...leaf,
          geometry: await util.geometryProvider!.move(
            leaf.geometry,
            x,
            y,
            0,
            context,
          ),
          plane: zTranslate(leaf.plane, z),
        };
      },
      zTranslate(toMove.plane, z),
      toMove.nonReplicadSerialized,
    );
  }
}

function handleNonReplicadRotate(
  toRotate: AbundanceObject,
  x: number,
  y: number,
  z: number,
) {
  const nrs = toRotate.nonReplicadSerialized;
  const toRadians = (deg: number) => (deg * Math.PI) / 180;

  function rotatePoint(
    [px, py, pz]: number[],
    x: number,
    y: number,
    z: number,
  ) {
    // X axis
    let [nx, ny, nz] = [px, py, pz];
    if (x) {
      const rad = toRadians(x);
      const cos = Math.cos(rad);
      const sin = Math.sin(rad);
      [ny, nz] = [ny * cos - nz * sin, ny * sin + nz * cos];
    }
    // Y axis
    if (y) {
      const rad = toRadians(y);
      const cos = Math.cos(rad);
      const sin = Math.sin(rad);
      [nx, nz] = [nx * cos + nz * sin, -nx * sin + nz * cos];
    }
    // Z axis
    if (z) {
      const rad = toRadians(z);
      const cos = Math.cos(rad);
      const sin = Math.sin(rad);
      [nx, ny] = [nx * cos - ny * sin, nx * sin + ny * cos];
    }
    return [nx, ny, nz];
  }

  if (Array.isArray(nrs) && nrs.length > 0 && nrs[0].type === "Label") {
    return nrs.map((label) => {
      const { line, text, rotation: prevRot } = label;
      return {
        ...label,
        line: {
          ...line,
          start: rotatePoint(line.start, x, y, z),
          end: rotatePoint(line.end, x, y, z),
        },
        text: {
          ...text,
          position: rotatePoint(text.position, x, y, z),
        },
        rotation: {
          x: (prevRot?.x || 0) + x,
          y: (prevRot?.y || 0) + y,
          z: (prevRot?.z || 0) + z,
        },
      };
    });
  } else if (nrs && nrs.type === "Label") {
    const { line, text, rotation: prevRot } = nrs;
    return {
      ...nrs,
      line: {
        ...line,
        start: rotatePoint(line.start, x, y, z),
        end: rotatePoint(line.end, x, y, z),
      },
      text: {
        ...text,
        position: rotatePoint(text.position, x, y, z),
      },
      rotation: {
        x: (prevRot?.x || 0) + x,
        y: (prevRot?.y || 0) + y,
        z: (prevRot?.z || 0) + z,
      },
    };
  }
}

/**
 * Function to rotate a geometry around the x, y, and z axis. If toRotate is 2D, its plane will be
 * rotated based on the x and y inputs, while it will be rotated within the plane according to the z input.
 **/
async function rotate(
  toRotate: AbundanceObject,
  x: number,
  y: number,
  z: number,
  context: RequestContext,
): Promise<AbundanceObject> {
  await util.init();
  // Handle non-Replicad geometry rotation for labels
  if (toRotate.nonReplicadSerialized) {
    toRotate.nonReplicadSerialized = handleNonReplicadRotate(toRotate, x, y, z);
  }
  if (util.is3D(toRotate)) {
    return util.actOnLeafs(
      toRotate,
      async (leaf: AbundanceLeaf) => {
        return {
          ...leaf,
          geometry: await util.geometryProvider!.rotate(
            leaf.geometry,
            x,
            y,
            z,
            context,
          ),
        };
      },
      toRotate.plane,
      toRotate.nonReplicadSerialized,
    );
  } else {
    return util.actOnLeafs(toRotate, async (leaf: AbundanceLeaf) => {
      return {
        ...leaf,
        geometry: await util.geometryProvider!.rotate(
          leaf.geometry,
          0,
          0,
          z,
          context,
        ),
        plane: util.asSimplePlane(
          util.asReplicadPlane(leaf.plane).pivot(x, "X").pivot(y, "Y"),
        ),
      };
    });
  }
}

/**
 * Scale geom by the given factor and return the resulting geometry.
 */
async function scale(
  geom: AbundanceObject,
  scaleFactor: number,
  context: RequestContext,
): Promise<AbundanceObject> {
  await util.init();
  return util.actOnLeafs(
    geom,
    async (leaf: AbundanceLeaf) => {
      return {
        ...leaf,
        geometry: await util.geometryProvider!.scale(
          leaf.geometry,
          scaleFactor,
          context,
        ),
      };
    },
    geom.plane,
  );
}

/**
 * Rounds all edges in geom to radius and return the resulting geometry.
 */
async function fillet(
  geom: AbundanceObject,
  radius: number,
  context: RequestContext,
): Promise<AbundanceObject> {
  await util.init();
  return util.actOnLeafs(
    geom,
    async (leaf: AbundanceLeaf) => {
      return {
        ...leaf,
        geometry: await util.geometryProvider!.fillet(
          leaf.geometry,
          radius,
          context,
        ),
      };
    },
    geom.plane,
  );
}

/**
 * Applies a chamfer (beveled edge) to all edges in geom. Chamfer is symmetric and specified by size.
 * Returns the resulting geometry.
 */
async function chamfer(
  geom: AbundanceObject,
  size: number,
  context: RequestContext,
): Promise<AbundanceObject> {
  await util.init();
  return util.actOnLeafs(
    geom,
    async (leaf: AbundanceLeaf) => {
      return {
        ...leaf,
        geometry: await util.geometryProvider!.chamfer(
          leaf.geometry,
          size,
          context,
        ),
      };
    },
    geom.plane,
  );
}

export { chamfer, extrude, fillet, move, rotate, scale };
