import opencascade from "replicad-opencascadejs/src/replicad_single.js";
import opencascadeWasm from "replicad-opencascadejs/src/replicad_single.wasm?url";
import * as replicad from "replicad";
import { v4 as uuidv4 } from "uuid";
import { GeometryProvider } from "./geometryProvider.ts";

let defaultColor: string = "#aad7f2";
let loaded: boolean = false;
let geometryProvider: GeometryProvider | undefined = undefined;

const init = async (): Promise<boolean> => {
  if (loaded) return Promise.resolve(true);

  //@ts-ignore
  const OC = await opencascade({
    locateFile: () => opencascadeWasm,
  });

  loaded = true;
  replicad.setOC(OC);
  geometryProvider = new GeometryProvider();

  return true;
};

interface SimplePlane {
  origin: [number, number, number];
  xDir: [number, number, number];
  normal: [number, number, number];
}

interface AbundanceObject {
  geometry: string | AbundanceObject[];
  plane: SimplePlane;
  color?: string;
  tags?: string[];
  bom?: string[];
}

function is3D(inputs: any): boolean {
  if (inputs === undefined || inputs.geometry === undefined) {
    return false;
  }
  if (isAssembly(inputs)) {
    return inputs.geometry.some((input: any) => is3D(input));
  } else if (
    geometryProvider!.get(inputs.geometry[0]).mesh !== undefined ||
    geometryProvider!.get(inputs.geometry[0]) instanceof replicad.Wire
  ) {
    return true;
  } else {
    return false;
  }
}

function getBounds(geometry: any): { min: number[]; max: number[] } {
  try {
    let minX = Infinity,
      minY = Infinity,
      minZ = Infinity;
    let maxX = -Infinity,
      maxY = -Infinity,
      maxZ = -Infinity;

    if (isAssembly(geometry)) {
      actOnLeafs(geometry, (leaf: AbundanceObject) => {
        if (
          leaf.geometry &&
          leaf.geometry[0] &&
          geometryProvider!.get(leaf.geometry[0]).boundingBox
        ) {
          const bbox = geometryProvider!.get(leaf.geometry[0]).boundingBox
            .bounds;
          minX = Math.min(minX, bbox[0][0]);
          minY = Math.min(minY, bbox[0][1]);
          minZ = Math.min(minZ, bbox[0][2]);
          maxX = Math.max(maxX, bbox[1][0]);
          maxY = Math.max(maxY, bbox[1][1]);
          maxZ = Math.max(maxZ, bbox[1][2]);
        }
        return leaf;
      });
    } else {
      if (
        geometry.geometry &&
        geometry.geometry[0] &&
        geometryProvider!.get(geometry.geometry[0]).boundingBox
      ) {
        const bbox = geometryProvider!.get(geometry.geometry[0]).boundingBox
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
  } catch (error: any) {
    console.error("GetBounds error:", error);
    throw new Error(`GetBounds failed: ${error.message}`);
  }
}

function isAbundanceObject(obj: any): obj is AbundanceObject {
  return obj && typeof obj === "object" && "geometry" in obj && "plane" in obj;
}

function isLeaf(assembly: AbundanceObject): boolean {
  return assembly !== undefined && !isAbundanceObject(assembly.geometry[0]);
}

function actOnLeafs(
  assembly: AbundanceObject,
  action: (leaf: AbundanceObject) => AbundanceObject,
  plane?: SimplePlane
): AbundanceObject {
  if (!isAbundanceObject(assembly)) {
    return assembly;
  }
  plane = plane || assembly.plane;

  if (isLeaf(assembly)) {
    return action(assembly);
  } else {
    let children = assembly.geometry as AbundanceObject[];
    let transformedAssembly: any[] = [];
    children.forEach((subAssembly: any) => {
      const result = actOnLeafs(subAssembly, action);
      if (result != undefined) {
        transformedAssembly.push(result);
      }
    });
    return {
      geometry: transformedAssembly,
      plane: plane,
      color: assembly.color,
      tags: assembly.tags,
      bom: assembly.bom,
    };
  }
}

/**
 * Recursively flattens an assembly tree into a flat array of geometry objects with colors.
 * @param {Object} assembly - The assembly to flatten
 * @returns {Array} An array of objects containing geometry and color properties
 */
function flattenAssembly(assembly: AbundanceObject): AbundanceObject[] {
  var flattened: AbundanceObject[] = [];
  if (assembly == undefined || assembly.geometry == undefined) {
    console.trace("attempted to flatten empty assembly");
    return flattened;
  }

  //This is a leaf
  if (isLeaf(assembly)) {
    flattened.push(assembly);
    return flattened;
  } else {
    const children = assembly.geometry as AbundanceObject[];
    children.forEach((subAssembly) => {
      flattened.push(...flattenAssembly(subAssembly));
    });
    return flattened;
  }
}

function generateUniqueID(): string {
  return uuidv4();
}

function isWireGeometry(inputs: any): boolean {
  if (isAssembly(inputs)) {
    return inputs.geometry.some((input: any) => isWireGeometry(input));
  } else if (
    inputs.geometry &&
    geometryProvider!.get(inputs.geometry[0]) instanceof replicad.Wire
  ) {
    return true;
  } else {
    return false;
  }
}

function isAssembly(part: any): boolean {
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

function realizeAssembly(assembly: any): any {
  return actOnLeafs(assembly, (leaf: any) => {
    if (leaf && leaf.geometry && leaf.geometry[0]) {
      const realizedGeometry = geometryProvider!.get(leaf.geometry[0]);
      return {
        geometry: [realizedGeometry],
        tags: leaf.tags,
        color: leaf.color,
        bom: leaf.bom,
        plane: leaf.plane,
      };
    } else {
      return leaf;
    }
  });
}

function cacheAssembly(assembly: any): any {
  return actOnLeafs(assembly, (leaf: any) => {
    if (leaf.geometry && leaf.geometry[0]) {
      const geomKey = geometryProvider!.addSingularToCache(leaf.geometry[0]);
      return {
        geometry: [geomKey],
        tags: leaf.tags,
        color: leaf.color,
        bom: leaf.bom,
        plane: leaf.plane,
      };
    } else {
      return leaf;
    }
  });
}

// Translate string representation to a replicad plane
function asReplicadPlane(plane: SimplePlane): replicad.Plane {
  return new replicad.Plane(
    [plane.origin[0], plane.origin[1], plane.origin[2]],
    [plane.xDir[0], plane.xDir[1], plane.xDir[2]],
    [plane.normal[0], plane.normal[1], plane.normal[2]]
  );
}

// Translate replicad plane to a simple representation which can be
// shipped between threads.
function asSimplePlane(plane: replicad.Plane): SimplePlane {
  return {
    origin: plane.origin.toTuple(),
    xDir: plane.xDir.toTuple(),
    normal: plane.zDir.toTuple(),
  };
}

const XYPlane = {
  origin: [0, 0, 0],
  xDir: [1, 0, 0],
  normal: [0, 0, 1],
};

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
  AbundanceObject,
  SimplePlane,
  asReplicadPlane,
  asSimplePlane,
  XYPlane,
  isAbundanceObject,
  flattenAssembly,
};
