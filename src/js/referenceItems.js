/**
 * References on the main thread: images, PDF pages and 3D models that Import
 * atoms bring in to model against. In a value they are geometry leaves with a
 * geometryType of "image", "pdf" or "gltf" (see src/worker/references.ts);
 * here each is described as a reference item, the form the 3D view
 * (referenceObjects.js) and the agent tools draw and measure:
 *
 *   { kind: "image" | "pdf" | "model", asset, resources?, name, mimeType,
 *     bytes, contentBounds: { min, max }, matrix, opacity, tags, page?,
 *     pageCount?, pageWidth?, pixels?, id, fileKey, geometryType }
 *
 * The file's content spans contentBounds in its own units; matrix (4x4,
 * column-major, three.js Matrix4.elements order) places it in the project.
 * The mesh worker sends the same items for displayed values, with the file.
 */
import {
  isReferenceLeaf,
  parseReferenceId,
  referenceMatrix,
} from "../worker/references";
import { flattenAssembly, withoutReferences } from "../worker/util";

export { isReferenceLeaf, withoutReferences };

/** Whether a value is geometry (an AbundanceObject): a leaf or an assembly. */
export function isGeometryValue(value) {
  return !!value && typeof value === "object" && "geometry" in value;
}

/** The reference item for a reference leaf. */
export function referenceItem(leaf) {
  return {
    ...leaf.metadata?.reference,
    geometryType: leaf.geometryType,
    id: leaf.geometry,
    fileKey: parseReferenceId(leaf.geometry)?.fileKey,
    matrix: referenceMatrix(leaf.geometry),
    tags: leaf.tags || [],
  };
}

/** The references in a value, in part order. */
export function referencesOf(value) {
  if (!isGeometryValue(value)) return [];
  return flattenAssembly(value).filter(isReferenceLeaf).map(referenceItem);
}

/** Whether a value has any shape: a part that isn't a reference. */
export function hasShapes(value) {
  if (!isGeometryValue(value)) return false;
  return flattenAssembly(value).some((leaf) => !isReferenceLeaf(leaf));
}

// ---------------------------------------------------------------------------
// Matrices: 4x4, column-major
// ---------------------------------------------------------------------------

export const IDENTITY = Object.freeze([
  1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1,
]);

/** a × b: the transform that applies b, then a. */
export function multiply(a, b) {
  const out = new Array(16);
  for (let col = 0; col < 4; col++) {
    for (let row = 0; row < 4; row++) {
      let sum = 0;
      for (let k = 0; k < 4; k++) sum += a[k * 4 + row] * b[col * 4 + k];
      out[col * 4 + row] = sum;
    }
  }
  return out;
}

function rotationAbout(axis, degrees) {
  const radians = (degrees * Math.PI) / 180;
  const c = Math.cos(radians);
  const s = Math.sin(radians);
  if (axis === 0) return [1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1];
  if (axis === 1) return [c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1];
  return [c, s, 0, 0, -s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
}

/**
 * Rotation by x, y and z degrees about the X, Y and Z axes through the
 * origin, in that order: how the Rotate atom turns 3D shapes.
 */
export function rotationXYZ(x, y, z) {
  return multiply(
    rotationAbout(2, z || 0),
    multiply(rotationAbout(1, y || 0), rotationAbout(0, x || 0)),
  );
}

/** A point transformed by a matrix. */
export function applyMatrix(matrix, [x, y, z]) {
  const m = matrix;
  return [
    m[0] * x + m[4] * y + m[8] * z + m[12],
    m[1] * x + m[5] * y + m[9] * z + m[13],
    m[2] * x + m[6] * y + m[10] * z + m[14],
  ];
}

// ---------------------------------------------------------------------------
// Describing references
// ---------------------------------------------------------------------------

/** The world-space bounding box of a reference item: { min, max }. */
export function referenceBounds(item) {
  const { min, max } = item.contentBounds;
  const matrix = item.matrix || IDENTITY;
  const lo = [Infinity, Infinity, Infinity];
  const hi = [-Infinity, -Infinity, -Infinity];
  for (const x of [min[0], max[0]]) {
    for (const y of [min[1], max[1]]) {
      for (const z of [min[2], max[2]]) {
        const p = applyMatrix(matrix, [x, y, z]);
        for (let i = 0; i < 3; i++) {
          lo[i] = Math.min(lo[i], p[i]);
          hi[i] = Math.max(hi[i], p[i]);
        }
      }
    }
  }
  return { min: lo, max: hi };
}

/** A short, JSON-safe description of a reference for agents and the UI. */
export function summarizeReference(item, index) {
  const round = (n) => Math.round(n * 1000) / 1000;
  const bounds = referenceBounds(item);
  return {
    index,
    kind: item.kind,
    name: item.name,
    ...(item.kind === "pdf"
      ? {
          page: item.page === 0 ? "all" : item.page || 1,
          page_count: item.pageCount,
        }
      : {}),
    ...(item.pixels ? { pixels: item.pixels } : {}),
    ...(item.tags?.length ? { tags: item.tags } : {}),
    bounding_box: {
      min: bounds.min.map(round),
      max: bounds.max.map(round),
      size: bounds.max.map((v, i) => round(v - bounds.min[i])),
    },
  };
}
