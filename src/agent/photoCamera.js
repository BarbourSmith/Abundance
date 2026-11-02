/**
 * Placing photos where they were taken, and measuring through them, for the
 * agent bridge.
 *
 * locate_photo solves the camera a photo was taken with (where it stood,
 * which way it looked, and its focal length) from points picked in the photo
 * whose positions in the model are known, and gives the Width, Rotate and
 * Move that stand the photo in front of that camera, at `distance`, filling
 * its view. Seen from the camera, the photo then lines up with the model.
 *
 * A photo placed that way records its camera: the camera sits `distance`
 * behind the photo's center, on the side the picture faces. photo_point uses
 * that to cast a ray from the camera through a pixel and find where it meets
 * a plane, such as a wall, to measure things the model doesn't have yet.
 *
 * Pixels are the image's own, as it displays: (0, 0) is its top-left corner,
 * u runs right and v down. World positions are in project units.
 */
import { pixelPlacement, referenceCanvas } from "./referenceTrace.js";

const DEG = 180 / Math.PI;

// ---------------------------------------------------------------------------
// Small vector and matrix helpers (3-vectors as arrays, 3x3 matrices as rows)
// ---------------------------------------------------------------------------

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const norm = (a) => Math.hypot(a[0], a[1], a[2]);
const unit = (a) => scale(a, 1 / norm(a));
const matVec = (m, v) => m.map((row) => dot(row, v));
const matMul = (a, b) =>
  a.map((row) =>
    [0, 1, 2].map(
      (j) => row[0] * b[0][j] + row[1] * b[1][j] + row[2] * b[2][j],
    ),
  );

/** Rotation by the vector w (axis times angle in radians). */
function expRotation([x, y, z]) {
  const t = Math.hypot(x, y, z);
  if (t < 1e-12)
    return [
      [1, -z, y],
      [z, 1, -x],
      [-y, x, 1],
    ];
  const [a, b, c] = [x / t, y / t, z / t];
  const s = Math.sin(t);
  const k = 1 - Math.cos(t);
  return [
    [1 - k * (b * b + c * c), -s * c + k * a * b, s * b + k * a * c],
    [s * c + k * a * b, 1 - k * (a * a + c * c), -s * a + k * b * c],
    [-s * b + k * a * c, s * a + k * b * c, 1 - k * (a * a + b * b)],
  ];
}

/**
 * World-to-camera rotation for a camera at `from` looking at `to`, level
 * (no roll). Camera axes: x right, y down, z forward.
 */
function lookAt(from, to) {
  const forward = unit(sub(to, from));
  let right = cross(forward, [0, 0, 1]);
  if (norm(right) < 1e-9) right = [1, 0, 0];
  right = unit(right);
  return [right, cross(forward, right), forward];
}

/** Solve a small dense linear system A x = b (Gaussian elimination). */
function solveLinear(A, b) {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(M[r][col]) > Math.abs(M[pivot][col])) pivot = r;
    }
    if (Math.abs(M[pivot][col]) < 1e-300) return null;
    [M[col], M[pivot]] = [M[pivot], M[col]];
    for (let r = col + 1; r < n; r++) {
      const f = M[r][col] / M[col][col];
      for (let c = col; c <= n; c++) M[r][c] -= f * M[col][c];
    }
  }
  const x = new Array(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let s = M[r][n];
    for (let c = r + 1; c < n; c++) s -= M[r][c] * x[c];
    x[r] = s / M[r][r];
  }
  return x;
}

// ---------------------------------------------------------------------------
// Cameras
// ---------------------------------------------------------------------------

/**
 * Where a world point lands in the photo: [u, v, depth], depth along the view.
 * @param {{ rotation: number[][], position: number[], focal: number,
 *   width: number, height: number }} camera
 */
export function projectPoint(camera, point) {
  const c = matVec(camera.rotation, sub(point, camera.position));
  return [
    camera.width / 2 + (camera.focal * c[0]) / c[2],
    camera.height / 2 + (camera.focal * c[1]) / c[2],
    c[2],
  ];
}

