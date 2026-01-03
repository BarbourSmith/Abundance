import {
  rectangle,
  circle,
  regularPolygon,
  text,
} from "../src/worker/shapes.ts";
import { init, is3D, defaultColor } from "../src/worker/util.ts";
import { describe, it, expect, beforeAll } from "vitest";

function degreesToRadians(degrees) {
  return (degrees * Math.PI) / 180;
}

function vectorEquals(vector, x, y, z) {
  expect(vector.x).toEqual(x);
  expect(vector.y).toEqual(y);
  expect(vector.z).toEqual(z);
}

describe("shapes.js", () => {
  const context = { project: "test" };
  
  beforeAll(async () => {
    await init();
  });

  describe("circle", () => {
    it("should create a circle with specified diameter", async () => {
      const diameter = 95;

      const result = await circle(diameter, context);

      expect(result).toBeDefined();
      expect(typeof result.geometry).toBe("string"); // geometry is a string ID, not an array
      expect(is3D(result)).toBe(false);
      expect(result.tags).toEqual([]);
      expect(result.color).toEqual(defaultColor);
      expect(result.bom).toEqual([]);
    });
  });

  describe("rectangle", () => {
    it("should create a rectangle with specified dimensions", async () => {
      const width = 90;
      const height = 5;

      const result = await rectangle(width, height, context);

      expect(result).toBeDefined();
      expect(typeof result.geometry).toBe("string"); // geometry is a string ID, not an array
      expect(is3D(result)).toBe(false);
      expect(result.tags).toEqual([]);
      expect(result.color).toEqual(defaultColor);
      expect(result.bom).toEqual([]);
    });
  });

  describe("regularPolygon", () => {
    it("should create a triangle (3-sided polygon)", async () => {
      const radius = 9;
      const sides = 3;

      const result = await regularPolygon(radius, sides, context);

      expect(result).toBeDefined();
      expect(typeof result.geometry).toBe("string"); // geometry is a string ID, not an array
      expect(is3D(result)).toBe(false);
      expect(result.tags).toEqual([]);
      expect(result.color).toEqual(defaultColor);
      expect(result.bom).toEqual([]);
    });
  });

  describe("text", () => {
    it("should create text as an assembly of individual letters", async () => {
      const testText = "ABC";
      const fontSize = 10;
      const fontFamily = "ROBOTO";
      
      const result = await text(testText, fontSize, fontFamily, context);
      
      expect(result).toBeDefined();
      expect(result.dimension).toBe("2D");
      
      // Text should be returned as an assembly (array of geometries)
      expect(Array.isArray(result.geometry)).toBe(true);
      
      // Should have one geometry per character
      expect(result.geometry).toHaveLength(testText.length);
      
      // Each letter should be a valid 2D geometry
      result.geometry.forEach((letter) => {
        expect(letter).toBeDefined();
        expect(letter.dimension).toBe("2D");
        expect(letter.geometry).toBeDefined();
        expect(typeof letter.geometry).toBe("string"); // geometry ID
      });
    });

    it("should handle single character text", async () => {
      const testText = "A";
      const fontSize = 10;
      const fontFamily = "ROBOTO";
      
      const result = await text(testText, fontSize, fontFamily, context);
      
      expect(result).toBeDefined();
      expect(Array.isArray(result.geometry)).toBe(true);
      expect(result.geometry).toHaveLength(1);
      expect(result.geometry[0].dimension).toBe("2D");
    });

    it("should handle empty string gracefully", async () => {
      const testText = "";
      const fontSize = 10;
      const fontFamily = "ROBOTO";
      
      const result = await text(testText, fontSize, fontFamily, context);
      
      expect(result).toBeDefined();
      expect(Array.isArray(result.geometry)).toBe(true);
      expect(result.geometry).toHaveLength(0);
    });
  });
});
