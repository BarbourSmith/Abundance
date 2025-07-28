import opencascade from "replicad-opencascadejs/src/replicad_single.js";
import opencascadeWasm from "replicad-opencascadejs/src/replicad_single.wasm?url";
import * as replicad from "replicad";
import { v4 as uuidv4 } from "uuid";
import { GeometryProvider } from "./geometryProvider.js";

let defaultColor = "#aad7f2";
let loaded = false;
let geometryProvider = undefined;

const init = async () => {
  if (loaded) return Promise.resolve(true);

  const OC = await opencascade({
    locateFile: () => opencascadeWasm,
  });

  loaded = true;
  replicad.setOC(OC);
  geometryProvider = new GeometryProvider();

  return true;
};

/**
 * Checks if the input geometry is 3D (has a mesh) or 2D (sketch).
 * @param {Object} inputs - The geometry object to check
 * @returns {boolean} True if the geometry is 3D, false if it's a 2D sketch
 */
function is3D(inputs) {
  if (inputs === undefined || inputs.geometry === undefined) {
    return false; // Invalid input, assume not 3D
  }
  if (isAssembly(inputs)) {
    return inputs.geometry.some((input) => is3D(input));
  } else if (
    geometryProvider.get(inputs.geometry[0]).mesh !== undefined ||
    geometryProvider.get(inputs.geometry[0]) instanceof replicad.Wire
  ) {
    return true;
  } else {
    return false;
  }
}

/**
 * Gets the bounds of the input geometry or assembly.
 * @param {*} input - Can be a library ID, util.replicad geometry, or assembly
 * @returns {Object} The bounds object with min and max arrays
 */
function getBounds(geometry) {
  try {
    let minX = Infinity,
      minY = Infinity,
      minZ = Infinity;
    let maxX = -Infinity,
      maxY = -Infinity,
      maxZ = -Infinity;

    if (isAssembly(geometry)) {
      // Handle assembly by iterating through all parts
      actOnLeafs(geometry, (leaf) => {
        if (
          leaf.geometry &&
          leaf.geometry[0] &&
          geometryProvider.get(leaf.geometry[0]).boundingBox
        ) {
          const bbox = geometryProvider.get(leaf.geometry[0]).boundingBox
            .bounds;
          minX = Math.min(minX, bbox[0][0]);
          minY = Math.min(minY, bbox[0][1]);
          minZ = Math.min(minZ, bbox[0][2]);
          maxX = Math.max(maxX, bbox[1][0]);
          maxY = Math.max(maxY, bbox[1][1]);
          maxZ = Math.max(maxZ, bbox[1][2]);
        }
      });
    } else {
      // Handle single geometry
      if (
        geometry.geometry &&
        geometry.geometry[0] &&
        geometryProvider.get(geometry.geometry[0]).boundingBox
      ) {
        const bbox = geometryProvider.get(geometry.geometry[0]).boundingBox
          .bounds;
        minX = bbox[0][0];
        minY = bbox[0][1];
        minZ = bbox[0][2];
        maxX = bbox[1][0];
        maxY = bbox[1][1];
        maxZ = bbox[1][2];
      } else {
        throw new Error("Invalid geometry: missing boundingBox");
      }
    }

    return {
      min: [minX, minY, minZ],
      max: [maxX, maxY, maxZ],
    };
  } catch (error) {
    console.error("GetBounds error:", error);
    throw new Error(`GetBounds failed: ${error.message}`);
  }
}

/**
 * Recursively applies an action function to all leaf geometries in an assembly tree.
 * @param {Object} assembly - The assembly or leaf geometry to process
 * @param {Function} action - The function to apply to each leaf geometry. Should return the transformed leaf or undefined to remove it
 * @param {Object} plane - Optional plane to use for the resulting assembly
 * @returns {Object} The transformed assembly with the action applied to all leaves
 */
function actOnLeafs(assembly, action, plane) {
  if (assembly === undefined || assembly.geometry == undefined) {
    // Empty assembly
  }
  plane = plane || assembly.plane;

  if (
    assembly.geometry.length == 1 &&
    assembly.geometry[0].geometry == undefined
  ) {
    return action(assembly);
  }
  //This is a branch
  else {
    let transformedAssembly = [];
    assembly.geometry.forEach((subAssembly) => {
      const result = actOnLeafs(subAssembly, action);
      if (result != undefined) {
        transformedAssembly.push(result);
      }
    });
    return {
      geometry: transformedAssembly,
      tags: assembly.tags,
      bom: assembly.bom,
      plane: plane,
    };
  }
}

/**
 * A function to generate a unique ID value.
 */
function generateUniqueID() {
  return uuidv4();
}

/**
 * Checks if the input geometry is wire geometry (like from G-code).
 * @param {Object} inputs - The geometry object to check
 * @returns {boolean} True if the geometry is wire geometry, false otherwise
 */
function isWireGeometry(inputs) {
  if (isAssembly(inputs)) {
    return inputs.geometry.some((input) => isWireGeometry(input));
  } else if (
    inputs.geometry &&
    geometryProvider.get(inputs.geometry[0]) instanceof replicad.Wire
  ) {
    return true;
  } else {
    return false;
  }
}

/**
 * Checks if a part is an assembly (contains sub-geometries) or a single part.
 * @param {Object} part - The part object to check
 * @returns {boolean} True if the part is an assembly, false if it's a single part
 */
function isAssembly(part) {
  if (part == undefined || part.geometry == undefined) {
    return false;
  }
  if (part.geometry.length > 0) {
    if (part.geometry[0].geometry) {
      return true;
    } else {
      return false;
    }
  } else {
    return false;
  }
}

/**
 * Given an assembly of GeomKeys from geometryProvider, return a new assembly
 * where each key has been realized into a geometry object.
 */
function realizeAssembly(assembly) {
  return actOnLeafs(assembly, (leaf) => {
    if (leaf && leaf.geometry && leaf.geometry[0]) {
      const realizedGeometry = geometryProvider.get(leaf.geometry[0]);
      return {
        geometry: [realizedGeometry],
        tags: leaf.tags,
        color: leaf.color,
        bom: leaf.bom,
        plane: leaf.plane,
      };
    } else {
      return leaf; // No geometry to realize
    }
  });
}

/**
 * Given an assembly of real geometries, place all geometries into the cache
 * and return a new assembly which has the keys in place of the geometries.
 */
function cacheAssembly(assembly) {
  return actOnLeafs(assembly, (leaf) => {
    if (leaf.geometry && leaf.geometry[0]) {
      const geomKey = geometryProvider.addSingularToCache(leaf.geometry[0]);
      return {
        geometry: [geomKey],
        tags: leaf.tags,
        color: leaf.color,
        bom: leaf.bom,
        plane: leaf.plane,
      };
    } else {
      return leaf; // No geometry to cache
    }
  });
}

export {
  init,
  actOnLeafs,
  replicad,
  geometryProvider,
  is3D,
  isWireGeometry,
  isAssembly,
  generateUniqueID,
  getBounds,
  defaultColor,
  realizeAssembly,
  cacheAssembly,
};
