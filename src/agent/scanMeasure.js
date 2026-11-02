/**
 * Measuring 3D model references (room scans and other meshes) and cutting
 * sections through them, for the agent bridge.
 *
 * measure_scan finds a scan's floor, ceiling and main wall directions, says
 * how far it is from level and square, and gives the Rotate and Move that put
 * the floor at Z = 0 with the walls along X and Y, then lists the large flat
 * surfaces (floor, seat tops, walls, window reveals) in those aligned
 * coordinates. section_view cuts a plane through an atom's geometry and the
 * models it carries and draws both, so a model can be checked against a scan
 * line by line.
 *
 * Triangles are flat arrays of world coordinates in project units, nine
 * numbers per triangle, wherever Move and Rotate placed the reference.
 */
import * as THREE from "three";
import {
  applyMatrix,
  IDENTITY,
  multiply,
  rotationXYZ,
} from "../js/referenceItems.js";
import { disposeObject, parseModel } from "../js/referenceFiles.js";
import { gridLabel, niceSpacing } from "./referenceTrace.js";

const DEG = 180 / Math.PI;

/** An angle in degrees, wrapped into [-180, 180). */
const wrap180 = (degrees) => ((((degrees + 180) % 360) + 360) % 360) - 180;

// ---------------------------------------------------------------------------
// Triangles
// ---------------------------------------------------------------------------

/**
 * A model reference's triangles in world coordinates.
 * @returns {Promise<Float64Array>} Nine numbers per triangle
 */
export async function referenceTriangles(item) {
  const scene = await parseModel(item.asset, item.resources);
  try {
    const placement = item.matrix || IDENTITY;
    const chunks = [];
    let total = 0;
    scene.traverse((child) => {
      if (!child.isMesh) return;
      const position = child.geometry.attributes.position;
      if (!position) return;
      const matrix = multiply(placement, child.matrixWorld.elements);
      const index = child.geometry.index;
      const count = index ? index.count : position.count;
      const out = new Float64Array(count * 3);
      for (let i = 0; i < count; i++) {
        const v = index ? index.getX(i) : i;
        const p = applyMatrix(matrix, [
          position.getX(v),
          position.getY(v),
          position.getZ(v),
        ]);
        out.set(p, i * 3);
      }
      chunks.push(out);
      total += out.length;
    });
    const all = new Float64Array(total);
    let at = 0;
    for (const chunk of chunks) {
      all.set(chunk, at);
      at += chunk.length;
    }
    return all;
  } finally {
    disposeObject(scene);
  }
}

/**
 * The triangles of display meshes from the CAD worker ({ faces: { vertices,
 * triangles } }), one array per mesh, already in world coordinates.
 * @returns {Float64Array[]}
 */
export function meshTriangles(meshes) {
  const out = [];
  for (const mesh of meshes || []) {
    const vertices = mesh?.faces?.vertices;
    const triangles = mesh?.faces?.triangles;
    if (!vertices?.length || !triangles?.length) continue;
    const tris = new Float64Array(triangles.length * 3);
    for (let i = 0; i < triangles.length; i++) {
      const v = triangles[i] * 3;
      tris[i * 3] = vertices[v];
      tris[i * 3 + 1] = vertices[v + 1];
      tris[i * 3 + 2] = vertices[v + 2];
    }
    out.push(tris);
  }
  return out;
}

/**
 * Each triangle's unit normal, area, and centroid.
 * @param {Float64Array} tris
 */
export function triangleFacts(tris) {
  const n = Math.floor(tris.length / 9);
  const normals = new Float64Array(n * 3);
  const areas = new Float64Array(n);
  const centroids = new Float64Array(n * 3);
  for (let t = 0; t < n; t++) {
    const o = t * 9;
    const ax = tris[o + 3] - tris[o];
    const ay = tris[o + 4] - tris[o + 1];
    const az = tris[o + 5] - tris[o + 2];
    const bx = tris[o + 6] - tris[o];
    const by = tris[o + 7] - tris[o + 1];
    const bz = tris[o + 8] - tris[o + 2];
    const cx = ay * bz - az * by;
    const cy = az * bx - ax * bz;
    const cz = ax * by - ay * bx;
    const length = Math.hypot(cx, cy, cz);
    areas[t] = length / 2;
    if (length > 0) {
      normals[t * 3] = cx / length;
      normals[t * 3 + 1] = cy / length;
      normals[t * 3 + 2] = cz / length;
    }
    for (let k = 0; k < 3; k++) {
      centroids[t * 3 + k] =
        (tris[o + k] + tris[o + 3 + k] + tris[o + 6 + k]) / 3;
    }
  }
  return { count: n, normals, areas, centroids };
}

