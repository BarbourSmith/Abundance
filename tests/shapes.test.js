import {
  rectangle,
  circle,
  regularPolygon,
  text,
} from "../src/worker/shapes.ts";
import { init, is3D, defaultColor } from "../src/worker/util.ts";

function degreesToRadians(degrees) {
  return (degrees * Math.PI) / 180;
}

function vectorEquals(vector, x, y, z) {
  expect(vector.x).toEqual(x);
  expect(vector.y).toEqual(y);
  expect(vector.z).toEqual(z);
}

describe("shapes.js", () => {
  beforeAll(async () => {
    await init();
  });

  describe("circle", () => {
    it("should create a circle with specified diameter", async () => {
      const diameter = 95;

      const result = await circle(diameter);

      expect(result).toBeDefined();
      expect(result.geometry).toHaveLength(1);
      expect(is3D(result)).toBe(false);
      expect(result.tags).toEqual([]);
      expect(result.color).toEqual(defaultColor);
      expect(result.bom).toEqual([]);

      vectorEquals(result.plane.zDir, 0, 0, 1);
      vectorEquals(result.plane.origin, 0, 0, 0);

      // Check bounding box dimensions
      const bounds = result.geometry[0].boundingBox;
      expect(bounds.width).toBeCloseTo(diameter, 4);
      expect(bounds.height).toBeCloseTo(diameter, 4);
    });
  });

  describe("rectangle", () => {
    it("should create a rectangle with specified dimensions", async () => {
      const width = 90;
      const height = 5;

      const result = await rectangle(width, height);

      expect(result).toBeDefined();
      expect(result.geometry).toHaveLength(1);
      expect(is3D(result)).toBe(false);
      expect(result.tags).toEqual([]);
      expect(result.color).toEqual(defaultColor);
      expect(result.bom).toEqual([]);

      // Check plane is the default XY plane
      vectorEquals(result.plane.zDir, 0, 0, 1);
      vectorEquals(result.plane.origin, 0, 0, 0);

      // Check bounding box dimensions
      const bounds = result.geometry[0].boundingBox;
      expect(bounds.width).toBeCloseTo(width, 4);
      expect(bounds.height).toBeCloseTo(height, 4);
    });
  });

  describe("regularPolygon", () => {
    it("should create a triangle (3-sided polygon)", async () => {
      const radius = 9;
      const sides = 3;

      const result = await regularPolygon(radius, sides);

      expect(result).toBeDefined();
      expect(result.geometry).toHaveLength(1);
      expect(is3D(result)).toBe(false);
      expect(result.tags).toEqual([]);
      expect(result.color).toEqual(defaultColor);
      expect(result.bom).toEqual([]);

      // Check plane is the default XY plane
      vectorEquals(result.plane.zDir, 0, 0, 1);
      vectorEquals(result.plane.origin, 0, 0, 0);

      // Check bounding box dimensions. Assumes shape is drawn with one edge parallel to the X-axis
      const bounds = result.geometry[0].boundingBox;
      expect(bounds.width).toBeCloseTo(
        Math.cos(degreesToRadians(30)) * radius * 2,
        4
      );
      expect(bounds.height).toBeCloseTo(
        radius + Math.sin(degreesToRadians(30)) * radius,
        4
      );
    });
  });
});
