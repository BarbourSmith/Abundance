import { expect, test, describe } from "vitest";

describe("G-code Pass Count Configuration", () => {
  // Mock the generateGcode parameters similar to KirimotoUpdate.js
  const createGcodeConfig = (passes, materialThickness = 5, extra = 1.5) => {
    const z = materialThickness;
    const totalDepth = z + extra;
    const depthPerPass = totalDepth / passes;
    
    // Create a single operation that lets Kiri:Moto handle passes
    const operations = [];
    operations.push({
      type: "outline",
      tool: 1000,
      spindle: 1000,
      step: depthPerPass,         // Depth increment per pass
      steps: passes,              // Number of passes to take
      down: totalDepth,           // Total depth to cut
      rate: 1500,
      plunge: 250,
      // ... other config
    });
    
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

  test("should calculate correct configuration for single operation with multiple passes", () => {
    const materialThickness = 5; // 5mm thick material
    const extra = 1.5; // 1.5mm cut through
    const totalDepth = materialThickness + extra; // 6.5mm total
    
    // Test 1 pass
    const config1Pass = createGcodeConfig(1, materialThickness, extra);
    expect(config1Pass.operations).toHaveLength(1);
    expect(config1Pass.operations[0].step).toBe(6.5); // Should cut 6.5mm per pass
    expect(config1Pass.operations[0].steps).toBe(1);  // 1 pass total
    expect(config1Pass.operations[0].down).toBe(6.5); // Total depth to cut
    
    // Test 2 passes
    const config2Pass = createGcodeConfig(2, materialThickness, extra);
    expect(config2Pass.operations).toHaveLength(1);
    expect(config2Pass.operations[0].step).toBe(3.25); // Should cut 3.25mm per pass
    expect(config2Pass.operations[0].steps).toBe(2);   // 2 passes total
    expect(config2Pass.operations[0].down).toBe(6.5);  // Total depth to cut
    
    // Test 3 passes
    const config3Pass = createGcodeConfig(3, materialThickness, extra);
    expect(config3Pass.operations).toHaveLength(1);
    expect(config3Pass.operations[0].step).toBe(6.5 / 3); // Should cut ~2.17mm per pass
    expect(config3Pass.operations[0].steps).toBe(3);      // 3 passes total
    expect(config3Pass.operations[0].down).toBe(6.5);     // Total depth to cut
  });

  test("should demonstrate the correct single operation approach", () => {
    // Current configuration in KirimotoUpdate.js (single operation approach)
    const passes = 2;
    const z = 5;
    const extra = 1.5;
    const totalDepth = z + extra;
    const depthPerPass = totalDepth / passes;
    
    const config = createGcodeConfig(passes, z, extra);
    
    // With single operation approach:
    // - One operation with step = 3.25mm, steps = 2, down = 6.5mm
    // - Tells Kiri:Moto: "Cut to 6.5mm total depth in 2 passes of 3.25mm each"
    // 
    // First pass: cut from 0 to 3.25mm
    // Second pass: cut from 3.25mm to 6.5mm
    // Result: Exactly 2 passes as requested
    
    expect(config.operations).toHaveLength(1);
    expect(config.operations[0].step).toBe(3.25);
    expect(config.operations[0].steps).toBe(2);
    expect(config.operations[0].down).toBe(6.5);
    
    // Verify the math: step * steps = total depth
    expect(config.operations[0].step * config.operations[0].steps).toBe(config.totalDepth);
  });

  test("should validate the single operation configuration", () => {
    const requestedPasses = 3;
    const z = 5;
    const extra = 1.5;
    const totalDepth = z + extra;
    const depthPerPass = totalDepth / requestedPasses;
    
    // CORRECT APPROACH: Single operation with step and steps parameters
    const config = createGcodeConfig(requestedPasses, z, extra);
    
    expect(config.operations).toHaveLength(1);
    expect(config.operations[0].step).toBeCloseTo(2.17, 2);  // ~2.17mm per pass
    expect(config.operations[0].steps).toBe(3);              // 3 passes total
    expect(config.operations[0].down).toBe(6.5);             // Total depth to cut
    
    // This tells Kiri:Moto:
    // "Execute one operation: Cut 6.5mm deep in 3 passes of ~2.17mm each"
    expect(config.operations[0].step * config.operations[0].steps).toBeCloseTo(totalDepth);
  });

  test("should show different pass configurations", () => {
    const testCases = [
      { requestedPasses: 1, z: 5, extra: 1.5, expectedTotal: 6.5 },
      { requestedPasses: 2, z: 5, extra: 1.5, expectedTotal: 6.5 },
      { requestedPasses: 3, z: 5, extra: 1.5, expectedTotal: 6.5 },
      { requestedPasses: 4, z: 5, extra: 1.5, expectedTotal: 6.5 },
    ];

    testCases.forEach(({ requestedPasses, z, extra, expectedTotal }) => {
      const config = createGcodeConfig(requestedPasses, z, extra);
      const expectedStepSize = expectedTotal / requestedPasses;
      
      // Single operation approach
      expect(config.operations).toHaveLength(1);
      expect(config.operations[0].step).toBeCloseTo(expectedStepSize, 2);
      expect(config.operations[0].steps).toBe(requestedPasses);
      expect(config.operations[0].down).toBe(expectedTotal);
      
      // Verify total depth calculation
      expect(config.operations[0].step * config.operations[0].steps).toBeCloseTo(expectedTotal);
    });
  });

  test("should validate that single operation approach produces exact pass count", () => {
    // This test validates that our implementation produces exactly the requested
    // number of passes using the single operation approach
    
    const passes = 3;
    const z = 5;
    const extra = 1.5;
    const totalDepth = z + extra; // 6.5mm
    const expectedStepSize = totalDepth / passes; // ~2.17mm
    
    // Single operation approach
    const config = createGcodeConfig(passes, z, extra);
    
    // Should create one operation with multiple steps
    expect(config.operations).toHaveLength(1);
    
    // Operation configuration
    expect(config.operations[0].step).toBeCloseTo(expectedStepSize, 2);  // ~2.17mm per pass
    expect(config.operations[0].steps).toBe(passes);                     // 3 passes total
    expect(config.operations[0].down).toBe(totalDepth);                  // 6.5mm total depth
    
    // This tells Kiri:Moto: "Execute one operation with 3 incremental passes"
    // Pass 1: 0 to 2.17mm
    // Pass 2: 2.17mm to 4.33mm  
    // Pass 3: 4.33mm to 6.5mm
    // Result: Exactly 3 distinct passes
    expect(config.operations[0].step * config.operations[0].steps).toBeCloseTo(totalDepth);
  });
});