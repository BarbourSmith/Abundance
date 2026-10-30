/**
 * Side data: the non-geometry data a value carries through the graph next to
 * its geometry. Dimension labels (Label atoms) and references (images, PDF
 * pages and 3D models such as scans, brought in by Import atoms; see
 * referenceFiles.js) ride along with the shapes they are combined with, so
 * they show in the 3D view wherever those shapes do, and Move, Rotate and
 * unit conversion place them with the geometry. They never take part in
 * geometry operations: an Assembly doesn't cut them and they don't cut
 * anything.
 *
 * Side data is the `nonReplicadSerialized` array at the root of a value (an
 * AbundanceObject), never on its branches or leaves. It never reaches the CAD
 * worker: atoms compute from their inputs with it stripped, then attach what
 * their output carries (Atom.outputSideData), and CadWorkerManager strips
 * anything that slips through. So the geometry kernel and its caches don't
 * know about it, and moving a reference image doesn't invalidate a single
 * cached boolean cut.
 *
 * Items:
 *   Label:     { type: "Label", line, endSegments?, arrows, text, tags? }
 *              Coordinates are in world space; see Label.serializeLabel.
 *   Reference: { type: "Reference", kind: "image" | "pdf" | "model", asset,
 *                name, mimeType, bytes, contentBounds: { min, max },
 *                matrix, opacity, tags, page?, pageCount?, resources?,
 *                source? }
 *              The file's content (an image or PDF page as a flat rectangle,
 *              a model in its own coordinates) spans contentBounds; matrix
 *              places it in the world.
 *
 * Matrices are 4x4, column-major (three.js Matrix4.elements order). Every
 * function here is pure and returns new objects.
 */

export const SIDE_DATA_KEY = "nonReplicadSerialized";

/** Whether a value is geometry (an AbundanceObject): a leaf or an assembly. */
export function isGeometryValue(value) {
  return !!value && typeof value === "object" && "geometry" in value;
}

/** Whether a side data item is a reference (image, PDF page or 3D model). */
export function isReference(item) {
  return item?.type === "Reference";
}

/** Whether a side data item is a dimension label. */
export function isLabel(item) {
  return item?.type === "Label";
}

/**
 * The side data items a value carries, as an array. Older values stored a
 * single label object, or empty objects, in this field.
 */
export function sideDataOf(value) {
  if (!isGeometryValue(value)) return [];
  const items = value[SIDE_DATA_KEY];
  const list = Array.isArray(items) ? items : items ? [items] : [];
  return list.filter(
    (item) => item && typeof item === "object" && typeof item.type === "string",
  );
}

/** The references (images, PDF pages, 3D models) a value carries. */
export function referencesOf(value) {
  return sideDataOf(value).filter(isReference);
}

/**
 * `value` with its side data replaced by `items`. A value that isn't
 * geometry is returned unchanged.
 */
export function withSideData(value, items) {
  if (!isGeometryValue(value)) return value;
  const keep = items && items.length > 0;
  if (!keep && !(SIDE_DATA_KEY in value)) return value;
  const { [SIDE_DATA_KEY]: _, ...rest } = value;
  return keep ? { ...rest, [SIDE_DATA_KEY]: items } : rest;
}

/**
 * `value` without side data anywhere in its tree, for the CAD worker. Only
 * the nodes that change are copied, so a value without side data comes back
 * as the same object.
 */
export function withoutSideData(value) {
  if (!isGeometryValue(value)) return value;
  let result = value;
  if (SIDE_DATA_KEY in value) {
    const { [SIDE_DATA_KEY]: _, ...rest } = value;
    result = rest;
  }
  if (Array.isArray(value.geometry)) {
    const children = value.geometry.map(withoutSideData);
    if (children.some((child, i) => child !== value.geometry[i])) {
      result = { ...result, geometry: children };
    }
  }
  return result;
}

/** The side data of several values, in order. */
export function mergeSideData(values) {
  return values.flatMap((value) => sideDataOf(value));
}

/** Whether a value has any geometry (at least one part). */
export function hasGeometry(value) {
  if (!isGeometryValue(value)) return false;
  if (!Array.isArray(value.geometry)) return true;
  return value.geometry.some(hasGeometry);
}

