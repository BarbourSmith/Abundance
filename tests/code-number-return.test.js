import { describe, it, expect } from "vitest";

/**
 * Test for the isPrimitive function logic used in code atoms
 * This validates that the code atom can properly detect and handle
 * primitive return values (numbers, strings, booleans) vs geometry.
 * 
 * Note: We duplicate the isPrimitive function here instead of importing it
 * from src/worker/code.ts because the worker modules use WebAssembly and
 * have complex dependencies that don't work with the browser test runner.
 * This pattern is consistent with other tests in the repository that test
 * isolated logic (e.g., code-input-parsing.test.js).
 */

// This mirrors the isPrimitive function from src/worker/code.ts
function isPrimitive(value) {
  return (
    value === null ||
    value === undefined ||
    typeof value === "number" ||
    typeof value === "string" ||
    typeof value === "boolean"
  );
}

describe("Code atom primitive return value handling", () => {
  describe("isPrimitive function", () => {
    it("should return true for numbers", () => {
      expect(isPrimitive(10)).toBe(true);
      expect(isPrimitive(0)).toBe(true);
      expect(isPrimitive(-5)).toBe(true);
      expect(isPrimitive(3.14159)).toBe(true);
      expect(isPrimitive(Infinity)).toBe(true);
      expect(isPrimitive(NaN)).toBe(true);
    });

    it("should return true for strings", () => {
      expect(isPrimitive("hello")).toBe(true);
      expect(isPrimitive("")).toBe(true);
      expect(isPrimitive("10")).toBe(true);
    });

    it("should return true for booleans", () => {
      expect(isPrimitive(true)).toBe(true);
      expect(isPrimitive(false)).toBe(true);
    });

    it("should return true for null and undefined", () => {
      expect(isPrimitive(null)).toBe(true);
      expect(isPrimitive(undefined)).toBe(true);
    });

    it("should return false for objects", () => {
      expect(isPrimitive({})).toBe(false);
      expect(isPrimitive({ geometry: [] })).toBe(false);
      expect(isPrimitive([])).toBe(false);
    });

    it("should return false for geometry-like objects", () => {
      const mockGeometry = {
        geometry: "some-id",
        plane: { origin: [0, 0, 0] },
        color: "#FFFFFF",
        tags: [],
        bom: [],
      };
      expect(isPrimitive(mockGeometry)).toBe(false);
    });

    it("should return false for functions", () => {
      expect(isPrimitive(() => {})).toBe(false);
      expect(isPrimitive(function() {})).toBe(false);
    });
  });

  describe("code execution result handling", () => {
    it("should correctly identify when code returns a number", () => {
      // Simulates the result of user code that returns a number
      const codeResult = 42;
      expect(isPrimitive(codeResult)).toBe(true);
    });

    it("should correctly identify when code returns geometry", () => {
      // Simulates the result of user code that returns geometry
      const geometryResult = {
        geometry: [{}],
        plane: { origin: [0, 0, 0], xDir: [1, 0, 0], normal: [0, 0, 1] },
        color: "#A3CE5B",
        tags: [],
        bom: [],
        dimension: "3D"
      };
      expect(isPrimitive(geometryResult)).toBe(false);
    });

    it("should handle arithmetic operation results", () => {
      // Simulating user code: return 5 + 10
      const result = 5 + 10;
      expect(isPrimitive(result)).toBe(true);
      expect(result).toBe(15);
    });

    it("should handle string concatenation results", () => {
      // Simulating user code: return "Hello" + " World"
      const result = "Hello" + " World";
      expect(isPrimitive(result)).toBe(true);
      expect(result).toBe("Hello World");
    });

  });
});
