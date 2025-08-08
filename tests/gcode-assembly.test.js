import { expect, test, describe } from "vitest";
import { init, isAssembly } from "../src/worker/util.js";
import { circle } from "../src/worker/shapes.js";
import { assembly } from "../src/worker/interaction.js";

describe("G-code assembly processing", () => {
  beforeAll(async () => {
    await init();
  });

  test("should detect assemblies correctly", async () => {
    // Create two simple shapes
    const circle1 = circle(10);
    const circle2 = circle(10);
    
    // Create an assembly from the shapes
    const assemblyResult = await assembly([circle1, circle2]);
    
    // Test that single parts are not detected as assemblies
    const isCircle1Assembly = isAssembly(circle1);
    expect(isCircle1Assembly).toBe(false);
    
    // Test that the assembly is detected correctly
    const isTestAssembly = isAssembly(assemblyResult);
    expect(isTestAssembly).toBe(true);
  });

  test("should handle single parts correctly in isAssembly", () => {
    // Create a single shape
    const singleCircle = circle(10);
    
    // Should not be detected as assembly
    const isSingleAssembly = isAssembly(singleCircle);
    expect(isSingleAssembly).toBe(false);
  });

  test("should handle edge cases in isAssembly", () => {
    // Test undefined input
    expect(isAssembly(undefined)).toBe(false);
    
    // Test null input
    expect(isAssembly(null)).toBe(false);
    
    // Test empty object
    expect(isAssembly({})).toBe(false);
  });
});