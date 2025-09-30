import * as replicad from "replicad";
import type { ShapeMesh } from "replicad";
import { GeometryProvider, ReplicadObject } from "./geometryProvider";
import { text } from "./shapes";
import type { AbundanceObject } from "./util";
import * as util from "./util";

type PartialMesh = {
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

type DisplayMesh = PartialMesh & { cameraZoom: number };

type MeshCacheEntry = {
  mesh: PartialMesh;
  bounds:
    | [replicad.SimplePoint, replicad.SimplePoint]
    | [replicad.Point2D, replicad.Point2D];
};

/**
 * A simple LRU (Least Recently Used) cache implementation.
 * Keys are moved to the "back" of the cache when added *OR* accessed.
 *
 * If an add operation would exceed the capacity, the "front" (least
 * recently used) item is removed.
 */
export class LRUCache<K, V> {
  private cache: Map<K, V>;
  private capacity: number;

  constructor(capacity: number) {
    this.cache = new Map();
    this.capacity = capacity;
  }

  get(key: K): V | undefined {
    if (!this.cache.has(key)) return undefined;
    const value = this.cache.get(key)!;
    // Move to end (most recently used)
    this.cache.delete(key);
    this.cache.set(key, value);
    return value;
  }

  set(key: K, value: V): void {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    }
    this.cache.set(key, value);
    if (this.cache.size > this.capacity) {
      // Remove least recently used (first key)
      const lruKey = this.cache.keys().next().value;
      if (lruKey) {
        this.cache.delete(lruKey);
      }
    }
  }

  has(key: K): boolean {
    return this.cache.has(key);
  }

  clear(): void {
    this.cache.clear();
  }
}

class MeshProvider {
  private CACHE_SIZE = 50;
  private geometryProvider: GeometryProvider;
  private defaultMesh: DisplayMesh[] | undefined;
  private meshCache: LRUCache<string, MeshCacheEntry> = new LRUCache(
    this.CACHE_SIZE
  );
  private metrics: [number, number] = [0, 0];

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

  private getLargestBoundingBox(meshArray: MeshCacheEntry[]): {
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
      if (!mesh.bounds || !Array.isArray(mesh.bounds)) {
        throw new Error("Invalid mesh geometry or boundingBox structure");
      }

      let boundingBox = mesh.bounds;
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

  private generateCameraPosition(meshArray: MeshCacheEntry[]): number {
    // Get the largest bounding box from the mesh array
    let largestBoundingBox = this.getLargestBoundingBox(meshArray);
    let zoom = this.calculateZoom(largestBoundingBox);

    return zoom;
  }

  private async getOrCreateMesh(
    shape: util.AbundanceLeaf
  ): Promise<MeshCacheEntry> {
    let cached = this.meshCache.get(shape.geometry);
    if (cached) {
      this.metrics[0] += 1;
      // overwrite color in case it's different from the cached version.
      return {
        ...cached,
        mesh: {
          ...cached.mesh,
          color: shape.color,
        },
      };
    }
    this.metrics[1] += 1;

    // Else build the mesh and bounding box.
    let cleanedGeom;
    // TODO: would love a better way to check if geometry is 2D or 3D.
    const geom = await this.geometryProvider.get(shape.geometry);
    if (!("mesh" in geom) || geom.mesh == undefined) {
      cleanedGeom = await this.geometryProvider.get(
        await this.geometryProvider.extrude(shape.geometry, shape.plane, 0.0001)
      );
    } else {
      cleanedGeom = geom;
    }
    let resultMesh = undefined;
    try {
      let sketchPlane = util.asReplicadPlane(shape.plane);
      if (cleanedGeom instanceof replicad.Drawing) {
        const threeDShape = cleanedGeom
          .sketchOnPlane(sketchPlane)
          .extrude(0.0001);
        resultMesh = {
          faces: threeDShape.mesh({ tolerance: 0.1, angularTolerance: 0.5 }),
          edges: threeDShape.meshEdges({
            tolerance: 0.1,
            angularTolerance: 0.5,
          }),
          color: shape.color,
        };
      } else {
        resultMesh = {
          faces: cleanedGeom.mesh({
            tolerance: 0.1,
            angularTolerance: 0.5,
          }),
          edges: cleanedGeom.meshEdges({
            tolerance: 0.1,
            angularTolerance: 0.5,
          }),
          color: shape.color,
        };
      }
    } catch (e) {
      throw new Error("Error generating display mesh" + e);
    }

    if (!resultMesh) {
      throw new Error("Failed to generate mesh for geometry");
    }
    const result = {
      mesh: resultMesh,
      bounds: cleanedGeom.boundingBox.bounds as
        | [replicad.SimplePoint, replicad.SimplePoint]
        | [replicad.Point2D, replicad.Point2D],
    };
    this.meshCache.set(shape.geometry, result);
    return result;
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
    if (flattened.length > this.CACHE_SIZE) {
      console.warn(
        `Warning: Assembly larger than cache (${this.CACHE_SIZE}). Increasing cache capacity to: ${flattened.length} x 1.5.`
      );
      this.CACHE_SIZE = Math.ceil(flattened.length * 1.5);
    }

    const partialMeshes = await Promise.all(
      flattened.map((leaf) => this.getOrCreateMesh(leaf))
    );

    const cameraZoom = this.generateCameraPosition(partialMeshes);

    const resultMeshes: DisplayMesh[] = partialMeshes.map((entry) => ({
      ...entry.mesh,
      cameraZoom: cameraZoom,
    }));

    console.log(
      `MeshProvider Cache Metrics: Hits = ${this.metrics[0]}, Misses = ${this.metrics[1]}`
    );
    return resultMeshes;
  }
}

export { MeshProvider };
