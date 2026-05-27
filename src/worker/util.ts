import * as replicad from "replicad";
import opencascade from "replicad-opencascadejs/src/replicad_single.js";
import opencascadeWasm from "replicad-opencascadejs/src/replicad_single.wasm?url";
import { v4 as uuidv4 } from "uuid";
import {
  GeometryProvider,
  ReplicadObject,
  RequestContext,
} from "./geometryProvider";

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

interface AbundanceBounds {
  min: [number, number, number];
  max: [number, number, number];
}

const EMPTY_BOUNDS: AbundanceBounds = {
  min: [Infinity, Infinity, Infinity],
  max: [-Infinity, -Infinity, -Infinity],
};

type AbundanceObject = AbundanceLeaf | AbundanceBranch;

interface AbundanceBranch {
  geometry: AbundanceObject[];
  plane: SimplePlane;
  color: string;
  tags: string[];
  bom: string[];
  dimension?: "2D" | "3D" | "Wire" | "Point3D";
  nonReplicadSerialized?: any;
  boundingBox?: AbundanceBounds;
}

interface AbundanceLeaf {
  geometry: string;
  dimension: "2D" | "3D" | "Wire" | "Point3D";
  plane: SimplePlane;
  color: string;
  tags: string[];
  bom: string[];
  nonReplicadSerialized?: any;
  boundingBox?: AbundanceBounds;
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
      let bbox = undefined;
      try {
        bbox = replicadbox.bounds;
      } catch (error) {
        console.error(
          "Failed to get bounds for geometry ID " + leaf.geometry,
          error,
        );
        return {
          min: [minX, minY, minZ],
          max: [maxX, maxY, maxZ],
        };
      }
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

/**
 * Merges multiple bounding boxes into a single bounding box.
 * Returns a new bounding box that encompasses all input bounds.
 */
function mergeBounds(bounds: AbundanceBounds[]): AbundanceBounds {
  if (bounds.length === 0) {
    return EMPTY_BOUNDS;
  }

  let minX = Infinity,
    minY = Infinity,
    minZ = Infinity;
  let maxX = -Infinity,
    maxY = -Infinity,
    maxZ = -Infinity;

  for (const bound of bounds) {
    minX = Math.min(minX, bound.min[0]);
    minY = Math.min(minY, bound.min[1]);
    minZ = Math.min(minZ, bound.min[2]);
    maxX = Math.max(maxX, bound.max[0]);
    maxY = Math.max(maxY, bound.max[1]);
    maxZ = Math.max(maxZ, bound.max[2]);
  }

  return {
    min: [minX, minY, minZ],
    max: [maxX, maxY, maxZ],
  };
}

/**
 * Checks if two bounding boxes overlap.
 * Returns true if boxes intersect or touch, false if they are completely separated.
 */
function boundsOverlap(
  bounds1: AbundanceBounds | undefined,
  bounds2: AbundanceBounds | undefined,
): boolean {
  if (!bounds1 || !bounds2) {
    return true; // If either is undefined, assume they might overlap
  }

  return !(
    bounds1.max[0] < bounds2.min[0] || // bounds1 is completely to the left
    bounds1.min[0] > bounds2.max[0] || // bounds1 is completely to the right
    bounds1.max[1] < bounds2.min[1] || // bounds1 is completely below
    bounds1.min[1] > bounds2.max[1] || // bounds1 is completely above
    bounds1.max[2] < bounds2.min[2] || // bounds1 is completely in front
    bounds1.min[2] > bounds2.max[2] // bounds1 is completely behind
  );
}

/**
 * Eagerly computes bounding boxes for an assembly by merging existing child bounds.
 * This is more efficient than withAssemblyBoundingBoxes() because it doesn't recursively
 * traverse the tree - it assumes all children already have valid bounds from prior operations.
 *
 * Use this when creating assemblies or after operations where you know children have bounds.
 */
function computeAssemblyBounds(geometry: AbundanceObject): AbundanceObject {
  if (isLeaf(geometry)) {
    return geometry;
  }

  const childBounds = (geometry.geometry as AbundanceObject[])
    .map((child) => child.boundingBox)
    .filter((bounds): bounds is AbundanceBounds => bounds !== undefined);

  const boundingBox =
    childBounds.length > 0 ? mergeBounds(childBounds) : EMPTY_BOUNDS;

  return {
    ...geometry,
    boundingBox,
  };
}

/**
 * Computes and caches bounding boxes for geometries.
 *
 * Optimization: If a geometry and all its children already have valid bounds,
 * this function returns immediately without recursive traversal (unless forceRecompute=true).
 *
 * When to use forceRecompute=true:
 * - When geometry children have been modified and bounds are stale
 * - When bounds need to be recalculated for performance analysis
 * - Normally, you should NOT use this - leaves bounds are only computed once,
 *   and assembly bounds are eagerly computed when assemblies are created
 *
 * Normal usage: forceRecompute=false (default) - reuses existing bounds when available
 */
async function withAssemblyBoundingBoxes(
  geometry: AbundanceObject,
  context: RequestContext,
  forceRecompute: boolean = false,
): Promise<AbundanceObject> {
  if (isLeaf(geometry)) {
    if (geometry.boundingBox && !forceRecompute) {
      return geometry;
    }
    let bounds: AbundanceBounds | undefined = undefined;
    try {
      const boundsResult = await getBounds(geometry, context);
      bounds = {
        min: boundsResult.min as [number, number, number],
        max: boundsResult.max as [number, number, number],
      };
    } catch (_) {
      // Bounds metadata is an optimization; keep geometry operation non-fatal.
    }
    return {
      ...geometry,
      ...(bounds ? { boundingBox: bounds } : {}),
    };
  }

  // Optimization: if assembly already has bounds and all children have bounds, just return
  // unless we're forced to recompute
  if (!forceRecompute && geometry.boundingBox) {
    const childBounds = (geometry.geometry as AbundanceObject[])
      .map((child) => child.boundingBox)
      .filter((bounds): bounds is AbundanceBounds => bounds !== undefined);

    // All children have bounds, so assembly bounds are valid
    if (childBounds.length === geometry.geometry.length) {
      return geometry;
    }
  }

  const childWithBounds = await Promise.all(
    (geometry.geometry as AbundanceObject[]).map((child) =>
      withAssemblyBoundingBoxes(child, context, forceRecompute),
    ),
  );
  if (childWithBounds.length === 0) {
    return {
      ...geometry,
      geometry: [],
      boundingBox: EMPTY_BOUNDS,
    };
  }

  const childBounds = childWithBounds
    .map((child) => child.boundingBox)
    .filter((bounds): bounds is AbundanceBounds => bounds !== undefined);

  const boundingBox =
    childBounds.length > 0 ? mergeBounds(childBounds) : EMPTY_BOUNDS;

  return {
    ...geometry,
    geometry: childWithBounds,
    boundingBox,
  };
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

    // Delete boundingBox after transformation - it's now stale!
    // Child geometries have changed (new IDs from transforms), so old child bounds are invalid
    // By deleting it, withAssemblyBoundingBoxes() will be forced to recompute fresh bounds
    // based on the new geometry positions
    const result = {
      geometry: transformedAssembly,
      plane: plane,
      color: assembly.color,
      tags: assembly.tags,
      bom: assembly.bom,
      nonReplicadSerialized: nonReplicadSerialized,
      // ← boundingBox intentionally NOT included
    };

    return result;
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

function assemblyOf(subAssemblies: AbundanceObject[]): AbundanceObject {
  const result: AbundanceBranch = {
    geometry: subAssemblies,
    plane: XYPlane,
    color: defaultColor,
    tags: [],
    bom: [],
    dimension: subAssemblies[0].dimension,
    nonReplicadSerialized: subAssemblies
      .map((a) => a.nonReplicadSerialized || [])
      .flat(),
  };
  return computeAssemblyBounds(result);
}

function coPlanar(p1: SimplePlane, p2: SimplePlane): boolean {
  const normalsAreParallel =
    Math.abs(p1.normal[0] * p2.normal[1] - p1.normal[1] * p2.normal[0]) <
      1e-6 &&
    Math.abs(p1.normal[0] * p2.normal[2] - p1.normal[2] * p2.normal[0]) <
      1e-6 &&
    Math.abs(p1.normal[1] * p2.normal[2] - p1.normal[2] * p2.normal[1]) < 1e-6;

  // Check if origins are on the same plane (dot product of normal and vector between origins is zero)
  const originDelta = [
    p2.origin[0] - p1.origin[0],
    p2.origin[1] - p1.origin[1],
    p2.origin[2] - p1.origin[2],
  ];
  const originOnPlane =
    Math.abs(
      p1.normal[0] * originDelta[0] +
        p1.normal[1] * originDelta[1] +
        p1.normal[2] * originDelta[2],
    ) < 1e-6;

  return normalsAreParallel && originOnPlane;
}

export {
  AbundanceBounds,
  AbundanceLeaf,
  AbundanceObject,
  actOnLeafs,
  actOnLeafsSync,
  asReplicadPlane,
  asSimplePlane,
  assemblyOf,
  boundsOverlap,
  computeAssemblyBounds,
  coPlanar,
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
  mergeBounds,
  replicad,
  SimplePlane,
  NonReplicadGeom,
  withAssemblyBoundingBoxes,
  XYPlane,
  startHeapMonitor,
};
