// ─── Types and primitive helpers ─────────────────────────────────────────────

type T3 = [number, number, number];
type T2 = [number, number];

function toT3(v: { x: number; y: number; z: number }): T3 {
  return [v.x, v.y, v.z];
}

function dist3(a: T3, b: T3): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

/**
 * Sample n points arc-length-uniformly along a Wire (which may span multiple
 * underlying edges). Produces exact boundary points at t=0 and t=1.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function sampleWire(wire: any, n: number): T3[] {
  const edges: any[] = wire.edges ?? []; // eslint-disable-line @typescript-eslint/no-explicit-any
  if (edges.length === 0)
    throw new Error("Unroll wires: a wire contains no edges.");
  const lengths: number[] = edges.map(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (e: any) => (e.length ?? 0) as number,
  );
  const total = lengths.reduce((a, b) => a + b, 0);
  if (!(total > 0)) throw new Error("Unroll wires: a wire has zero length.");
  const out: T3[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const target = (i / (n - 1)) * total;
    let cursor = 0;
    for (let k = 0; k < edges.length; k++) {
      const eLen = lengths[k];
      if (target <= cursor + eLen || k === edges.length - 1) {
        const tLocal = eLen > 0 ? (target - cursor) / eLen : 0;
        out[i] = toT3(edges[k].pointAt(Math.min(1, Math.max(0, tLocal))));
        break;
      }
      cursor += eLen;
    }
  }
  return out;
}

/**
 * Unrolls (flattens) the developable surface between two 3D wires into a
 * 2D Drawing, using the JCISE 2021 ruling optimisation.
 *
 * Input: an Assembly containing exactly two Wire geometries. The first wire
 * is the primary boundary; the second is the secondary.  The secondary is
 * auto-oriented to run parallel with the primary so that the cap rulings
 * at each end are short frame lines rather than long diagonals.
 *
 * The optimal ruling path is found by minimising quad-twist (zero point-cost
 * grid, twist penalty per DP step) producing a near-developable unrolled
 * pattern laid flat on the XY plane.
 */
function run(
  wires: Assembly,
  numRulings: number = 24,
): Assembly {
  if (!Number.isFinite(numRulings) || numRulings < 2) {
    throw new Error("Unroll wires: numRulings must be an integer ≥ 2.");
  }

  // ── Extract two wires from the assembly ────────────────────────────────
  const wireGeoms: any[] = []; // eslint-disable-line @typescript-eslint/no-explicit-any
  (wires as any).onLeafs((leaf: Assembly) => { // eslint-disable-line @typescript-eslint/no-explicit-any
    if (leaf.geometry instanceof replicad.Wire) wireGeoms.push(leaf.geometry);
    return leaf;
  });
  if (wireGeoms.length < 2) {
    throw new Error(
      `Unroll wires: assembly must contain 2 Wire geometries, found ${wireGeoms.length}.`,
    );
  }

  const n = Math.max(2, Math.floor(numRulings));
  const P3 = sampleWire(wireGeoms[0], n);
  let S3 = sampleWire(wireGeoms[1], n);

  // ── Orient secondary parallel to primary ──────────────────────────────
  // capEdge1 connects P3[n-1] to S3[0] in the wire topology.  For a
  // correctly oriented secondary, S3[n-1] should be near P3[n-1] (short
  // last-ruling = short cap edge).  If S3[0] is closer to P3[n-1] than
  // S3[n-1] is, the secondary runs antiparallel — reverse it.
  if (dist3(P3[n - 1], S3[0]) < dist3(P3[n - 1], S3[n - 1])) {
    S3 = S3.slice().reverse();
  }

  // ── Find optimal ruling path (twist-minimising DP) ─────────────────────
  // Without a surface we have no per-point normals; use a zero cost grid so
  // the DP selects the path that minimises quad-twist alone.
  const zeroCost: number[][] = Array.from({ length: n }, () =>
    new Array(n).fill(0),
  );
  const { path } = findOptimalRulingPath(zeroCost, P3, S3);

  // ── Unfold triangles ─────────────────────────────────────────────────
  const P2: (T2 | undefined)[] = new Array(n);
  const S2: (T2 | undefined)[] = new Array(n);
  const [i0, j0] = path[0];
  const L0 = dist3(P3[i0], S3[j0]);
  if (!(L0 > 0)) {
    throw new Error("Unroll wires: first ruling has zero length; cannot orient.");
  }
  P2[i0] = [0, 0];
  S2[j0] = [L0, 0];

  const tris2D: [T2, T2, T2][] = [];
  const tris3D: [T3, T3, T3][] = [];

  for (let k = 0; k < path.length - 1; k++) {
    const [i, j] = path[k];
    const [iN, jN] = path[k + 1];
    const advancedP = iN > i;
    const newP3 = advancedP ? P3[iN] : S3[jN];
    const r0 = dist3(P3[i], newP3);
    const r1 = dist3(S3[j], newP3);
    const p0 = P2[i]!;
    const p1 = S2[j]!;

    let side: number;
    if (k === 0) {
      side = 1;
    } else {
      const [iPrev, jPrev] = path[k - 1];
      const otherPt: T2 = iPrev !== i ? P2[iPrev]! : S2[jPrev]!;
      const ox = otherPt[0] - p0[0];
      const oy = otherPt[1] - p0[1];
      const hx = p1[0] - p0[0];
      const hy = p1[1] - p0[1];
      side = -(Math.sign(hx * oy - hy * ox)) || 1;
    }

    const newP2 = circleIntersect(p0, r0, p1, r1, side, k);
    if (advancedP) P2[iN] = newP2;
    else S2[jN] = newP2;

    tris2D.push([p0, p1, newP2]);
    tris3D.push([P3[i], S3[j], newP3]);
  }

  // ── Build boundary chains and 2D drawing ─────────────────────────────
  const primaryChain: T2[] = [];
  const secondaryChain: T2[] = [];
  let lastI = -1;
  let lastJ = -1;
  for (const [i, j] of path) {
    if (i !== lastI) { primaryChain.push(P2[i]!); lastI = i; }
    if (j !== lastJ) { secondaryChain.push(S2[j]!); lastJ = j; }
  }
  if (primaryChain.length < 2 || secondaryChain.length < 2) {
    throw new Error(
      `Unroll wires: degenerate chains (primary=${primaryChain.length}, ` +
      `secondary=${secondaryChain.length}); need ≥2 on each side.`,
    );
  }

  const pen = replicad.draw(primaryChain[0]);
  for (let i = 1; i < primaryChain.length; i++) pen.lineTo(primaryChain[i]);
  pen.lineTo(secondaryChain[secondaryChain.length - 1]);
  for (let i = secondaryChain.length - 2; i >= 0; i--) pen.lineTo(secondaryChain[i]);
  const drawing = pen.close();

  return new Assembly({
    geometry: drawing,
    tags: ["developed"],
  });
}

