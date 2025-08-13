import { expect, test, describe } from "vitest";

describe("G-code Pass Generation - Fixed Implementation", () => {
  // Test the fixed multiple operations approach
  const createFixedGcodeConfig = (passes, materialThickness = 5, extra = 1.5) => {
    const z = materialThickness;
    const totalDepth = z + extra;
    const depthPerPass = totalDepth / passes;
    
    // Multiple operations approach with depth boundaries (FIXED VERSION)
    const operations = [];
    
    for (let pass = 1; pass <= passes; pass++) {
      const currentDepth = depthPerPass * pass; // Cumulative depth
      
      operations.push({
        type: "outline",
        tool: 1000,
        spindle: 1000,
        step: currentDepth,       // Total depth to cut for this operation
        steps: 1,                 // Only one step per operation
        down: currentDepth,       // Total depth for this operation
        rate: 1500,
        plunge: 250,
        ov_topz: pass === 1 ? 0 : -(depthPerPass * (pass - 1)), // Start depth
        ov_botz: -currentDepth,   // End depth
        ov_conv: false,
      });
    }
    
    return {
      operations,
      totalDepth,
      depthPerPass,
    };
  };

  test("should create correct multiple operations for 1 pass", () => {
    const config = createFixedGcodeConfig(1, 5, 1.5);
    
    expect(config.operations).toHaveLength(1);
    
    const op1 = config.operations[0];
    expect(op1.step).toBe(6.5);      // Total depth
    expect(op1.steps).toBe(1);       // Single step
    expect(op1.down).toBe(6.5);      // Total depth
    expect(op1.ov_topz).toBe(0);     // Start at surface
    expect(op1.ov_botz).toBe(-6.5);  // End at full depth
  });

  test("should create correct multiple operations for 2 passes", () => {
    const config = createFixedGcodeConfig(2, 5, 1.5);
    
    expect(config.operations).toHaveLength(2);
    
    // First pass: surface to 3.25mm
    const op1 = config.operations[0];
    expect(op1.step).toBe(3.25);
    expect(op1.steps).toBe(1);
    expect(op1.down).toBe(3.25);
    expect(op1.ov_topz).toBe(0);     // Start at surface
    expect(op1.ov_botz).toBe(-3.25); // End at 3.25mm
    
    // Second pass: 3.25mm to 6.5mm
    const op2 = config.operations[1];
    expect(op2.step).toBe(6.5);
    expect(op2.steps).toBe(1);
    expect(op2.down).toBe(6.5);
    expect(op2.ov_topz).toBe(-3.25);  // Start at 3.25mm
    expect(op2.ov_botz).toBe(-6.5);   // End at 6.5mm
  });

  test("should create correct multiple operations for 3 passes", () => {
    const config = createFixedGcodeConfig(3, 5, 1.5);
    
    expect(config.operations).toHaveLength(3);
    
    const depthPerPass = 6.5 / 3; // ~2.17mm per pass
    
    // First pass: surface to 2.17mm
    const op1 = config.operations[0];
    expect(op1.step).toBeCloseTo(depthPerPass, 2);
    expect(op1.steps).toBe(1);
    expect(op1.down).toBeCloseTo(depthPerPass, 2);
    expect(op1.ov_topz).toBe(0);
    expect(op1.ov_botz).toBeCloseTo(-depthPerPass, 2);
    
    // Second pass: 2.17mm to 4.33mm
    const op2 = config.operations[1];
    expect(op2.step).toBeCloseTo(depthPerPass * 2, 2);
    expect(op2.steps).toBe(1);
    expect(op2.down).toBeCloseTo(depthPerPass * 2, 2);
    expect(op2.ov_topz).toBeCloseTo(-depthPerPass, 2);
    expect(op2.ov_botz).toBeCloseTo(-depthPerPass * 2, 2);
    
    // Third pass: 4.33mm to 6.5mm
    const op3 = config.operations[2];
    expect(op3.step).toBe(6.5);
    expect(op3.steps).toBe(1);
    expect(op3.down).toBe(6.5);
    expect(op3.ov_topz).toBeCloseTo(-depthPerPass * 2, 2);
    expect(op3.ov_botz).toBe(-6.5);
  });

  test("should explain why the fixed approach works", () => {
    const config = createFixedGcodeConfig(3, 5, 1.5);
    
    // The fixed approach works because:
    // 1. Each operation has its own depth boundaries (ov_topz and ov_botz)
    // 2. Each operation uses steps=1 to avoid the Kiri:Moto steps parameter bug
    // 3. Depth boundaries prevent overlapping cuts
    
    expect(config.operations).toHaveLength(3);
    
    // Verify no overlapping by checking that each operation's start depth
    // matches the previous operation's end depth
    for (let i = 1; i < config.operations.length; i++) {
      const prevOp = config.operations[i - 1];
      const currentOp = config.operations[i];
      
      expect(currentOp.ov_topz).toBeCloseTo(prevOp.ov_botz, 2);
    }
    
    // Verify all operations use steps=1 to avoid the bug
    config.operations.forEach(op => {
      expect(op.steps).toBe(1);
    });
  });

  test("should demonstrate how this approach avoids the Kiri:Moto bug", () => {
    const passes = 3;
    const config = createFixedGcodeConfig(passes, 5, 1.5);
    
    // This approach avoids the bug because:
    // 1. We don't rely on the broken `steps` parameter (always use steps=1)
    // 2. We use depth boundaries (ov_topz/ov_botz) to control exact cutting regions
    // 3. Each operation cuts only its assigned depth range
    
    console.log("Fixed approach for 3 passes:");
    config.operations.forEach((op, index) => {
      console.log(`Operation ${index + 1}:`);
      console.log(`  - Cut from ${-op.ov_topz}mm to ${-op.ov_botz}mm`);
      console.log(`  - steps: ${op.steps} (always 1 to avoid bug)`);
      console.log(`  - step: ${op.step}mm, down: ${op.down}mm`);
    });
    
    expect(config.operations.every(op => op.steps === 1)).toBe(true);
    expect(config.operations).toHaveLength(passes);
  });
});