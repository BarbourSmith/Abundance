import Fonts from "../js/fonts.js";
import { MeshLruCache } from "../js/meshCache.js";
import * as workerpool from "workerpool";
import type { ShapeMesh } from "replicad";
import * as replicad from "replicad";
import { ReplicadObject, RequestContext } from "./geometryProvider";
import { text } from "./shapes";
import { asPositionQuaternion, transformPoint } from "./lazyTransform";
import type { RigidTransform } from "./lazyTransform";
import type { AbundanceLeaf, AbundanceObject } from "./util";
import * as util from "./util";
import {
  Bounds,
  boundsOverlap,
  diagnoseShape,
  isValidShape,
  measureOverlap,
  shapeBounds,
} from "./geometryDiagnostics";

type Vec3 = [number, number, number];

/**
 * Triangles for display. Arrays from the mesh cache are typed arrays, which
 * cross to the main thread several times faster than number[] and take half
 * the memory; atom-supplied meshOverrides are plain arrays.
 */
type DisplayFaces = {
  vertices: Float32Array | number[];
  normals: Float32Array | number[];
  triangles: Uint32Array | number[];
  faceGroups: ShapeMesh["faceGroups"];
};

type DisplayEdges = {
  lines: Float32Array | number[];
  edgeGroups: {
    start: number;
    count: number;
    edgeId: number;
  }[];
};

/**
 * One part of a displayed value.
 *
 * Moved and rotated copies of a shape share one `faces` and `edges` object,
 * meshed once from the untransformed shape, and each carries its own
 * `transform`. postMessage keeps shared objects shared, so the main thread
 * receives one copy of the triangles, and readers build one three.js geometry
 * for it and place each part with `transform`. A part without a transform is
 * already in place.
 */
type DisplayMesh = {
  cameraZoom: number;
  faces?: DisplayFaces;
  edges?: DisplayEdges;
  /** Where to put the mesh: three.js Object3D.position and .quaternion. */
  transform?: {
    position: Vec3;
    quaternion: [number, number, number, number];
  };
  color: string;
  point?: Vec3;
  // Per-vertex RGB triples in [0,1], aligned with faces.vertices. Set
  // when an atom supplies a pre-baked metadata.meshOverride. Plain array
  // so it survives JSON serialization through the assembly cache.
  vertexColors?: number[];
};

const textCache: Map<string, DisplayMesh[]> = new Map();
const started: Promise<boolean> = util.init(false);
void started.then(() => util.startHeapMonitor("meshWorker"));

/**
 * LRU of deserialized shapes, keyed by project and the id of the stored shape.
 *
 * Display requests carry no operation id, so geometryProvider.get() reads
 * every leaf from IndexedDB and re-parses its BREP on every request. Clicking
 * back to something shown a moment ago paid that full cost again. Geometry ids
 * are content addressed, so a cached shape only goes stale when Recompute
 * Project rebuilds the stored shapes, which calls forgetProject. Otherwise
 * entries are only evicted to bound memory.
 *
 * Moved and rotated copies share their base shape's entry: getShapeCached
 * applies the transform to the cached base, which is cheap.
 *
 * workerpool runs one task at a time per worker, and eviction only happens
 * between tasks (see withShapeCache), so a shape is never deleted while a task
 * is still using it.
 */
const SHAPE_CACHE_MAX_ENTRIES = 256;
const shapeCache = new Map<string, ReplicadObject>();

async function getShapeCached(
  id: string,
  context: RequestContext,
): Promise<ReplicadObject> {
  const provider = util.geometryProvider!;
  const { base, transform } = provider.splitTransform(id);
  const key = `${context?.project ?? ""}|${base}`;
  let shape = shapeCache.get(key);
  if (shape) {
    // Refresh recency.
    shapeCache.delete(key);
  } else {
    shape = await provider.get(base, context);
  }
  shapeCache.set(key, shape);
  return transform ? provider.transformShape(shape, transform) : shape;
}