function quadTwist(
  P: T3[],
  S: T3[],
  i: number,
  j: number,
  iN: number,
  jN: number,
): number {
  const A = P[i];
  const Ap = P[iN];
  const B = S[j];
  const Bp = S[jN];
  const e1x = Ap[0] - A[0],
    e1y = Ap[1] - A[1],
    e1z = Ap[2] - A[2];
  const e2x = Bp[0] - A[0],
    e2y = Bp[1] - A[1],
    e2z = Bp[2] - A[2];
  const e3x = B[0] - A[0],
    e3y = B[1] - A[1],
    e3z = B[2] - A[2];
  const nx = e1y * e2z - e1z * e2y;
  const ny = e1z * e2x - e1x * e2z;
  const nz = e1x * e2y - e1y * e2x;
  const nMag = Math.hypot(nx, ny, nz);
  const height = nMag > 0 ? Math.abs(nx * e3x + ny * e3y + nz * e3z) / nMag : 0;
  const avgEdge =
    0.25 * (dist3(A, Ap) + dist3(Ap, Bp) + dist3(Bp, B) + dist3(B, A));
  return avgEdge > 0 ? height / avgEdge : 0;
}

/**
 * 2-neighbour anti-diagonal DP: from (i, j) you may only advance to
 * (i+1, j) or (i, j+1). Every path has 2(n-1) steps and emits 2n-1 rulings.
 * Identical to the implementation in atomimpl.ts.
 */
