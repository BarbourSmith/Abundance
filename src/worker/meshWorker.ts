import * as workerpool from "workerpool";
import type { ShapeMesh } from "replicad";
import * as replicad from "replicad";
import { ReplicadObject, RequestContext } from "./geometryProvider";
import { text } from "./shapes";
import type { AbundanceObject } from "./util";
import * as util from "./util";

type DisplayMesh = {
  cameraZoom: number;
  faces?: ShapeMesh;
  edges?: {
    lines: number[];
    edgeGroups: {
      start: number;
      count: number;
      edgeId: number;
    }[];
  };
  color: string;
  point?: [number, number, number];
  // Per-vertex RGB triples in [0,1], aligned with faces.vertices. Present
  // when the source assembly carried a metadata.heatmap payload.
  vertexColors?: Float32Array;
};

let defaultMesh: any = undefined;
const started: Promise<boolean> = util.init(false);
void started.then(() => util.startHeapMonitor("meshWorker"));

function getLargestBoundingBox(meshArray: ReplicadObject[]):
  | {
      width: number;
      height: number;
      depth: number;
    }
  | undefined {
  const overallMin: [number, number, number] = [Infinity, Infinity, Infinity];
  const overallMax: [number, number, number] = [
    -Infinity,
    -Infinity,
    -Infinity,
  ];

  try {
    if (!Array.isArray(meshArray)) {
      throw new Error("meshArray is not defined or not an array");
    }
    meshArray.forEach((mesh, idx) => {
      //console.log(mesh.boundingBox.bounds);
      if (!mesh.boundingBox || !Array.isArray(mesh.boundingBox.bounds)) {
        console.error(
          `mesh[${idx}] missing boundingBox or bounds:`,
          mesh.boundingBox,
        );
        throw new Error("Invalid mesh geometry or boundingBox structure");
      }

      if (mesh.boundingBox.bounds instanceof Error) {
        throw new Error("Bounding box calculation error");
        // handle or skip this mesh
      }
      const boundingBox = mesh.boundingBox.bounds;
      if (
        boundingBox.length < 2 ||
        !Array.isArray(boundingBox[0]) ||
        !Array.isArray(boundingBox[1])
      ) {
        console.error(
          `mesh[${idx}] boundingBox bounds not properly defined:`,
          boundingBox,
        );
        throw new Error("boundingBox bounds are not properly defined");
      }

      const min = boundingBox[0];
      const max = boundingBox[1];

      // Update overall minimum coordinates
      overallMin[0] = Math.min(overallMin[0], min[0]);
      overallMin[1] = Math.min(overallMin[1], min[1]);
      if (min[2] != undefined) {
        overallMin[2] = Math.min(overallMin[2], min[2]);
      }
      // Update overall maximum coordinates
      overallMax[0] = Math.max(overallMax[0], max[0]);
      overallMax[1] = Math.max(overallMax[1], max[1]);
      if (max[2] != undefined) {
        overallMax[2] = Math.max(overallMax[2], max[2]);
      }
    });

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
  } catch (error) {
    console.error("Error in getLargestBoundingBox:", error);
    // Return a default bounding box if error occurs
    //return { width: 0, height: 0, depth: 0 };
  }
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

function generateCameraPosition(meshArray: ReplicadObject[]): number {
  // Get the largest bounding box from the mesh array
  const largestBoundingBox = getLargestBoundingBox(meshArray);
  if (largestBoundingBox == undefined) {
    throw new Error("Could not determine largest bounding box");
  }
  const zoom = calculateZoom(largestBoundingBox);
  if (zoom == 0) {
    throw new Error("Calculated zoom level is zero");
  }
  /*console.log("Generated camera zoom:", zoom);*/
  return zoom;
}
/**
 * Generates and memoizes default mesh for display when no output is available.
 * @param {string} id - The unique identifier to store the default mesh in the library
 * @returns {Promise} A promise that resolves to the default text mesh
 */
async function generateDefaultMesh(
  context: RequestContext,
): Promise<DisplayMesh[]> {
  if (defaultMesh == undefined) {
    const s = performance.now();
    const textAssembly = await text(
      "No output to display",
      28,
      "ROBOTO",
      context,
    );
    const leaves = util.flattenAssembly(textAssembly);
    const meshParts: DisplayMesh[] = [];
    for (const leaf of leaves) {
      const rObj = await util.geometryProvider?.get(leaf.geometry, context);
      const meshShape = (rObj as replicad.Drawing)
        .sketchOnPlane("XY")
        .extrude(0.0001);
      meshParts.push({
        cameraZoom: 10,
        faces: meshShape.mesh({ tolerance: 0.1, angularTolerance: 0.5 }),
        edges: meshShape.meshEdges({
          tolerance: 0.1,
          angularTolerance: 0.5,
        }),
        color: util.defaultColor,
      });
    }
    defaultMesh = meshParts;
    console.debug("generated default mesh. took ", performance.now() - s, "ms");
  } else {
    console.debug("default mesh hit");
  }
  return defaultMesh;
}

async function generateDisplayMesh(
  id: AbundanceObject,
  context: RequestContext,
): Promise<{ id: AbundanceObject; mesh: DisplayMesh[] }> {
  try {
    await started;
    let geom = undefined;
    if (util.isAbundanceObject(id) && id.geometry.length !== 0) {
      geom = id;
    } else {
      return { id: id, mesh: await generateDefaultMesh(context) };
    }

    // Flatten the assembly to remove hierarchy. Skip empty shapes
    const flattened = util.flattenAssembly(geom).filter((part) => {
      return part.geometry !== util.geometryProvider?.EMPTY_SHAPE_SENTINEL;
    });
    if (flattened.length === 0) {
      return { id: id, mesh: await generateDefaultMesh(context) };
    }

    const meshArray: {
      color: string;
      geometry: ReplicadObject;
      metadata?: Record<string, any>;
      plane: typeof geom.plane;
    }[] = [];

    for (let i = 0; i < flattened.length; i++) {
      const displayObject = flattened[i];
      const geom = await util.geometryProvider!.get(
        displayObject.geometry,
        context,
      );
      meshArray.push({
        color: displayObject.color,
        geometry: geom,
        metadata: displayObject.metadata,
        plane: displayObject.plane,
      });
    }

    let cameraZoom;
    try {
      // Exclude Vertex (Point3D) geometries from bounding box — they produce a
      // degenerate single-point box that would skew or zero-out the zoom level.
      const cameraGeoms = meshArray
        .map((m) => m.geometry)
        .filter((g) => !(g instanceof replicad.Vertex));
      cameraZoom =
        cameraGeoms.length > 0 ? generateCameraPosition(cameraGeoms) : 1;
    } catch (e) {
      console.error("Error generating camera position:", e);
      cameraZoom = 1;
    }

    const finalMeshes = [];
    // Iterate through the meshArray and create final meshes with faces, edges and color to pass to display
    for (const [index, meshObj] of meshArray.entries()) {
      try {
        if (meshObj.geometry instanceof replicad.Vertex) {
          // Point3D — emit a point coordinate, no mesh geometry
          finalMeshes.push({
            cameraZoom: cameraZoom,
            point: (meshObj.geometry as replicad.Vertex).asTuple(),
            color: meshObj.color,
          });
        } else if (meshObj.geometry instanceof replicad.Wire) {
          // Wire — edges only, no faces
          finalMeshes.push({
            cameraZoom: cameraZoom,
            edges: meshObj.geometry.meshEdges({
              tolerance: 0.03,
              angularTolerance: 0.1,
            }),
            color: meshObj.color,
          });
        } else if (meshObj.geometry instanceof replicad.Drawing) {
          const sketchPlane = util.asReplicadPlane(meshObj.plane);
          const threeDShape = meshObj.geometry
            .sketchOnPlane(sketchPlane)
            .extrude(0.0001);
          let faces = threeDShape.mesh({
            tolerance: 0.1,
            angularTolerance: 0.5,
          });
          const edges = threeDShape.meshEdges({
            tolerance: 0.1,
            angularTolerance: 0.5,
          });
          let vertexColors: Float32Array | undefined;
          const heatmap = meshObj.metadata?.heatmap;
          if (heatmap && heatmap.kind === "perQuadField") {
            try {
              const r = applyPerQuadHeatmap(faces, heatmap, meshObj.plane);
              faces = r.mesh;
              vertexColors = r.vertexColors;
            } catch (e) {
              console.error("Heatmap colourise failed:", e);
            }
          }
          finalMeshes.push({
            cameraZoom: cameraZoom,
            faces,
            edges,
            color: meshObj.color,
            ...(vertexColors ? { vertexColors } : {}),
          });
        } else {
          // Shape3D — mesh normally
          finalMeshes.push({
            cameraZoom: cameraZoom,
            faces: meshObj.geometry.mesh({
              tolerance: 0.1,
              angularTolerance: 0.5,
            }),
            edges: meshObj.geometry.meshEdges({
              tolerance: 0.1,
              angularTolerance: 0.5,
            }),
            color: meshObj.color,
          });
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error(
          `Error meshing geometry part ${index} (color: ${meshObj.color}): ${msg}`,
          e,
        );
        // Skip this part and continue so other parts still display
      }
    }
    if (finalMeshes.length === 0 && meshArray.length > 0) {
      console.error(
        "All geometry parts failed to mesh — falling back to default mesh",
      );
      return { id: id, mesh: await generateDefaultMesh(context) };
    }
    return { id: geom, mesh: finalMeshes };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("Error in generateDisplayMesh:", msg, e);
    // Fall back to default mesh while preserving the original id so callers can update UI state
    return { id, mesh: await generateDefaultMesh(context) };
  }
}

// ─── Heatmap helpers ──────────────────────────────────────────────────────
//
// Given a `metadata.heatmap` payload of shape:
//   { kind: "perQuadField", quads: [[T2,T2,T2,T2], ...],
//     values: number[], range: [min,max], gradient: [hex,hex],
//     targetEdge?: number }
// subdivide the planar (top/bottom) triangles of the supplied ShapeMesh on
// the plane until each triangle's projected edge is below `targetEdge`, then
// emit per-vertex RGB colours by point-in-quad lookup against the quad
// field. Side triangles of the thin extrude are skipped (subdividing them
// produces slivers without visual benefit). Hard-capped to avoid runaway
// triangle counts on misconfigured atoms.

const MAX_HEATMAP_TRIS = 50000;

function applyPerQuadHeatmap(
  mesh: ShapeMesh,
  heatmap: any,
  plane: { origin: number[]; xDir: number[]; normal: number[] },
): { mesh: ShapeMesh; vertexColors: Float32Array } {
  const targetEdge: number =
    typeof heatmap.targetEdge === "number" && heatmap.targetEdge > 0
      ? heatmap.targetEdge
      : 1;
  const quads = heatmap.quads as Array<
    [
      [number, number],
      [number, number],
      [number, number],
      [number, number],
    ]
  >;
  const values = heatmap.values as number[];
  const range = heatmap.range as [number, number];
  const gradient = heatmap.gradient as [string, string];

  // Plane basis. yDir = normal × xDir.
  const nx = plane.normal[0],
    ny = plane.normal[1],
    nz = plane.normal[2];
  const xx = plane.xDir[0],
    xy = plane.xDir[1],
    xz = plane.xDir[2];
  const yx = ny * xz - nz * xy;
  const yy = nz * xx - nx * xz;
  const yz = nx * xy - ny * xx;
  const ox = plane.origin[0],
    oy = plane.origin[1],
    oz = plane.origin[2];
  const project = (
    x: number,
    y: number,
    z: number,
  ): [number, number] => {
    const dx = x - ox,
      dy = y - oy,
      dz = z - oz;
    return [dx * xx + dy * xy + dz * xz, dx * yx + dy * yy + dz * yz];
  };

  // Subdivide top/bottom face triangles in place; copy side triangles
  // through unchanged.
  const vertices = mesh.vertices.slice();
  const normals = mesh.normals.slice();
  const newTriangles: number[] = [];
  const newFaceGroups: ShapeMesh["faceGroups"] = [];
  let capped = false;

  for (const fg of mesh.faceGroups) {
    const startIdx = newTriangles.length;
    const triEnd = fg.start + fg.count;
    for (let t = fg.start; t < triEnd; t += 3) {
      const i0 = mesh.triangles[t];
      const i1 = mesh.triangles[t + 1];
      const i2 = mesh.triangles[t + 2];
      if (newTriangles.length / 3 >= MAX_HEATMAP_TRIS) {
        capped = true;
        newTriangles.push(i0, i1, i2);
        continue;
      }
      if (
        triangleAlignedWithPlane(
          i0,
          i1,
          i2,
          vertices,
          plane.normal as [number, number, number],
        )
      ) {
        subdivideTri(
          i0,
          i1,
          i2,
          vertices,
          normals,
          newTriangles,
          targetEdge,
          project,
        );
      } else {
        newTriangles.push(i0, i1, i2);
      }
    }
    newFaceGroups.push({
      start: startIdx,
      count: newTriangles.length - startIdx,
      faceId: fg.faceId,
    });
  }
  if (capped) {
    console.warn(
      `Heatmap subdivision hit ${MAX_HEATMAP_TRIS} triangle cap; consider raising targetEdge`,
    );
  }

  // Colourise: for each vertex, point-in-quad lookup, then gradient lerp.
  const numVerts = vertices.length / 3;
  const vertexColors = new Float32Array(numVerts * 3);
  const [r0, g0, b0] = hexToRgb(gradient[0]);
  const [r1, g1, b1] = hexToRgb(gradient[1]);
  const rmin = range[0];
  const rspan = range[1] - range[0] || 1;
  for (let v = 0; v < numVerts; v++) {
    const [px, py] = project(
      vertices[v * 3],
      vertices[v * 3 + 1],
      vertices[v * 3 + 2],
    );
    let value = rmin;
    for (let q = 0; q < quads.length; q++) {
      if (pointInQuad(px, py, quads[q])) {
        value = values[q];
        break;
      }
    }
    let s = (value - rmin) / rspan;
    if (s < 0) s = 0;
    else if (s > 1) s = 1;
    vertexColors[v * 3] = r0 + (r1 - r0) * s;
    vertexColors[v * 3 + 1] = g0 + (g1 - g0) * s;
    vertexColors[v * 3 + 2] = b0 + (b1 - b0) * s;
  }

  return {
    mesh: { vertices, normals, triangles: newTriangles, faceGroups: newFaceGroups },
    vertexColors,
  };
}

function triangleAlignedWithPlane(
  i0: number,
  i1: number,
  i2: number,
  vertices: number[],
  planeNormal: [number, number, number],
): boolean {
  const ax = vertices[i1 * 3] - vertices[i0 * 3];
  const ay = vertices[i1 * 3 + 1] - vertices[i0 * 3 + 1];
  const az = vertices[i1 * 3 + 2] - vertices[i0 * 3 + 2];
  const bx = vertices[i2 * 3] - vertices[i0 * 3];
  const by = vertices[i2 * 3 + 1] - vertices[i0 * 3 + 1];
  const bz = vertices[i2 * 3 + 2] - vertices[i0 * 3 + 2];
  const cx = ay * bz - az * by;
  const cy = az * bx - ax * bz;
  const cz = ax * by - ay * bx;
  const len = Math.hypot(cx, cy, cz);
  if (len < 1e-12) return false;
  const dot =
    (cx * planeNormal[0] + cy * planeNormal[1] + cz * planeNormal[2]) / len;
  return Math.abs(dot) > 0.9;
}

function subdivideTri(
  i0: number,
  i1: number,
  i2: number,
  vertices: number[],
  normals: number[],
  outTris: number[],
  targetEdge: number,
  project: (x: number, y: number, z: number) => [number, number],
): void {
  if (outTris.length / 3 >= MAX_HEATMAP_TRIS) {
    outTris.push(i0, i1, i2);
    return;
  }
  const p0 = project(
    vertices[i0 * 3],
    vertices[i0 * 3 + 1],
    vertices[i0 * 3 + 2],
  );
  const p1 = project(
    vertices[i1 * 3],
    vertices[i1 * 3 + 1],
    vertices[i1 * 3 + 2],
  );
  const p2 = project(
    vertices[i2 * 3],
    vertices[i2 * 3 + 1],
    vertices[i2 * 3 + 2],
  );
  const e01 = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
  const e12 = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
  const e20 = Math.hypot(p0[0] - p2[0], p0[1] - p2[1]);
  if (Math.max(e01, e12, e20) <= targetEdge) {
    outTris.push(i0, i1, i2);
    return;
  }
  const m01 = addMidpoint(i0, i1, vertices, normals);
  const m12 = addMidpoint(i1, i2, vertices, normals);
  const m20 = addMidpoint(i2, i0, vertices, normals);
  subdivideTri(i0, m01, m20, vertices, normals, outTris, targetEdge, project);
  subdivideTri(m01, i1, m12, vertices, normals, outTris, targetEdge, project);
  subdivideTri(m20, m12, i2, vertices, normals, outTris, targetEdge, project);
  subdivideTri(m01, m12, m20, vertices, normals, outTris, targetEdge, project);
}

function addMidpoint(
  i: number,
  j: number,
  vertices: number[],
  normals: number[],
): number {
  const idx = vertices.length / 3;
  vertices.push(
    (vertices[i * 3] + vertices[j * 3]) * 0.5,
    (vertices[i * 3 + 1] + vertices[j * 3 + 1]) * 0.5,
    (vertices[i * 3 + 2] + vertices[j * 3 + 2]) * 0.5,
  );
  const nx = (normals[i * 3] + normals[j * 3]) * 0.5;
  const ny = (normals[i * 3 + 1] + normals[j * 3 + 1]) * 0.5;
  const nz = (normals[i * 3 + 2] + normals[j * 3 + 2]) * 0.5;
  const nl = Math.hypot(nx, ny, nz) || 1;
  normals.push(nx / nl, ny / nl, nz / nl);
  return idx;
}

function pointInQuad(
  x: number,
  y: number,
  q: [
    [number, number],
    [number, number],
    [number, number],
    [number, number],
  ],
): boolean {
  let inside = false;
  for (let i = 0, j = 3; i < 4; j = i++) {
    const xi = q[i][0],
      yi = q[i][1];
    const xj = q[j][0],
      yj = q[j][1];
    if (
      yi > y !== yj > y &&
      x < ((xj - xi) * (y - yi)) / (yj - yi) + xi
    ) {
      inside = !inside;
    }
  }
  return inside;
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [
    parseInt(h.slice(0, 2), 16) / 255,
    parseInt(h.slice(2, 4), 16) / 255,
    parseInt(h.slice(4, 6), 16) / 255,
  ];
}

workerpool.worker({
  generateDisplayMesh: generateDisplayMesh,
});
