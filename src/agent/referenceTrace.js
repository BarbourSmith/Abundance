/**
 * Reading shapes and positions off image and PDF references, for the agent
 * bridge. trace_reference turns a shape in a photo or drawing into an outline
 * in project units, ready to draw with a Code atom, and view_reference shows
 * part of a reference zoomed in with a grid in project units, so an agent can
 * read where things are instead of measuring pixels itself.
 *
 * A reference's pixels map to the world through its contentBounds (the flat
 * rectangle the image or page spans, top row at max Y, as the 3D view draws
 * it) and its matrix (where Move, Rotate, and unit conversion placed it).
 */
import { IDENTITY, applyMatrix } from "../js/sideData.js";
import { getAsset, renderPdfPage } from "../js/referenceFiles.js";

/** Longest side, in pixels, of the copy of a reference that gets traced. */
const TRACE_PIXELS = 2048;

/** Longest side, in pixels, of the preview trace_reference returns. */
const PREVIEW_PIXELS = 1024;

/** Most pixels on the longest side of a source view_reference draws from. */
const MAX_SOURCE_PIXELS = 8192;

/** Most points trace_reference returns in one outline. */
const MAX_POINTS = 1000;

// ---------------------------------------------------------------------------
// Placement
// ---------------------------------------------------------------------------

/**
 * How a reference drawn `width` x `height` pixels maps to the world. Pixel
 * coordinates are continuous: (0, 0) is the top-left corner of the image.
 * @returns {{ toWorld: (u: number, v: number) => number[],
 *   toPixel: (x: number, y: number) => number[], flat: boolean, z: number,
 *   unitsPerPixel: number, affine: number[] }}
 *   affine is [a, b, c, d, e, f] with world x = a·u + c·v + e and
 *   y = b·u + d·v + f, as canvas setTransform takes it.
 */
export function pixelPlacement(item, width, height) {
  const { min, max } = item.contentBounds;
  const matrix = item.matrix || IDENTITY;
  const z = (min[2] + max[2]) / 2;
  const toWorld = (u, v) =>
    applyMatrix(matrix, [
      min[0] + (u / width) * (max[0] - min[0]),
      max[1] - (v / height) * (max[1] - min[1]),
      z,
    ]);
  const origin = toWorld(0, 0);
  const alongU = toWorld(1, 0);
  const alongV = toWorld(0, 1);
  const [a, b] = [alongU[0] - origin[0], alongU[1] - origin[1]];
  const [c, d] = [alongV[0] - origin[0], alongV[1] - origin[1]];
  const det = a * d - b * c;
  const unitsPerPixel = Math.sqrt(Math.abs(det));
  // Flat when a step across the image doesn't change Z, so it lies in XY
  const flat =
    det !== 0 &&
    Math.abs(alongU[2] - origin[2]) <= 1e-6 * Math.hypot(a, b) &&
    Math.abs(alongV[2] - origin[2]) <= 1e-6 * Math.hypot(c, d);
  const toPixel = (x, y) => {
    const dx = x - origin[0];
    const dy = y - origin[1];
    return [(d * dx - c * dy) / det, (-b * dx + a * dy) / det];
  };
  return {
    toWorld,
    toPixel,
    flat,
    z: origin[2],
    unitsPerPixel,
    affine: [a, b, c, d, origin[0], origin[1]],
  };
}

/**
 * A canvas of the reference's picture, an image file or a PDF page, with its
 * longest side at most maxPixels.
 * @returns {Promise<HTMLCanvasElement>}
 */