function evictShape(key: string): void {
  const shape = shapeCache.get(key);
  shapeCache.delete(key);
  try {
    (shape as { delete?: () => void } | undefined)?.delete?.();
  } catch {
    // Already freed; nothing to do.
  }
}

function trimShapeCache(): void {
  while (shapeCache.size > SHAPE_CACHE_MAX_ENTRIES) {
    evictShape(shapeCache.keys().next().value as string);
  }
}

/**
 * Meshes of stored shapes, keyed like shapeCache, so a shape is meshed once
 * however many moved copies of it are shown and however many displayed values
 * include it. Meshing is by far the slowest step of displaying a shape.
 *
 * Sketches are the exception: a moved sketch also gets a new plane, so they
 * are meshed in place and cached per placement under `<key>|placed|...`; the
 * base entry only records that the shape is a sketch.
 */
type Bounds3 = [Vec3, Vec3];
type MeshEntry =
  | { kind: "shape"; faces: DisplayFaces; edges: DisplayEdges; bounds?: Bounds3 }
  | { kind: "wire"; edges: DisplayEdges; bounds?: Bounds3 }
  | { kind: "vertex" }
  | { kind: "drawing" };
type PlacedDrawing = {
  faces: DisplayFaces;
  edges: DisplayEdges;
  bounds?: number[][];
};

const MESH_CACHE_MAX_BYTES = 256 * 1024 * 1024;
const meshCache = new MeshLruCache({
  maxEntries: Infinity,
  maxBytes: MESH_CACHE_MAX_BYTES,
});

/**
 * Drops a project's cached shapes and meshes. Recompute Project rebuilds the
 * stored shapes, and one stored broken can come back different under the
 * same id.
 */
function forgetProject(project: string): void {
  const prefix = `${project ?? ""}|`;
  for (const key of [...shapeCache.keys()]) {
    if (key.startsWith(prefix)) evictShape(key);
  }
  for (const key of [...meshCache.keys()] as string[]) {
    if (key.startsWith(prefix)) meshCache.delete(key);
  }
}

/** Run a worker task, trimming the shape cache once it has finished. */
async function withShapeCache<T>(task: () => Promise<T>): Promise<T> {
  try {
    return await task();
  } finally {
    trimShapeCache();
  }
}

/**
 * Width, height and depth of the box around all of `boxes`. Each box is a
 * [min, max] pair; 2D sketch boxes have no z.
 */
function overallSize(boxes: number[][][]): {
  width: number;
  height: number;
  depth: number;
} {
  const overallMin = [Infinity, Infinity, Infinity];
  const overallMax = [-Infinity, -Infinity, -Infinity];
  for (const [min, max] of boxes) {
    for (let i = 0; i < 3; i++) {
      if (Number.isFinite(min?.[i]) && Number.isFinite(max?.[i])) {
        overallMin[i] = Math.min(overallMin[i], min[i]);
        overallMax[i] = Math.max(overallMax[i], max[i]);
      }
    }
  }
  for (let i = 0; i < 3; i++) {
    if (!isFinite(overallMax[i]) || !isFinite(overallMin[i])) {
      overallMin[i] = 0;
      overallMax[i] = 0;
    }
  }
  return {
    width: overallMax[0] - overallMin[0],
    height: overallMax[1] - overallMin[1],
    depth: overallMax[2] - overallMin[2],
  };
}