/** Robust (Huber) weight for a miss of r pixels. */
const huber = (r, k) => (Math.abs(r) <= k ? 1 : k / Math.abs(r));

/**
 * Solve the camera that took a photo from points seen in it.
 * @param {{ pixel: number[], at: number[] }[]} points - Pixels and the world
 *   positions they show
 * @param {object} options
 * @param {number} options.width - Photo width in pixels
 * @param {number} options.height - Photo height in pixels
 * @param {number} [options.focal] - Focal length in pixels; solved when omitted
 * @param {number} [options.tolerance] - Misses up to this many pixels count
 *   fully; larger ones are down-weighted as likely mismatches. Default 1% of
 *   the photo's longest side.
 * @returns {{ rotation: number[][], position: number[], focal: number,
 *   width: number, height: number, misses: number[], rms: number }}
 */
export function solveCamera(points, { width, height, focal, tolerance } = {}) {
  const solveFocal = !(focal > 0);
  const needed = solveFocal ? 5 : 4;
  if (points.length < needed) {
    throw new RangeError(
      `Give at least ${needed} points${solveFocal ? " (or a focal length)" : ""}; 6 or more spread across the photo and at different depths give a reliable answer.`,
    );
  }
  const k = tolerance || 0.01 * Math.max(width, height);
  const world = points.map((p) => p.at);
  const pixels = points.map((p) => p.pixel);
  const centroid = scale(
    world.reduce((s, p) => add(s, p), [0, 0, 0]),
    1 / world.length,
  );
  const spread = Math.max(...world.map((p) => norm(sub(p, centroid))), 1e-6);

  // Parameters: a small rotation applied to the start's rotation, the
  // camera position, and (when solved) the focal length
  const cameraOf = (start, p) => ({
    rotation: matMul(expRotation(p.slice(0, 3)), start),
    position: p.slice(3, 6),
    focal: solveFocal ? p[6] : focal,
    width,
    height,
  });
  const residuals = (start, p) => {
    const camera = cameraOf(start, p);
    const out = [];
    for (let i = 0; i < world.length; i++) {
      const [u, v, depth] = projectPoint(camera, world[i]);
      if (!(depth > 1e-6 * spread)) {
        // Behind the camera: a large, smooth penalty steering it away
        out.push(1e4 + 1e4 * Math.abs(depth / spread), 1e4);
        continue;
      }
      out.push(u - pixels[i][0], v - pixels[i][1]);
    }
    return out;
  };
  const cost = (r) => {
    let s = 0;
    for (let i = 0; i < r.length; i += 2) {
      const m = Math.hypot(r[i], r[i + 1]);
      s += m <= k ? m * m : 2 * k * m - k * k;
    }
    return s;
  };

  // Levenberg-Marquardt with Huber weights, from one start
  const refine = (start, p0) => {
    let p = [...p0];
    let r = residuals(start, p);
    let current = cost(r);
    let lambda = 1e-3;
    const steps = p.map((_, i) =>
      i < 3 ? 1e-6 : i < 6 ? 1e-6 * spread : 1e-4 * p0[6],
    );
    for (let iteration = 0; iteration < 200; iteration++) {
      const weights = [];
      for (let i = 0; i < r.length; i += 2) {
        const w = huber(Math.hypot(r[i], r[i + 1]), k);
        weights.push(w, w);
      }
      const J = p.map((_, j) => {
        const q = [...p];
        q[j] += steps[j];
        const r2 = residuals(start, q);
        return r2.map((v, i) => (v - r[i]) / steps[j]);
      });
      const n = p.length;
      const JtJ = Array.from({ length: n }, (_, a) =>
        Array.from({ length: n }, (_, b) =>
          J[a].reduce((s, v, i) => s + weights[i] * v * J[b][i], 0),
        ),
      );
      const Jtr = J.map((col) =>
        col.reduce((s, v, i) => s + weights[i] * v * r[i], 0),
      );
      let improved = false;
      for (let tries = 0; tries < 10; tries++) {
        const A = JtJ.map((row, a) =>
          row.map((v, b) => (a === b ? v * (1 + lambda) + 1e-12 : v)),
        );
        const delta = solveLinear(
          A,
          Jtr.map((v) => -v),
        );
        if (!delta) break;
        const q = p.map((v, i) => v + delta[i]);
        if (solveFocal && !(q[6] > 0)) {
          lambda *= 10;
          continue;
        }
        const r2 = residuals(start, q);
        const c2 = cost(r2);
        if (c2 < current) {
          p = q;
          r = r2;
          lambda = Math.max(lambda / 10, 1e-9);
          improved = current - c2 > 1e-10 * current;
          current = c2;
          break;
        }
        lambda *= 10;
      }
      if (!improved) break;
    }
    return { start, p, cost: current };
  };

  // Start from cameras around the points, looking at them, at a few
  // distances, so the solve doesn't settle on a mirror-image answer
  const focal0 = solveFocal ? 0.8 * Math.max(width, height) : focal;
  let best = null;
  for (let a = 0; a < 12; a++) {
    for (const distance of [1.5, 3, 6]) {
      const angle = (a / 12) * 2 * Math.PI;
      const from = add(centroid, [
        Math.cos(angle) * distance * spread,
        Math.sin(angle) * distance * spread,
        0.2 * spread,
      ]);
      const start = lookAt(from, centroid);
      const p0 = [0, 0, 0, ...from, ...(solveFocal ? [focal0] : [])];
      const found = refine(start, p0);
      if (!best || found.cost < best.cost) best = found;
    }
  }
  const camera = cameraOf(best.start, best.p);
  const misses = world.map((point, i) => {
    const [u, v] = projectPoint(camera, point);
    return Math.hypot(u - pixels[i][0], v - pixels[i][1]);
  });
  return {
    ...camera,
    misses,
    rms: Math.sqrt(misses.reduce((s, m) => s + m * m, 0) / misses.length),
  };
}

