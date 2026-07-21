/**
 * Parses a camber hull project JSON and extracts a set of longitudinal wires:
 *   - one sheer wire (the deck-edge curve)
 *   - one wire per template control-point index (the locus each point sweeps
 *     along the hull)
 *
 * Both port and starboard sides are output.
 *
 * The offsets are frame-aligned: each template point's (n, d) are applied
 * orthogonal to the sheer tangent and straight down, matching camber's
 * `buildLongitudinalMesh` from render.ts:
 *
 *   world = p + n_blend × n̂  +  d_blend × d̂
 *
 * where n̂ = [Ty, -Tx, 0]  (inboard, ⊥ to sheer tangent in the xy-plane)
 *       d̂ = [0,  0,  -1]  (depth, straight down)
 *       p  = [x,  y(x), 0] (sheer station position)
 *
 * The sheer control-point y-values are the B-spline control polygon vertices
 * (not exactly on the smooth curve), which introduces small interior errors —
 * acceptable since we then fit a B-spline approximation through the points.
 *
 * Input: a raw camber hull JSON string.
 */

function run(hullJson: string): Assembly {
  // ── Phase 1: Decode JSON ──────────────────────────────────────────────
  // Parse the camber on-disk format:
  //   sheerPlan: [{dx, y, w[]}, ...] — sheer control stations
  //              dx[0] is the absolute x anchor; subsequent are increments.
  //   templates: [[{dd, n, k}, ...], ...] — K templates, each with m points.
  //              dd[0] is always 0 (pinned sheer); subsequent are increments.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let doc: any;
  try {
    doc = JSON.parse(hullJson);
  } catch (e) {
    throw new Error(
      "Camber hull wires: invalid JSON — " +
        (e instanceof Error ? e.message : String(e)),
    );
  }
  if (!Array.isArray(doc.sheerPlan) || doc.sheerPlan.length < 2) {
    throw new Error(
      "Camber hull wires: sheerPlan must be an array of ≥ 2 points.",
    );
  }
  if (!Array.isArray(doc.templates) || doc.templates.length < 1) {
    throw new Error("Camber hull wires: templates must be a non-empty array.");
  }
  if (!Array.isArray(doc.templates[0]) || doc.templates[0].length < 2) {
    throw new Error(
      "Camber hull wires: templates[0] must be an array of ≥ 2 points.",
    );
  }

  // Decode sheerPlan: cumulative dx → absolute x; y and w are as-is.
  interface SheerStation {
    x: number;
    y: number;
    w: number[];
  }
  const cp: SheerStation[] = [];
  {
    let xAcc = 0;
    for (let i = 0; i < doc.sheerPlan.length; i++) {
      const p = doc.sheerPlan[i];
      xAcc = i === 0 ? Number(p.dx) : xAcc + Number(p.dx);
      const y = Number(p.y);
      const w: number[] = Array.isArray(p.w) ? p.w.map(Number) : [];
      cp.push({ x: xAcc, y, w });
    }
  }

  // Decode sheerTrim: cumulative dx → absolute x; z = -depth.
  interface TrimStation {
    x: number;
    z: number;
  }
  const trim: TrimStation[] = [];
  if (Array.isArray(doc.sheerTrim) && doc.sheerTrim.length >= 2) {
    let xAcc2 = 0;
    for (let i = 0; i < doc.sheerTrim.length; i++) {
      const p = doc.sheerTrim[i];
      xAcc2 = i === 0 ? Number(p.dx) : xAcc2 + Number(p.dx);
      trim.push({ x: xAcc2, z: -Number(p.depth) });
    }
  }
  // Linear interpolation of sheer trim z at a given x.
  function zfAt(x: number): number {
    if (trim.length === 0) return 0;
    if (x <= trim[0].x) return trim[0].z;
    if (x >= trim[trim.length - 1].x) return trim[trim.length - 1].z;
    for (let i = 1; i < trim.length; i++) {
      if (x <= trim[i].x) {
        const t = (x - trim[i - 1].x) / (trim[i].x - trim[i - 1].x);
        return trim[i - 1].z + t * (trim[i].z - trim[i - 1].z);
      }
    }
    return 0;
  }

  // ── Clamped cubic B-spline sampler (ported from camber/src/bspline.ts) ────
  // Evaluates y(x) along a clamped uniform B-spline defined by (x,y) control
  // points. Degree is min(3, numCP-1). The curve interpolates only the
  // endpoints and APPROXIMATES interior control points (variation-diminishing).
  function bsplFindSpan(nn: number, p: number, u: number, U: number[]): number {
    if (u >= U[nn + 1]) return nn;
    if (u <= U[p]) return p;
    let lo = p,
      hi = nn + 1,
      mid = (lo + hi) >> 1;
    while (u < U[mid] || u >= U[mid + 1]) {
      if (u < U[mid]) hi = mid;
      else lo = mid;
      mid = (lo + hi) >> 1;
    }
    return mid;
  }
  function bsplDeBoor(
    span: number,
    u: number,
    U: number[],
    P: [number, number][],
    p: number,
  ): [number, number] {
    const d: [number, number][] = [];
    for (let j = 0; j <= p; j++)
      d[j] = [P[span - p + j][0], P[span - p + j][1]];
    for (let r = 1; r <= p; r++)
      for (let j = p; j >= r; j--) {
        const idx2 = span - p + j,
          den = U[idx2 + p - r + 1] - U[idx2];
        const a = den > 0 ? (u - U[idx2]) / den : 0;
        d[j] = [
          (1 - a) * d[j - 1][0] + a * d[j][0],
          (1 - a) * d[j - 1][1] + a * d[j][1],
        ];
      }
    return d[p];
  }
  function clampedBSplineSamplerX(
    pts: [number, number][],
  ): (x: number) => number {
    const numCP = pts.length;
    if (numCP === 0) return () => 0;
    if (numCP === 1) return () => pts[0][1];
    const p = Math.min(3, numCP - 1),
      nn = numCP - 1;
    const U: number[] = [];
    for (let i = 0; i <= p; i++) U.push(0);
    const interior = numCP - p - 1;
    for (let i = 1; i <= interior; i++) U.push(i / (interior + 1));
    for (let i = 0; i <= p; i++) U.push(1);
    const x0 = pts[0][0],
      x1 = pts[numCP - 1][0];
    return (x: number) => {
      x = Math.max(x0, Math.min(x1, x));
      let lo = 0,
        hi = 1,
        pt: [number, number] = pts[0];
      for (let it = 0; it < 36; it++) {
        const mid = (lo + hi) / 2;
        pt = bsplDeBoor(bsplFindSpan(nn, p, mid, U), mid, U, pts, p);
        if (pt[0] < x) lo = mid;
        else hi = mid;
      }
      return pt[1];
    };
  }
  // Plan half-breadth: clamped B-spline over sheerPlan control polygon.
  // This matches camber's sheer.yf exactly — interior cps are handles, not
  // on-curve points, so the true sheer lies inside the control polygon.
  const yf = clampedBSplineSamplerX(
    cp.map((s) => [s.x, s.y] as [number, number]),
  );

  // Decode templates: cumulative dd → absolute d; n and k are as-is.
  interface TemplatePoint {
    n: number;
    d: number;
    k: number;
  }
  const nTpl = doc.templates.length;
  const nPts: number = doc.templates[0].length; // shared section-point count
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const templates: TemplatePoint[][] = doc.templates.map(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (tpl: any[], ti: number) => {
      if (!Array.isArray(tpl) || tpl.length !== nPts) {
        throw new Error(
          `Camber hull wires: templates[${ti}] must have ${nPts} points ` +
            `(matching templates[0]).`,
        );
      }
      let dAcc = 0;
      return tpl.map((pt, i) => {
        dAcc = i === 0 ? 0 : dAcc + Number(pt.dd);
        return { n: Number(pt.n), d: dAcc, k: Number(pt.k) || 0 };
      });
    },
  );

  // Validate / build per-station weights.
  // If w is missing or wrong length on any station, fall back to a linear
  // handoff: full weight on template 0 at stern, template K-1 at bow.
  const hasWeights = cp.every((p) => p.w.length === nTpl);
  if (!hasWeights) {
    const xLo = cp[0].x;
    const xHi = cp[cp.length - 1].x;
    const span = xHi - xLo || 1;
    cp.forEach((p) => {
      if (nTpl === 1) {
        p.w = [1];
      } else {
        const t = (p.x - xLo) / span; // 0 at stern, 1 at bow
        p.w = Array.from({ length: nTpl }, (_, j) => {
          // Triangle basis: peak at j/(nTpl-1), width = 2/(nTpl-1)
          const center = j / (nTpl - 1);
          return Math.max(0, 1 - Math.abs(t - center) * (nTpl - 1));
        });
      }
    });
  }
  // Renormalize onto simplex (clamp negatives, divide by sum).
  cp.forEach((p) => {
    let s = 0;
    const c = p.w.map((v) => {
      const x = v > 0 ? v : 0;
      s += x;
      return x;
    });
    p.w = s > 0 ? c.map((v) => v / s) : c.map(() => 1 / c.length);
  });

  const nStations = cp.length;

  // At station si, find the blended n-offset where the cross-section reaches
  // depth dtrim (positive = below flat deck). Linear interpolation along the
  // blended template curve; used to compute the trimmed sheer position.
  function nAtDepth(si: number, dtrim: number): number {
    if (dtrim <= 0) return 0;
    const w = cp[si].w;
    const bn: number[] = [],
      bd: number[] = [];
    for (let k = 0; k < nPts; k++) {
      let nv = 0,
        dv = 0;
      for (let j = 0; j < nTpl; j++) {
        nv += w[j] * templates[j][k].n;
        dv += w[j] * templates[j][k].d;
      }
      bn.push(nv);
      bd.push(dv);
    }
    if (dtrim >= bd[bd.length - 1]) return bn[bn.length - 1];
    for (let k = 1; k < bd.length; k++) {
      if (dtrim <= bd[k]) {
        const span = bd[k] - bd[k - 1];
        const t = span > 0 ? (dtrim - bd[k - 1]) / span : 0;
        return bn[k - 1] + t * (bn[k] - bn[k - 1]);
      }
    }
    return bn[bn.length - 1];
  }

  // ── Phase 2: Frame per station ────────────────────────────────────────
  // At each sheer control point, compute the local frame vectors:
  //   T  = normalised tangent along the sheer (finite diff of adjacent cps)
  //   d̂  = [0, 0, -1]         (depth — T is always in the xy-plane, so
  //                             projecting out T leaves d̂ unchanged)
  //   n̂  = cross(d̂, T) = [Ty, -Tx, 0]   (inboard, ⊥ T in plan)
  type Vec3 = [number, number, number];
  function normalize(v: Vec3): Vec3 {
    const len = Math.hypot(v[0], v[1], v[2]);
    if (len < 1e-12) return [0, 1, 0]; // degenerate: fall back to +y
    return [v[0] / len, v[1] / len, v[2] / len];
  }

  // Tangent at each station: central difference of yf (B-spline, not cp.y).
  const tangents: Vec3[] = cp.map((_, i) => {
    let dX: number, dY: number;
    if (i === 0) {
      dX = cp[1].x - cp[0].x;
      dY = yf(cp[1].x) - yf(cp[0].x);
    } else if (i === nStations - 1) {
      dX = cp[nStations - 1].x - cp[nStations - 2].x;
      dY = yf(cp[nStations - 1].x) - yf(cp[nStations - 2].x);
    } else {
      dX = cp[i + 1].x - cp[i - 1].x;
      dY = yf(cp[i + 1].x) - yf(cp[i - 1].x);
    }
    return normalize([dX, dY, 0]);
  });

  // ── Phase 3: Sample wire point-lists ──────────────────────────────────
  // Trimmed sheer: the deck edge is not at the flat-deck sheer (z=0) but has
  // moved inward by the amount the blended cross-section sweeps between d=0
  // and d=dtrim, so both the xy position and z are correctly placed.
  const sheerPts: Vec3[] = cp.map((p, i) => {
    const dtrim = -zfAt(p.x); // positive depth below flat deck
    const nTrim = nAtDepth(i, dtrim); // n-offset at that depth
    const T = tangents[i];
    return [p.x + nTrim * T[1], yf(p.x) - nTrim * T[0], -dtrim] as Vec3;
  });

  // Longitudinal wire for template-point idx:
  //   n_blend = Σ_j  w[j] * templates[j][idx].n
  //   d_blend = Σ_j  w[j] * templates[j][idx].d
  //   world   = p + n_blend * n̂  +  d_blend * d̂
  //           = [x + n_blend*Ty,  y - n_blend*Tx,  -d_blend]
  const longPts: Vec3[][] = Array.from({ length: nPts }, (_, idx) =>
    cp.map((p, i) => {
      const T = tangents[i];
      const Tx = T[0],
        Ty = T[1];
      let nB = 0,
        dB = 0;
      for (let j = 0; j < nTpl; j++) {
        nB += p.w[j] * templates[j][idx].n;
        dB += p.w[j] * templates[j][idx].d;
      }
      return [p.x + nB * Ty, yf(p.x) - nB * Tx, -dB] as Vec3;
    }),
  );

  // ── Phase 4: Build wire Assemblies ────────────────────────────────────
  // Each point list becomes two wires (starboard + port mirror).
  // Port mirror: negate the y coordinate of every point.
  // replicad.makeBSplineApproximation → Edge → assembleWire → Wire.
  const wireColors = ["#2a6496", "#e07b00", "#3a9d5d", "#8b3aa0", "#c0392b"];

  function buildWireAssembly(
    pts: Vec3[],
    side: "stbd" | "port",
    label: string,
    colorIdx: number,
  ): Assembly {
    const finalPts: Vec3[] =
      side === "port" ? pts.map(([x, y, z]) => [x, -y, z] as Vec3) : pts;
    const edge = replicad.makeBSplineApproximation(finalPts, {
      tolerance: 1e-3,
      smoothing: [0.7, 1, 0.1], // optimization weight for: length, curvature, torsion
      degMax: 6,
      degMin: 1,
    });
    //const edge = replicad.makeBezierCurve(finalPts);
    const wire = replicad.assembleWire([edge]);
    const color = wireColors[colorIdx % wireColors.length];
    return new Assembly({
      geometry: wire,
      color,
      tags: ["longitudinal", label, side],
    });
  }

  const allWires: Assembly[] = [];
  const allPoints: Assembly[] = [];

  // Sheer wire — starboard only.
  allWires.push(buildWireAssembly(sheerPts, "stbd", "sheer", 0));
  for (const pt of sheerPts) {
    allPoints.push(
      new Assembly({
        geometry: replicad.makeVertex(pt),
        color: "#2a6496",
        tags: ["point", "sheer"],
      }),
    );
  }

  // One longitudinal wire per template point — starboard only.
  // Skip any wire whose points cross above the trimmed sheer (z > zfAt(x)).
  for (let idx = 1; idx < nPts; idx++) {
    const aboveTrim = longPts[idx].some((pt, i) => pt[2] > zfAt(cp[i].x));
    if (aboveTrim) continue;
    allWires.push(
      buildWireAssembly(longPts[idx], "stbd", `long-${idx}`, idx + 1),
    );
    for (const pt of longPts[idx]) {
      allPoints.push(
        new Assembly({
          geometry: replicad.makeVertex(pt),
          color: wireColors[(idx + 1) % wireColors.length],
          tags: ["point", `long-${idx}`],
        }),
      );
    }
  }

  return new Assembly({
    geometry: [
      new Assembly({
        geometry: allWires,
        color: "#2a6496",
        tags: ["hull-wires"],
      }),
      new Assembly({
        geometry: allPoints,
        color: "#e07b00",
        tags: ["hull-points"],
      }),
    ],
    color: "#2a6496",
    tags: ["hull"],
  });
}