export async function referenceCanvas(item, maxPixels) {
  if (item.kind === "pdf") {
    return renderPdfPage(item.asset, item.page || 1, maxPixels);
  }
  const bitmap = await createImageBitmap(getAsset(item.asset).blob);
  const scale = Math.min(1, maxPixels / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  return canvas;
}

// ---------------------------------------------------------------------------
// Masks
// ---------------------------------------------------------------------------

/** "#c83020" or "c83020" -> [200, 48, 32], or null when it isn't a color. */
export function parseHexColor(text) {
  const match = /^#?([0-9a-f]{6})$/i.exec(String(text).trim());
  if (!match) return null;
  const n = parseInt(match[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function hexColor([r, g, b]) {
  return "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("");
}

/**
 * The image's background color: the median of the pixels along its edges.
 * Transparent pixels count as white.
 * @param {ImageData} image
 */
export function backgroundColor({ data, width, height }) {
  const samples = [[], [], []];
  const add = (x, y) => {
    const i = (y * width + x) * 4;
    for (let c = 0; c < 3; c++) {
      samples[c].push(data[i + 3] < 128 ? 255 : data[i + c]);
    }
  };
  for (let x = 0; x < width; x++) {
    add(x, 0);
    add(x, height - 1);
  }
  for (let y = 1; y < height - 1; y++) {
    add(0, y);
    add(width - 1, y);
  }
  return samples.map((values) => {
    values.sort((p, q) => p - q);
    return values[values.length >> 1];
  });
}

/**
 * 1 for each pixel that is part of a shape: one within `tolerance` of `color`
 * when a color is given, otherwise one more than `tolerance` away from the
 * background color. Distance is straight-line distance in RGB (0 to 441).
 * Transparent pixels are background.
 * @param {ImageData} image
 */
export function shapeMask(
  { data, width, height },
  { color, background, tolerance },
) {
  const mask = new Uint8Array(width * height);
  const target = color || background;
  const limit = tolerance * tolerance;
  for (let p = 0; p < mask.length; p++) {
    const i = p * 4;
    if (data[i + 3] < 128) continue;
    const dr = data[i] - target[0];
    const dg = data[i + 1] - target[1];
    const db = data[i + 2] - target[2];
    const distance = dr * dr + dg * dg + db * db;
    mask[p] = color ? (distance <= limit ? 1 : 0) : distance > limit ? 1 : 0;
  }
  return mask;
}

/** The mask grown by `radius` pixels in every direction (a square). */
function dilate(mask, width, height, radius) {
  const rows = new Uint8Array(mask.length);
  const sums = new Int32Array(Math.max(width, height) + 1);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) sums[x + 1] = sums[x] + mask[y * width + x];
    for (let x = 0; x < width; x++) {
      const lo = Math.max(0, x - radius);
      const hi = Math.min(width, x + radius + 1);
      rows[y * width + x] = sums[hi] - sums[lo] > 0 ? 1 : 0;
    }
  }
  const out = new Uint8Array(mask.length);
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++)
      sums[y + 1] = sums[y] + rows[y * width + x];
    for (let y = 0; y < height; y++) {
      const lo = Math.max(0, y - radius);
      const hi = Math.min(height, y + radius + 1);
      out[y * width + x] = sums[hi] - sums[lo] > 0 ? 1 : 0;
    }
  }
  return out;
}

const invert = (mask) => mask.map((v) => 1 - v);

/**
 * The mask with gaps narrower than about 2 × radius pixels bridged: grown,
 * then shrunk back (a morphological closing).
 */
export function closeGaps(mask, width, height, radius) {
  if (radius < 1) return mask;
  const grown = dilate(mask, width, height, radius);
  return invert(dilate(invert(grown), width, height, radius));
}

/**
 * The pixels of the connected region (4-connected) that contains pixel
 * `seed`, with any holes in it filled.
 */
