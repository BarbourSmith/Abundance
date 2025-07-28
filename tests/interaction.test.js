// Test file for interaction.js - boolean operations and complex geometry operations
import {
  difference,
  fusion,
  intersect,
  assembly,
  loftShapes,
  shrinkWrapSketches,
  is3D,
} from "../src/worker/interaction.js";
import { circle, rectangle } from "../src/worker/shapes.js";
import { extrude } from "../src/worker/actions.js";
import { init, is3D } from "../src/worker/util.js";

describe("interaction.js", () => {
  beforeEach(async () => {
    await init();
  });

  describe("difference (boolean subtraction)", () => {
    it("should subtract one 3D geometry from another", async () => {
      // Create two overlapping boxes
      const rect1 = rectangle(10, 10);
      const rect2 = rectangle(6, 6);
      const box1 = await extrude(rect1, 5);
      const box2 = await extrude(rect2, 5);

      const result = await difference(box1, box2);

      expect(result).toBeDefined();
      expect(result.geometry).toHaveLength(1);
      expect(is3D(result)).toBe(true);

      // Result should be valid 3D geometry
      const bounds = result.geometry[0].boundingBox;
      expect(bounds).toBeDefined();
    });

    it("should subtract one 2D sketch from another", async () => {
      // Create two overlapping circles
      const c1 = circle(10);
      const c2 = circle(6);

      const result = await difference(c1, c2);

      expect(result).toBeDefined();
      expect(result.geometry).toHaveLength(1);
      expect(is3D(result)).toBe(false);
    });
  });

  describe("fusion (boolean union)", () => {
    it("should fuse multiple 3D geometries together", async () => {
      // Create two boxes
      const rect1 = rectangle(10, 10);
      const rect2 = rectangle(10, 10);
      const box1 = await extrude(rect1, 5);
      const box2 = await extrude(rect2, 5);

      const result = await fusion([box1, box2]);

      expect(result).toBeDefined();
      expect(result.geometry).toHaveLength(1);
      expect(is3D(result)).toBe(true);
    });

    it("should fuse multiple 2D sketches together", async () => {
      const c1 = circle(8);
      const c2 = circle(8);

      const result = await fusion([c1, c2]);

      expect(result).toBeDefined();
      expect(result.geometry).toHaveLength(1);
      expect(is3D(result)).toBe(false);
    });
  });

  describe("intersect (boolean intersection)", () => {
    it("should find intersection of two 3D geometries", async () => {
      // Create two overlapping boxes
      const rect1 = rectangle(10, 10);
      const rect2 = rectangle(10, 10);
      const box1 = await extrude(rect1, 5);
      const box2 = await extrude(rect2, 5);

      const result = await intersect(box1, box2);

      expect(result).toBeDefined();
      expect(result.geometry).toHaveLength(1);
    });

    it("should find intersection of two 2D sketches", async () => {
      const rect1 = rectangle(10, 10);
      const rect2 = rectangle(10, 10);

      const result = await intersect(rect1, rect2);

      expect(result).toBeDefined();
      expect(result.geometry).toHaveLength(1);
      expect(is3D(result)).toBe(false);
    });
  });

  describe("assembly", () => {
    it("should create an assembly from multiple 3D parts", async () => {
      // Create two boxes
      const rect1 = rectangle(5, 5);
      const rect2 = rectangle(5, 5);
      const box1 = await extrude(rect1, 3);
      const box2 = await extrude(rect2, 3);

      const result = await assembly([box1, box2]);

      expect(result).toBeDefined();
      expect(result.geometry).toBeDefined();
      // Assembly should contain multiple parts
      expect(Array.isArray(result.geometry)).toBe(true);
    });

    it("should create an assembly from multiple 2D sketches", async () => {
      const c1 = circle(6);
      const r1 = rectangle(8, 4);

      const result = await assembly([c1, r1]);

      expect(result).toBeDefined();
      expect(result.geometry).toBeDefined();
      expect(Array.isArray(result.geometry)).toBe(true);
    });
  });

  describe("loftShapes", () => {
    it("should create a loft between multiple 2D sketches", async () => {
      // Create two circles of different sizes
      const c1 = circle(10);
      const c2 = circle(6);

      const result = await loftShapes([c1, c2]);

      expect(result).toBeDefined();
      expect(result.geometry).toHaveLength(1);
      expect(is3D(result)).toBe(true); // Loft should create 3D geometry
    });

    it("should handle lofting between different shape types", async () => {
      const c1 = circle(8);
      const r1 = rectangle(10, 6);

      const result = await loftShapes([c1, r1]);

      expect(result).toBeDefined();
      expect(result.geometry).toHaveLength(1);
      expect(is3D(result)).toBe(true);
    });
  });

  describe("shrinkWrapSketches", () => {
    it("should create a boundary around multiple 2D sketches", async () => {
      const c1 = circle(5);
      const r1 = rectangle(8, 6);

      const result = await shrinkWrapSketches([c1, r1]);

      expect(result).toBeDefined();
      expect(result.geometry).toHaveLength(1);
      expect(is3D(result)).toBe(false); // Should remain 2D
    });

    it("should handle single sketch input", async () => {
      const r1 = rectangle(10, 5);

      const result = await shrinkWrapSketches([r1]);

      expect(result).toBeDefined();
      expect(result.geometry).toHaveLength(1);
      expect(is3D(result)).toBe(false);
    });
  });
});
