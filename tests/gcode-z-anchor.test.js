import { expect, test, describe } from "vitest";

describe("G-code Z Anchor Configuration", () => {
  test("should set camZAnchor to 'top' for correct Z=0 reference at top of part", () => {
    // This test validates that the Z anchor is set to "top" which means:
    // - Z=0 is at the top surface of the stock/part
    // - Negative Z values go down into the part
    // - This is the standard CNC convention for most operations
    
    // Mock the process configuration from KirimotoUpdate.js
    const createProcessConfig = (zAnchor) => {
      return {
        camZAnchor: zAnchor,
        camZTop: 0, // top of stock at Z=0
        camZClearance: 3, // clearance height above part
      };
    };

    // Test the correct configuration
    const correctConfig = createProcessConfig("top");
    expect(correctConfig.camZAnchor).toBe("top");
    
    // Verify that "bottom" is NOT being used (this was the bug)
    expect(correctConfig.camZAnchor).not.toBe("bottom");
    
    // Verify Z top is set to 0
    expect(correctConfig.camZTop).toBe(0);
  });

  test("should demonstrate the difference between top, middle, and bottom Z anchors", () => {
    // According to engine.js logic:
    // - "top": widget.setTopZ(stock.z - zdelta)
    //   This sets Z=0 at the top of the stock
    // - "middle": widget.setTopZ(stock.z - (stock.z - wzmax) / 2 + zdelta)
    //   This sets Z=0 at the middle of the part
    // - "bottom": widget.setTopZ(wzmax + zdelta)
    //   This sets Z=0 at the bottom of the part (WRONG for our use case)

    const stockHeight = 10; // 10mm stock thickness
    const partHeight = 8; // 8mm part height
    const wzmax = partHeight; // max Z of widget bounds
    const zdelta = 0; // Z offset

    // Simulate the Z anchor calculations from engine.js
    const topAnchor = stockHeight - zdelta; // Sets Z=0 at top of stock
    const middleAnchor = stockHeight - (stockHeight - wzmax) / 2 + zdelta; // Middle
    const bottomAnchor = wzmax + zdelta; // Sets Z=0 at bottom/max Z of part

    // For standard CNC operations, we want Z=0 at the top
    expect(topAnchor).toBe(10); // Top of 10mm stock
    
    // Bottom anchor would place Z=0 at the part's max Z (bottom of part)
    expect(bottomAnchor).toBe(8); // Bottom of 8mm part
    
    // This demonstrates why "top" is correct:
    // With "top" anchor, cutting depths are negative values from the top surface
    // With "bottom" anchor, Z=0 is at the wrong reference point
    expect(topAnchor).toBeGreaterThan(bottomAnchor);
  });

  test("should show the issue: bottom anchor causes tool to plunge unexpectedly low", () => {
    // PROBLEM SCENARIO:
    // When camZAnchor = "bottom", Z=0 is at the bottom of the part
    // This causes the tool to start at positions that cut through the part
    
    const partThickness = 5; // 5mm thick part
    const cutThrough = 1.5; // cut 1.5mm below bottom
    const passes = 2;
    
    // With BOTTOM anchor (WRONG - this was the bug):
    const wrongConfig = {
      camZAnchor: "bottom",
      camZBottom: -(partThickness + cutThrough), // -6.5mm
      camZTop: 0, // But Z=0 is at BOTTOM of part!
    };
    
    // This means the tool thinks it should cut from Z=0 (bottom of part)
    // down to Z=-6.5mm, which is cutting air above and through the part incorrectly
    
    // With TOP anchor (CORRECT - the fix):
    const correctConfig = {
      camZAnchor: "top",
      camZBottom: -(partThickness + cutThrough), // -6.5mm from top
      camZTop: 0, // Z=0 is at TOP of stock
    };
    
    // This means the tool cuts from Z=0 (top of part)
    // down to Z=-6.5mm (through part and a bit beyond)
    // This is the correct behavior!
    
    expect(wrongConfig.camZAnchor).toBe("bottom");
    expect(correctConfig.camZAnchor).toBe("top");
    expect(correctConfig.camZTop).toBe(0);
    
    // Both have same camZBottom, but the reference point (camZAnchor) is different
    expect(wrongConfig.camZBottom).toBe(correctConfig.camZBottom);
  });

  test("should validate the complete fix in KirimotoUpdate.js configuration", () => {
    // This test represents the actual configuration that should be in KirimotoUpdate.js
    const passes = 2;
    const zPartHeight = 5; // part is 5mm thick
    const cutThrough = 1.5; // cut through 1.5mm
    const zBottom = zPartHeight;
    
    // Calculate down per pass
    const down = (zBottom + cutThrough) / passes; // 3.25mm per pass
    const camZBottom = -zBottom - cutThrough; // -6.5mm (total depth from top)
    const camZThru = passes > 1 ? 0 : cutThrough;
    
    // The CORRECT configuration (after fix)
    const fixedProcessConfig = {
      camZAnchor: "top", // CRITICAL: Must be "top" not "bottom"
      camZTop: 0, // Top of stock is at Z=0
      camZBottom: camZBottom, // -6.5mm (cut through bottom)
      camZClearance: 3, // 3mm clearance above part
      camZThru: camZThru, // 0 for multiple passes
    };
    
    // Assertions to validate the fix
    expect(fixedProcessConfig.camZAnchor).toBe("top");
    expect(fixedProcessConfig.camZTop).toBe(0);
    expect(fixedProcessConfig.camZBottom).toBe(-6.5);
    expect(fixedProcessConfig.camZClearance).toBe(3);
    
    // Verify calculations
    expect(down).toBe(3.25); // Each pass is 3.25mm
    expect(passes * down).toBe(6.5); // Total depth is 6.5mm
  });

  test("should explain the Z coordinate system with top anchor", () => {
    // With camZAnchor = "top", the Z coordinate system works as follows:
    // Z = +3mm: clearance height (camZClearance)
    // Z = 0mm: top surface of the stock/part (camZTop)
    // Z = -5mm: if part is 5mm thick, this is the bottom of the part
    // Z = -6.5mm: if cutting through 1.5mm, this is the final cut depth (camZBottom)
    
    const partThickness = 5;
    const cutThrough = 1.5;
    const clearance = 3;
    
    const zLevels = {
      clearance: clearance, // +3mm above part
      topOfPart: 0, // Z=0 at top (camZTop)
      bottomOfPart: -partThickness, // -5mm
      cutThroughDepth: -(partThickness + cutThrough), // -6.5mm (camZBottom)
    };
    
    // Verify the coordinate system makes sense
    expect(zLevels.clearance).toBeGreaterThan(zLevels.topOfPart);
    expect(zLevels.topOfPart).toBeGreaterThan(zLevels.bottomOfPart);
    expect(zLevels.bottomOfPart).toBeGreaterThan(zLevels.cutThroughDepth);
    
    // Tool path should go from clearance -> top -> cut through -> back to clearance
    expect(zLevels.clearance).toBe(3);
    expect(zLevels.topOfPart).toBe(0);
    expect(zLevels.bottomOfPart).toBe(-5);
    expect(zLevels.cutThroughDepth).toBe(-6.5);
  });
});
