import * as replicad from "replicad";
import opencascade from "replicad-opencascadejs/src/replicad_single.js";
import opencascadeWasm from "replicad-opencascadejs/src/replicad_single.wasm?url";
import { v4 as uuidv4 } from "uuid";
import { GeometryProvider, RequestContext } from "./geometryProvider";

const defaultColor: string = "#aad7f2";
let loaded: boolean = false;
let geometryProvider: GeometryProvider | undefined = undefined;
let ocModule: any = undefined;

const init = async (logMetrics: boolean = true): Promise<boolean> => {
  if (loaded) return Promise.resolve(true);
  //@ts-expect-error - opencascade doesn't have types
  const OC = await opencascade({
    locateFile: () => opencascadeWasm,
  });

  loaded = true;
  ocModule = OC;
  replicad.setOC(OC);
  geometryProvider = new GeometryProvider(logMetrics);

  return true;
};

/**
 * Periodically logs the size of the OpenCascade WASM linear-memory heap.
 *
 * Intended as a leak diagnostic: if the heap byte length climbs monotonically
 * across operations and never drops, replicad/OCCT objects are being orphaned
 * (typically because `.delete()` was not called on a Shape3D / Wire / Drawing
 * before its JS wrapper was dropped). A monotonically growing WASM heap will
 * eventually trigger Emscripten's `abort()` and put the worker into the
 * sticky "RuntimeError: Aborted()" state.
 *
 * @param label identifier prepended to log lines so multiple workers can be
 *     distinguished (e.g. "geometryProvider", "meshWorker").
 * @param intervalMs how often to log, defaults to 10s.
 * @returns a handle to the interval timer (so callers can clear it in tests).
 */
function startHeapMonitor(
  label: string,
  intervalMs: number = 10000,
): ReturnType<typeof setInterval> {
  let lastBytes: number | undefined = undefined;
  let peakBytes: number = 0;
  return setInterval(() => {
    const heap = ocModule?.HEAPU8;
    if (!heap) return; // OC not yet initialized
    const bytes = heap.byteLength;
    if (bytes > peakBytes) peakBytes = bytes;
    const delta = lastBytes === undefined ? 0 : bytes - lastBytes;
    lastBytes = bytes;
    const mb = (n: number) => (n / (1024 * 1024)).toFixed(1);
    console.warn(
      `[wasm-heap:${label}] ${mb(bytes)} MB (peak ${mb(peakBytes)} MB, ` +
        `delta ${delta >= 0 ? "+" : ""}${mb(delta)} MB)`,
    );
  }, intervalMs);
}

interface SimplePlane {
  origin: [number, number, number];
  xDir: [number, number, number];
  normal: [number, number, number];
}

type AbundanceObject = AbundanceLeaf | AbundanceBranch;

interface AbundanceBranch {
  geometry: AbundanceObject[];
  plane: SimplePlane;
  color: string;
  tags: string[];
  bom: string[];
  nonReplicadSerialized?: any;
}

interface AbundanceLeaf {
  geometry: string;
  dimension: "2D" | "3D" | "Wire" | "Point3D";
  plane: SimplePlane;
  color: string;
  tags: string[];
  bom: string[];
  nonReplicadSerialized?: any;
}

function dimensionLabel(geom: any): "2D" | "3D" | "Wire" | "Point3D" {
  if (geom instanceof replicad.Drawing) {
    return "2D";
  } else if (geom instanceof replicad.Wire) {
    return "Wire";
  } else if (geom instanceof replicad.Vertex) {
    return "Point3D";
  } else if (replicad.isShape3D(geom)) {
    return "3D";
  } else {
    throw new Error(
      "Unsupported geometry type: " +
        (geom && geom.constructor ? geom.constructor.name : typeof geom),
    );
  }
}

function _checkFirstDimIs(
  part: AbundanceObject,
  dimension: "2D" | "3D" | "Wire" | "Point3D",
): boolean {
  if (isAssembly(part)) {
    return part.geometry.some((input: AbundanceObject) =>
      _checkFirstDimIs(input, dimension),
    );
  } else {
    return part && part.dimension === dimension;
  }
}

function is2D(part: AbundanceObject): boolean {
  return _checkFirstDimIs(part, "2D");
}