function findOptimalRulingPath(
  cost: number[][],
  P: T3[],
  S: T3[],
): { path: [number, number][]; totalCost: number } {
  const n = cost.length;
  const INF = Number.POSITIVE_INFINITY;
  const dist: number[][] = new Array(n);
  const prevDir: number[][] = new Array(n);
  for (let i = 0; i < n; i++) {
    dist[i] = new Array(n).fill(INF);
    prevDir[i] = new Array(n).fill(-1);
  }
  dist[0][0] = cost[0][0];

  for (let s = 1; s <= 2 * (n - 1); s++) {
    const iLo = Math.max(0, s - (n - 1));
    const iHi = Math.min(n - 1, s);
    for (let iN = iLo; iN <= iHi; iN++) {
      const jN = s - iN;
      const rulingCost = cost[iN][jN];
      if (!isFinite(rulingCost)) continue;
      let best = INF;
      let bestDir = -1;
      if (iN > 0 && isFinite(dist[iN - 1][jN])) {
        const cand =
          dist[iN - 1][jN] + rulingCost + quadTwist(P, S, iN - 1, jN, iN, jN);
        if (cand < best) {
          best = cand;
          bestDir = 0;
        }
      }
      if (jN > 0 && isFinite(dist[iN][jN - 1])) {
        const cand =
          dist[iN][jN - 1] + rulingCost + quadTwist(P, S, iN, jN - 1, iN, jN);
        if (cand < best) {
          best = cand;
          bestDir = 1;
        }
      }
      if (best < INF) {
        dist[iN][jN] = best;
        prevDir[iN][jN] = bestDir;
      }
    }
  }

  const path: [number, number][] = [];
  if (isFinite(dist[n - 1][n - 1])) {
    let ci = n - 1;
    let cj = n - 1;
    while (ci >= 0 && cj >= 0) {
      path.push([ci, cj]);
      if (ci === 0 && cj === 0) break;
      const dir = prevDir[ci][cj];
      if (dir === 0) ci -= 1;
      else if (dir === 1) cj -= 1;
      else break;
    }
    path.reverse();
    return { path, totalCost: dist[n - 1][n - 1] };
  }
  console.warn("Unroll: DAG search found no path; falling back to diagonal.");
  for (let k = 0; k < n; k++) path.push([k, k]);
  return { path, totalCost: INF };
}

/**
 * Locate the unfold triangle whose plane is closest to `p`, returning the
 * 2D image of `p` under that triangle's affine 3D→2D map. We prefer
 * triangles where the projected point's barycentric coordinates are all
 * within [−ε, 1+ε] (i.e. inside the triangle); among those, pick the one
 * with the smallest perpendicular distance. If none qualify, fall back to
 * the globally closest triangle and clamp.
 */
/**
 * Safely fetch the UV coordinates of a 3D point on `face`. Returns null if
 * the point is off-surface or OCCT raises (e.g. periodic-seam glitch).
 * `face.uvCoordinates(p)` may return either a `[u, v]` tuple or an
 * object with .u/.v depending on the replicad build; normalise both.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function uvAtSafe(face: any, p: T3): T2 | null {
  try {
    const r = face.uvCoordinates([p[0], p[1], p[2]]);
    if (Array.isArray(r)) {
      if (!isFinite(r[0]) || !isFinite(r[1])) return null;
      return [r[0], r[1]];
    }
    if (r && typeof r.u === "number" && typeof r.v === "number") {
      return [r.u, r.v];
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Return the index of the unfold triangle whose UV image contains `uv`,
 * or -1 if none does. UV is a single-valued chart on the trimmed face, so
 * at most one triangle truly contains `uv`; a small ε accepts on-edge
 * points and either side resolves to the same 2D position (the affine
 * maps agree on the shared edge).
 */
function findContainingTriangle(
  uv: T2,
  trisUV: ([T2, T2, T2] | null)[],
): number {
  const EPS = 1e-9;
  for (let k = 0; k < trisUV.length; k++) {
    const tri = trisUV[k];
    if (!tri) continue;
    const bary = baryUV(uv, tri[0], tri[1], tri[2]);
    if (!bary) continue;
    const [u, v, w] = bary;
    if (u >= -EPS && v >= -EPS && w >= -EPS) return k;
  }
  return -1;
}

/**
 * Identify the best 3D triangle for a point P. We prefer the one where P
 * projects inside (positive barycentric), using physical distance to the
 * triangle plane as a tie-breaker.
 */
function findBestTriangle3D(p: T3, tris3D: [T3, T3, T3][]): number {
  let bestK = -1;
  let minScore = Infinity;

  for (let k = 0; k < tris3D.length; k++) {
    const tri = tris3D[k];
    const bary = bary3D(p, tri[0], tri[1], tri[2]);
    if (!bary) continue;

    const [u, v, w] = bary;
    // Penalty for being physically outside the triangle footprint
    const outsideDist = Math.max(0, -u, -v, -w);
    // Distance to triangle plane
    const planeDist = distToPlane(p, tri[0], tri[1], tri[2]);

    // Combined score: proximity to plane + penalty for being outside.
    // Being outside is penalized much more heavily than being slightly
    // off-plane.
    const score = planeDist + outsideDist * 1000;

    if (score < minScore) {
      minScore = score;
      bestK = k;
    }
  }
  return bestK;
}

/**
 * Project 3D point p into triangle k and return its 2D coordinates.
 */
function mapWithTriangle3D(
  p: T3,
  k: number,
  tris3D: [T3, T3, T3][],
  tris2D: [T2, T2, T2][],
): T2 {
  const tri3 = tris3D[k];
  const tri2 = tris2D[k];
  const bary = bary3D(p, tri3[0], tri3[1], tri3[2]);
  if (!bary) return [0, 0];

  const [u, v, w] = bary;
  const [a2, b2, c2] = tri2;

  return [u * a2[0] + v * b2[0] + w * c2[0], u * a2[1] + v * b2[1] + w * c2[1]];
}

