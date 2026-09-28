/**
 * Unrolls (flattens) a ruled surface into a 2D Drawing of its boundary,
 * using the same primary/secondary ruling extractor as the rulings atom
 * (see atomimpl.ts and Wang et al., JCISE 2021).
 *
 * Because the 2-neighbour shortest path advances exactly one of (i, j) per
 * step, every pair of consecutive rulings shares an endpoint. The strip
 * between them is therefore a TRIANGLE, which is intrinsically planar and
 * unrolls exactly — no quad-skew distortion. The first ruling is laid along
 * +X; each subsequent triangle hinges across the shared ruling and is
 * placed on the opposite side from the prior triangle's apex.
 *
 * The two long edges (primary chain and secondary chain) are emitted as
 * smooth splines through the placed vertices; the two short edges (first
 * and last rulings) are straight line segments. Splines play better with
 * downstream CAM than dense polylines.
 *
 *   primaryEdgeIndex → cyclic index into face.outerWire().edges. The two
 *                      neighbouring edges are excluded; remaining edges form
 *                      the secondary, identical to atomimpl.ts.
 */
function run(
  surface: Assembly,
  numRulings: number = 24,
  primaryEdgeIndex: number = 0,
  holeSamples: number = 64,
): Assembly {
  if (typeof surface == "string") {
    throw new Error("Missing required geometry input");
  }
  console.log(numRulings);
  if (!Number.isFinite(numRulings) || numRulings < 2) {
    throw new Error(
      "Unroll surface: numRulings must be an integer ≥ 2 (two rulings " +
      "needed to define a strip).",
    );
  }
  console.log(primaryEdgeIndex);
  if (!Number.isFinite(primaryEdgeIndex)) {
    throw new Error(
      "Unroll surface: primaryEdgeIndex must be a number. was: " +
      primaryEdgeIndex,
    );
  }
  if (!Number.isFinite(holeSamples) || holeSamples < 8) {
    throw new Error("Unroll surface: holeSamples must be an integer ≥ 8.");
  }

  const results: Assembly[] = [];
  let index = 0;
  const noneSelected = surface.getSelectedFaces().length == 0;
  (surface as any).onLeafs((leaf: Assembly<LeafGeom>) => {
    if (leaf.geometry instanceof replicad.Drawing) {
      console.warn("drawings cannot be unrolled");
      return leaf;
    }
    const faces: replicad.Face[] = [];
    if (noneSelected) {
      faces.push(
        ...(leaf.geometry instanceof replicad.Face
          ? [leaf.geometry]
          : leaf.geometry.faces),
      );
    } else {
      // Else the user has made a selection, only unroll selected faces
      if (leaf.selection?.faces && leaf.selection.faces.length > 0) {
        faces.push(
          ...leaf.selection.faces.map((idx) => leaf.geometry.faces[idx]),
        );
      }
    }
    for (const face of faces) {
      // Scope every OC handle allocated for this face: the primary/secondary
      // wires, the inner-wire face clone, and each hole wire. Only the final
      // `drawing` (returned by unrollFaceToDrawing) is deliberately NOT kept,
      // so it survives the cleanup and can be handed to the downstream
      // Assembly. Without this scope, auto-select mode leaked a face clone +
      // outer wire per edge candidate per face — hundreds of MB on a
      // 6-face / m=6 surface.
      const [keep, cleanup] = safeScope();
      let drawing: any; // eslint-disable-line @typescript-eslint/no-explicit-any
      let pIdx: number;
      try {
        const resolvedEdgeIndex =
          primaryEdgeIndex < 0 ? selectBestPrimaryEdge(face) : primaryEdgeIndex;
        const rulingWires = assembleRulingWires(face, resolvedEdgeIndex, keep);
        pIdx = rulingWires.pIdx;
        const innerFaceClone = keep(face.clone());
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const holeWires: any[] = (innerFaceClone.innerWires() ?? []).map(
          (w: any) => keep(w), // eslint-disable-line @typescript-eslint/no-explicit-any
        );
        const result = unrollFaceToDrawing(
          face,
          rulingWires.primaryWire,
          rulingWires.secondaryWire,
          numRulings,
          holeWires,
          holeSamples,
        );
        drawing = result.drawing;
      } finally {
        cleanup();
      }
      results.push(
        new Assembly({
          ...leaf,
          geometry: drawing,
          tags: [...(leaf.tags ?? []), "developed", "ruling-primary:" + pIdx],
          plane: replicad.makePlane("XY", [0, 0, index]),
        }),
      );
      index++;
    }
    return leaf;
  });
  console.log(results);
  return results;
}