function calculateZoom(boundingBox: {
  width: number;
  height: number;
  depth: number;
}): number {
  try {
    // Given example bounding box and zoom level
    const exampleBoundingBox = {
      width: 312.0005000624958,
      height: 312.00074999364347,
      depth: 432.0009977339615,
    };
    const exampleZoom = 0.5;

    // Calculate the diagonal length of the given example bounding box
    const exampleDiagonal = Math.sqrt(
      Math.pow(exampleBoundingBox.width, 2) +
        Math.pow(exampleBoundingBox.height, 2) +
        Math.pow(exampleBoundingBox.depth, 2),
    );

    // Calculate the diagonal length of the input bounding box
    const diagonal = Math.sqrt(
      Math.pow(boundingBox.width, 2) +
        Math.pow(boundingBox.height, 2) +
        Math.pow(boundingBox.depth, 2),
    );

    // Calculate the zoom level based on the proportional relationship
    // Apply a margin factor (0.9) to leave visual breathing room around the object
    // This prevents thumbnails from appearing too zoomed in
    // The 0.9 factor means objects fill ~90% of the viewport, providing subtle margins
    const marginFactor = 0.9;
    const zoom = (exampleZoom * exampleDiagonal * marginFactor) / diagonal;
    return zoom;
  } catch (e) {
    console.error("Error calculating zoom level:", e);
    throw e;
  }
}

function generateCameraPosition(boxes: number[][][]): number {
  const zoom = calculateZoom(overallSize(boxes));
  if (zoom == 0 || !Number.isFinite(zoom)) {
    throw new Error("Calculated zoom level is zero");
  }
  return zoom;
}

/** The box around `bounds` once moved by `transform`. */
function moveBounds(bounds: Bounds3, transform?: RigidTransform): Bounds3 {
  if (!transform) return bounds;
  const min: Vec3 = [Infinity, Infinity, Infinity];
  const max: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (let corner = 0; corner < 8; corner++) {
    const point = transformPoint(transform, [
      bounds[(corner >> 0) & 1][0],
      bounds[(corner >> 1) & 1][1],
      bounds[(corner >> 2) & 1][2],
    ]);
    for (let i = 0; i < 3; i++) {
      min[i] = Math.min(min[i], point[i]);
      max[i] = Math.max(max[i], point[i]);
    }
  }
  return [min, max];
}

/** The box around a flat list of xyz coordinates. */
function boundsOfPoints(points: ArrayLike<number>): Bounds3 | undefined {
  if (!points || points.length < 3) return undefined;
  const min: Vec3 = [Infinity, Infinity, Infinity];
  const max: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (let j = 0; j < points.length; j += 3) {
    for (let i = 0; i < 3; i++) {
      min[i] = Math.min(min[i], points[j + i]);
      max[i] = Math.max(max[i], points[j + i]);
    }
  }
  return [min, max];
}

/** A shape's bounding box, or undefined when OpenCascade can't give one. */
function boundsOf(shape: {
  boundingBox: { bounds: unknown; delete?: () => void };
}) {
  let box;
  try {
    box = shape.boundingBox;
    const bounds = box.bounds;
    if (Array.isArray(bounds) && Array.isArray(bounds[0])) {
      return bounds.map((corner) => [...corner]) as Bounds3;
    }
  } catch (e) {
    console.error("Error computing bounding box:", e);
  } finally {
    box?.delete?.();
  }
  return undefined;
}

const MESH_TOLERANCE = { tolerance: 0.1, angularTolerance: 0.5 };
const WIRE_TOLERANCE = { tolerance: 0.03, angularTolerance: 0.1 };

function packFaces(mesh: ShapeMesh): DisplayFaces {
  return {
    vertices: new Float32Array(mesh.vertices),
    normals: new Float32Array(mesh.normals),
    triangles: new Uint32Array(mesh.triangles),
    faceGroups: mesh.faceGroups,
  };
}

function packEdges(edges: {
  lines: number[];
  edgeGroups: DisplayEdges["edgeGroups"];
}): DisplayEdges {
  return { lines: new Float32Array(edges.lines), edgeGroups: edges.edgeGroups };
}