function distToPlane(p: T3, a: T3, b: T3, c: T3): number {
  const v1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const v2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];

  const nx = v1[1] * v2[2] - v1[2] * v2[1];
  const ny = v1[2] * v2[0] - v1[0] * v2[2];
  const nz = v1[0] * v2[1] - v1[1] * v2[0];
  const nLen = Math.hypot(nx, ny, nz);
  if (nLen === 0) return dist3(p, a);

  const dx = p[0] - a[0];
  const dy = p[1] - a[1];
  const dz = p[2] - a[2];

  return Math.abs(dx * nx + dy * ny + dz * nz) / nLen;
}

/**
 * 3D Barycentric coordinates of P in triangle (A, B, C).
 * P is projected onto the plane of ABC.
 */
function bary3D(p: T3, a: T3, b: T3, c: T3): [number, number, number] | null {
  const v0 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const v1 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const v2 = [p[0] - a[0], p[1] - a[1], p[2] - a[2]];

  const d00 = v0[0] * v0[0] + v0[1] * v0[1] + v0[2] * v0[2];
  const d01 = v0[0] * v1[0] + v0[1] * v1[1] + v0[2] * v1[2];
  const d11 = v1[0] * v1[0] + v1[1] * v1[1] + v1[2] * v1[2];
  const d20 = v2[0] * v0[0] + v2[1] * v0[1] + v2[2] * v0[2];
  const d21 = v2[0] * v1[0] + v2[1] * v1[1] + v2[2] * v1[2];

  const denom = d00 * d11 - d01 * d01;
  if (Math.abs(denom) < 1e-12) return null;

  const invDenom = 1.0 / denom;
  const v = (d11 * d20 - d01 * d21) * invDenom;
  const w = (d00 * d21 - d01 * d20) * invDenom;
  const u = 1.0 - v - w;

  return [u, v, w];
}

/**
 * Affine UV→2D map via the barycentric of `uv` in triangle `k`. Caller is
 * responsible for picking a triangle that (nearly) contains `uv`.
 */
function mapWithTriangle(
  uv: T2,
  k: number,
  trisUV: ([T2, T2, T2] | null)[],
  tris2D: [T2, T2, T2][],
): T2 {
  const tri = trisUV[k];
  if (!tri) return [0, 0];
  const bary = baryUV(uv, tri[0], tri[1], tri[2]);
  const [u, v, w] = bary ?? [1, 0, 0];
  const [a2, b2, c2] = tris2D[k];
  return [u * a2[0] + v * b2[0] + w * c2[0], u * a2[1] + v * b2[1] + w * c2[1]];
}

/** Signed-area barycentric of `p` in triangle (A, B, C) in 2D. Returns
 *  [u, v, w] with u+v+w=1; null on a zero-area triangle. */
function baryUV(p: T2, A: T2, B: T2, C: T2): [number, number, number] | null {
  const ax = B[0] - A[0],
    ay = B[1] - A[1];
  const bx = C[0] - A[0],
    by = C[1] - A[1];
  const denom = ax * by - ay * bx;
  if (!(Math.abs(denom) > 0)) return null;
  const px = p[0] - A[0],
    py = p[1] - A[1];
  const v = (px * by - py * bx) / denom;
  const w = (ax * py - ay * px) / denom;
  const u = 1 - v - w;
  return [u, v, w];
}

/** Place a new 2D point at distance r0 from p0 and r1 from p1, on the
 * sideSign side of the directed line p0→p1 (+1 = left, −1 = right). */
function circleIntersect(
  p0: T2,
  r0: number,
  p1: T2,
  r1: number,
  sideSign: number,
  stripIdx: number,
): T2 {
  const dx = p1[0] - p0[0];
  const dy = p1[1] - p0[1];
  const d = Math.hypot(dx, dy);
  const sum = r0 + r1;
  const diff = Math.abs(r0 - r1);
  const EPS = 1e-6;
  if (d === 0 || d > sum * (1 + EPS) || d < diff * (1 - EPS)) {
    throw new Error(
      `Unroll: degenerate triangle at strip ${stripIdx} ` +
      `(r0=${r0.toFixed(4)}, r1=${r1.toFixed(4)}, hinge=${d.toFixed(4)}).`,
    );
  }
  const dC = Math.max(diff, Math.min(sum, d));
  const a = (r0 * r0 - r1 * r1 + dC * dC) / (2 * dC);
  const h = Math.sqrt(Math.max(0, r0 * r0 - a * a));
  const ux = dx / d;
  const uy = dy / d;
  const mx = p0[0] + a * ux;
  const my = p0[1] + a * uy;
  return [mx + h * -uy * sideSign, my + h * ux * sideSign];
}
