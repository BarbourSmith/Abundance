import * as util from "./util";
import { AbundanceLeaf, AbundanceObject } from "./util";

/**
 * Methods in this file act on a single geometry and return a modified copy of it.
 */

/**
 * Extrudes a 2D sketch to create a 3D geometry with the specified height and returns the result.
 */
async function extrude(
  toExtrude: AbundanceObject,
  height: number
): Promise<AbundanceObject> {
  return util.actOnLeafs(toExtrude, async (leaf: AbundanceLeaf) => {
    return {
      ...leaf,
      geometry: await util.geometryProvider!.extrude(
        leaf.geometry,
        leaf.plane,
        height
      ),
      dimension: "3D",
    };
  });
}

/**
 * Moves a geometry by the specified x, y, and z distances. If the geometry is 2D, then its plane
 * will be translated by the specified z distance.
 */
async function move(
  toMove: AbundanceObject,
  x: number,
  y: number,
  z: number
): Promise<AbundanceObject> {
  if (util.is3D(toMove)) {
    return util.actOnLeafs(
      toMove,
      async (leaf: AbundanceLeaf) => {
        return {
          ...leaf,
          geometry: await util.geometryProvider!.move(leaf.geometry, x, y, z),
        };
      },
      toMove.plane
    );
  } else {
    const zTranslate = (plane: any, z: number) => {
      return util.asSimplePlane(
        util.asReplicadPlane(plane).translate([0, 0, z])
      );
    };
    return util.actOnLeafs(
      toMove,
      async (leaf: AbundanceLeaf) => {
        return {
          ...leaf,
          geometry: await util.geometryProvider!.move(leaf.geometry, x, y),
          plane: zTranslate(leaf.plane, z),
        };
      },
      zTranslate(toMove.plane, z)
    );
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
  z: number
): Promise<AbundanceObject> {
  if (util.is3D(toRotate)) {
    return util.actOnLeafs(toRotate, async (leaf: AbundanceLeaf) => {
      return {
        ...leaf,
        geometry: await util.geometryProvider!.rotate(leaf.geometry, x, y, z),
      };
    });
  } else {
    return util.actOnLeafs(toRotate, async (leaf: AbundanceLeaf) => {
      return {
        ...leaf,
        geometry: await util.geometryProvider!.rotate(leaf.geometry, 0, 0, z),
        plane: util.asSimplePlane(
          util.asReplicadPlane(leaf.plane).pivot(x, "X").pivot(y, "Y")
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
  scaleFactor: number
): Promise<AbundanceObject> {
  return util.actOnLeafs(
    geom,
    async (leaf: AbundanceLeaf) => {
      return {
        ...leaf,
        geometry: await util.geometryProvider!.scale(
          leaf.geometry,
          scaleFactor
        ),
      };
    },
    geom.plane
  );
}

/**
 * Rounds all edges in geom to radius and return the resulting geometry.
 */
async function fillet(
  geom: AbundanceObject,
  radius: number
): Promise<AbundanceObject> {
  return util.actOnLeafs(
    geom,
    async (leaf: AbundanceLeaf) => {
      return {
        ...leaf,
        geometry: await util.geometryProvider!.fillet(leaf.geometry, radius),
      };
    },
    geom.plane
  );
}

/**
 * Applies a chamfer (beveled edge) to all edges in geom. Chamfer is symmetric and specified by size.
 * Returns the resulting geometry.
 */
async function chamfer(
  geom: AbundanceObject,
  size: number
): Promise<AbundanceObject> {
  return util.actOnLeafs(
    geom,
    async (leaf: AbundanceLeaf) => {
      return {
        ...leaf,
        geometry: await util.geometryProvider!.chamfer(leaf.geometry, size),
      };
    },
    geom.plane
  );
}

export { chamfer, extrude, fillet, move, rotate, scale };
