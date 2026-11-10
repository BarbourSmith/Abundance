/**
 * References: images, PDF pages and 3D models (glTF/GLB) brought in by Import
 * atoms to model against. They are geometry leaves like any other, with a
 * geometryType of "image", "pdf" or "gltf", so they travel through the graph,
 * get tagged, and are placed by Move, Rotate and unit conversion. They aren't
 * replicad shapes, so operations that need one (booleans, extrude, a disjoint
 * Assembly) reject them, and outputs that only make sense for shapes (cut
 * layout, G-code, export) leave them out. See REFERENCE_POLICY in worker.ts.
 *
 * The file's bytes are stored once in the geometry cache under a file key
 * (see GeometryProvider.storeReferenceFile). A leaf's geometry id names that
 * file and where it is placed:
 *
 *   ref|<scale>|<file key>                      at its imported placement
 *   xf|<rotation>|<translation>|ref|<scale>|<file key>   moved or rotated
 *
 * Moves and rotations use the same lazy ids as shapes (lazyTransform.ts), but
 * nothing ever loads a reference as a shape: the mesh worker turns the id into
 * a placement matrix and the main thread draws the file. The scale, applied
 * first, covers an image's width, a model's file units and unit conversion of
 * GitHub molecules, none of which a rigid transform can express.
 *
 * How the file is drawn (its kind, size before placement, page, opacity, ...)
 * is in leaf.metadata.reference, a ReferenceInfo.
 */
import {
  RigidTransform,
  parseTransformedId,
  storedId,
  transformId,
} from "./lazyTransform";

const REFERENCE_GEOMETRY_TYPES = ["image", "pdf", "gltf"] as const;
type ReferenceGeometryType = (typeof REFERENCE_GEOMETRY_TYPES)[number];

const PREFIX = "ref|";

/** How a reference file is drawn. Lengths are in the file's own units. */
interface ReferenceInfo {
  kind: "image" | "pdf" | "model";
  /** Main-thread asset id of the file (its SHA-256); see referenceFiles.js. */
  asset: string;
  /** Asset ids of a .gltf's other files, by their path in the .gltf. */
  resources?: Record<string, string>;
  name: string;
  mimeType: string;
  bytes: number;
  /** The file's content before placement, as a box: { min, max }. */
  contentBounds: { min: number[]; max: number[] };
  opacity: number;
  page?: number;
  pageCount?: number;
  pixels?: [number, number];
  [key: string]: unknown;
}

/** The file stored in the cache for a reference. */
interface ReferenceFile {
  file: Blob;
  /** A .gltf's other files, by their path in the .gltf. */
  resources?: Record<string, Blob>;
}

function isReferenceType(type: unknown): type is ReferenceGeometryType {
  return REFERENCE_GEOMETRY_TYPES.includes(type as ReferenceGeometryType);
}

/** Whether a leaf (or any object with a geometryType) is a reference. */
function isReferenceLeaf(leaf: unknown): boolean {
  return (
    !!leaf &&
    typeof leaf === "object" &&
    isReferenceType((leaf as { geometryType?: unknown }).geometryType)
  );
}

/** The id of a stored reference file at `scale`, not moved. */
function referenceBaseId(fileKey: string, scale: number = 1): string {
  return `${PREFIX}${scale}|${fileKey}`;
}

function parseBase(
  base: string,
): { fileKey: string; scale: number } | undefined {
  if (!base.startsWith(PREFIX)) return undefined;
  const end = base.indexOf("|", PREFIX.length);
  const scale = Number(base.slice(PREFIX.length, end));
  if (end < 0 || !Number.isFinite(scale) || scale <= 0) {
    throw new Error("Malformed reference geometry id: " + base);
  }
  return { fileKey: base.slice(end + 1), scale };
}

/**
 * The parts of a reference id: the stored file, the scale applied first, then
 * the rigid transform. Undefined for any other id.
 */
function parseReferenceId(
  id: string,
): { fileKey: string; scale: number; transform: RigidTransform } | undefined {
  const transformed = parseTransformedId(id);
  const base = parseBase(transformed ? transformed.base : id);
  if (!base) return undefined;
  return {
    ...base,
    transform: transformed
      ? transformed.transform
      : { rotation: [1, 0, 0, 0], translation: [0, 0, 0] },
  };
}