/** Meshes a stored (untransformed) shape for the mesh cache. */
function meshStoredShape(shape: ReplicadObject): MeshEntry {
  if (shape instanceof replicad.Vertex) return { kind: "vertex" };
  if (shape instanceof replicad.Drawing) return { kind: "drawing" };
  if (shape instanceof replicad.Wire) {
    return {
      kind: "wire",
      edges: packEdges(shape.meshEdges(WIRE_TOLERANCE)),
      bounds: boundsOf(shape),
    };
  }
  const solid = shape as replicad.Shape3D;
  return {
    kind: "shape",
    faces: packFaces(solid.mesh(MESH_TOLERANCE)),
    edges: packEdges(solid.meshEdges(MESH_TOLERANCE)),
    bounds: boundsOf(solid),
  };
}

/** Meshes a sketch on its plane, as a thin solid. */
function meshDrawing(
  drawing: replicad.Drawing,
  plane: AbundanceLeaf["plane"],
): PlacedDrawing {
  const solid = drawing
    .sketchOnPlane(util.asReplicadPlane(plane))
    .extrude(0.0001) as replicad.Shape3D;
  try {
    return {
      faces: packFaces(solid.mesh(MESH_TOLERANCE)),
      edges: packEdges(solid.meshEdges(MESH_TOLERANCE)),
      bounds: boundsOf(drawing) as number[][] | undefined,
    };
  } finally {
    solid.delete();
  }
}

type DisplayPart = {
  mesh: Omit<DisplayMesh, "cameraZoom">;
  /** For the camera zoom; undefined for points. */
  bounds?: number[][];
};

/**
 * The display mesh for one leaf. Throws when the leaf's shape can't be loaded
 * or meshed.
 */
async function displayPart(
  leaf: AbundanceLeaf,
  context: RequestContext,
): Promise<DisplayPart> {
  const color = leaf.color;

  // Generic atom-supplied mesh: short-circuits all tessellation. The atom
  // owns the full render contract (faces, edges, optional vertex colours);
  // meshWorker stays domain-agnostic.
  const override = leaf.metadata?.meshOverride;
  if (override && override.faces && override.id == leaf.geometry) {
    return {
      mesh: {
        faces: override.faces,
        edges: override.edges,
        color,
        ...(override.vertexColors
          ? { vertexColors: override.vertexColors }
          : {}),
      },
      bounds: boundsOfPoints(override.faces.vertices),
    };
  }

  const { base, transform } = util.geometryProvider!.splitTransform(
    leaf.geometry,
  );
  const baseKey = `${context?.project ?? ""}|${base}`;
  let entry = meshCache.get(baseKey) as MeshEntry | undefined;
  if (!entry) {
    entry = meshStoredShape(await getShapeCached(base, context));
    meshCache.set(baseKey, entry);
  }

  switch (entry.kind) {
    case "shape":
    case "wire":
      return {
        mesh: {
          ...(entry.kind === "shape" ? { faces: entry.faces } : {}),
          edges: entry.edges,
          color,
          ...(transform ? { transform: asPositionQuaternion(transform) } : {}),
        },
        bounds: entry.bounds && moveBounds(entry.bounds, transform),
      };
    case "vertex": {
      const vertex = (await getShapeCached(
        leaf.geometry,
        context,
      )) as replicad.Vertex;
      return { mesh: { point: vertex.asTuple() as Vec3, color } };
    }
    case "drawing": {
      // Sent in place: see meshCache.
      const key = `${baseKey}|placed|${leaf.geometry}|${JSON.stringify(leaf.plane)}`;
      let placed = meshCache.get(key) as PlacedDrawing | undefined;
      if (!placed) {
        const drawing = (await getShapeCached(
          leaf.geometry,
          context,
        )) as replicad.Drawing;
        placed = meshDrawing(drawing, leaf.plane);
        meshCache.set(key, placed);
      }
      return {
        mesh: { faces: placed.faces, edges: placed.edges, color },
        bounds: placed.bounds,
      };
    }
  }
}

/**
 * Generates and memoizes default mesh for display when no output is available.
 * @param {string} id - The unique identifier to store the default mesh in the library
 * @returns {Promise} A promise that resolves to the default text mesh
 */