/** facts with every normal and centroid moved by a 4x4 matrix. */
function transformFacts(facts, matrix) {
  const normals = new Float64Array(facts.normals.length);
  const centroids = new Float64Array(facts.centroids.length);
  const turn = [...matrix.slice(0, 12), 0, 0, 0, 1];
  for (let t = 0; t < facts.count; t++) {
    const i = t * 3;
    normals.set(
      applyMatrix(turn, [
        facts.normals[i],
        facts.normals[i + 1],
        facts.normals[i + 2],
      ]),
      i,
    );
    centroids.set(
      applyMatrix(matrix, [
        facts.centroids[i],
        facts.centroids[i + 1],
        facts.centroids[i + 2],
      ]),
      i,
    );
  }
  return { ...facts, normals, centroids };
}

// ---------------------------------------------------------------------------
// Measuring a scan
// ---------------------------------------------------------------------------

/** The weighted value below which `fraction` of the weight lies. */
function weightedQuantile(values, weights, fraction) {
  const order = [...values.keys()].sort((i, j) => values[i] - values[j]);
  const total = weights.reduce((s, w) => s + w, 0);
  let seen = 0;
  for (const i of order) {
    seen += weights[i];
    if (seen >= fraction * total) return values[i];
  }
  return values[order[order.length - 1]];
}

/**
 * Peaks of an area-weighted histogram: the offsets where the most surface
 * area lies, at least `separation` apart, heaviest first.
 */
