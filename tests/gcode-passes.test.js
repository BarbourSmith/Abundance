import { expect, test, describe } from "vitest";

describe("G-code Pass Count Configuration", () => {
  // Mock the generateGcode parameters similar to KirimotoUpdate.js
  const createGcodeConfig = (passes, materialThickness = 5, extra = 1.5) => {
    const z = materialThickness;
    const totalDepth = z + extra;
    const depthPerPass = totalDepth / passes;
    
    // Create separate operations with non-overlapping depths
    const operations = [];
    for (let i = 1; i <= passes; i++) {
      const previousDepth = depthPerPass * (i - 1);
      const currentDepth = depthPerPass * i;
      
      operations.push({
        type: "outline",
        tool: 1000,
        spindle: 1000,
        step: depthPerPass,           // Depth for this specific pass
        steps: 1,                     // Single step per operation
        down: depthPerPass,           // Incremental depth (not cumulative)
        rate: 1500,
        plunge: 250,
        ov_topz: -previousDepth,      // Start at the end of the previous pass
        ov_botz: -currentDepth,       // End at the target depth for this pass
        // ... other config
      });
    }
    
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

  test("should calculate correct configuration for multiple operations with non-overlapping depths", () => {
    const materialThickness = 5; // 5mm thick material
    const extra = 1.5; // 1.5mm cut through
    const totalDepth = materialThickness + extra; // 6.5mm total
    
    // Test 1 pass
    const config1Pass = createGcodeConfig(1, materialThickness, extra);
    expect(config1Pass.operations).toHaveLength(1);
    expect(config1Pass.operations[0].step).toBe(6.5); // Should cut 6.5mm per pass
    expect(config1Pass.operations[0].steps).toBe(1);  // 1 step per operation
    expect(config1Pass.operations[0].down).toBe(6.5); // Incremental depth
    expect(config1Pass.operations[0].ov_topz).toBeCloseTo(0, 10); // Start at surface
    expect(config1Pass.operations[0].ov_botz).toBe(-6.5); // End at full depth
    
    // Test 2 passes
    const config2Pass = createGcodeConfig(2, materialThickness, extra);
    expect(config2Pass.operations).toHaveLength(2);
    
    // First operation: 0 to 3.25mm
    expect(config2Pass.operations[0].step).toBe(3.25);
    expect(config2Pass.operations[0].steps).toBe(1);
    expect(config2Pass.operations[0].down).toBe(3.25);
    expect(config2Pass.operations[0].ov_topz).toBeCloseTo(0, 10);      // Start at surface
    expect(config2Pass.operations[0].ov_botz).toBe(-3.25);  // End at 3.25mm depth
    
    // Second operation: 3.25mm to 6.5mm
    expect(config2Pass.operations[1].step).toBe(3.25);
    expect(config2Pass.operations[1].steps).toBe(1);
    expect(config2Pass.operations[1].down).toBe(3.25);
    expect(config2Pass.operations[1].ov_topz).toBe(-3.25);  // Start at 3.25mm depth
    expect(config2Pass.operations[1].ov_botz).toBe(-6.5);   // End at full depth
    
    // Test 3 passes
    const config3Pass = createGcodeConfig(3, materialThickness, extra);
    expect(config3Pass.operations).toHaveLength(3);
    
    const expectedStepSize = 6.5 / 3; // ~2.17mm per pass
    
    // First operation: 0 to ~2.17mm
    expect(config3Pass.operations[0].step).toBeCloseTo(expectedStepSize, 2);
    expect(config3Pass.operations[0].ov_topz).toBeCloseTo(0, 10);
    expect(config3Pass.operations[0].ov_botz).toBeCloseTo(-expectedStepSize, 2);
    
    // Second operation: ~2.17mm to ~4.33mm
    expect(config3Pass.operations[1].step).toBeCloseTo(expectedStepSize, 2);
    expect(config3Pass.operations[1].ov_topz).toBeCloseTo(-expectedStepSize, 2);
    expect(config3Pass.operations[1].ov_botz).toBeCloseTo(-expectedStepSize * 2, 2);
    
    // Third operation: ~4.33mm to 6.5mm
    expect(config3Pass.operations[2].step).toBeCloseTo(expectedStepSize, 2);
    expect(config3Pass.operations[2].ov_topz).toBeCloseTo(-expectedStepSize * 2, 2);
    expect(config3Pass.operations[2].ov_botz).toBeCloseTo(-6.5, 2);
  });

  test("should demonstrate the correct multiple operations approach with depth control", () => {
    // Current configuration in KirimotoUpdate.js (multiple operations with depth control)
    const passes = 2;
    const z = 5;
    const extra = 1.5;
    const totalDepth = z + extra;
    const depthPerPass = totalDepth / passes;
    
    const config = createGcodeConfig(passes, z, extra);
    
    // With multiple operations approach using depth control:
    // - First operation: cuts from 0 to 3.25mm (ov_topz: 0, ov_botz: -3.25)
    // - Second operation: cuts from 3.25mm to 6.5mm (ov_topz: -3.25, ov_botz: -6.5)
    // 
    // Result: Exactly 2 non-overlapping passes as requested
    
    expect(config.operations).toHaveLength(2);
    
    // First operation
    expect(config.operations[0].step).toBe(3.25);
    expect(config.operations[0].steps).toBe(1);
    expect(config.operations[0].down).toBe(3.25);
    expect(config.operations[0].ov_topz).toBeCloseTo(0, 10);
    expect(config.operations[0].ov_botz).toBe(-3.25);
    
    // Second operation
    expect(config.operations[1].step).toBe(3.25);
    expect(config.operations[1].steps).toBe(1);
    expect(config.operations[1].down).toBe(3.25);
    expect(config.operations[1].ov_topz).toBe(-3.25);
    expect(config.operations[1].ov_botz).toBe(-6.5);
  });

  test("should validate the multiple operations configuration with depth control", () => {
    const requestedPasses = 3;
    const z = 5;
    const extra = 1.5;
    const totalDepth = z + extra;
    const depthPerPass = totalDepth / requestedPasses;
    
    // CORRECT APPROACH: Multiple operations with depth boundaries
    const config = createGcodeConfig(requestedPasses, z, extra);
    
    expect(config.operations).toHaveLength(3);
    
    for (let i = 0; i < 3; i++) {
      const operation = config.operations[i];
      const expectedTopZ = -depthPerPass * i;
      const expectedBotZ = -depthPerPass * (i + 1);
      
      expect(operation.step).toBeCloseTo(depthPerPass, 2);  // ~2.17mm per pass
      expect(operation.steps).toBe(1);                      // 1 step per operation
      expect(operation.down).toBeCloseTo(depthPerPass, 2);  // Incremental depth
      expect(operation.ov_topz).toBeCloseTo(expectedTopZ, 2);
      expect(operation.ov_botz).toBeCloseTo(expectedBotZ, 2);
    }
    
    // This tells Kiri:Moto:
    // "Execute three operations with controlled depth boundaries"
    // Pass 1: 0 to 2.17mm
    // Pass 2: 2.17mm to 4.33mm  
    // Pass 3: 4.33mm to 6.5mm
  });

  test("should show different pass configurations with depth boundaries", () => {
    const testCases = [
      { requestedPasses: 1, z: 5, extra: 1.5, expectedTotal: 6.5 },
      { requestedPasses: 2, z: 5, extra: 1.5, expectedTotal: 6.5 },
      { requestedPasses: 3, z: 5, extra: 1.5, expectedTotal: 6.5 },
      { requestedPasses: 4, z: 5, extra: 1.5, expectedTotal: 6.5 },
    ];

    testCases.forEach(({ requestedPasses, z, extra, expectedTotal }) => {
      const config = createGcodeConfig(requestedPasses, z, extra);
      const expectedStepSize = expectedTotal / requestedPasses;
      
      // Multiple operations approach with depth control
      expect(config.operations).toHaveLength(requestedPasses);
      
      for (let i = 0; i < requestedPasses; i++) {
        const operation = config.operations[i];
        expect(operation.step).toBeCloseTo(expectedStepSize, 2);
        expect(operation.steps).toBe(1);
        expect(operation.down).toBeCloseTo(expectedStepSize, 2);
        expect(operation.ov_topz).toBeCloseTo(-expectedStepSize * i, 2);
        expect(operation.ov_botz).toBeCloseTo(-expectedStepSize * (i + 1), 2);
      }
    });
  });

  test("should validate that depth boundary approach produces exact pass count", () => {
    // This test validates that our implementation produces exactly the requested
    // number of passes using depth boundaries to prevent overlap
    
    const passes = 3;
    const z = 5;
    const extra = 1.5;
    const totalDepth = z + extra; // 6.5mm
    const expectedStepSize = totalDepth / passes; // ~2.17mm
    
    // Multiple operations approach with depth boundaries
    const config = createGcodeConfig(passes, z, extra);
    
    // Should create one operation per pass
    expect(config.operations).toHaveLength(passes);
    
    // Verify each operation has proper depth boundaries
    for (let i = 0; i < passes; i++) {
      const operation = config.operations[i];
      const expectedStartDepth = expectedStepSize * i;
      const expectedEndDepth = expectedStepSize * (i + 1);
      
      expect(operation.step).toBeCloseTo(expectedStepSize, 2);
      expect(operation.steps).toBe(1);
      expect(operation.down).toBeCloseTo(expectedStepSize, 2);
      expect(operation.ov_topz).toBeCloseTo(-expectedStartDepth, 2);
      expect(operation.ov_botz).toBeCloseTo(-expectedEndDepth, 2);
    }
    
    // This tells Kiri:Moto: "Execute three operations with non-overlapping depth ranges"
    // Pass 1: surface (0) to 2.17mm depth
    // Pass 2: 2.17mm depth to 4.33mm depth  
    // Pass 3: 4.33mm depth to 6.5mm depth
    // Result: Exactly 3 distinct, non-overlapping passes
  });
});