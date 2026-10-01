/**
 * On-demand geometry checks for the local agent tools (get_atom,
 * check_geometry, check_interference).
 *
 * These run in the mesh worker pool only when an agent asks, never in the
 * CAD pipeline, so they add nothing to normal recompute time.
 */
import * as replicad from "replicad";

export type Bounds = { min: number[]; max: number[] };

export type SliverFace = {
  face: number;
  /** Approximate width: 2 * area / perimeter. */
  width: number;
  area: number;
  center: number[];
};

export type ShapeDiagnostics = {
  kind: "solid" | "sketch" | "wire" | "point" | "other";
  bounding_box?: Bounds;
  volume?: number;
  face_count?: number;
  valid?: boolean;
  unmeshed_faces?: number[];
  sliver_faces?: SliverFace[];
  problems: string[];
};

export type Overlap = {
  volume: number;
  /** Approximate thickness of the overlapping region: 2 * volume / area. */
  thickness: number;
  bounding_box: Bounds;
};

const MAX_SLIVERS_REPORTED = 5;

export function round(n: number, places = 3): number {
  const f = 10 ** places;
  return Math.round(n * f) / f;
}

export function shapeBounds(shape: replicad.Shape3D): Bounds | undefined {
  const box = shape.boundingBox;
  try {
    const [min, max] = box.bounds;
    if (!min || !max || min.some((v) => !Number.isFinite(v))) return undefined;
    return { min: [...min], max: [...max] };
  } finally {
    box.delete();
  }
}

export function boundsOverlap(a: Bounds, b: Bounds, slack = 0): boolean {
  return a.min.every(
    (_, i) => a.min[i] <= b.max[i] + slack && b.min[i] <= a.max[i] + slack,
  );
}

function roundBounds(b: Bounds): Bounds {
  return { min: b.min.map((v) => round(v)), max: b.max.map((v) => round(v)) };
}

function isValidShape(shape: replicad.Shape3D): boolean {
  const oc = replicad.getOC();
  const analyzer = new oc.BRepCheck_Analyzer(shape.wrapped, true, false, false);
  try {
    return analyzer.IsValid();
  } finally {
    analyzer.delete();
  }
}

/**
 * One pass over the faces: faces the display mesher produced no triangles for
 * (they render as holes, so the part looks see-through from one side), and
 * faces narrower than minFeature.
 */
function scanFaces(
  shape: replicad.Shape3D,
  minFeature: number,
): { faceCount: number; unmeshed: number[]; slivers: SliverFace[] } {
  // Same tolerances as generateDisplayMesh, so this matches what users see.
  // Meshing stores each face's triangulation, read back below.
  shape.mesh({ tolerance: 0.1, angularTolerance: 0.5 });
  const unmeshed: number[] = [];
  const slivers: SliverFace[] = [];
  const faces = shape.faces;
  faces.forEach((face, index) => {
    try {
      const triangulation = face.triangulation();
      if (!triangulation || triangulation.trianglesIndexes.length === 0) {
        unmeshed.push(index);
      }
      const area = replicad.measureArea(face);
      let perimeter = 0;
      for (const edge of face.edges) {
        perimeter += replicad.measureLength(edge);
        edge.delete();
      }
      if (perimeter <= 0) return;
      const width = (2 * area) / perimeter;
      if (width < minFeature) {
        const center = face.center;
        slivers.push({
          face: index,
          width: round(width, 4),
          area: round(area, 4),
          center: center.toTuple().map((v) => round(v)),
        });
        center.delete();
      }
    } finally {
      face.delete();
    }
  });
  slivers.sort((a, b) => a.width - b.width);
  return { faceCount: faces.length, unmeshed, slivers };
}

/**
 * Check one part. `minFeature` is in project units: faces narrower than it
 * are reported as slivers.
 */
export function diagnoseShape(
  shape: unknown,
  minFeature: number,
): ShapeDiagnostics {
  if (shape instanceof replicad.Vertex) return { kind: "point", problems: [] };
  if (shape instanceof replicad.Wire) return { kind: "wire", problems: [] };
  if (shape instanceof replicad.Drawing)
    return { kind: "sketch", problems: [] };
  if (!(shape instanceof replicad.Shape))
    return { kind: "other", problems: [] };

  const solid = shape as replicad.Shape3D;
  const result: ShapeDiagnostics = { kind: "solid", problems: [] };
  const bounds = shapeBounds(solid);
  if (bounds) result.bounding_box = roundBounds(bounds);
  result.volume = round(replicad.measureVolume(solid));

  result.valid = isValidShape(solid);
  if (!result.valid) {
    result.problems.push(
      "OpenCascade reports the shape as invalid. It may render or cut incorrectly.",
    );
  }
  if (result.volume < 0) {
    result.problems.push(
      "Negative volume: the shape is inside out, so it may render see-through.",
    );
  }

  try {
    const { faceCount, unmeshed, slivers } = scanFaces(solid, minFeature);
    result.face_count = faceCount;
    if (unmeshed.length) {
      result.unmeshed_faces = unmeshed.slice(0, 20);
      result.problems.push(
        `${unmeshed.length} face(s) produced no triangles when meshed, so the part shows holes or looks see-through.`,
      );
    }
    if (slivers.length) {
      result.sliver_faces = slivers.slice(0, MAX_SLIVERS_REPORTED);
      result.problems.push(
        `${slivers.length} sliver face(s) narrower than ${minFeature} (thinnest ${slivers[0].width}). Usually a part overlapping another by a tiny amount; check_interference finds which.`,
      );
    }
  } catch (e) {
    result.problems.push(`Checking faces failed: ${(e as Error).message || e}`);
  }
  return result;
}

/**
 * The overlap between two solids, or null when they don't overlap by more
 * than a negligible volume. Doesn't modify either input.
 */
export function measureOverlap(
  a: replicad.Shape3D,
  b: replicad.Shape3D,
  minVolume: number,
): Overlap | null {
  let common: replicad.Shape3D;
  try {
    common = a.intersect(b);
  } catch (e) {
    // Shapes that only touch intersect to nothing, which replicad rejects.
    if (/Could not intersect/.test((e as Error).message)) return null;
    throw e;
  }
  try {
    const volume = replicad.measureVolume(common);
    if (!(volume > minVolume)) return null;
    const area = replicad.measureArea(common);
    const bounds = shapeBounds(common);
    if (!bounds) return null;
    return {
      volume: round(volume),
      thickness: round(area > 0 ? (2 * volume) / area : 0, 4),
      bounding_box: roundBounds(bounds),
    };
  } finally {
    common.delete();
  }
}
