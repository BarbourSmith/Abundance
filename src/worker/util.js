import opencascade from "replicad-opencascadejs/src/replicad_single.js";
import opencascadeWasm from "replicad-opencascadejs/src/replicad_single.wasm?url";
import * as replicad from "replicad";
import { v4 as uuidv4 } from "uuid";

let defaultColor = "#aad7f2";
let loaded = false;
const init = async () => {
  if (loaded) return Promise.resolve(true);

  const OC = await opencascade({
    locateFile: () => opencascadeWasm,
  });

  loaded = true;
  replicad.setOC(OC);

  return true;
};

/**
 * Checks if the input geometry is 3D (has a mesh) or 2D (sketch).
 * @param {Object} inputs - The geometry object to check
 * @returns {boolean} True if the geometry is 3D, false if it's a 2D sketch
 */
function is3D(inputs) {
  // if it's an assembly assume it's 3d since our assemblies don't work for drawings right now
  if (isAssembly(inputs)) {
    return inputs.geometry.some((input) => is3D(input));
  } else if (
    inputs.geometry[0].mesh !== undefined ||
    inputs.geometry[0] instanceof replicad.Wire
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
        if (leaf.geometry && leaf.geometry[0] && leaf.geometry[0].boundingBox) {
          const bbox = leaf.geometry[0].boundingBox.bounds;
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
        geometry.geometry[0].boundingBox
      ) {
        const bbox = geometry.geometry[0].boundingBox.bounds;
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
  plane = plane || assembly.plane;
  //This is a leaf
  if (assembly.geometry == undefined) {
    // Empty geometry - silently handle
  }

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
  } else if (inputs.geometry && inputs.geometry[0] instanceof replicad.Wire) {
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

export {
  init,
  actOnLeafs,
  replicad,
  is3D,
  isWireGeometry,
  isAssembly,
  generateUniqueID,
  getBounds,
  defaultColor,
};
