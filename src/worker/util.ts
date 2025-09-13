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

type AbundanceObject = AbundanceLeaf | AbundanceBranch;

interface AbundanceBranch {
  geometry: AbundanceObject[];
  dimension: "2D" | "3D" | "Wire";
  plane: SimplePlane;
  color: string;
  tags: string[];
  bom: string[];
}

interface AbundanceLeaf {
  geometry: string;
  dimension: "2D" | "3D" | "Wire";
  plane: SimplePlane;
  color: string;
  tags: string[];
  bom: string[];
}

function is3D(part: AbundanceObject): boolean {
  if (part === undefined || part.geometry === undefined) {
    return false;
  }
  if (isAssembly(part)) {
    return part.geometry.some((input: any) => is3D(input));
  } else {
    // leaf
    return part.dimension === "3D";
  }
}

async function getBounds(
  geometry: AbundanceObject
): Promise<{ min: number[]; max: number[] }> {
  try {
    let minX = Infinity,
      minY = Infinity,
      minZ = Infinity;
    let maxX = -Infinity,
      maxY = -Infinity,
      maxZ = -Infinity;

    actOnLeafs(geometry, async (leaf: AbundanceLeaf) => {
      const replicadbox = (await geometryProvider!.get(leaf.geometry))
        .boundingBox;
      let bbox = replicadbox.bounds;
      minX = Math.min(minX, bbox[0][0]);
      minY = Math.min(minY, bbox[0][1]);
      maxX = Math.max(maxX, bbox[1][0]);
      maxY = Math.max(maxY, bbox[1][1]);

      if (replicadbox instanceof replicad.BoundingBox) {
        // BoundingBox is 3D
        bbox = replicadbox.bounds;
        minZ = Math.min(minZ, bbox[0][2]);
        maxZ = Math.max(maxZ, bbox[1][2]);
      }
      return leaf;
    });

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

function isLeaf(obj: AbundanceObject): obj is AbundanceLeaf {
  return obj !== undefined && !isAbundanceObject(obj.geometry[0]);
}

function actOnLeafsSync(
  assembly: AbundanceObject,
  action: (leaf: AbundanceLeaf) => AbundanceObject
): AbundanceObject {
  if (isLeaf(assembly)) {
    return action(assembly);
  } else {
    const newChildren = (assembly.geometry as AbundanceObject[]).map((child) =>
      actOnLeafsSync(child, action)
    );
    return {
      ...assembly,
      geometry: newChildren,
    };
  }
}

async function actOnLeafs(
  assembly: AbundanceObject,
  action: (leaf: AbundanceLeaf) => AbundanceObject | Promise<AbundanceObject>,
  plane?: SimplePlane
): Promise<AbundanceObject> {
  if (!isAbundanceObject(assembly)) {
    return assembly;
  }
  plane = plane || assembly.plane;

  if (isLeaf(assembly)) {
    return await action(assembly);
  } else {
    let children = assembly.geometry as AbundanceObject[];
    let transformedAssembly: any[] = [];
    for (const subAssembly of children) {
      const result = await actOnLeafs(subAssembly, action);
      if (result != undefined) {
        transformedAssembly.push(result);
      }
    }
    return {
      geometry: transformedAssembly,
      plane: plane,
      color: assembly.color,
      tags: assembly.tags,
      bom: assembly.bom,
      dimension: assembly.dimension,
    };
  }
}

/**
 * Gets all leafs from an assembly as a flat list.
 */
function flattenAssembly(assembly: AbundanceObject): AbundanceLeaf[] {
  var flattened: AbundanceLeaf[] = [];
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

function isWireGeometry(inputs: AbundanceObject): boolean {
  if (isAssembly(inputs)) {
    return inputs.geometry.some((input: any) => isWireGeometry(input));
  } else {
    return inputs.dimension === "Wire";
  }
}

function isAssembly(part: any): part is AbundanceBranch {
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

const XYPlane: SimplePlane = {
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
  AbundanceLeaf,
  SimplePlane,
  asReplicadPlane,
  asSimplePlane,
  XYPlane,
  isAbundanceObject,
  flattenAssembly,
  isLeaf,
  actOnLeafsSync,
};