export function regionAt(mask, width, height, seed) {
  const region = new Uint8Array(mask.length);
  const stack = [seed];
  region[seed] = 1;
  while (stack.length) {
    const p = stack.pop();
    const x = p % width;
    for (const q of [
      x > 0 ? p - 1 : -1,
      x < width - 1 ? p + 1 : -1,
      p - width,
      p + width,
    ]) {
      if (q >= 0 && q < mask.length && mask[q] && !region[q]) {
        region[q] = 1;
        stack.push(q);
      }
    }
  }
  // Fill holes: whatever outside pixel the image's edges can't reach
  const outside = new Uint8Array(mask.length);
  const edge = [];
  for (let x = 0; x < width; x++) edge.push(x, (height - 1) * width + x);
  for (let y = 0; y < height; y++) edge.push(y * width, y * width + width - 1);
  for (const p of edge) {
    if (!region[p] && !outside[p]) {
      outside[p] = 1;
      stack.push(p);
    }
  }
  while (stack.length) {
    const p = stack.pop();
    const x = p % width;
    for (const q of [
      x > 0 ? p - 1 : -1,
      x < width - 1 ? p + 1 : -1,
      p - width,
      p + width,
    ]) {
      if (q >= 0 && q < mask.length && !region[q] && !outside[q]) {
        outside[q] = 1;
        stack.push(q);
      }
    }
  }
  for (let p = 0; p < region.length; p++) region[p] = outside[p] ? 0 : 1;
  return region;
}

/** The pixel of the largest connected region in the mask, or -1 for none. */
export function largestRegionSeed(mask, width) {
  const seen = new Uint8Array(mask.length);
  let best = -1;
  let bestSize = 0;
  const stack = [];
  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || seen[start]) continue;
    let size = 0;
    seen[start] = 1;
    stack.push(start);
    while (stack.length) {
      const p = stack.pop();
      size++;
      const x = p % width;
      for (const q of [
        x > 0 ? p - 1 : -1,
        x < width - 1 ? p + 1 : -1,
        p - width,
        p + width,
      ]) {
        if (q >= 0 && q < mask.length && mask[q] && !seen[q]) {
          seen[q] = 1;
          stack.push(q);
        }
      }
    }
    if (size > bestSize) {
      bestSize = size;
      best = start;
    }
  }
  return best;
}

/** The mask pixel nearest pixel (u, v), or -1 when the mask is empty. */
export function nearestMaskPixel(mask, width, u, v) {
  let best = -1;
  let bestDistance = Infinity;
  for (let p = 0; p < mask.length; p++) {
    if (!mask[p]) continue;
    const dx = (p % width) + 0.5 - u;
    const dy = Math.floor(p / width) + 0.5 - v;
    const distance = dx * dx + dy * dy;
    if (distance < bestDistance) {
      bestDistance = distance;
      best = p;
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Outlines
// ---------------------------------------------------------------------------

/**
 * The outer boundary of a region, along the pixel edges, as pixel-corner
 * points [u, v] going clockwise on screen (Y down).
 */
export function regionBoundary(region, width, height) {
  const inside = (x, y) =>
    x >= 0 && y >= 0 && x < width && y < height && region[y * width + x] === 1;
  const stride = width + 1;
  /** corner -> corners its boundary edges lead to */
  const next = new Map();
  const addEdge = (x0, y0, x1, y1) => {
    const key = y0 * stride + x0;
    const list = next.get(key);
    const end = y1 * stride + x1;
    if (list) list.push(end);
    else next.set(key, [end]);
  };
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!inside(x, y)) continue;
      // Each edge has the region on its right, walking clockwise on screen
      if (!inside(x, y - 1)) addEdge(x, y, x + 1, y);
      if (!inside(x + 1, y)) addEdge(x + 1, y, x + 1, y + 1);
      if (!inside(x, y + 1)) addEdge(x + 1, y + 1, x, y + 1);
      if (!inside(x - 1, y)) addEdge(x, y + 1, x, y);
    }
  }
  let longest = [];
  for (const [startKey, ends] of next) {
    while (ends.length) {
      const loop = [];
      let from = startKey;
      let to = ends.pop();
      while (true) {
        loop.push([from % stride, Math.floor(from / stride)]);
        if (to === startKey) break;
        const options = next.get(to);
        if (!options?.length) break;
        let pick = options.length - 1;
        if (options.length > 1) {
          // Where two corners touch, turn right so loops never cross
          const dx = (to % stride) - (from % stride);
          const dy = Math.floor(to / stride) - Math.floor(from / stride);
          pick = options.findIndex((end) => {
            const ex = (end % stride) - (to % stride);
            const ey = Math.floor(end / stride) - Math.floor(to / stride);
            return dx * ey - dy * ex > 0;
          });
          if (pick < 0) pick = 0;
        }
        from = to;
        to = options.splice(pick, 1)[0];
      }
      if (loop.length > longest.length) longest = loop;
    }
  }
  return longest;
}