/**
 * Split the face's outer wire into a primary edge + a secondary edge chain
 * (see partitionOuterWire), then assemble each side into a proper
 * replicad.Wire via replicad.assembleWire. The secondary chain's edge order
 * is reversed first if its leading edge shares primary's orientation flag —
 * that indicates the chain, sampled in its natural wire-cyclic order, would
 * run anti-parallel to primary.
 */
function assembleRulingWires(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  face: any,
  primaryEdgeIndex: number,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  keep: (v: any) => any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): { primaryWire: any; secondaryWire: any; pIdx: number } {
  const { primary, secondaryEdges, pIdx } = partitionOuterWire(
    face,
    primaryEdgeIndex,
    keep,
  );
  console.log(
    "should reverse: ",
    primary.orientation == secondaryEdges[0].orientation,
  );
  // `assembleWire` and `flipOrientation` may each return a fresh OC handle.
  // Register both so the caller's scope frees them regardless of which is
  // the eventual wrapper identity.
  const primaryWire = keep(replicad.assembleWire([primary]));
  const secondaryRaw = keep(replicad.assembleWire(secondaryEdges));
  const secondaryWire = keep(secondaryRaw.flipOrientation());
  return { primaryWire, secondaryWire, pIdx };
}

/**
 * Uniformly sample a Wire (single-edge or multi-edge/compound) at n points
 * across its full parametric range [0, 1], which replicad's Wire.pointAt
 * parametrizes continuously by cumulative arc length across all of its
 * constituent edges. t=0 and t=n-1 land exactly on the wire's two
 * endpoints.
 */
function sampleWireUniform(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  wire: any,
  n: number,
): T3[] {
  const out: T3[] = new Array(n);
  const [keep, cleanup] = replicad.localGC();
  try {
    for (let i = 0; i < n; i++) {
      const t = n === 1 ? 0 : i / (n - 1);
      out[i] = toT3(keep(wire.pointAt(t)));
    }
  } finally {
    cleanup();
  }
  return out;
}

/**
 * Probe every outer edge of `face` at a low ruling count and return the
 * index of the edge that yields the lowest total ruling cost. Used when
 * primaryEdgeIndex < 0 (auto-select mode).
 */
const DEVELOP_PROBE_N = 8;
function selectBestPrimaryEdge(
  face: any, // eslint-disable-line @typescript-eslint/no-explicit-any
): number {
  const [keep, cleanup] = safeScope();
  let bestIdx = 0;
  try {
    // Track the face clone + outer wire ourselves (we only need `m`);
    // partitionOuterWire also cleans up its own clones on each iteration.
    const faceClone = keep(face.clone());
    const outerWire = keep(faceClone.outerWire());
    const m = (outerWire.edges ?? []).length;
    let bestCost = Infinity;
    for (let k = 0; k < m; k++) {
      try {
        const { primaryWire, secondaryWire } = assembleRulingWires(
          face,
          k,
          keep,
        );
        const P3 = sampleWireUniform(primaryWire, DEVELOP_PROBE_N);
        const S3 = sampleWireUniform(secondaryWire, DEVELOP_PROBE_N);
        const cost = buildCostGrid(face, P3, S3);
        const { totalCost } = findOptimalRulingPath(cost, P3, S3);
        if (totalCost < bestCost) {
          bestCost = totalCost;
          bestIdx = k;
        }
      } catch {
        // edge produced a degenerate partition; skip
      }
    }
    console.log(
      `Unroll auto-select: chose primaryEdgeIndex=${bestIdx} (cost=${bestCost.toExponential(2)}) from ${m} candidates`,
    );
  } finally {
    cleanup();
  }
  return bestIdx;
}