function histogramPeaks(values, weights, { bin, separation, minWeight, max }) {
  if (!values.length) return [];
  let lo = Infinity,
    hi = -Infinity;
  for (const v of values) {
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  const bins = Math.max(1, Math.ceil((hi - lo) / bin) + 1);
  const sums = new Float64Array(bins);
  values.forEach((v, i) => (sums[Math.floor((v - lo) / bin)] += weights[i]));
  // Smooth over three bins so a plane split across two bins counts once
  const smooth = sums.map(
    (s, i) => s + (sums[i - 1] || 0) + (sums[i + 1] || 0),
  );
  const order = [...smooth.keys()].sort((i, j) => smooth[j] - smooth[i]);
  const peaks = [];
  for (const i of order) {
    if (smooth[i] < minWeight || peaks.length >= max) break;
    const at = lo + (i + 0.5) * bin;
    if (peaks.some((p) => Math.abs(p - at) < separation)) continue;
    peaks.push(at);
  }
  return peaks;
}

/**
 * Measure a scan: its floor, ceiling and main wall directions, how to level
 * and square it, and its large flat surfaces once aligned.
 * @param {Float64Array} tris - Triangles in world coordinates
 * @param {object} options
 * @param {number} options.mmPerUnit - Millimeters per project unit
 * @param {number} [options.maxPlanes] - Most surfaces to list per direction
 */
export function measureScan(tris, { mmPerUnit = 1, maxPlanes = 12 } = {}) {
  const mm = (value) => value / mmPerUnit; // millimeters to project units
  const facts = triangleFacts(tris);
  if (!facts.count) throw new RangeError("The model has no triangles.");

  // The floor: the lowest level holding a large share of the upward-facing
  // area. Furniture tops and seats sit higher; a table can outweigh the floor
  // but never sits under it.
  const upward = [];
  for (let t = 0; t < facts.count; t++) {
    if (facts.normals[t * 3 + 2] > Math.cos(30 / DEG)) upward.push(t);
  }
  if (!upward.length) {
    throw new RangeError(
      "No upward-facing surface was found to use as the floor. The model may be on its side; turn it with a Rotate atom so its floor faces up.",
    );
  }
  const floorLevels = histogramPeaks(
    upward.map((t) => facts.centroids[t * 3 + 2]),
    upward.map((t) => facts.areas[t]),
    { bin: mm(20), separation: mm(150), minWeight: 0, max: 20 },
  );
  const levelArea = (z) =>
    upward.reduce(
      (s, t) =>
        Math.abs(facts.centroids[t * 3 + 2] - z) < mm(60)
          ? s + facts.areas[t]
          : s,
      0,
    );
  const areas = floorLevels.map(levelArea);
  const biggest = Math.max(...areas);
  const floorGuess = Math.min(
    ...floorLevels.filter((_, i) => areas[i] >= 0.3 * biggest),
  );
  // Its tilt: the area-weighted mean of its normals, which a scanner's noise
  // averages out of and a few large triangles give exactly. A tilted floor
  // runs out of a band of Z, so the floor is picked again by height along
  // its normal until it settles.
  let floorTris = upward.filter(
    (t) => Math.abs(facts.centroids[t * 3 + 2] - floorGuess) < mm(80),
  );
  const floorNormal = new THREE.Vector3(0, 0, 1);
  for (let pass = 0; pass < 4 && floorTris.length; pass++) {
    floorNormal.set(0, 0, 0);
    for (const t of floorTris) {
      const w = facts.areas[t];
      floorNormal.x += w * facts.normals[t * 3];
      floorNormal.y += w * facts.normals[t * 3 + 1];
      floorNormal.z += w * facts.normals[t * 3 + 2];
    }
    floorNormal.normalize();
    const along = (t) =>
      floorNormal.x * facts.centroids[t * 3] +
      floorNormal.y * facts.centroids[t * 3 + 1] +
      floorNormal.z * facts.centroids[t * 3 + 2];
    const height = weightedQuantile(
      floorTris.map(along),
      floorTris.map((t) => facts.areas[t]),
      0.5,
    );
    const facing = (t) =>
      floorNormal.x * facts.normals[t * 3] +
      floorNormal.y * facts.normals[t * 3 + 1] +
      floorNormal.z * facts.normals[t * 3 + 2];
    floorTris = upward.filter(
      (t) =>
        Math.abs(along(t) - height) < mm(60) && facing(t) > Math.cos(20 / DEG),
    );
  }
  const floorTrisZ = floorTris.map((t) => facts.centroids[t * 3 + 2]);
  const floorTrisArea = floorTris.map((t) => facts.areas[t]);

  // Level: turn about X, then Y, as the Rotate atom does, until the floor's
  // normal points straight up
  const levelX = Math.atan2(floorNormal.y, floorNormal.z) * DEG;
  const levelY =
    Math.atan2(-floorNormal.x, Math.hypot(floorNormal.y, floorNormal.z)) * DEG;
  const leveled = transformFacts(facts, rotationXYZ(levelX, levelY, 0));

  // Square: the walls' directions repeat every 90°, so average 4θ around
  // the strongest direction
  const quarterBins = new Float64Array(360);
  const walls = [];
  for (let t = 0; t < facts.count; t++) {
    const nx = leveled.normals[t * 3];
    const ny = leveled.normals[t * 3 + 1];
    if (Math.abs(leveled.normals[t * 3 + 2]) > 0.2) continue;
    const fourTheta = 4 * Math.atan2(ny, nx) * DEG;
    walls.push([fourTheta, facts.areas[t]]);
    quarterBins[Math.floor(wrap180(fourTheta) + 180) % 360] += facts.areas[t];
  }
  let wallAngle = 0;
  if (walls.length) {
    let peak = 0;
    for (let i = 1; i < 360; i++) {
      const sum = (k) =>
        quarterBins[(k + 359) % 360] +
        quarterBins[k] +
        quarterBins[(k + 1) % 360];
      if (sum(i) > sum(peak)) peak = i;
    }
    let sx = 0,
      sy = 0;
    for (const [fourTheta, w] of walls) {
      if (Math.abs(wrap180(fourTheta - (peak - 179.5))) > 12) continue;
      sx += w * Math.cos(fourTheta / DEG);
      sy += w * Math.sin(fourTheta / DEG);
    }
    wallAngle = (Math.atan2(sy, sx) * DEG) / 4;
  }

  const rotate = { x: levelX, y: levelY, z: -wallAngle };
  const turned = transformFacts(
    facts,
    rotationXYZ(rotate.x, rotate.y, rotate.z),
  );
  const floorZ = weightedQuantile(
    floorTris.map((t) => turned.centroids[t * 3 + 2]),
    floorTris.map((t) => facts.areas[t]),
    0.5,
  );
  const move = { x: 0, y: 0, z: -floorZ };
  const lift = [...IDENTITY.slice(0, 12), 0, 0, move.z, 1];
  const aligned = transformFacts(turned, lift);
  const toAligned = multiply(lift, rotationXYZ(rotate.x, rotate.y, rotate.z));

  // How flat the floor is once level: half the spread of its middle 90%
  const floorHeights = floorTris.map((t) => aligned.centroids[t * 3 + 2]);
  const floorWeights = floorTris.map((t) => facts.areas[t]);
  const floorSpread =
    (weightedQuantile(floorHeights, floorWeights, 0.95) -
      weightedQuantile(floorHeights, floorWeights, 0.05)) /
    2;

  // Large flat surfaces, in aligned coordinates
  const minArea = mm(mm(1e5)); // 0.1 m²
  const surfaces = (axis, sign) => {
    const picked = [];
    for (let t = 0; t < facts.count; t++) {
      if (sign * aligned.normals[t * 3 + axis] > 0.95) picked.push(t);
    }
    const offsets = picked.map((t) => aligned.centroids[t * 3 + axis]);
    const weights = picked.map((t) => facts.areas[t]);
    const peaks = histogramPeaks(offsets, weights, {
      bin: mm(10),
      separation: mm(50),
      minWeight: minArea,
      max: maxPlanes,
    });
    return peaks.map((at) => {
      const members = picked.filter(
        (_, i) => Math.abs(offsets[i] - at) < mm(25),
      );
      const w = members.map((t) => facts.areas[t]);
      const coord = (k) => members.map((t) => aligned.centroids[t * 3 + k]);
      // Extents from the triangles' corners, so a surface made of a few large
      // triangles spans its full size; trimmed at 2% for a scan's stray bits
      const corners = [];
      const cornerWeights = [];
      for (const t of members) {
        for (let j = 0; j < 3; j++) {
          const o = t * 9 + j * 3;
          corners.push(
            applyMatrix(toAligned, [tris[o], tris[o + 1], tris[o + 2]]),
          );
          cornerWeights.push(facts.areas[t]);
        }
      }
      const span = (k) => {
        const values = corners.map((p) => p[k]);
        return [
          weightedQuantile(values, cornerWeights, 0.02),
          weightedQuantile(values, cornerWeights, 0.98),
        ];
      };
      const area = w.reduce((s, v) => s + v, 0);
      const extents = {};
      for (const k of [0, 1, 2]) {
        if (k !== axis) extents["xyz"[k]] = span(k);
      }
      return {
        at: weightedQuantile(coord(axis), w, 0.5),
        area_m2: (area * mmPerUnit * mmPerUnit) / 1e6,
        extents,
      };
    });
  };
  const planes = {
    facing_up: surfaces(2, 1),
    facing_down: surfaces(2, -1),
    facing_plus_x: surfaces(0, 1),
    facing_minus_x: surfaces(0, -1),
    facing_plus_y: surfaces(1, 1),
    facing_minus_y: surfaces(1, -1),
  };

  // A ceiling, if there is one: the highest large downward-facing level at
  // least 1.5 m up, so the underside of a floor slab or a seat isn't taken
  // for one
  const overhead = planes.facing_down.filter((p) => p.at > mm(1500));
  const ceiling = overhead.length
    ? overhead.reduce((best, p) =>
        p.area_m2 >= 0.3 * overhead[0].area_m2 && p.at > best.at ? p : best,
      )
    : null;

  const tilt = floorNormal.angleTo(new THREE.Vector3(0, 0, 1)) * DEG;
  return {
    floor: {
      z: weightedQuantile(floorTrisZ, floorTrisArea, 0.5), // before aligning
      tilt_degrees: tilt,
      flatness: floorSpread,
    },
    walls: walls.length ? { angle_degrees: wallAngle } : null,
    ceiling_height: ceiling ? ceiling.at : null,
    rotate,
    move,
    planes,
  };
}

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------

/** For a cut across `axis`, the two world axes drawn as the picture's u, v. */
export const SECTION_AXES = Object.freeze({
  x: [1, 2],
  y: [0, 2],
  z: [0, 1],
});

/**
 * Where triangles cross the plane axis = at: line segments [u1, v1, u2, v2]
 * in the plane's picture coordinates (see SECTION_AXES).
 * @param {Float64Array} tris
 * @param {"x"|"y"|"z"} axis
 * @param {number} at
 * @returns {Float64Array}
 */
export function cutTriangles(tris, axis, at) {
  const k = "xyz".indexOf(axis);
  const [ui, vi] = SECTION_AXES[axis];
  const out = [];
  const d = [0, 0, 0];
  for (let o = 0; o + 8 < tris.length; o += 9) {
    let above = 0;
    for (let j = 0; j < 3; j++) {
      d[j] = tris[o + j * 3 + k] - at;
      // A vertex exactly on the plane counts as above it, so an edge lying in
      // the plane isn't drawn twice and a touching corner draws nothing
      if (d[j] === 0) d[j] = 1e-12;
      if (d[j] > 0) above++;
    }
    if (above === 0 || above === 3) continue;
    for (let j = 0; j < 3; j++) {
      const j2 = (j + 1) % 3;
      if (d[j] > 0 === d[j2] > 0) continue;
      const s = d[j] / (d[j] - d[j2]);
      const a = o + j * 3;
      const b = o + j2 * 3;
      out.push(
        tris[a + ui] + s * (tris[b + ui] - tris[a + ui]),
        tris[a + vi] + s * (tris[b + vi] - tris[a + vi]),
      );
    }
  }
  return Float64Array.from(out);
}

/** The [min, max] corners of every segment in several cuts, or null. */
export function segmentsBounds(cuts) {
  let u0 = Infinity,
    v0 = Infinity,
    u1 = -Infinity,
    v1 = -Infinity;
  for (const segments of cuts) {
    for (let i = 0; i + 1 < segments.length; i += 2) {
      u0 = Math.min(u0, segments[i]);
      u1 = Math.max(u1, segments[i]);
      v0 = Math.min(v0, segments[i + 1]);
      v1 = Math.max(v1, segments[i + 1]);
    }
  }
  return u1 >= u0 ? { min: [u0, v0], max: [u1, v1] } : null;
}

/** Colors the section picture draws geometry and models in. */
export const SECTION_COLORS = Object.freeze({
  geometry: "#e0301e",
  reference: "#30343a",
});

/**
 * Draw cuts on a grid labeled in project units.
 * @param {{ segments: Float64Array, color: string, width: number }[]} layers
 *   Drawn in order, so later layers show on top
 * @param {object} view
 * @param {{ min: number[], max: number[] }} view.region - In picture units
 * @param {string[]} view.axisNames - Names of the u and v axes
 * @param {number} [view.spacing] - Grid spacing; default about 10 lines
 * @param {number} [view.size] - Longest side in pixels
 */
export function drawSection(
  layers,
  { region, axisNames, spacing, size = 1024 },
) {
  const [u0, v0] = region.min;
  const [u1, v1] = region.max;
  const extent = Math.max(u1 - u0, v1 - v0);
  const scale = size / extent;
  const width = Math.max(1, Math.round((u1 - u0) * scale));
  const height = Math.max(1, Math.round((v1 - v0) * scale));
  const toX = (u) => (u - u0) * scale;
  const toY = (v) => (v1 - v) * scale;

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);

  const grid = spacing || niceSpacing(extent);
  const lines = (from, to) => {
    const out = [];
    for (let k = Math.ceil(from / grid); k * grid <= to + grid * 1e-9; k++) {
      out.push(k * grid);
    }
    return out.slice(0, 400);
  };
  const gridColor = (value) =>
    Math.abs(value) < grid * 1e-9
      ? "rgba(26, 63, 214, 0.9)"
      : "rgba(26, 63, 214, 0.3)";
  context.lineWidth = 1;
  for (const u of lines(u0, u1)) {
    context.strokeStyle = gridColor(u);
    context.beginPath();
    context.moveTo(Math.round(toX(u)) + 0.5, 0);
    context.lineTo(Math.round(toX(u)) + 0.5, height);
    context.stroke();
  }
  for (const v of lines(v0, v1)) {
    context.strokeStyle = gridColor(v);
    context.beginPath();
    context.moveTo(0, Math.round(toY(v)) + 0.5);
    context.lineTo(width, Math.round(toY(v)) + 0.5);
    context.stroke();
  }

  context.lineCap = "round";
  for (const { segments, color, width: lineWidth } of layers) {
    context.strokeStyle = color;
    context.lineWidth = lineWidth;
    context.beginPath();
    for (let i = 0; i + 3 < segments.length; i += 4) {
      context.moveTo(toX(segments[i]), toY(segments[i + 1]));
      context.lineTo(toX(segments[i + 2]), toY(segments[i + 3]));
    }
    context.stroke();
  }

  // Labels last, so the cut lines don't cover them
  context.font = "12px sans-serif";
  context.lineJoin = "round";
  const text = (value, tx, ty, align, baseline, color = "#1a3fd6") => {
    context.textAlign = align;
    context.textBaseline = baseline;
    context.lineWidth = 3;
    context.strokeStyle = "rgba(255, 255, 255, 0.9)";
    context.strokeText(value, tx, ty);
    context.fillStyle = color;
    context.fillText(value, tx, ty);
  };
  for (const u of lines(u0, u1)) {
    text(gridLabel(u, grid), toX(u) + 3, 3, "left", "top");
  }
  for (const v of lines(v0, v1)) {
    text(gridLabel(v, grid), 3, toY(v) - 2, "left", "bottom");
  }
  text(
    `→ ${axisNames[0]}   ↑ ${axisNames[1]}`,
    width - 6,
    height - 6,
    "right",
    "bottom",
    "#000000",
  );

  return {
    dataUrl: canvas.toDataURL("image/png"),
    grid,
    pixels_per_unit: Number(scale.toPrecision(4)),
    pixels: [width, height],
  };
}