/** A closed polyline smoothed with a Gaussian of `sigma` points. */
function smoothLoop(points, sigma) {
  if (sigma <= 0 || points.length < 3) return points;
  const reach = Math.ceil(sigma * 3);
  const weights = [];
  for (let k = -reach; k <= reach; k++) {
    weights.push(Math.exp((-k * k) / (2 * sigma * sigma)));
  }
  const total = weights.reduce((sum, w) => sum + w, 0);
  const n = points.length;
  return points.map((_, i) => {
    let u = 0;
    let v = 0;
    for (let k = -reach; k <= reach; k++) {
      const [pu, pv] = points[(((i + k) % n) + n) % n];
      const w = weights[k + reach];
      u += pu * w;
      v += pv * w;
    }
    return [u / total, v / total];
  });
}

/** Points every `step` along a closed polyline. */
function resampleLoop(points, step) {
  const n = points.length;
  const lengths = [0];
  for (let i = 0; i < n; i++) {
    const [u0, v0] = points[i];
    const [u1, v1] = points[(i + 1) % n];
    lengths.push(lengths[i] + Math.hypot(u1 - u0, v1 - v0));
  }
  const perimeter = lengths[n];
  const count = Math.max(3, Math.round(perimeter / step));
  const out = [];
  let segment = 0;
  for (let k = 0; k < count; k++) {
    const at = (k * perimeter) / count;
    while (lengths[segment + 1] < at) segment++;
    const span = lengths[segment + 1] - lengths[segment] || 1;
    const t = (at - lengths[segment]) / span;
    const [u0, v0] = points[segment];
    const [u1, v1] = points[(segment + 1) % n];
    out.push([u0 + (u1 - u0) * t, v0 + (v1 - v0) * t]);
  }
  return out;
}

const loopLength = (points) =>
  points.reduce((sum, [x0, y0], i) => {
    const [x1, y1] = points[(i + 1) % points.length];
    return sum + Math.hypot(x1 - x0, y1 - y0);
  }, 0);

/** Signed area of a closed polygon; positive when counterclockwise (Y up). */
export function signedArea(points) {
  let twice = 0;
  points.forEach(([x0, y0], i) => {
    const [x1, y1] = points[(i + 1) % points.length];
    twice += x0 * y1 - x1 * y0;
  });
  return twice / 2;
}

/**
 * Trace one shape in a reference image or PDF page.
 * @param {object} item - The reference (side data item)
 * @param {object} options
 * @param {number[]} [options.point] - [x, y] in project units inside or near the shape
 * @param {string} [options.color] - Hex color of the shape; default: anything
 *   that isn't the background
 * @param {number} [options.tolerance] - RGB distance that still matches
 * @param {number} [options.closeGaps] - Bridge gaps up to about this wide, in project units
 * @param {number} [options.spacing] - Distance between returned points, in project units
 * @param {number} [options.smoothing] - How far to smooth the pixel staircase, in project units
 */