/**
 * Unrolls a single replicad.Face into a 2D Drawing, given pre-assembled
 * primary/secondary boundary wires and an explicit list of hole wires to
 * punch. Returns the drawing; the caller already knows pIdx since it built
 * the wires via assembleRulingWires.
 */
function unrollFaceToDrawing(
  face: any, // eslint-disable-line @typescript-eslint/no-explicit-any
  primaryWire: any, // eslint-disable-line @typescript-eslint/no-explicit-any
  secondaryWire: any, // eslint-disable-line @typescript-eslint/no-explicit-any
  numRulings: number,
  holeWires: any[], // eslint-disable-line @typescript-eslint/no-explicit-any
  holeSamples: number,
): { drawing: any } {
  // eslint-disable-line @typescript-eslint/no-explicit-any
  const n = Math.max(2, Math.floor(numRulings));
  const holeN = Math.max(8, Math.floor(holeSamples));

  const P3 = sampleWireUniform(primaryWire, n);
  const S3 = sampleWireUniform(secondaryWire, n);
  // primaryWire/secondaryWire are owned by the caller's localGC scope and
  // will be freed there. Don't delete them here — that would double-delete.
  const cost = buildCostGrid(face, P3, S3);
  const { path, totalCost } = findOptimalRulingPath(cost, P3, S3);
  console.log(
    `Unroll: ${path.length} rulings, total cost=${totalCost.toExponential(2)}`,
  );

  // UV coordinates of every primary/secondary sample on the underlying
  // surface. We map hole samples through UV (single-valued chart), not 3D,
  // so triangle containment is an unambiguous 2D point-in-triangle test.
  // uvAtSafe returns plain [u, v] tuples (not WASM handles), so no localGC
  // scope is needed here.
  const PUV: (T2 | null)[] = P3.map((p) => uvAtSafe(face, p));
  const SUV: (T2 | null)[] = S3.map((p) => uvAtSafe(face, p));

  // ── Unfold triangles ────────────────────────────────────────────────────
  // P2[i] / S2[j] hold the 2D position of primary sample i / secondary
  // sample j once it's been placed. Each path step extends exactly one of
  // these arrays by one new entry.
  const P2: (T2 | undefined)[] = new Array(n);
  const S2: (T2 | undefined)[] = new Array(n);
  const [i0, j0] = path[0];
  const L0 = dist3(P3[i0], S3[j0]);
  if (!(L0 > 0)) {
    throw new Error("Unroll: first ruling has zero length; cannot orient.");
  }
  // First ruling along +X: primary endpoint at origin, secondary endpoint at +X.
  P2[i0] = [0, 0];
  S2[j0] = [L0, 0];

  // Per-strip triangle records, populated alongside the unfold. Vertex order
  // is (hinge-primary, hinge-secondary, apex); 2D and UV triples stay in
  // sync so a UV barycentric coord transfers directly to the 2D pattern.
  const tris2D: [T2, T2, T2][] = [];
  const trisUV: ([T2, T2, T2] | null)[] = [];
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

    // Side choice: place the new apex on the opposite side of the current
    // hinge (P2[i] → S2[j]) from the previous triangle's apex. For the
    // first triangle there's no prior apex, so pick +1 (left of p0→p1)
    // arbitrarily — the whole pattern just unfolds toward +Y.
    let side: number;
    if (k === 0) {
      side = 1;
    } else {
      const [iPrev, jPrev] = path[k - 1];
      // The previous triangle's apex is whichever of (P2[iPrev], S2[jPrev])
      // is NOT shared with the current hinge. Exactly one of iPrev, jPrev
      // differs from (i, j) — that one is the apex.
      const otherPt: T2 = iPrev !== i ? P2[iPrev]! : S2[jPrev]!;
      const ox = otherPt[0] - p0[0];
      const oy = otherPt[1] - p0[1];
      const hx = p1[0] - p0[0];
      const hy = p1[1] - p0[1];
      const sideOfOther = Math.sign(hx * oy - hy * ox);
      side = -sideOfOther || 1;
    }

    const newP2 = circleIntersect(p0, r0, p1, r1, side, k);
    if (advancedP) P2[iN] = newP2;
    else S2[jN] = newP2;

    tris2D.push([p0, p1, newP2]);
    tris3D.push([P3[i], S3[j], newP3]);

    const uvA = PUV[i];
    const uvB = SUV[j];
    const uvC = advancedP ? PUV[iN] : SUV[jN];
    trisUV.push(uvA && uvB && uvC ? [uvA, uvB, uvC] : null);
  }

  // ── Build the two long chains in path order ────────────────────────────
  // primaryChain = the 2D positions of the primary samples actually visited,
  // in the order they appear along the path. Same for secondaryChain.
  const primaryChain: T2[] = [];
  const secondaryChain: T2[] = [];
  let lastI = -1;
  let lastJ = -1;
  for (const [i, j] of path) {
    if (i !== lastI) {
      primaryChain.push(P2[i]!);
      lastI = i;
    }
    if (j !== lastJ) {
      secondaryChain.push(S2[j]!);
      lastJ = j;
    }
  }
  if (primaryChain.length < 2 || secondaryChain.length < 2) {
    throw new Error(
      `Unroll: degenerate chains (primary=${primaryChain.length}, ` +
      `secondary=${secondaryChain.length}); need ≥2 on each side.`,
    );
  }

  // ── Build the boundary drawing ─────────────────────────────────────────
  // Primary chain (spline) → last ruling (straight) → reversed secondary
  // chain (spline) → close back along first ruling (straight).
  const pen = replicad.draw(primaryChain[0]);
  for (let i = 1; i < primaryChain.length; i++) {
    pen.lineTo(primaryChain[i]);
  }
  pen.lineTo(secondaryChain[secondaryChain.length - 1]);
  for (let i = secondaryChain.length - 2; i >= 0; i--) {
    pen.lineTo(secondaryChain[i]);
  }
  let drawing = pen.close();

  // ── Punch holes from the explicitly provided hole wires (if any) ──────
  // Hole wires themselves are owned by the caller's scope; wire.pointAt(t)
  // returns fresh Vector handles that ARE tracked here. Drawings are plain
  // JS wrappers (no .delete() surface), so intermediate `drawing`/
  // `holeDrawing` values are freed by ordinary GC after reassignment.
  const [keepHoles, cleanupHoles] = replicad.localGC();
  try {
    for (let h = 0; h < holeWires.length; h++) {
      const wire = holeWires[h];
      // Pass 1: dense 3D samples around the wire.
      const samples3D: T3[] = [];
      for (let i = 0; i < holeN; i++) {
        const t = i / holeN;
        samples3D.push(toT3(keepHoles(wire.pointAt(t))));
      }
      if (samples3D.length < 3) continue;

      // Pass 2: map 3D→2D using nearest physical triangle.
      const samples2D: T2[] = samples3D
        .map((p) => {
          const k = findBestTriangle3D(p, tris3D);
          return k >= 0 ? mapWithTriangle3D(p, k, tris3D, tris2D) : null;
        })
        .filter((p): p is T2 => p !== null);

      if (samples2D.length < 3) continue;

      // Pass 3: Draw the hole.
      const holePen = replicad.draw(samples2D[0]);
      for (let i = 1; i < samples2D.length; i++) {
        holePen.lineTo(samples2D[i]);
      }
      const holeDrawing = holePen.close();
      drawing = drawing.cut(holeDrawing);
    }
  } finally {
    cleanupHoles();
  }

  return { drawing };
}

