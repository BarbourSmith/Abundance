import * as replicad from "replicad";
import type { ShapeMesh } from "replicad";
import { GeometryProvider, ReplicadObject } from "./geometryProvider";
import { text } from "./shapes";
import type { AbundanceObject } from "./util";
import * as util from "./util";

type DisplayMesh = {
  cameraZoom: number;
  faces: ShapeMesh;
  edges: {
    lines: number[];
    edgeGroups: {
      start: number;
      count: number;
      edgeId: number;
    }[];
  };
  color: string;
};

class MeshProvider {
  private geometryProvider: GeometryProvider;
  private defaultMesh: DisplayMesh[] | undefined;

  constructor(geometryProvider: GeometryProvider) {
    this.geometryProvider = geometryProvider;
    this.defaultMesh = undefined;
  }

  /**
   * Generates and memoizes default mesh for display when no output is available.
   * @param {string} id - The unique identifier to store the default mesh in the library
   * @returns {Promise} A promise that resolves to the default text mesh
   */
  async generateDefaultMesh(): Promise<DisplayMesh[]> {
    if (!this.defaultMesh) {
      const defaultText = await text("No output to display", 28, "ROBOTO");
      this.defaultMesh = await this.generateDisplayMesh(defaultText);
    }
    return this.defaultMesh;
  }

  private getLargestBoundingBox(meshArray: ReplicadObject[]): {
    width: number;
    height: number;
    depth: number;
  } {
    let overallMin: [number, number, number] = [Infinity, Infinity, Infinity];
    let overallMax: [number, number, number] = [
      -Infinity,
      -Infinity,
      -Infinity,
    ];

    if (!Array.isArray(meshArray)) {
      throw new Error("meshArray is not defined or not an array");
    }

    meshArray.forEach((mesh) => {
      if (!mesh.boundingBox || !Array.isArray(mesh.boundingBox.bounds)) {
        throw new Error("Invalid mesh geometry or boundingBox structure");
      }

      let boundingBox = mesh.boundingBox.bounds;
      if (
        boundingBox.length < 2 ||
        !Array.isArray(boundingBox[0]) ||
        !Array.isArray(boundingBox[1])
      ) {
        throw new Error("boundingBox bounds are not properly defined");
      }

      let min = boundingBox[0];
      let max = boundingBox[1];

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

    // Calculate the width, height, and depth
    let width = overallMax[0] - overallMin[0];
    let height = overallMax[1] - overallMin[1];
    let depth = overallMax[2] - overallMin[2];

    return { width, height, depth };
  }

  private calculateZoom(boundingBox: {
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
          Math.pow(exampleBoundingBox.depth, 2)
      );

      // Calculate the diagonal length of the input bounding box
      const diagonal = Math.sqrt(
        Math.pow(boundingBox.width, 2) +
          Math.pow(boundingBox.height, 2) +
          Math.pow(boundingBox.depth, 2)
      );

      // Calculate the zoom level based on the proportional relationship
      const zoom = (exampleZoom * exampleDiagonal) / diagonal;
      return zoom;
    } catch (e) {
      throw new Error("Error calculating zoom level");
    }
  }

  private generateCameraPosition(meshArray: ReplicadObject[]): number {
    // Get the largest bounding box from the mesh array
    let largestBoundingBox = this.getLargestBoundingBox(meshArray);
    let zoom = this.calculateZoom(largestBoundingBox);

    return zoom;
  }

  async generateDisplayMesh(id: AbundanceObject): Promise<DisplayMesh[]> {
    console.log("Generating display mesh for ID:", JSON.stringify(id));
    let geom = undefined;
    if (util.isAbundanceObject(id)) {
      geom = id;
    } else {
      return this.generateDefaultMesh();
    }

    // Flatten the assembly to remove hierarchy
    const flattened = util.flattenAssembly(geom);

    let meshArray: { color: string; geometry: ReplicadObject }[] = [];

    for (let i = 0; i < flattened.length; i++) {
      const displayObject = flattened[i];
      let cleanedGeometry;
      // TODO: would love a better way to check if geometry is 2D or 3D.
      const geom = await util.geometryProvider!.get(displayObject.geometry);
      if (!("mesh" in geom) || geom.mesh == undefined) {
        cleanedGeometry = await util.geometryProvider!.get(
          await util.geometryProvider!.extrude(
            displayObject.geometry,
            displayObject.plane,
            0.0001
          )
        );
      } else {
        cleanedGeometry = geom;
      }
      meshArray.push({
        color: displayObject.color,
        geometry: cleanedGeometry,
      });
    }

    let cameraZoom;
    try {
      cameraZoom = this.generateCameraPosition(
        meshArray.map((m) => m.geometry)
      );
    } catch (e) {
      cameraZoom = 1;
    }

    let finalMeshes = [];
    // Iterate through the meshArray and create final meshes with faces, edges and color to pass to display
    for (const meshObj of meshArray) {
      try {
        let sketchPlane = util.asReplicadPlane(geom.plane);
        if (meshObj.geometry instanceof replicad.Drawing) {
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
        throw new Error("Error generating display mesh" + e);
      }
    }
    return finalMeshes;
  }
}

export { MeshProvider };