export async function traceReference(item, options = {}) {
  const canvas = await referenceCanvas(item, TRACE_PIXELS);
  const { width, height } = canvas;
  const image = canvas.getContext("2d").getImageData(0, 0, width, height);
  const placement = pixelPlacement(item, width, height);
  const px = placement.unitsPerPixel;

  const color =
    options.color === undefined ? null : parseHexColor(options.color);
  if (options.color !== undefined && !color) {
    throw new RangeError(
      `"${options.color}" isn't a hex color such as "#c83020".`,
    );
  }
  const background = backgroundColor(image);
  const tolerance = options.tolerance ?? 40;
  let mask = shapeMask(image, { color, background, tolerance });
  const gapPixels = Math.round((options.closeGaps ?? 0) / px / 2);
  mask = closeGaps(mask, width, height, Math.min(gapPixels, 64));

  let seed;
  if (options.point) {
    if (!placement.flat) {
      throw new RangeError(
        "This reference doesn't lie flat in XY, so a point can't pick a shape on it. Leave point out to trace the largest shape.",
      );
    }
    const [u, v] = placement.toPixel(options.point[0], options.point[1]);
    if (u < 0 || v < 0 || u >= width || v >= height) {
      throw new RangeError(
        `[${options.point.join(", ")}] isn't on the reference; pick a point inside its bounding box.`,
      );
    }
    const at = Math.floor(v) * width + Math.floor(u);
    seed = mask[at] ? at : nearestMaskPixel(mask, width, u, v);
  } else {
    seed = largestRegionSeed(mask, width);
  }
  if (seed < 0) {
    throw new RangeError(
      color
        ? `No pixels within ${tolerance} of ${hexColor(color)}; raise tolerance or pick another color.`
        : `Nothing stands out from the background (${hexColor(background)}) by more than ${tolerance}; lower tolerance.`,
    );
  }
  const region = regionAt(mask, width, height, seed);
  const corners = regionBoundary(region, width, height);
  const regionPixels = region.reduce((sum, v) => sum + v, 0);

  const smoothing = Math.max(0, (options.smoothing ?? 1.5 * px) / px);
  const smoothed = smoothLoop(corners, smoothing);
  const perimeterPixels = loopLength(smoothed);
  const spacingPixels = Math.max(
    options.spacing ? options.spacing / px : perimeterPixels / 150,
    perimeterPixels / MAX_POINTS,
    0.5,
  );
  const pixelPoints = resampleLoop(smoothed, spacingPixels);

  // Round to a tenth of a pixel, in project units
  const step = 10 ** Math.floor(Math.log10(px / 10));
  const round = (n) => Math.round(n / step) * step;
  const clean = (n) => Number(round(n).toFixed(Math.max(0, -Math.log10(step))));
  let points = pixelPoints.map(([u, v]) => placement.toWorld(u, v));
  const result = { flat: placement.flat };
  if (placement.flat) {
    points = points.map(([x, y]) => [x, y]);
    // Counterclockwise in XY, the way Replicad expects a profile
    if (signedArea(points) < 0) points.reverse();
    result.z = clean(placement.z);
    result.area = clean(Math.abs(signedArea(points)));
  }
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  Object.assign(result, {
    points: points.map((p) => p.map(clean)),
    point_count: points.length,
    perimeter: clean(perimeterPixels * px),
    bounding_box: {
      min: [clean(Math.min(...xs)), clean(Math.min(...ys))],
      max: [clean(Math.max(...xs)), clean(Math.max(...ys))],
    },
    traced: {
      pixels: [width, height],
      region_pixels: regionPixels,
      units_per_pixel: Number(px.toPrecision(4)),
      ...(color
        ? { color: hexColor(color) }
        : { background: hexColor(background) }),
      tolerance,
    },
  });
  result.preview = tracePreview(canvas, pixelPoints);
  return result;
}

/** The reference with the traced outline drawn on it, as a PNG data URL. */
function tracePreview(source, pixelPoints) {
  const scale = Math.min(
    1,
    PREVIEW_PIXELS / Math.max(source.width, source.height),
  );
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(source.width * scale));
  canvas.height = Math.max(1, Math.round(source.height * scale));
  const context = canvas.getContext("2d");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.globalAlpha = 0.6;
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  context.globalAlpha = 1;
  context.strokeStyle = "#e0007a";
  context.lineWidth = 2;
  context.beginPath();
  pixelPoints.forEach(([u, v], i) =>
    i
      ? context.lineTo(u * scale, v * scale)
      : context.moveTo(u * scale, v * scale),
  );
  context.closePath();
  context.stroke();
  return canvas.toDataURL("image/png");
}

// ---------------------------------------------------------------------------
// Zoomed views
// ---------------------------------------------------------------------------

/** A round grid spacing, 1, 2, or 5 times a power of ten, near extent / 10. */
export function niceSpacing(extent) {
  const raw = extent / 10;
  const power = 10 ** Math.floor(Math.log10(raw));
  for (const factor of [1, 2, 5, 10]) {
    if (raw <= factor * power * 1.5) return factor * power;
  }
  return 10 * power;
}