/**
 * The Rotate angles (applied X, then Y, then Z, as the Rotate atom does) for
 * a rotation matrix given as rows.
 */
export function rotateAngles(m) {
  const y = Math.asin(Math.max(-1, Math.min(1, -m[2][0])));
  const x = Math.atan2(m[2][1], m[2][2]);
  const z = Math.atan2(m[1][0], m[0][0]);
  return { x: x * DEG, y: y * DEG, z: z * DEG };
}

/**
 * Where to put a photo so it stands in front of its camera at `distance`,
 * facing it and filling its view: the Import atom's Width, then a Rotate and
 * a Move of the photo as imported (flat, centered on the origin).
 */
export function photoPlacement(camera, distance) {
  const [right, down, forward] = camera.rotation;
  const up = scale(down, -1);
  // Columns: where the flat photo's X (right), Y (up) and Z (toward the
  // viewer) must point
  const toward = scale(forward, -1);
  const m = [0, 1, 2].map((i) => [right[i], up[i], toward[i]]);
  return {
    width: (distance * camera.width) / camera.focal,
    rotate: rotateAngles(m),
    move: add(camera.position, scale(forward, distance)),
  };
}

/**
 * The camera a placed photo records: `distance` behind its center, on the
 * side its picture faces, looking through it.
 * @returns {{ position: number[], toWorld: (u: number, v: number) => number[],
 *   width: number, height: number }}
 */
export function placedPhotoCamera(item, distance) {
  const [width, height] = item.pixels;
  const placed = pixelPlacement(item, width, height);
  const center = placed.toWorld(width / 2, height / 2);
  const right = sub(
    placed.toWorld(width, height / 2),
    placed.toWorld(0, height / 2),
  );
  const up = sub(
    placed.toWorld(width / 2, 0),
    placed.toWorld(width / 2, height),
  );
  const facing = unit(cross(right, up));
  return {
    position: add(center, scale(facing, distance)),
    toWorld: placed.toWorld,
    width,
    height,
  };
}

/**
 * Where the ray from a placed photo's camera through pixel (u, v) meets the
 * plane axis = at, or null when it runs parallel to it or away from it.
 */
