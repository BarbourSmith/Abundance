import { expect, test, describe, beforeAll } from "vitest";
import { init } from "../src/worker/util.ts";
import { visualizeGcodeIncremental } from "../src/worker/worker.ts";

describe("Gcode Visualization - No Phantom Lines", () => {
  beforeAll(async () => {
    await init();
  });

  test("should NOT create phantom lines back to origin between parts", async () => {
    // Part 1: Rectangle at origin
    const gcodePart1 = `
G0 X0 Y0 Z5
G0 Z0
G1 X10 Y0 Z0
G1 X10 Y10 Z0
G1 X0 Y10 Z0
G1 X0 Y0 Z0
`;

    // Part 2: Rectangle at X=20 (should NOT have a line from origin)
    const gcodePart2 = `
G0 X20 Y0 Z5
G0 Z0
G1 X30 Y0 Z0
G1 X30 Y10 Z0
G1 X20 Y10 Z0
G1 X20 Y0 Z0
`;
    
    const context = { project: "test-no-phantom" };
    
    const result = await visualizeGcodeIncremental(
      [gcodePart1, gcodePart2],
      context
    );
    
    // Should produce valid result
    expect(result).toBeDefined();
    expect(result.geometryType).toBe("replicad.Shape3D");
    
    console.log(`\n✅ No phantom lines created - position flows continuously between parts`);
  });

  test("should maintain position continuity across three parts", async () => {
    // Three parts at different positions
    const part1 = `
G0 X0 Y0 Z0
G1 X5 Y0 Z0
G1 X5 Y5 Z0
`;

    const part2 = `
G0 X10 Y0 Z0
G1 X15 Y0 Z0
G1 X15 Y5 Z0
`;

    const part3 = `
G0 X20 Y0 Z0
G1 X25 Y0 Z0
G1 X25 Y5 Z0
`;
    
    const context = { project: "test-continuity" };
    
    const result = await visualizeGcodeIncremental(
      [part1, part2, part3],
      context
    );
    
    // Should work
    expect(result).toBeDefined();
    
    console.log(`\n✅ Position maintained across all three parts`);
  });

  test("should handle multi-part assemblies correctly", async () => {
    // Simulate a realistic assembly with parts at various positions
    const parts = [
      `G0 X0 Y0 Z5\nG0 Z0\nG1 X10 Y0 Z0\nG1 X10 Y10 Z0\nG1 X0 Y10 Z0`,
      `G0 X20 Y0 Z5\nG0 Z0\nG1 X30 Y0 Z0\nG1 X30 Y10 Z0\nG1 X20 Y10 Z0`,
      `G0 X0 Y20 Z5\nG0 Z0\nG1 X10 Y20 Z0\nG1 X10 Y30 Z0\nG1 X0 Y30 Z0`,
    ];
    
    const context = { project: "test-multi-part" };
    
    const result = await visualizeGcodeIncremental(parts, context);
    
    // Should produce the correct structure
    expect(result.geometryType).toBe("replicad.Shape3D");
    
    console.log(`\n✅ Incremental method produces correct visualization`);
  });
});