/** A grid value as short text: 12.5, not 12.500000001. */
function label(value, spacing) {
  const decimals = Math.max(0, -Math.floor(Math.log10(spacing)) + 1);
  return String(Number(value.toFixed(decimals)));
}

/**
 * Draw part of a flat reference, region { min: [x, y], max: [x, y] } in
 * project units, with grid lines every `spacing` labeled in project units.
 * @returns {Promise<{ dataUrl: string, region: object, grid: number,
 *   pixels_per_unit: number, pixels: number[] }>}
 */
export async function viewReference(item, { region, spacing, size = 1024 }) {
  const [x0, y0] = region.min;
  const [x1, y1] = region.max;
  const extent = Math.max(x1 - x0, y1 - y0);
  const scale = size / extent;
  const width = Math.max(1, Math.round((x1 - x0) * scale));
  const height = Math.max(1, Math.round((y1 - y0) * scale));

  // Enough source pixels that the zoomed view isn't blurrier than it must be
  const nominal = pixelPlacement(item, 1000, 1000);
  const sourcePixels = Math.min(
    MAX_SOURCE_PIXELS,
    Math.ceil(((1000 * nominal.unitsPerPixel) / extent) * size * 1.5),
  );
  const source = await referenceCanvas(item, Math.max(256, sourcePixels));
  const placement = pixelPlacement(item, source.width, source.height);
  if (!placement.flat) {
    throw new RangeError(
      "This reference doesn't lie flat in XY; render_image shows it from any side.",
    );
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);
  // Source pixel -> world (affine) -> view pixel (Y flipped, region at 0, 0)
  const [a, b, c, d, e, f] = placement.affine;
  context.setTransform(
    scale * a,
    -scale * b,
    scale * c,
    -scale * d,
    scale * (e - x0),
    -scale * (f - y1),
  );
  context.imageSmoothingQuality = "high";
  context.drawImage(source, 0, 0);
  context.setTransform(1, 0, 0, 1, 0, 0);

  const grid = spacing || niceSpacing(extent);
  const toX = (x) => (x - x0) * scale;
  const toY = (y) => (y1 - y) * scale;
  context.font = "12px sans-serif";
  context.lineJoin = "round";
  const text = (value, tx, ty, align, baseline) => {
    context.textAlign = align;
    context.textBaseline = baseline;
    context.lineWidth = 3;
    context.strokeStyle = "rgba(255, 255, 255, 0.9)";
    context.strokeText(value, tx, ty);
    context.fillStyle = "#1a3fd6";
    context.fillText(value, tx, ty);
  };
  const lines = (from, to) => {
    const out = [];
    for (let k = Math.ceil(from / grid); k * grid <= to + grid * 1e-9; k++) {
      out.push(k * grid);
    }
    return out.slice(0, 400);
  };
  for (const x of lines(x0, x1)) {
    context.strokeStyle =
      Math.abs(x) < grid * 1e-9
        ? "rgba(26, 63, 214, 0.9)"
        : "rgba(26, 63, 214, 0.35)";
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(Math.round(toX(x)) + 0.5, 0);
    context.lineTo(Math.round(toX(x)) + 0.5, height);
    context.stroke();
    text(label(x, grid), toX(x) + 3, 3, "left", "top");
  }
  for (const y of lines(y0, y1)) {
    context.strokeStyle =
      Math.abs(y) < grid * 1e-9
        ? "rgba(26, 63, 214, 0.9)"
        : "rgba(26, 63, 214, 0.35)";
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(0, Math.round(toY(y)) + 0.5);
    context.lineTo(width, Math.round(toY(y)) + 0.5);
    context.stroke();
    text(label(y, grid), 3, toY(y) - 2, "left", "bottom");
  }
  return {
    dataUrl: canvas.toDataURL("image/png"),
    grid,
    pixels_per_unit: Number(scale.toPrecision(4)),
    pixels: [width, height],
  };
}