async function generateDefaultMesh(): Promise<DisplayMesh[]> {
  const s = performance.now();
  const defaultMesh = textMesh("No output to display");
  console.debug("generated default mesh. took ", performance.now() - s, "ms");

  return defaultMesh;
}

async function textMesh(text: string): Promise<DisplayMesh[]> {
  await util.init();
  await util.replicad.loadFont(Fonts["ROBOTO" as keyof typeof Fonts], "ROBOTO");

  const drawing = replicad.drawText(text, {
    fontFamily: "ROBOTO",
    fontSize: 28,
  });
  const meshShape = drawing.sketchOnPlane("XY").extrude(0.0001);
  return [
    {
      cameraZoom: 10,
      faces: meshShape.mesh({ tolerance: 0.1, angularTolerance: 0.5 }),
      edges: meshShape.meshEdges({
        tolerance: 0.1,
        angularTolerance: 0.5,
      }),
      color: util.defaultColor,
    },
  ];
}

async function generateDisplayMesh(
  id: AbundanceObject,
  context: RequestContext,
): Promise<{ id: AbundanceObject; mesh: DisplayMesh[] }> {
  try {
    await started;
    let geom = undefined;
    if (util.isAbundanceObject(id)) {
      if (id.geometry.length !== 0) {
        geom = id;
      } else {
        return { id: id, mesh: await generateDefaultMesh() };
      }
    } else {
      // handle other content types
      if (typeof id === "number" || typeof id === "string") {
        return { id: id, mesh: await textMesh(String(id)) };
      }
      return { id: id, mesh: await generateDefaultMesh() };
    }

    // Flatten the assembly to remove hierarchy. Skip empty shapes
    const flattened = util.flattenAssembly(geom).filter((part) => {
      return part.geometry !== util.geometryProvider?.EMPTY_SHAPE_SENTINEL;
    });
    if (flattened.length === 0) {
      return { id: id, mesh: await generateDefaultMesh() };
    }

    const parts: DisplayPart[] = [];
    for (const [index, leaf] of flattened.entries()) {
      try {
        parts.push(await displayPart(leaf, context));
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error(
          `Error meshing geometry part ${index} (color: ${leaf.color}): ${msg}`,
          e,
        );
        // Skip this part and continue so other parts still display
      }
    }
    if (parts.length === 0) {
      console.error(
        "All geometry parts failed to mesh — falling back to default mesh",
      );
      return { id: id, mesh: await generateDefaultMesh() };
    }

    let cameraZoom;
    try {
      // Points have no box: a single point would skew or zero the zoom.
      const boxes = parts
        .map((part) => part.bounds)
        .filter((bounds): bounds is number[][] => !!bounds);
      cameraZoom = boxes.length > 0 ? generateCameraPosition(boxes) : 1;
    } catch (e) {
      console.error("Error generating camera position:", e);
      cameraZoom = 1;
    }

    return {
      id: geom,
      mesh: parts.map((part) => ({ cameraZoom, ...part.mesh })),
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("Error in generateDisplayMesh:", msg, e);
    // Fall back to default mesh while preserving the original id so callers can update UI state
    return { id, mesh: await generateDefaultMesh() };
  }
}

/**
 * Generate one mesh per topological Face of each leaf shape, keyed by
 * leaf index. Used by faceselect mode so that clicking a rendered mesh
 * directly identifies which `shape.faces[i]` was picked (as opposed to
 * relying on faceGroups inside a combined mesh).
 *
 * Returns `{ [leafIndex]: Array<{ index: number; faces: ShapeMesh }> }`.
 */
async function generatePerFaceMeshes(
  id: AbundanceObject,
  context: RequestContext,
): Promise<Record<number, { index: number; faces: ShapeMesh }[]>> {
  await started;
  const result: Record<number, { index: number; faces: ShapeMesh }[]> = {};
  if (!util.isAbundanceObject(id) || id.geometry.length === 0) {
    return result;
  }
  const flattened = util.flattenAssembly(id).filter((part) => {
    return part.geometry !== util.geometryProvider?.EMPTY_SHAPE_SENTINEL;
  });
  for (let leafIndex = 0; leafIndex < flattened.length; leafIndex++) {
    const displayObject = flattened[leafIndex];
    // In the untransformed shape's coordinates, like the display mesh:
    // the 3D view places each part's face and edge meshes with its transform.
    const { base } = util.geometryProvider!.splitTransform(
      displayObject.geometry,
    );
    const shape = await getShapeCached(base, context);
    // Only Shape (3D solids, faces) have a `.faces` accessor.
    if (
      !shape ||
      shape instanceof replicad.Vertex ||
      shape instanceof replicad.Wire ||
      shape instanceof replicad.Drawing
    ) {
      result[leafIndex] = [];
      continue;
    }
    const faces = (shape as replicad.Shape<any>).faces;
    const faceMeshes: { index: number; faces: ShapeMesh }[] = [];
    faces.forEach((face, faceIdx) => {
      try {
        const mesh = face.mesh({ tolerance: 0.1, angularTolerance: 0.5 });
        faceMeshes.push({ index: faceIdx, faces: mesh });
      } catch (e) {
        console.error(`Error meshing face ${faceIdx} of leaf ${leafIndex}:`, e);
      }
    });
    result[leafIndex] = faceMeshes;
  }
  return result;
}

/**
 * Generate one line mesh per topological Edge of each leaf shape, keyed
 * by leaf index. Used by edgeselect mode.
 *
 * Returns `{ [leafIndex]: Array<{ index: number; edges: {lines, edgeGroups} }> }`.
 */
async function generatePerEdgeMeshes(
  id: AbundanceObject,
  context: RequestContext,
): Promise<Record<number, { index: number; edges: any }[]>> {
  await started;
  const result: Record<number, { index: number; edges: any }[]> = {};
  if (!util.isAbundanceObject(id) || id.geometry.length === 0) {
    return result;
  }
  const flattened = util.flattenAssembly(id).filter((part) => {
    return part.geometry !== util.geometryProvider?.EMPTY_SHAPE_SENTINEL;
  });
  for (let leafIndex = 0; leafIndex < flattened.length; leafIndex++) {
    const displayObject = flattened[leafIndex];
    // In the untransformed shape's coordinates, like the display mesh:
    // the 3D view places each part's face and edge meshes with its transform.
    const { base } = util.geometryProvider!.splitTransform(
      displayObject.geometry,
    );
    const shape = await getShapeCached(base, context);
    if (
      !shape ||
      shape instanceof replicad.Vertex ||
      shape instanceof replicad.Drawing
    ) {
      result[leafIndex] = [];
      continue;
    }
    const edges = (shape as replicad.Shape<any>).edges;
    const edgeMeshes: { index: number; edges: any }[] = [];
    edges.forEach((edge, edgeIdx) => {
      try {
        const meshed = (edge as any).meshEdges({
          tolerance: 0.03,
          angularTolerance: 0.1,
        });
        edgeMeshes.push({ index: edgeIdx, edges: meshed });
      } catch (e) {
        console.error(`Error meshing edge ${edgeIdx} of leaf ${leafIndex}:`, e);
      }
    });
    result[leafIndex] = edgeMeshes;
  }
  return result;
}

/** The parts of a value in display order, the order agent tools number them. */
function partsOf(value: AbundanceObject): AbundanceLeaf[] {
  if (!util.isAbundanceObject(value)) return [];
  return util.flattenAssembly(value).filter((part) => {
    return part.geometry !== util.geometryProvider?.EMPTY_SHAPE_SENTINEL;
  });
}

/** A pick on a part, as the 3D view's selection mode reports it. */
type SelectionRef =
  { kind: "edge" | "face"; leaf: number; index: number } | { kind: "bounds" };

/**
 * Coordinates for picked edges and faces, for the Label atom: an edge's start
 * and end points, a face's center. Parts are numbered as in
 * generatePerEdgeMeshes / generatePerFaceMeshes (non-empty leaves in order),
 * so picks made in selection mode resolve to the same element. A reference
 * that no longer exists (the model changed) resolves to null.
 */
async function resolveSelectionPoints(
  value: AbundanceObject,
  refs: SelectionRef[],
  context: RequestContext,
) {
  await started;
  const parts = util.isAbundanceObject(value)
    ? util
        .flattenAssembly(value)
        .filter(
          (part) =>
            part.geometry !== util.geometryProvider?.EMPTY_SHAPE_SENTINEL,
        )
    : [];
  const xyz = (v: replicad.Vector) => [v.x, v.y, v.z];
  const results = [];
  for (const ref of refs) {
    try {
      // The bounding box of all the parts
      if (ref.kind === "bounds") {
        const min = [Infinity, Infinity, Infinity];
        const max = [-Infinity, -Infinity, -Infinity];
        for (const part of parts) {
          const shape = (await getShapeCached(
            part.geometry,
            context,
          )) as replicad.Shape<any>;
          const bounds = shape?.boundingBox?.bounds;
          if (!bounds) continue;
          for (let i = 0; i < 3; i++) {
            min[i] = Math.min(min[i], bounds[0][i]);
            max[i] = Math.max(max[i], bounds[1][i]);
          }
        }
        results.push(Number.isFinite(min[0]) ? { min, max } : null);
        continue;
      }
      const part = parts[ref.leaf];
      if (!part) {
        results.push(null);
        continue;
      }
      const shape = (await getShapeCached(
        part.geometry,
        context,
      )) as replicad.Shape<any>;
      if (ref.kind === "edge") {
        const edge = shape?.edges?.[ref.index];
        results.push(
          edge
            ? { start: xyz(edge.startPoint), end: xyz(edge.endPoint) }
            : null,
        );
      } else {
        const face = shape?.faces?.[ref.index];
        results.push(face ? { center: xyz(face.center) } : null);
      }
    } catch {
      results.push(null);
    }
  }
  return results;
}

/**
 * Agent diagnostics: check each part (or one part) for invalid shapes, faces
 * that fail to mesh, and sliver faces. Stops after budgetMs and reports how
 * many parts it checked.
 */
async function inspectParts(
  value: AbundanceObject,
  context: RequestContext,
  opts: { part?: number; minFeature: number; budgetMs: number },
) {
  await started;
  const parts = partsOf(value);
  if (opts.part !== undefined && !parts[opts.part]) {
    return { part_count: parts.length, checked: 0, parts: [] };
  }
  const indices =
    opts.part !== undefined ? [opts.part] : parts.map((_, i) => i);
  const start = performance.now();
  const results = [];
  for (const index of indices) {
    if (performance.now() - start > opts.budgetMs) break;
    const leaf = parts[index];
    try {
      const shape = await getShapeCached(leaf.geometry, context);
      results.push({
        index,
        tags: leaf.tags,
        ...diagnoseShape(shape, opts.minFeature),
      });
    } catch (e) {
      results.push({
        index,
        tags: leaf.tags,
        kind: "other",
        problems: [`Could not check this part: ${(e as Error).message || e}`],
      });
    }
  }
  return { part_count: parts.length, checked: results.length, parts: results };
}

/**
 * Which of these parts OpenCascade reports as invalid, for the editor's broken
 * geometry flag. Only 3D shapes are checked. Stops after budgetMs; `checked`
 * lists the ids it got to.
 */
async function findInvalidParts(
  ids: string[],
  context: RequestContext,
  budgetMs: number,
) {
  await started;
  const start = performance.now();
  const checked: string[] = [];
  const invalid: string[] = [];
  for (const id of ids) {
    if (performance.now() - start > budgetMs) break;
    try {
      const shape = await getShapeCached(id, context);
      if (
        replicad.isShape3D(shape as replicad.AnyShape) &&
        !isValidShape(shape as replicad.Shape3D)
      ) {
        invalid.push(id);
      }
    } catch {
      // A part that won't load isn't this check's to report.
    }
    checked.push(id);
  }
  return { checked, invalid };
}

/**
 * Agent diagnostics: find parts that overlap. With several groups (an
 * Assembly's inputs) only parts from different groups are compared; with one
 * group, every pair of its parts is.
 */
async function checkInterference(
  groups: { label: string; value: AbundanceObject }[],
  context: RequestContext,
  opts: { minVolume: number; budgetMs: number },
) {
  await started;
  type Entry = {
    group: number;
    part: number;
    leaf: AbundanceLeaf;
    shape: replicad.Shape3D;
    bounds: Bounds;
  };
  const entries: Entry[] = [];
  let skippedNonSolid = 0;
  for (const [group, { value }] of groups.entries()) {
    const parts = partsOf(value);
    for (const [part, leaf] of parts.entries()) {
      const shape = await getShapeCached(leaf.geometry, context);
      if (
        !(shape instanceof replicad.Shape) ||
        shape instanceof replicad.Vertex ||
        shape instanceof replicad.Wire
      ) {
        skippedNonSolid++;
        continue;
      }
      const bounds = shapeBounds(shape as replicad.Shape3D);
      if (!bounds) continue;
      entries.push({
        group,
        part,
        leaf,
        shape: shape as replicad.Shape3D,
        bounds,
      });
    }
  }

  const describe = (e: Entry) => ({
    input: groups[e.group].label,
    part: e.part,
    ...(e.leaf.tags?.length ? { tags: e.leaf.tags } : {}),
  });
  const start = performance.now();
  const overlaps = [];
  let compared = 0;
  let incomplete = false;
  outer: for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      const a = entries[i];
      const b = entries[j];
      if (groups.length > 1 && a.group === b.group) continue;
      if (!boundsOverlap(a.bounds, b.bounds)) continue;
      if (performance.now() - start > opts.budgetMs) {
        incomplete = true;
        break outer;
      }
      compared++;
      try {
        const overlap = measureOverlap(a.shape, b.shape, opts.minVolume);
        if (overlap)
          overlaps.push({ a: describe(a), b: describe(b), ...overlap });
      } catch (e) {
        overlaps.push({
          a: describe(a),
          b: describe(b),
          error: `Intersection failed: ${(e as Error).message || e}`,
        });
      }
    }
  }
  return {
    parts: entries.length,
    ...(skippedNonSolid ? { skipped_non_solid: skippedNonSolid } : {}),
    pairs_intersected: compared,
    incomplete,
    overlaps,
  };
}

