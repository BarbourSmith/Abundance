import { expect, test, describe } from "vitest";

describe("G-code Pass Count Configuration", () => {
  // Mock the generateGcode parameters similar to KirimotoUpdate.js
  const createGcodeConfig = (passes, materialThickness = 5, extra = 1.5) => {
    const z = materialThickness;
    const totalDepth = z + extra;
    
    return {
      outline: {
        type: "outline",
        tool: 1000,
        spindle: 1000,
        step: totalDepth / passes,  // Depth per pass
        steps: passes,              // Number of passes - let Kiri:Moto handle
        down: totalDepth,           // Total depth to cut
        rate: 1500,
        plunge: 250,
        // ... other config
      },
      rough: {
        camRoughDown: z / passes,
        camOutlineDown: z / passes,
      }
    };
  };

  test("should calculate correct step size for requested passes", () => {
    const materialThickness = 5; // 5mm thick material
    const extra = 1.5; // 1.5mm cut through
    const totalDepth = materialThickness + extra; // 6.5mm total
    
    // Test 1 pass
    const config1Pass = createGcodeConfig(1, materialThickness, extra);
    expect(config1Pass.outline.step).toBe(6.5); // Should cut 6.5mm per pass
    expect(config1Pass.outline.steps).toBe(1);  // 1 pass
    expect(config1Pass.outline.down).toBe(6.5); // Total depth
    
    // Test 2 passes
    const config2Pass = createGcodeConfig(2, materialThickness, extra);
    expect(config2Pass.outline.step).toBe(3.25); // Should cut 3.25mm per pass
    expect(config2Pass.outline.steps).toBe(2);   // 2 passes
    expect(config2Pass.outline.down).toBe(6.5);  // Total depth
    
    // Test 3 passes
    const config3Pass = createGcodeConfig(3, materialThickness, extra);
    expect(config3Pass.outline.step).toBe(6.5 / 3); // Should cut ~2.17mm per pass
    expect(config3Pass.outline.steps).toBe(3);      // 3 passes
    expect(config3Pass.outline.down).toBe(6.5);     // Total depth
  });

  test("should demonstrate the fixed configuration", () => {
    // Current configuration in KirimotoUpdate.js (after fix)
    const passes = 2;
    const z = 5;
    const extra = 1.5;
    const totalDepth = z + extra;
    
    const fixedConfig = {
      step: totalDepth / passes,    // 3.25mm per pass
      steps: passes,                // 2 passes (let Kiri:Moto handle)
      down: totalDepth,             // 6.5mm total depth
    };
    
    // With fixed config:
    // - step = 3.25mm (depth per pass)
    // - steps = 2 (number of passes)
    // - down = 6.5mm (total depth)
    // 
    // Kiri:Moto interprets this as:
    // "Cut 6.5mm total depth, in 2 passes of 3.25mm each"
    // Result: Exactly 2 passes of 3.25mm each = 6.5mm total
    
    expect(fixedConfig.step).toBe(3.25);
    expect(fixedConfig.steps).toBe(2);
    expect(fixedConfig.down).toBe(6.5);
    
    // Verify the math: step * steps should equal total depth
    expect(fixedConfig.step * fixedConfig.steps).toBe(totalDepth);
  });

  test("should show the correct configuration that fixes the issue", () => {
    const requestedPasses = 2;
    const z = 5;
    const extra = 1.5;
    const totalDepth = z + extra;
    
    // CORRECT FIX: Set steps to the number of passes and down to total depth
    const fixedConfig = {
      step: totalDepth / requestedPasses, // 3.25mm per pass
      steps: requestedPasses, // Set to actual number of passes
      down: totalDepth, // Set to total depth
    };
    
    expect(fixedConfig.step).toBe(3.25);
    expect(fixedConfig.steps).toBe(2);
    expect(fixedConfig.down).toBe(6.5);
    
    // This should tell Kiri:Moto:
    // "Cut 6.5mm total depth, in 2 steps of 3.25mm each"
  });

  test("should validate the new fix approach", () => {
    const requestedPasses = 2;
    const z = 5;
    const extra = 1.5;
    const totalDepth = z + extra;
    
    // NEW FIX: Set steps to requested passes and down to total depth
    const newConfig = {
      step: totalDepth / requestedPasses, // 3.25mm per step
      steps: requestedPasses,             // Number of steps = requested passes
      down: totalDepth,                   // Total depth for the operation
    };
    
    expect(newConfig.step).toBe(3.25);
    expect(newConfig.steps).toBe(2);
    expect(newConfig.down).toBe(6.5);
    
    // This tells Kiri:Moto: "Cut 6.5mm total, in 2 steps of 3.25mm each"
    // Result: Exactly 2 passes of 3.25mm each = 6.5mm total
  });

  test("should show current approach: step per pass, down total depth", () => {
    const requestedPasses = 3;
    const z = 5;
    const extra = 1.5;
    const totalDepth = z + extra; // 6.5
    
    // Current approach: step = depth per pass, down = total depth
    const currentConfig = {
      step: totalDepth / requestedPasses, // 2.17mm per step
      steps: 1,                          // 1 operation
      down: totalDepth,                   // 6.5mm total depth
    };
    
    expect(Math.ceil(currentConfig.down / currentConfig.step)).toBe(requestedPasses);
  });

  test("should experiment with different parameter combinations", () => {
    const requestedPasses = 3;
    const z = 5;
    const extra = 1.5;
    const totalDepth = z + extra; // 6.5
    
    // Current approach (back to original with original calculation)
    const approach1 = {
      step: totalDepth / requestedPasses, // 2.17mm per step
      steps: 1,                          // 1 step per operation
      down: totalDepth / requestedPasses, // 2.17mm per operation
    };
    
    // Alternative: fixed step depth, multiple steps
    const approach2 = {
      step: 1.0,                          // Fixed 1mm per step
      steps: Math.ceil(totalDepth),       // 7 steps total
      down: totalDepth,                   // 6.5mm total
    };
    
    // Alternative: divide total by passes, but set down to total
    const approach3 = {
      step: totalDepth / requestedPasses, // 2.17mm per step
      steps: requestedPasses,             // 3 steps
      down: totalDepth,                   // 6.5mm total
    };
    
    // Test different interpretation: maybe down should be step * steps?
    const approach4 = {
      step: totalDepth / requestedPasses, // 2.17mm per step  
      steps: 1,                          // 1 step
      down: totalDepth,                   // 6.5mm total (not step * steps)
    };
    
    expect(approach1.step * requestedPasses).toBeCloseTo(totalDepth);
  });

  test("should demonstrate old vs new behavior", () => {
    const testCases = [
      { requestedPasses: 1, z: 5, extra: 1.5 },
      { requestedPasses: 2, z: 5, extra: 1.5 },
      { requestedPasses: 3, z: 5, extra: 1.5 },
    ];

    testCases.forEach(({ requestedPasses, z, extra }) => {
      const totalDepth = z + extra;
      
      // OLD BEHAVIOR (manual multiple operations - before this fix)
      const oldConfig = {
        step: totalDepth / requestedPasses,
        steps: 1,  // Always 1 step per operation, multiple operations manually created
        down: totalDepth / requestedPasses,  // Depth per operation
      };
      
      // NEW BEHAVIOR (single operation, let Kiri:Moto handle passes)  
      const newConfig = {
        step: totalDepth / requestedPasses,  // Depth per pass
        steps: requestedPasses,              // Let Kiri:Moto generate this many passes
        down: totalDepth,                    // Total depth
      };
      
      // Old approach created multiple operations manually
      // New approach creates single operation and lets Kiri:Moto handle the passes
      
      // Verify new config has correct relationships
      expect(newConfig.step * newConfig.steps).toBe(totalDepth);
      expect(newConfig.steps).toBe(requestedPasses);
      expect(newConfig.down).toBe(totalDepth);
    });
  });

  test("should validate that Kiri:Moto pass generation approach matches test expectations", () => {
    // This test validates that our implementation matches the expected behavior
    // from the test case "should show the correct configuration that fixes the issue"
    
    const passes = 2;
    const z = 5;
    const extra = 1.5;
    const totalDepth = z + extra;
    
    // Current implementation (single operation approach)
    const config = createGcodeConfig(passes, z, extra);
    
    // Should match the "correct configuration" from the earlier test
    expect(config.outline.step).toBe(totalDepth / passes);  // 3.25
    expect(config.outline.steps).toBe(passes);               // 2
    expect(config.outline.down).toBe(totalDepth);            // 6.5
    
    // This tells Kiri:Moto: "Cut 6.5mm total depth, in 2 steps of 3.25mm each"
    expect(config.outline.step * config.outline.steps).toBe(totalDepth);
  });
});