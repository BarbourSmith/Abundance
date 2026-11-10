/**
 * An SVG Export draws the part as seen from below (drawProjection). The
 * projection splits the part's edges, so it comes back as many separate
 * pieces, most of them open: a hole can arrive as two halves, and seams where
 * the part's bottom faces meet show up as lines inside it. An SVG of those
 * pieces has no closed paths to cut, and the 3D view can't cut its holes.
 *
 * outlineProjection keeps the curves that bound the part's footprint, those
 * with material on one side only, joins them end to end into closed loops, and
 * sorts the loops into outlines and their holes. Curves with material on both
 * sides (seams, and edges of pockets or steps underneath) are dropped.
 */
import * as replicad from "replicad";

type Point = [number, number];

/** The outlines in a drawing, through any nesting of blueprints. */
function outlinesOf(shape: any, outlines: replicad.Blueprint[] = []) {
  if (shape.curves) outlines.push(shape);
  else (shape.blueprints ?? []).forEach((b: any) => outlinesOf(b, outlines));
  return outlines;
}

const midpoint = (curve: replicad.Curve2D): Point =>
  curve.value((curve.firstParameter + curve.lastParameter) / 2) as Point;

/** Curves that trace the same path, either way round, are kept once. */
function withoutDuplicates(curves: replicad.Curve2D[]): replicad.Curve2D[] {
  const round = (p: Point) => p.map((v) => v.toFixed(5)).join(",");
  const seen = new Set<string>();
  return curves.filter((curve) => {
    const ends = [round(curve.firstPoint), round(curve.lastPoint)].sort();
    const key = `${ends.join("|")}|${round(midpoint(curve))}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * A test for whether the part has material above or below a point of the
 * bottom view, by whether a vertical line there touches the part. The bottom
 * view looks up the Z axis with X unchanged, so its points are world X and Y.
 */
function footprintTest(shape: replicad.AnyShape, tolerance: number) {
  const oc = replicad.getOC() as any;
  const [[, , zMin], [, , zMax]] = shape.boundingBox.bounds;
  // Only a face whose bounding box covers the point can touch the line
  const faces = (shape as replicad.Shape3D).faces.map((face) => ({
    face,
    bounds: face.boundingBox.bounds,
  }));
  const touches = (line: replicad.Edge, face: replicad.Face) => {
    const distance = new oc.BRepExtrema_DistShapeShape(
      line.wrapped,
      face.wrapped,
    );
    try {
      return distance.IsDone() && distance.Value() < tolerance;
    } finally {
      distance.delete();
    }
  };
  return ([x, y]: Point) => {
    const line = replicad.makeLine([x, y, zMin - 1], [x, y, zMax + 1]);
    try {
      return faces.some(
        ({ face, bounds: [min, max] }) =>
          x >= min[0] - tolerance &&
          x <= max[0] + tolerance &&
          y >= min[1] - tolerance &&
          y <= max[1] + tolerance &&
          touches(line, face),
      );
    } finally {
      line.delete();
    }
  };
}

/**
 * Joins curves end to end, reversing them where needed, and only through
 * points `canJoinAt` allows. Returns the chains that close into loops and the
 * ones that don't.
 */
function joinCurves(
  curves: replicad.Curve2D[],
  tolerance: number,
  canJoinAt: (point: Point) => boolean = () => true,
) {
  const samePoint = (a: Point, b: Point) =>
    Math.hypot(a[0] - b[0], a[1] - b[1]) < tolerance;
  const left = [...curves];
  const closed: replicad.Curve2D[][] = [];
  const open: replicad.Curve2D[][] = [];
  while (left.length) {
    const chain = [left.shift()!];
    for (;;) {
      const end = chain[chain.length - 1].lastPoint;
      if (chain.length > 1 && samePoint(end, chain[0].firstPoint)) break;
      if (!canJoinAt(end)) break;
      const next = left.findIndex(
        (c) => samePoint(c.firstPoint, end) || samePoint(c.lastPoint, end),
      );
      if (next < 0) break;
      const [curve] = left.splice(next, 1);
      if (!samePoint(curve.firstPoint, end)) curve.reverse();
      chain.push(curve);
    }
    const isLoop =
      chain.length > 0 &&
      samePoint(chain[chain.length - 1].lastPoint, chain[0].firstPoint);
    (isLoop ? closed : open).push(chain);
  }
  return { closed, open };
}

/**
 * The bottom view of `shape` (its drawProjection from "bottom") as closed
 * outlines with holes, plus any boundary pieces that didn't close. A
 * projection with no closed outline is returned as it is.
 */
export function outlineProjection(
  projection: replicad.Drawing,
  shape: replicad.AnyShape,
): replicad.Drawing {
  const [min, max] = shape.boundingBox.bounds;
  const size = Math.hypot(max[0] - min[0], max[1] - min[1], max[2] - min[2]);
  // How far either side of a curve to look for material
  const offset = Math.max(size * 1e-4, 1e-6);
  const hasMaterial = footprintTest(shape, size * 1e-9 + 1e-9);

  const curves = withoutDuplicates(
    //@ts-expect-error - ignore access of private innerShape field
    outlinesOf(projection.innerShape).flatMap((outline) => outline.curves),
  );
  const isBoundary = (curve: replicad.Curve2D) => {
    const [x, y] = midpoint(curve);
    const [tx, ty] = curve.tangentAt(0.5);
    const length = Math.hypot(tx, ty) || 1;
    const [nx, ny] = [(-ty / length) * offset, (tx / length) * offset];
    return hasMaterial([x + nx, y + ny]) !== hasMaterial([x - nx, y - ny]);
  };

  // Seams only branch off where three or more curve ends meet, so a run of
  // curves between such points is all boundary or all seam. Testing one curve
  // per run keeps the (slow) material test to a few calls.
  const tolerance = offset / 100;
  const ends = curves.flatMap((curve) => [curve.firstPoint, curve.lastPoint]);
  const passesThrough = (point: Point) =>
    ends.filter(
      (end) => Math.hypot(end[0] - point[0], end[1] - point[1]) < tolerance,
    ).length === 2;
  const runs = joinCurves(curves, tolerance, passesThrough);
  const boundary = [...runs.closed, ...runs.open]
    .filter((run) => isBoundary(run[Math.floor(run.length / 2)]))
    .flat();

  const { closed, open } = joinCurves(boundary, tolerance);
  if (!closed.length) return projection;
  const shapes = replicad.organiseBlueprints(
    closed.map((chain) => new replicad.Blueprint(chain)),
  );
  if (!open.length) return new replicad.Drawing(shapes);
  return new replicad.Drawing(
    new replicad.Blueprints([
      ...shapes.blueprints,
      ...open.map((chain) => new replicad.Blueprint(chain)),
    ]),
  );
}
