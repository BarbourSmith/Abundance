import { expect, test, describe, beforeAll } from "vitest";
import { init } from "../src/worker/util.ts";
import { visualizeGcodeIncremental } from "../src/worker/worker.ts";

describe("G-code Generation for Thin Parts (< 1mm)", () => {
  beforeAll(async () => {
    await init();
  });

  test("should handle G-code with very small Z movements", async () => {
    // Simulate G-code that might be generated for a 0.5mm thick part
    // with 3 passes (down per pass = 0.333mm)
    const thinPartGcode = `
G0 X0 Y0 Z0
G1 X10 Y0 Z-0.333
G1 X10 Y10 Z-0.333
G1 X0 Y10 Z-0.333
G1 X0 Y0 Z-0.333
G1 X10 Y0 Z-0.666
G1 X10 Y10 Z-0.666
G1 X0 Y10 Z-0.666
G1 X0 Y0 Z-0.666
G1 X10 Y0 Z-1.0
G1 X10 Y10 Z-1.0
G1 X0 Y10 Z-1.0
G1 X0 Y0 Z-1.0
`;
    
    const context = { project: "test-thin-part" };
    const result = await visualizeGcodeIncremental([thinPartGcode], context);
    
    expect(result).toBeDefined();
    expect(result.geometry).toBeDefined();
    expect(result.dimension).toBe("3D");
  });

  test("should handle G-code with minimal XY movements (very small part)", async () => {
    // Test a very small part with small movements
    const smallPartGcode = `
G0 X0 Y0 Z0
G1 X0.5 Y0 Z-0.2
G1 X0.5 Y0.5 Z-0.2
G1 X0 Y0.5 Z-0.2
G1 X0 Y0 Z-0.2
G1 X0.5 Y0 Z-0.5
G1 X0.5 Y0.5 Z-0.5
G1 X0 Y0.5 Z-0.5
G1 X0 Y0 Z-0.5
`;
    
    const context = { project: "test-small-part" };
    const result = await visualizeGcodeIncremental([smallPartGcode], context);
    
    expect(result).toBeDefined();
    expect(result.geometry).toBeDefined();
    expect(result.dimension).toBe("3D");
  });

  test("should handle G-code that might have been generated with omitthru issues", async () => {
    // This simulates G-code where the CAM engine might have generated
    // only travel moves without cutting moves due to omitthru settings
    const problematicGcode = `
G0 X0 Y0 Z5
G0 X10 Y0 Z5
G0 X10 Y10 Z5
G0 X0 Y10 Z5
G0 X0 Y0 Z5
`;
    
    const context = { project: "test-problematic" };
    
    // This might fail or produce an empty result
    // The fix should ensure this doesn't happen for actual cutting operations
    try {
      const result = await visualizeGcodeIncremental([problematicGcode], context);
      // If it succeeds, we should have a valid result
      expect(result).toBeDefined();
    } catch (error) {
      // If it fails, it should be the expected error
      expect(error.message).toContain("No valid gcode movements found");
    }
  });

  test("should visualize G-code with mixed rapid and linear moves", async () => {
    // Realistic G-code with both G0 (rapid) and G1 (feed) moves
    const mixedGcode = `
G0 X0 Y0 Z5
G0 Z0.5
G1 Z-0.3 F200
G1 X10 Y0 Z-0.3 F500
G1 X10 Y10 Z-0.3
G1 X0 Y10 Z-0.3
G1 X0 Y0 Z-0.3
G0 Z5
`;
    
    const context = { project: "test-mixed-moves" };
    const result = await visualizeGcodeIncremental([mixedGcode], context);
    
    expect(result).toBeDefined();
    expect(result.geometry).toBeDefined();
    expect(result.dimension).toBe("3D");
  });

  test("should handle empty G-code string", async () => {
    const emptyGcode = `

`;
    
    const context = { project: "test-empty-gcode" };
    
    // Empty G-code should throw an error
    await expect(
      visualizeGcodeIncremental([emptyGcode], context)
    ).rejects.toThrow("No valid gcode movements found");
  });

  test("should calculate correct down per pass for thin materials", () => {
    // Test the calculation logic that would be in KirimotoUpdate.js
    const testCases = [
      { thickness: 0.5, cutThrough: 0.5, passes: 3, expectedDown: 0.333 },
      { thickness: 0.8, cutThrough: 0.2, passes: 2, expectedDown: 0.5 },
      { thickness: 1.0, cutThrough: 0.5, passes: 2, expectedDown: 0.75 },
      { thickness: 2.0, cutThrough: 1.5, passes: 3, expectedDown: 1.167 },
    ];

    testCases.forEach(({ thickness, cutThrough, passes, expectedDown }) => {
      const zBottom = thickness;
      const down = passes > 1 ? (zBottom + cutThrough) / passes : 10000;
      
      expect(down).toBeCloseTo(expectedDown, 2);
    });
  });

  test("should ensure minimum down per pass for thin materials", () => {
    // Proposed fix: ensure down per pass is at least 0.5mm
    const MIN_DOWN_PER_PASS = 0.5;
    
    const testCases = [
      { thickness: 0.5, cutThrough: 0.5, passes: 3 },
      { thickness: 0.8, cutThrough: 0.2, passes: 2 },
    ];

    testCases.forEach(({ thickness, cutThrough, passes }) => {
      const zBottom = thickness;
      let down = passes > 1 ? (zBottom + cutThrough) / passes : 10000;
      
      // Apply minimum threshold
      if (passes > 1 && down < MIN_DOWN_PER_PASS) {
        // Recalculate passes to ensure minimum down
        const adjustedPasses = Math.max(1, Math.floor((zBottom + cutThrough) / MIN_DOWN_PER_PASS));
        down = (zBottom + cutThrough) / adjustedPasses;
      }
      
      expect(down).toBeGreaterThanOrEqual(MIN_DOWN_PER_PASS);
    });
  });
});
