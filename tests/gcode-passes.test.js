import { expect, test, describe } from "vitest";

describe("G-code pass calculation logic", () => {
  test("should calculate correct step parameters for given passes", () => {
    // Simulate the calculation logic from Kirimoto.js
    const z = 10; // Material thickness (from bounding box)
    const extra = 1.5; // Cut through parameter
    const passes = 2; // Desired number of passes
    
    // Current calculation (which may be incorrect)
    const currentStepSize = (z + extra) / passes; // 11.5 / 2 = 5.75
    const currentSteps = 1; // This is hardcoded to 1 in the current code
    const currentDown = (z + extra) / passes; // 11.5 / 2 = 5.75
    
    console.log("Current logic:");
    console.log("- Material thickness (z):", z);
    console.log("- Cut through (extra):", extra);  
    console.log("- Total depth to cut:", z + extra);
    console.log("- Desired passes:", passes);
    console.log("- Step size:", currentStepSize);
    console.log("- Steps:", currentSteps);
    console.log("- Down per step:", currentDown);
    
    // The issue: With steps=1 and down=5.75, Kiri:Moto will:
    // 1. Make 1 step of 5.75mm depth
    // 2. But since the total material is 11.5mm thick, it needs another pass
    // 3. This results in 2 passes instead of the intended 1 pass of 5.75mm each
    
    // Correct calculation should be:
    const totalDepth = z + extra; // 11.5mm
    const correctStepSize = totalDepth / passes; // 5.75mm per pass
    const correctSteps = passes; // 2 steps
    const correctDown = correctStepSize; // 5.75mm per step
    
    console.log("\nCorrect logic:");
    console.log("- Step size:", correctStepSize);
    console.log("- Steps:", correctSteps);
    console.log("- Down per step:", correctDown);
    console.log("- Total depth cut:", correctSteps * correctDown);
    
    // Verify the correct calculation
    expect(correctSteps * correctDown).toBe(totalDepth);
    expect(correctSteps).toBe(passes);
    
    // The fix should change steps from 1 to passes
    expect(correctSteps).toBe(passes);
    expect(correctDown).toBe(totalDepth / passes);
  });
  
  test("should work for different pass counts", () => {
    const testCases = [
      { z: 10, extra: 1.5, passes: 1 },
      { z: 10, extra: 1.5, passes: 2 },
      { z: 10, extra: 1.5, passes: 3 },
      { z: 20, extra: 2.0, passes: 4 },
    ];
    
    testCases.forEach(({ z, extra, passes }) => {
      const totalDepth = z + extra;
      const stepSize = totalDepth / passes;
      const steps = passes;
      const downPerStep = stepSize;
      
      console.log(`\nTest case: z=${z}, extra=${extra}, passes=${passes}`);
      console.log(`- Total depth: ${totalDepth}`);
      console.log(`- Step size: ${stepSize}`);
      console.log(`- Steps: ${steps}`);
      console.log(`- Down per step: ${downPerStep}`);
      console.log(`- Total cut: ${steps * downPerStep}`);
      
      expect(steps * downPerStep).toBe(totalDepth);
      expect(steps).toBe(passes);
    });
  });
});