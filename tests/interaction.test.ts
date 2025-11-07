// Test file for interaction.ts - boolean operations and complex geometry operations
import {
  difference,
  fusion,
  intersect,
  assembly,
  loftShapes,
  shrinkWrapSketches,
} from "../src/worker/interaction";
import { circle, rectangle } from "../src/worker/shapes";
import { extrude, move } from "../src/worker/actions";
import { init, is3D } from "../src/worker/util";
import { describe, it, expect, beforeEach } from "vitest";
import { RequestContext } from "../src/worker/geometryProvider";

describe("interaction.ts", () => {
  const context: RequestContext = { project: "test" };
  beforeEach(async () => {
    await init();
  });

  describe("difference (boolean subtraction)", () => {
    it("should subtract one 3D geometry from another", async () => {
      const rect1 = await rectangle(10, 10, context);
      const rect2 = await rectangle(6, 6, context);
      const box1 = await extrude(rect1, 5, context);
      const box2 = await extrude(rect2, 5, context);

      const result = await difference(box1, box2, context);

      expect(result).toBeDefined();
      expect(result.geometry).toHaveLength(1);

      const bounds = result.geometry[0].boundingBox;
      expect(bounds).toBeDefined();
    });

    it("should subtract one 2D sketch from another", async () => {
      const c1 = await circle(10, context);
      const c2 = await circle(6, context);

      const result = await difference(c1, c2, context);

      expect(result).toBeDefined();
      expect(result.geometry).toHaveLength(1);
    });
  });
  /*
  describe("fusion (boolean union)", () => {
    it("should fuse multiple 3D geometries together", async () => {
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
      const rect1 = rectangle(5, 5);
      const rect2 = rectangle(5, 5);
      const box1 = await extrude(rect1, 3);
      const box2 = await extrude(rect2, 3);

      const result = await assembly([box1, box2]);

      expect(result).toBeDefined();
      expect(result.geometry).toBeDefined();
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
  */

  describe("loftShapes", () => {
    it("should create a loft between multiple 2D sketches", async () => {
      const c1 = await circle(10, context);
      const c2 = await circle(6, context);

      const result = await loftShapes([c1, c2], context);

      expect(result).toBeDefined();
      expect(result.geometry).toHaveLength(1);
      expect(is3D(result)).toBe(true);
    });

    it("should handle lofting between different shape types", async () => {
      const c1 = await circle(8, context);
      const r1 = await rectangle(10, 6, context);

      const result = await loftShapes([c1, r1], context);

      expect(result).toBeDefined();
      expect(result.geometry).toHaveLength(1);
      expect(is3D(result)).toBe(true);
    });

    it("should create different lofts when sketches are at different heights", async () => {
      // Create first loft with sketches at default (z=0) and z=10
      const c1 = await circle(10, context);
      const c2a = await circle(6, context);
      const c2aMoved = await move(c2a, 0, 0, 10, context);
      const loft1 = await loftShapes([c1, c2aMoved], context);

      // Create second loft with same sketches but at z=0 and z=20
      const c3 = await circle(10, context);
      const c4 = await circle(6, context);
      const c4Moved = await move(c4, 0, 0, 20, context);
      const loft2 = await loftShapes([c3, c4Moved], context);

      // Both lofts should be defined and 3D
      expect(loft1).toBeDefined();
      expect(loft2).toBeDefined();
      expect(is3D(loft1)).toBe(true);
      expect(is3D(loft2)).toBe(true);

      // The lofts should be different (different geometry IDs means different cached geometries)
      expect(loft1.geometry).not.toEqual(loft2.geometry);
    });
  });

  /*
  describe("shrinkWrapSketches", () => {
    it("should create a boundary around multiple 2D sketches", async () => {
      const c1 = circle(5);
      const r1 = rectangle(8, 6);

      const result = await shrinkWrapSketches([c1, r1]);

      expect(result).toBeDefined();
      expect(result.geometry).toHaveLength(1);
      expect(is3D(result)).toBe(false);
    });

    it("should handle single sketch input", async () => {
      const r1 = rectangle(10, 5);

      const result = await shrinkWrapSketches([r1]);

      expect(result).toBeDefined();
      expect(result.geometry).toHaveLength(1);
      expect(is3D(result)).toBe(false);
    });
  });
  */
});