export function pixelOnPlane(camera, [u, v], axis, at) {
  const k = "xyz".indexOf(axis);
  const through = camera.toWorld(u, v);
  const direction = sub(through, camera.position);
  if (Math.abs(direction[k]) < 1e-12) return null;
  const t = (at - camera.position[k]) / direction[k];
  if (!(t > 0)) return null;
  return add(camera.position, scale(direction, t));
}

// ---------------------------------------------------------------------------
// Pictures
// ---------------------------------------------------------------------------

/**
 * The photo with world segments drawn through a camera (red), and the picked
 * points (blue rings) with where the camera puts their world positions (red
 * crosses), scaled to `size` pixels on its longest side.
 * @param {object} item - An image reference
 * @param {object} camera - From solveCamera
 * @param {object} drawing
 * @param {number[][][]} [drawing.segments] - [[a, b], ...] world points
 * @param {{ pixel: number[], at: number[] }[]} [drawing.points]
 * @param {number} [drawing.size]
 */
export async function drawThroughCamera(
  item,
  camera,
  { segments = [], points = [], size = 1024 },
) {
  const source = await referenceCanvas(item, Math.max(size, 1024));
  const s = size / Math.max(camera.width, camera.height);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(camera.width * s);
  canvas.height = Math.round(camera.height * s);
  const context = canvas.getContext("2d");
  context.drawImage(source, 0, 0, canvas.width, canvas.height);

  // Segments, cut where they pass behind the camera
  const near = 1e-3;
  const inCamera = (p) => matVec(camera.rotation, sub(p, camera.position));
  const toPixel = (c) => [
    (camera.width / 2 + (camera.focal * c[0]) / c[2]) * s,
    (camera.height / 2 + (camera.focal * c[1]) / c[2]) * s,
  ];
  context.strokeStyle = "rgba(230, 30, 20, 0.95)";
  context.lineWidth = 2;
  context.beginPath();
  for (const [a, b] of segments) {
    let ca = inCamera(a);
    let cb = inCamera(b);
    if (ca[2] < near && cb[2] < near) continue;
    if (ca[2] < near || cb[2] < near) {
      const t = (near - ca[2]) / (cb[2] - ca[2]);
      const cut = add(ca, scale(sub(cb, ca), t));
      if (ca[2] < near) ca = cut;
      else cb = cut;
    }
    const [x0, y0] = toPixel(ca);
    const [x1, y1] = toPixel(cb);
    context.moveTo(x0, y0);
    context.lineTo(x1, y1);
  }
  context.stroke();

  points.forEach(({ pixel, at }, i) => {
    const [x, y] = [pixel[0] * s, pixel[1] * s];
    context.strokeStyle = "#1a3fd6";
    context.lineWidth = 2;
    context.beginPath();
    context.arc(x, y, 7, 0, 2 * Math.PI);
    context.stroke();
    if (at) {
      const c = inCamera(at);
      if (c[2] > near) {
        const [px, py] = toPixel(c);
        context.strokeStyle = "#e01e14";
        context.beginPath();
        context.moveTo(px - 6, py - 6);
        context.lineTo(px + 6, py + 6);
        context.moveTo(px + 6, py - 6);
        context.lineTo(px - 6, py + 6);
        context.stroke();
      }
    }
    context.font = "bold 13px sans-serif";
    context.lineWidth = 3;
    context.strokeStyle = "rgba(255, 255, 255, 0.9)";
    context.strokeText(String(i), x + 9, y - 9);
    context.fillStyle = "#1a3fd6";
    context.fillText(String(i), x + 9, y - 9);
  });
  return { dataUrl: canvas.toDataURL("image/jpeg", 0.85), scale: s };
}

/**
 * World line segments from display meshes' edges ({ edges: { lines } }, flat
 * pairs of points), for drawing a model through a camera.
 */
export function meshEdgeSegments(meshes, max = 20000) {
  const out = [];
  for (const mesh of meshes || []) {
    const lines = mesh?.edges?.lines;
    if (!lines) continue;
    for (let i = 0; i + 5 < lines.length && out.length < max; i += 6) {
      out.push([
        [lines[i], lines[i + 1], lines[i + 2]],
        [lines[i + 3], lines[i + 4], lines[i + 5]],
      ]);
    }
  }
  return out;
}
