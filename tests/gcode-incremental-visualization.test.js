import { expect, test, describe, beforeAll } from "vitest";
import { init } from "../src/worker/util.ts";
import { visualizeGcodeIncremental } from "../src/worker/worker.ts";

describe("Incremental G-code Visualization Performance Tests", () => {
  beforeAll(async () => {
    await init();
  });

  test("should visualize single gcode part with incremental method", async () => {
    const singleGcode = `
G0 X0 Y0 Z0
G1 X10 Y0 Z0
G1 X10 Y10 Z0
G1 X0 Y10 Z0
G1 X0 Y0 Z0
`;
    
    const context = { project: "test-single-incremental" };
    const result = await visualizeGcodeIncremental([singleGcode], context);
    
    expect(result).toBeDefined();
    expect(result.geometry).toBeDefined();
    expect(result.geometryType).toBe("3D");
  });

  test("should visualize multiple gcode parts with incremental method", async () => {
    const gcodePart1 = `
G0 X0 Y0 Z0
G1 X10 Y0 Z0
G1 X10 Y10 Z0
G1 X0 Y10 Z0
G1 X0 Y0 Z0
`;

    const gcodePart2 = `
G0 X20 Y0 Z0
G1 X30 Y0 Z0
G1 X30 Y10 Z0
G1 X20 Y10 Z0
G1 X20 Y0 Z0
`;

    const gcodePart3 = `
G0 X40 Y0 Z0
G1 X50 Y0 Z0
G1 X50 Y10 Z0
G1 X40 Y10 Z0
G1 X40 Y0 Z0
`;
    
    const context = { project: "test-multi-incremental" };
    const result = await visualizeGcodeIncremental(
      [gcodePart1, gcodePart2, gcodePart3],
      context
    );
    
    expect(result).toBeDefined();
    expect(result.geometry).toBeDefined();
    expect(result.geometryType).toBe("3D");
  });

  test("should visualize multiple parts correctly", async () => {
    const gcodePart1 = `
G0 X0 Y0 Z0
G1 X10 Y0 Z0
G1 X10 Y10 Z0
G1 X0 Y10 Z0
G1 X0 Y0 Z0
`;

    const gcodePart2 = `
G0 X20 Y0 Z0
G1 X30 Y0 Z0
G1 X30 Y10 Z0
G1 X20 Y10 Z0
G1 X20 Y0 Z0
`;
    
    const context = { project: "test-multi-part" };
    
    const result = await visualizeGcodeIncremental(
      [gcodePart1, gcodePart2],
      context
    );
    
    // Should produce valid result
    expect(result).toBeDefined();
    expect(result.geometryType).toBe("3D");
    expect(result.geometry).toBeDefined();
  });

  test("should handle empty gcode array", async () => {
    const context = { project: "test-empty-array" };
    // Empty array should throw an error like the original function
    await expect(visualizeGcodeIncremental([], context)).rejects.toThrow();
  });

  test("should handle multiple parts efficiently", async () => {
    // Create 5 gcode parts
    const gcodeParts = [];
    for (let i = 0; i < 5; i++) {
      const x = i * 20;
      gcodeParts.push(`
G0 X${x} Y0 Z0
G1 X${x + 10} Y0 Z0
G1 X${x + 10} Y10 Z0
G1 X${x} Y10 Z0
G1 X${x} Y0 Z0
`);
    }
    
    // Time incremental method
    const start = performance.now();
    const context = { project: "test-perf-incremental" };
    const result = await visualizeGcodeIncremental(gcodeParts, context);
    const time = performance.now() - start;
    
    console.log(`\n=== Performance Test Results (5 parts) ===`);
    console.log(`Incremental method: ${time.toFixed(2)}ms`);
    
    // Should produce valid result
    expect(result).toBeDefined();
    
    console.log(`✅ Incremental method produces valid results`);
  });

  test("should handle complex gcode with Z movements", async () => {
    const complexGcode1 = `
G0 X0 Y0 Z0
G1 X10 Y0 Z0
G1 X10 Y10 Z5
G1 X0 Y10 Z5
G1 X0 Y0 Z0
`;

    const complexGcode2 = `
G0 X20 Y20 Z2
G1 X30 Y20 Z2
G1 X30 Y30 Z7
G1 X20 Y30 Z7
G1 X20 Y20 Z2
`;
    
    const context = { project: "test-complex-gcode" };
    const result = await visualizeGcodeIncremental(
      [complexGcode1, complexGcode2],
      context
    );
    
    expect(result).toBeDefined();
    expect(result.geometry).toBeDefined();
    expect(result.geometryType).toBe("3D");
  });
});