function isReferenceId(id: string): boolean {
  return storedId(id).startsWith(PREFIX);
}

/**
 * The cache key a geometry id keeps alive: the file of a reference, the base
 * shape of a moved shape, or the id itself.
 */
function storedKey(id: string): string {
  const base = storedId(id);
  return parseBase(base)?.fileKey ?? base;
}

/**
 * A reference id scaled by `factor` about the origin. Uniform scaling
 * commutes with rotation, so it scales the file and the translation.
 */
function scaleReferenceId(id: string, factor: number): string {
  const parsed = parseReferenceId(id);
  if (!parsed) throw new Error("Not a reference geometry id: " + id);
  const { rotation, translation } = parsed.transform;
  return transformId(
    referenceBaseId(parsed.fileKey, roundScale(parsed.scale * factor)),
    {
      rotation,
      translation: translation.map((t) => t * factor) as [
        number,
        number,
        number,
      ],
    },
  );
}

// Snap float noise, so converting units there and back gives back the id.
function roundScale(scale: number): number {
  const rounded = Number(scale.toPrecision(12));
  return rounded === 0 ? scale : rounded;
}

/**
 * The 4x4 matrix placing a reference id's file, column-major (three.js
 * Matrix4.elements order): scale, then rotate, then translate.
 */
function referenceMatrix(id: string): number[] {
  const parsed = parseReferenceId(id);
  if (!parsed) throw new Error("Not a reference geometry id: " + id);
  const s = parsed.scale;
  const [w, x, y, z] = parsed.transform.rotation;
  const [tx, ty, tz] = parsed.transform.translation;
  // Rotation matrix of a unit quaternion, rows r0..r2
  const r = [
    [1 - 2 * (y * y + z * z), 2 * (x * y - w * z), 2 * (x * z + w * y)],
    [2 * (x * y + w * z), 1 - 2 * (x * x + z * z), 2 * (y * z - w * x)],
    [2 * (x * z - w * y), 2 * (y * z + w * x), 1 - 2 * (x * x + y * y)],
  ];
  return [
    r[0][0] * s,
    r[1][0] * s,
    r[2][0] * s,
    0,
    r[0][1] * s,
    r[1][1] * s,
    r[2][1] * s,
    0,
    r[0][2] * s,
    r[1][2] * s,
    r[2][2] * s,
    0,
    tx,
    ty,
    tz,
    1,
  ];
}

/** A point transformed by a column-major 4x4 matrix. */
function applyMatrix(m: number[], [x, y, z]: number[]): number[] {
  return [
    m[0] * x + m[4] * y + m[8] * z + m[12],
    m[1] * x + m[5] * y + m[9] * z + m[13],
    m[2] * x + m[6] * y + m[10] * z + m[14],
  ];
}

/** The world-space box around a reference leaf: { min, max }. */
function referenceBounds(leaf: {
  geometry: string;
  metadata?: Record<string, any>;
}): { min: number[]; max: number[] } {
  const info = leaf.metadata?.reference as ReferenceInfo | undefined;
  if (!info?.contentBounds) {
    throw new Error("Reference has no size information: " + leaf.geometry);
  }
  const matrix = referenceMatrix(leaf.geometry);
  const { min, max } = info.contentBounds;
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

/** The name operations use in errors for a reference geometry type. */
function referenceTypeName(type: ReferenceGeometryType): string {
  return type === "image"
    ? "an image"
    : type === "pdf"
      ? "a PDF"
      : "a 3D model";
}

export {
  REFERENCE_GEOMETRY_TYPES,
  ReferenceFile,
  ReferenceGeometryType,
  ReferenceInfo,
  applyMatrix,
  isReferenceId,
  isReferenceLeaf,
  isReferenceType,
  parseReferenceId,
  referenceBaseId,
  referenceBounds,
  referenceMatrix,
  referenceTypeName,
  scaleReferenceId,
  storedKey,
};
