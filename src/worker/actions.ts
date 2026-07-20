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
  if (util.isWireGeometry(toExtrude)) {
    throw new Error("Cannot extrude a Wire.");
  }
  if (util.isPoint3D(toExtrude)) {
    throw new Error("Cannot extrude a Point3D.");
  }
  await util.init();
  if (util.is2D(toExtrude)) {
    return util.actOnLeafs(toExtrude, async (leaf: AbundanceLeaf) => {
      const transformed = {
        ...leaf,
        geometry: await util.geometryProvider!.extrude(
          leaf.geometry,
          leaf.plane,
          height,
          context,
        ),
        dimension: "3D",
      };
      // Delete boundingBox - extrude creates entirely new geometry with different bounds
      delete transformed.boundingBox;
      return transformed;
    });
  } else if (util.isFace(toExtrude)) {
    return util.actOnLeafs(toExtrude, async (leaf: AbundanceLeaf) => {
      const transformed = {
        ...leaf,
        geometry: await util.geometryProvider!.extrudeFace(
          leaf.geometry,
          height,
          context,
        ),
        dimension: "3D",
      };
      // Delete boundingBox - extrude creates entirely new geometry with different bounds
      delete transformed.boundingBox;
      return transformed;
    });
  } else {
    throw new Error("Unknown Geometry Type: " + toExtrude.dimension);
  }
}

function handleNonReplicadMove(
  toMove: AbundanceObject,
  x: number,
  y: number,
  z: number,
  context: RequestContext,
) {
  let nrs = toMove.nonReplicadSerialized;
  // Filter out empty objects from the array
  if (Array.isArray(nrs)) {
    nrs = nrs.filter((item) => item && Object.keys(item).length > 0);
  }
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
      endSegments: label.endSegments
        ? {
            ...label.endSegments,
            start: {
              p1: addVec(label.endSegments.start.p1, moveVec),
              p2: addVec(label.endSegments.start.p2, moveVec),
            },
            end: {
              p1: addVec(label.endSegments.end.p1, moveVec),
              p2: addVec(label.endSegments.end.p2, moveVec),
            },
          }
        : undefined,
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
      endSegments: nrs.endSegments
        ? {
            ...nrs.endSegments,
            start: {
              p1: addVec(nrs.endSegments.start.p1, moveVec),
              p2: addVec(nrs.endSegments.start.p2, moveVec),
            },
            end: {
              p1: addVec(nrs.endSegments.end.p1, moveVec),
              p2: addVec(nrs.endSegments.end.p2, moveVec),
            },
          }
        : undefined,
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
  if (
    util.is3D(toMove) ||
    util.isWireGeometry(toMove) ||
    util.isPoint3D(toMove)
  ) {
    return util.actOnLeafs(
      toMove,
      async (leaf: AbundanceLeaf) => {
        const transformed = {
          ...leaf,
          geometry: await util.geometryProvider!.move(
            leaf.geometry,
            x,
            y,
            z,
            context,
          ),
        };
        // Delete boundingBox - it's stale after transform
        // The box will be recomputed fresh when needed
        delete transformed.boundingBox;
        return transformed;
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
  let nrs = toRotate.nonReplicadSerialized;
  // Filter out empty objects from the array
  if (Array.isArray(nrs)) {
    nrs = nrs.filter((item) => item && Object.keys(item).length > 0);
  }
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
      const { line, text, endSegments, rotation: prevRot } = label;
      return {
        ...label,
        line: {
          ...line,
          start: rotatePoint(line.start, x, y, z),
          end: rotatePoint(line.end, x, y, z),
        },
        endSegments: endSegments
          ? {
              ...endSegments,
              start: {
                p1: rotatePoint(endSegments.start.p1, x, y, z),
                p2: rotatePoint(endSegments.start.p2, x, y, z),
              },
              end: {
                p1: rotatePoint(endSegments.end.p1, x, y, z),
                p2: rotatePoint(endSegments.end.p2, x, y, z),
              },
            }
          : undefined,
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
    const { line, text, endSegments, rotation: prevRot } = nrs;
    return {
      ...nrs,
      line: {
        ...line,
        start: rotatePoint(line.start, x, y, z),
        end: rotatePoint(line.end, x, y, z),
      },
      endSegments: endSegments
        ? {
            ...endSegments,
            start: {
              p1: rotatePoint(endSegments.start.p1, x, y, z),
              p2: rotatePoint(endSegments.start.p2, x, y, z),
            },
            end: {
              p1: rotatePoint(endSegments.end.p1, x, y, z),
              p2: rotatePoint(endSegments.end.p2, x, y, z),
            },
          }
        : undefined,
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
  if (
    util.is3D(toRotate) ||
    util.isWireGeometry(toRotate) ||
    util.isPoint3D(toRotate)
  ) {
    return util.actOnLeafs(
      toRotate,
      async (leaf: AbundanceLeaf) => {
        const transformed = {
          ...leaf,
          geometry: await util.geometryProvider!.rotate(
            leaf.geometry,
            x,
            y,
            z,
            context,
          ),
        };
        // Delete boundingBox - it's stale after transform
        delete transformed.boundingBox;
        return transformed;
      },
      toRotate.plane,
      toRotate.nonReplicadSerialized,
    );
  } else {
    return util.actOnLeafs(toRotate, async (leaf: AbundanceLeaf) => {
      const transformed = {
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
      // Delete boundingBox - it's stale after transform
      delete transformed.boundingBox;
      return transformed;
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
      const transformed = {
        ...leaf,
        geometry: await util.geometryProvider!.scale(
          leaf.geometry,
          scaleFactor,
          context,
        ),
      };
      // Delete boundingBox - it's stale after transform
      delete transformed.boundingBox;
      return transformed;
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
      const transformed = {
        ...leaf,
        geometry: await util.geometryProvider!.fillet(
          leaf.geometry,
          radius,
          context,
        ),
      };
      // Delete boundingBox - geometry shape has changed
      delete transformed.boundingBox;
      return transformed;
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
      const transformed = {
        ...leaf,
        geometry: await util.geometryProvider!.chamfer(
          leaf.geometry,
          size,
          context,
        ),
      };
      // Delete boundingBox - geometry shape has changed
      delete transformed.boundingBox;
      return transformed;
    },
    geom.plane,
  );
}

export { chamfer, extrude, fillet, move, rotate, scale };