// ─── Shared helpers (mirror atomimpl.ts; sandboxed files can't import) ───

type T3 = [number, number, number];
type T2 = [number, number];

/**
 * Like replicad.localGC but tolerant of already-deleted OC handles. When
 * two JS wrappers alias the same underlying OC handle (e.g. some methods
 * that return `this` or share topology across wire/edge boundaries), the
 * built-in localGC will throw "This object has been deleted" the second
 * time it tries to free a handle. We catch and continue so a single stale
 * wrapper doesn't leak the rest of the scope's objects.
 */
function safeScope(): [
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (v: any) => any,
  () => void,
] {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cleaner = new Set<any>();
  return [
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (v: any) => {
      if (v && typeof v.delete === "function") cleaner.add(v);
      return v;
    },
    () => {
      for (const d of cleaner) {
        try {
          d.delete();
        } catch {
          // Already deleted (aliased handle); safe to ignore.
        }
      }
      cleaner.clear();
    },
  ];
}

function toT3(v: { x: number; y: number; z: number }): T3 {
  return [v.x, v.y, v.z];
}

function dist3(a: T3, b: T3): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

function partitionOuterWire(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  face: any,
  primaryEdgeIndex: number,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  keep: (v: any) => any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): { primary: any; secondaryEdges: any[]; pIdx: number } {
  // Register the transient face clone and its outer wire so the caller's
  // localGC scope frees them. Every edge in `.edges` is also an OC handle;
  // register them up front so the ones we don't return survive as long as
  // needed but get cleaned up on scope exit.
  const faceClone = keep(face.clone());
  const outerWire = keep(faceClone.outerWire());
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const allEdges: any[] = (outerWire.edges ?? []).map((e: any) => keep(e));
  const m = allEdges.length;
  const pIdx = ((Math.floor(primaryEdgeIndex) % m) + m) % m;
  const primary = allEdges[pIdx];

  const excludedIdx = new Set([pIdx]);
  if (primary.isClosed) {
    if (pIdx == 0) {
      excludedIdx.add(1);
    } else if (pIdx == allEdges.length - 1) {
      excludedIdx.add(allEdges.length - 2);
    } else {
      console.warn("found a closed face with two neighbors..");
    }
  } else {
    excludedIdx.add((pIdx - 1 + m) % m);
    excludedIdx.add((pIdx + 1) % m);
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const secondaryEdges: any[] = [];
  for (let k = 0; k < m; k++) {
    const idx = (pIdx + 2 + k) % m;
    if (!excludedIdx.has(idx)) secondaryEdges.push(allEdges[idx]);
  }
  if (secondaryEdges.length === 0) {
    console.warn("less than 4 edges total. this may cause bugs later");
    secondaryEdges.push(allEdges[(pIdx + 1) % m]);
  }
  return { primary, secondaryEdges, pIdx };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalAtSafe(
  face: any,
  p: T3,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  keep: (v: any) => any,
): T3 | null {
  try {
    const nv = keep(face.normalAt(p));
    const x = nv.x,
      y = nv.y,
      z = nv.z;
    const len = Math.hypot(x, y, z);
    if (!(len > 0)) return null;
    return [x / len, y / len, z / len];
  } catch {
    return null;
  }
}

function buildCostGrid(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  face: any,
  primarySamples: T3[],
  secondarySamples: T3[],
): number[][] {
  const n = primarySamples.length;
  const ns = secondarySamples.length;
  const [keep, cleanup] = replicad.localGC();
  let primaryNormals: (T3 | null)[];
  let secondaryNormals: (T3 | null)[];
  try {
    primaryNormals = primarySamples.map((p) => normalAtSafe(face, p, keep));
    secondaryNormals = secondarySamples.map((p) => normalAtSafe(face, p, keep));
  } finally {
    cleanup();
  }
  const cost: number[][] = new Array(n);
  for (let i = 0; i < n; i++) {
    const row: number[] = new Array(ns);
    const nA = primaryNormals[i];
    for (let j = 0; j < ns; j++) {
      const nB = secondaryNormals[j];
      if (!nA || !nB) {
        row[j] = Infinity;
        continue;
      }
      const dot = nA[0] * nB[0] + nA[1] * nB[1] + nA[2] * nB[2];
      row[j] = 1 - Math.abs(dot);
    }
    cost[i] = row;
  }
  return cost;
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
 * `face.uvCoordinates(p)` returns a plain `[u, v]` tuple (not a WASM
 * handle), so there's nothing to delete here.
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
