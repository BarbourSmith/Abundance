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

    const meshArray: { color: string; geometry: ReplicadObject }[] = [];

    for (let i = 0; i < flattened.length; i++) {
      const displayObject = flattened[i];
      const geom = await util.geometryProvider!.get(
        displayObject.geometry,
        context,
      );
      meshArray.push({
        color: displayObject.color,
        geometry: geom,
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
          const sketchPlane = util.asReplicadPlane(geom.plane);
          const threeDShape = meshObj.geometry
            .sketchOnPlane(sketchPlane)
            .extrude(0.0001);
          finalMeshes.push({
            cameraZoom: cameraZoom,
            faces: threeDShape.mesh({ tolerance: 0.1, angularTolerance: 0.5 }),
            edges: threeDShape.meshEdges({
              tolerance: 0.1,
              angularTolerance: 0.5,
            }),
            color: meshObj.color,
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

workerpool.worker({
  generateDisplayMesh: generateDisplayMesh,
});