workerpool.worker({
  generateDisplayMesh: (id: AbundanceObject, context: RequestContext) =>
    withShapeCache(() => generateDisplayMesh(id, context)),
  generatePerFaceMeshes: (id: AbundanceObject, context: RequestContext) =>
    withShapeCache(() => generatePerFaceMeshes(id, context)),
  generatePerEdgeMeshes: (id: AbundanceObject, context: RequestContext) =>
    withShapeCache(() => generatePerEdgeMeshes(id, context)),
  resolveSelectionPoints: (
    value: AbundanceObject,
    refs: SelectionRef[],
    context: RequestContext,
  ) => withShapeCache(() => resolveSelectionPoints(value, refs, context)),
  inspectParts: (
    value: AbundanceObject,
    context: RequestContext,
    opts: { part?: number; minFeature: number; budgetMs: number },
  ) => withShapeCache(() => inspectParts(value, context, opts)),
  findInvalidParts: (
    ids: string[],
    context: RequestContext,
    budgetMs: number,
  ) => withShapeCache(() => findInvalidParts(ids, context, budgetMs)),
  checkInterference: (
    groups: { label: string; value: AbundanceObject }[],
    context: RequestContext,
    opts: { minVolume: number; budgetMs: number },
  ) => withShapeCache(() => checkInterference(groups, context, opts)),
  forgetProject,
});