// ---------------------------------------------------------------------------
// Matrices
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

export function translation(x, y, z) {
  return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1];
}

export function scaling(factor) {
  return [factor, 0, 0, 0, 0, factor, 0, 0, 0, 0, factor, 0, 0, 0, 0, 1];
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
// Placing side data
// ---------------------------------------------------------------------------

/** A label with every point moved by `matrix`. */
function transformLabel(label, matrix) {
  const at = (point) => applyMatrix(matrix, point);
  const segment = (s) => ({ p1: at(s.p1), p2: at(s.p2) });
  return {
    ...label,
    line: {
      ...label.line,
      start: at(label.line.start),
      end: at(label.line.end),
    },
    endSegments: label.endSegments
      ? {
          ...label.endSegments,
          start: segment(label.endSegments.start),
          end: segment(label.endSegments.end),
        }
      : undefined,
    text: { ...label.text, position: at(label.text.position) },
  };
}

/** Side data placed by a further `matrix`, applied after its own placement. */
export function transformSideData(items, matrix) {
  return items.map((item) => {
    if (isReference(item)) {
      return { ...item, matrix: multiply(matrix, item.matrix || IDENTITY) };
    }
    if (isLabel(item)) return transformLabel(item, matrix);
    return item;
  });
}

/** Side data moved by x, y, z, as the Move atom moves shapes. */
export function translateSideData(items, x, y, z) {
  const moved = transformSideData(items, translation(x || 0, y || 0, z || 0));
  return moved.map((item) =>
    isLabel(item)
      ? {
          ...item,
          movement: {
            x: (item.movement?.x || 0) + (x || 0),
            y: (item.movement?.y || 0) + (y || 0),
            z: (item.movement?.z || 0) + (z || 0),
          },
        }
      : item,
  );
}

/** Side data turned about the origin, as the Rotate atom turns 3D shapes. */
export function rotateSideData(items, x, y, z) {
  const turned = transformSideData(items, rotationXYZ(x, y, z));
  return turned.map((item) =>
    isLabel(item)
      ? {
          ...item,
          rotation: {
            x: (item.rotation?.x || 0) + (x || 0),
            y: (item.rotation?.y || 0) + (y || 0),
            z: (item.rotation?.z || 0) + (z || 0),
          },
        }
      : item,
  );
}

/** Side data scaled about the origin, as unit conversion scales shapes. */
export function scaleSideData(items, factor) {
  return transformSideData(items, scaling(factor));
}

// ---------------------------------------------------------------------------
// Tags
// ---------------------------------------------------------------------------

/** Side data with `tags` added to every item, as the Tag atom tags shapes. */
export function tagSideData(items, tags) {
  return items.map((item) => ({
    ...item,
    tags: [...new Set([...(item.tags || []), ...tags])],
  }));
}

/** Every tag on any side data item. */
export function sideDataTags(items) {
  return [...new Set(items.flatMap((item) => item.tags || []))];
}

/**
 * The side data Extract Tag keeps: items with one of the selected tags, and
 * untagged items when untagged geometry is included. With no tags selected
 * and untagged excluded (only Not Keep Out), everything is kept: side data is
 * never keepout geometry.
 */
export function extractSideDataByTags(items, selectedTags, includeUntagged) {
  if (!selectedTags.length && !includeUntagged) return items;
  return items.filter((item) => {
    const tags = item.tags || [];
    if (selectedTags.some((tag) => tags.includes(tag))) return true;
    return includeUntagged && tags.length === 0;
  });
}

// ---------------------------------------------------------------------------
// Describing references
// ---------------------------------------------------------------------------

/** The world-space bounding box of a reference: { min, max }. */
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

/** The bounding box around several references, or null for none. */
export function referencesBounds(items) {
  if (!items.length) return null;
  const boxes = items.map(referenceBounds);
  return {
    min: [0, 1, 2].map((i) => Math.min(...boxes.map((b) => b.min[i]))),
    max: [0, 1, 2].map((i) => Math.max(...boxes.map((b) => b.max[i]))),
  };
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
      ? { page: item.page, page_count: item.pageCount }
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