function is3D(part: AbundanceObject): boolean {
  return _checkFirstDimIs(part, "3D");
}

function isPoint3D(part: AbundanceObject): boolean {
  return _checkFirstDimIs(part, "Point3D");
}

function isWireGeometry(part: AbundanceObject): boolean {
  return _checkFirstDimIs(part, "Wire");
}

async function getBounds(
  geometry: AbundanceObject,
  context: RequestContext,
): Promise<{ min: number[]; max: number[] }> {
  try {
    let minX = Infinity,
      minY = Infinity,
      minZ = Infinity;
    let maxX = -Infinity,
      maxY = -Infinity,
      maxZ = -Infinity;

    await actOnLeafs(geometry, async (leaf: AbundanceLeaf) => {
      const replicadbox = (await geometryProvider!.get(leaf.geometry, context))
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
      } else {
        // For 2D geometries, set Z bounds to 0 (assuming they lie on the XY plane)
        minZ = Math.min(minZ, 0);
        maxZ = Math.max(maxZ, 0);
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
  return obj !== undefined && !Array.isArray(obj.geometry);
}

function actOnLeafsSync(
  assembly: AbundanceObject,
  action: (leaf: AbundanceLeaf) => AbundanceObject,
): AbundanceObject {
  if (isLeaf(assembly)) {
    return action(assembly);
  } else {
    const newChildren = (assembly.geometry as AbundanceObject[]).map((child) =>
      actOnLeafsSync(child, action),
    );
    // Preserve nonReplicadGeom if present
    return {
      ...assembly,
      geometry: newChildren,
    };
  }
}

async function actOnLeafs(
  assembly: AbundanceObject,
  action: (
    leaf: AbundanceLeaf,
  ) => AbundanceLeaf | Promise<AbundanceLeaf | undefined>,
  plane?: SimplePlane,
  nonReplicadSerialized?: any,
): Promise<AbundanceObject> {
  if (!isAbundanceObject(assembly)) {
    return assembly;
  }
  plane = plane || assembly.plane;
  nonReplicadSerialized =
    nonReplicadSerialized || assembly.nonReplicadSerialized || {};

  if (isLeaf(assembly)) {
    const result = await action(assembly);
    if (result != undefined) {
      return result;
    } else {
      // Empty geometry represented as branch with no leafs
      return {
        ...assembly,
        plane: plane,
        geometry: [],
        nonReplicadSerialized: nonReplicadSerialized,
      };
    }
  } else {
    const children = assembly.geometry as AbundanceObject[];
    const transformedAssembly: any[] = [];
    for (const subAssembly of children) {
      const result = await actOnLeafs(subAssembly, action);
      if (result != undefined && result.geometry?.length > 0) {
        transformedAssembly.push(result);
      }
    }
    return {
      geometry: transformedAssembly,
      plane: plane,
      color: assembly.color,
      tags: assembly.tags,
      bom: assembly.bom,
      nonReplicadSerialized: nonReplicadSerialized,
    };
  }
}

/**
 * Gets all leafs from an assembly as a flat list.
 */
function flattenAssembly(assembly: AbundanceObject): AbundanceLeaf[] {
  const flattened: AbundanceLeaf[] = [];
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

function isAssembly(part: AbundanceObject): part is AbundanceBranch {
  return Array.isArray(part.geometry);
}

// Translate string representation to a replicad plane
function asReplicadPlane(plane: SimplePlane): replicad.Plane {
  return new replicad.Plane(
    [plane.origin[0], plane.origin[1], plane.origin[2]],
    [plane.xDir[0], plane.xDir[1], plane.xDir[2]],
    [plane.normal[0], plane.normal[1], plane.normal[2]],
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

async function hashFileContents(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  let hash = "";
  if (self.crypto?.subtle) {
    const digest = await self.crypto.subtle.digest("SHA-256", arrayBuffer);
    hash = Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  } else {
    console.warn("SubtleCrypto not available, falling back to simple hash");
    hash = hashString(String.fromCharCode(...new Uint8Array(arrayBuffer)));
  }
  return hash;
}

/**
 * Generates a concise 32-bit FNV-1a hash for a string (suitable for cache keys).
 * @param {string} str - The input string to hash (e.g., G-code)
 * @returns {string} - 8-character hex hash
 */
function hashString(str: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = (hash * 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

/**
 * Consolidate Euler rotations (X/Y/Z) into a single axis-angle rotation.
 *
 * Given rotations around the local/global X, Y, Z axes:
 *   Rx(xDeg) -> Ry(yDeg) -> Rz(zDeg)
 *
 * This computes:
 *   angleDeg
 *   axis [x,y,z]
 *
 * so you can do:
 *   obj.rotate(angleDeg, center, axis)
 *
 * Assumes:
 * - Right-handed coordinate system
 * - Intrinsic rotations applied in X -> Y -> Z order
 * - rotate() uses axis-angle rotation
 */

type Vec3 = [number, number, number];

interface AxisAngle {
  angleDeg: number;
  axis: Vec3;
}

function degreesToRadians(deg: number): number {
  return (deg * Math.PI) / 180;
}

function radiansToDegrees(rad: number): number {
  return (rad * 180) / Math.PI;
}

/**
 * 3x3 matrix multiplication
 */
function multiply3x3(a: number[][], b: number[][]): number[][] {
  const out = Array.from({ length: 3 }, () => [0, 0, 0]);

  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      out[r][c] = a[r][0] * b[0][c] + a[r][1] * b[1][c] + a[r][2] * b[2][c];
    }
  }

  return out;
}

function rotationX(rad: number): number[][] {
  const c = Math.cos(rad);
  const s = Math.sin(rad);

  return [
    [1, 0, 0],
    [0, c, -s],
    [0, s, c],
  ];
}

function rotationY(rad: number): number[][] {
  const c = Math.cos(rad);
  const s = Math.sin(rad);

  return [
    [c, 0, s],
    [0, 1, 0],
    [-s, 0, c],
  ];
}

function rotationZ(rad: number): number[][] {
  const c = Math.cos(rad);
  const s = Math.sin(rad);

  return [
    [c, -s, 0],
    [s, c, 0],
    [0, 0, 1],
  ];
}

/**
 * Convert a rotation matrix into axis-angle form.
 */
function matrixToAxisAngle(m: number[][]): AxisAngle {
  const trace = m[0][0] + m[1][1] + m[2][2];

  // Numerical safety
  const cosTheta = Math.min(1, Math.max(-1, (trace - 1) / 2));

  const theta = Math.acos(cosTheta);

  if (Math.abs(theta) < 1e-8) {
    return {
      angleDeg: 0,
      axis: [1, 0, 0],
    };
  }

  const sinTheta = Math.sin(theta);

  const x = (m[2][1] - m[1][2]) / (2 * sinTheta);
  const y = (m[0][2] - m[2][0]) / (2 * sinTheta);
  const z = (m[1][0] - m[0][1]) / (2 * sinTheta);

  // Normalize axis
  const len = Math.hypot(x, y, z);

  return {
    angleDeg: radiansToDegrees(theta),
    axis: [x / len, y / len, z / len],
  };
}

/**
 * Consolidate sequence of X, Y, Z rotations (around the global
 * x, y, z axes respectively) into a single rotation operation
 *
 * Rotation order:
 *   X -> Y -> Z
 */
function eulerToSingleAxisRotation(
  xDeg: number,
  yDeg: number,
  zDeg: number,
): AxisAngle {
  const rx = rotationX(degreesToRadians(xDeg));
  const ry = rotationY(degreesToRadians(yDeg));
  const rz = rotationZ(degreesToRadians(zDeg));

  // Combined rotation matrix:
  // Apply X, then Y, then Z
  const combined = multiply3x3(rz, multiply3x3(ry, rx));

  return matrixToAxisAngle(combined);
}

export {
  AbundanceLeaf,
  AbundanceObject,
  actOnLeafs,
  actOnLeafsSync,
  asReplicadPlane,
  asSimplePlane,
  defaultColor,
  dimensionLabel,
  flattenAssembly,
  generateUniqueID,
  geometryProvider,
  getBounds,
  hashFileContents,
  hashString,
  init,
  is2D,
  is3D,
  isAbundanceObject,
  isAssembly,
  isLeaf,
  isPoint3D,
  isWireGeometry,
  replicad,
  SimplePlane,
  NonReplicadGeom,
  XYPlane,
  startHeapMonitor,
  AxisAngle,
  Vec3,
  eulerToSingleAxisRotation,
};
