import { Plane } from "./geometryProvider.js";
import * as util from "./util.js";

/**
 * Methods in this file act on a single geometry and return a modified copy of it.
 */

/**
 * Extrudes a 2D sketch to create a 3D geometry with the specified height and returns the result.
 */
function extrude(toExtrude, height) {
  return util.actOnLeafs(toExtrude, (leaf) => {
    return {
      geometry: [
        util.geometryProvider.extrude(leaf.geometry[0], leaf.plane, height),
      ],
      tags: leaf.tags,
      plane: leaf.plane,
      color: leaf.color,
      bom: leaf.bom,
    };
  });
}

/**
 * Moves a geometry by the specified x, y, and z distances. If the geometry is 2D, then it's plane
 * will be translated by the specified z distance.
 */
function move(toMove, x, y, z) {
  if (util.is3D(toMove)) {
    return util.actOnLeafs(
      toMove,
      (leaf) => {
        return {
          geometry: [util.geometryProvider.move(leaf.geometry[0], x, y, z)],
          plane: leaf.plane,
          tags: leaf.tags,
          color: leaf.color,
          bom: leaf.bom,
        };
      },
      toMove.plane
    );
  } else {
    return util.actOnLeafs(
      toMove,
      (leaf) => {
        return {
          geometry: [util.geometryProvider.move(leaf.geometry[0], x, y)],
          tags: leaf.tags,
          plane: Plane.fromReplicadPlane(
            leaf.plane.asReplicadPlane().translate([0, 0, z])
          ),
          color: leaf.color,
          bom: leaf.bom,
        };
      },
      Plane.fromReplicadPlane(
        toMove.plane.asReplicadPlane().translate([0, 0, z])
      )
    );
  }
}

/**
 * Function to rotate a geometry around the x, y, and z axis. If toRotate is 2D, it's plane will be
 * rotated based on the x and y inputs, while it will be rotated within the plane according to the z input.
 **/
async function rotate(toRotate, x, y, z) {
  if (util.is3D(toRotate)) {
    return util.actOnLeafs(toRotate, (leaf) => {
      return {
        geometry: [util.geometryProvider.rotate(leaf.geometry[0], x, y, z)],
        tags: leaf.tags,
        plane: leaf.plane,
        color: leaf.color,
        bom: leaf.bom,
      };
    });
  } else {
    return util.actOnLeafs(toRotate, (leaf) => {
      return {
        geometry: [util.geometryProvider.rotate(leaf.geometry[0], 0, 0, z)],
        tags: leaf.tags,
        plane: Plane.fromReplicadPlane(
          leaf.plane.asReplicadPlane().pivot(x, "X").pivot(y, "Y")
        ),
        color: leaf.color,
        bom: leaf.bom,
      };
    });
  }
}

/**
 * Scale geom by the given factor and return the resulting geometry.
 */
async function scale(geom, scaleFactor) {
  return util.actOnLeafs(
    geom,
    (leaf) => {
      return {
        geometry: [util.geometryProvider.scale(leaf.geometry[0], scaleFactor)],
        plane: leaf.plane,
        tags: leaf.tags,
        color: leaf.color,
        bom: leaf.bom,
      };
    },
    geom.plane
  );
}

/**
 * Rounds all edges in geom to radius and return the resulting geometry.
 */
async function fillet(geom, radius) {
  return util.actOnLeafs(
    geom,
    (leaf) => {
      return {
        geometry: [util.geometryProvider.fillet(leaf.geometry[0], radius)],
        plane: leaf.plane,
        tags: leaf.tags,
        color: leaf.color,
        bom: leaf.bom,
      };
    },
    geom.plane
  );
}

/**
 * Applies a chamfer (beveled edge) to all edges in geom. Chamfer is symmetric and specified by size.
 * Returns the resulting geometry.
 */
async function chamfer(geom, size) {
  return util.actOnLeafs(
    geom,
    (leaf) => {
      return {
        geometry: [util.geometryProvider.chamfer(leaf.geometry[0], size)],
        plane: leaf.plane,
        tags: leaf.tags,
        color: leaf.color,
        bom: leaf.bom,
      };
    },
    geom.plane
  );
}

export { extrude, move, rotate, scale, fillet, chamfer };
