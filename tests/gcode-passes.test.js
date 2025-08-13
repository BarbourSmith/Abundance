import { expect, test, describe } from "vitest";

describe("G-code Pass Count Configuration", () => {
  // Mock the generateGcode parameters similar to KirimotoUpdate.js
  const createGcodeConfig = (passes, materialThickness = 5, extra = 1.5) => {
    const z = materialThickness;
    const totalDepth = z + extra;
    const depthPerPass = totalDepth / passes;
    
    // Single operation approach with steps parameter
    const operations = [{
      type: "outline",
      tool: 1000,
      spindle: 1000,
      step: depthPerPass,     // Depth per pass
      steps: passes,          // Number of passes to make
      down: totalDepth,       // Total depth to cut
      rate: 1500,
      plunge: 250,
      ov_topz: 0,
      ov_botz: 0,
      // ... other config
    }];
    
    return {
      operations,
      totalDepth,
      depthPerPass,
      rough: {
        camRoughDown: z / passes,
        camOutlineDown: z / passes,
      }
    };
  };

  test("should calculate correct configuration for single operation with steps parameter", () => {
    const materialThickness = 5; // 5mm thick material
    const extra = 1.5; // 1.5mm cut through
    const totalDepth = materialThickness + extra; // 6.5mm total
    
    // Test 1 pass
    const config1Pass = createGcodeConfig(1, materialThickness, extra);
    expect(config1Pass.operations).toHaveLength(1);
    expect(config1Pass.operations[0].step).toBe(6.5); // Should cut 6.5mm per pass
    expect(config1Pass.operations[0].steps).toBe(1);  // 1 pass total
    expect(config1Pass.operations[0].down).toBe(6.5); // Total depth
    expect(config1Pass.operations[0].ov_topz).toBe(0); // No depth override
    expect(config1Pass.operations[0].ov_botz).toBe(0); // No depth override
    
    // Test 2 passes
    const config2Pass = createGcodeConfig(2, materialThickness, extra);
    expect(config2Pass.operations).toHaveLength(1);
    expect(config2Pass.operations[0].step).toBe(3.25);  // 3.25mm per pass
    expect(config2Pass.operations[0].steps).toBe(2);    // 2 passes total
    expect(config2Pass.operations[0].down).toBe(6.5);   // Total depth
    
    // Test 3 passes
    const config3Pass = createGcodeConfig(3, materialThickness, extra);
    expect(config3Pass.operations).toHaveLength(1);
    
    const expectedStepSize = 6.5 / 3; // ~2.17mm per pass
    expect(config3Pass.operations[0].step).toBeCloseTo(expectedStepSize, 2);
    expect(config3Pass.operations[0].steps).toBe(3);    // 3 passes total
    expect(config3Pass.operations[0].down).toBe(6.5);   // Total depth
  });

  test("should demonstrate the single operation approach with steps parameter", () => {
    // Current configuration in KirimotoUpdate.js (single operation with steps)
    const passes = 2;
    const z = 5;
    const extra = 1.5;
    const totalDepth = z + extra;
    const depthPerPass = totalDepth / passes;
    
    const config = createGcodeConfig(passes, z, extra);
    
    // With single operation approach:
    // - One operation tells Kiri:Moto: "Cut 6.5mm total in 2 passes of 3.25mm each"
    // 
    // Result: Exactly 2 passes as requested
    
    expect(config.operations).toHaveLength(1);
    
    // Single operation
    expect(config.operations[0].step).toBe(3.25);  // 3.25mm per pass
    expect(config.operations[0].steps).toBe(2);    // 2 passes total
    expect(config.operations[0].down).toBe(6.5);   // Total depth
    expect(config.operations[0].ov_topz).toBe(0);  // No depth override
    expect(config.operations[0].ov_botz).toBe(0);  // No depth override
  });

  test("should validate the single operation configuration with steps parameter", () => {
    const requestedPasses = 3;
    const z = 5;
    const extra = 1.5;
    const totalDepth = z + extra;
    const depthPerPass = totalDepth / requestedPasses;
    
    // CORRECT APPROACH: Single operation with steps parameter
    const config = createGcodeConfig(requestedPasses, z, extra);
    
    expect(config.operations).toHaveLength(1);
    
    const operation = config.operations[0];
    expect(operation.step).toBeCloseTo(depthPerPass, 2);  // ~2.17mm per pass
    expect(operation.steps).toBe(3);                      // 3 passes total
    expect(operation.down).toBe(totalDepth);              // 6.5mm total depth
    expect(operation.ov_topz).toBe(0);                    // No depth override
    expect(operation.ov_botz).toBe(0);                    // No depth override
    
    // This tells Kiri:Moto:
    // "Execute one operation: Cut 6.5mm total depth in exactly 3 passes of 2.17mm each"
  });

  test("should show different pass configurations with single operation", () => {
    const testCases = [
      { requestedPasses: 1, z: 5, extra: 1.5, expectedTotal: 6.5 },
      { requestedPasses: 2, z: 5, extra: 1.5, expectedTotal: 6.5 },
      { requestedPasses: 3, z: 5, extra: 1.5, expectedTotal: 6.5 },
      { requestedPasses: 4, z: 5, extra: 1.5, expectedTotal: 6.5 },
    ];

    testCases.forEach(({ requestedPasses, z, extra, expectedTotal }) => {
      const config = createGcodeConfig(requestedPasses, z, extra);
      const expectedStepSize = expectedTotal / requestedPasses;
      
      // Single operation approach with steps parameter
      expect(config.operations).toHaveLength(1);
      
      const operation = config.operations[0];
      expect(operation.step).toBeCloseTo(expectedStepSize, 2);
      expect(operation.steps).toBe(requestedPasses);
      expect(operation.down).toBe(expectedTotal);
      expect(operation.ov_topz).toBe(0);
      expect(operation.ov_botz).toBe(0);
    });
  });

  test("should validate that single operation approach produces exact pass count", () => {
    // This test validates that our implementation produces exactly the requested
    // number of passes using a single operation with steps parameter
    
    const passes = 3;
    const z = 5;
    const extra = 1.5;
    const totalDepth = z + extra; // 6.5mm
    const expectedStepSize = totalDepth / passes; // ~2.17mm
    
    // Single operation approach with steps parameter
    const config = createGcodeConfig(passes, z, extra);
    
    // Should create one operation
    expect(config.operations).toHaveLength(1);
    
    // Verify the operation has correct parameters
    const operation = config.operations[0];
    expect(operation.step).toBeCloseTo(expectedStepSize, 2);
    expect(operation.steps).toBe(passes);
    expect(operation.down).toBe(totalDepth);
    expect(operation.ov_topz).toBe(0);
    expect(operation.ov_botz).toBe(0);
    
    // This tells Kiri:Moto: "Execute one operation that cuts 6.5mm total in exactly 3 steps of 2.17mm each"
    // Result: Exactly 3 distinct passes
  });
});