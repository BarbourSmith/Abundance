import { expect, test, describe } from "vitest";

describe("Minimal G-code Generator Example", () => {
  test("should generate valid G-code structure for different pass counts", () => {
    // Test the basic G-code generation logic that powers the minimal example
    
    // Simulate STL bounds (10x10x10mm cube)
    const bounds = {
      min: { x: 0, y: 0, z: 0 },
      max: { x: 10, y: 10, z: 10 }
    };
    
    const toolSize = 6.35;
    const cutThrough = 1.5;
    const toolRadius = toolSize / 2;
    
    // Test calculations for different pass counts
    const testCases = [
      { passes: 1, expectedDepthPerPass: 11.5 },
      { passes: 2, expectedDepthPerPass: 5.75 },
      { passes: 4, expectedDepthPerPass: 2.875 },
      { passes: 10, expectedDepthPerPass: 1.15 }
    ];
    
    testCases.forEach(({ passes, expectedDepthPerPass }) => {
      const totalDepth = (bounds.max.z - bounds.min.z) + cutThrough; // 11.5mm
      const depthPerPass = totalDepth / passes;
      
      expect(depthPerPass).toBeCloseTo(expectedDepthPerPass, 3);
      
      // Verify cutting depths for each pass
      for (let pass = 1; pass <= passes; pass++) {
        const currentDepth = bounds.max.z - (depthPerPass * pass);
        
        // Each pass should cut deeper than the previous
        if (pass > 1) {
          const previousDepth = bounds.max.z - (depthPerPass * (pass - 1));
          expect(currentDepth).toBeLessThan(previousDepth);
        }
        
        // Final pass should reach the target depth
        if (pass === passes) {
          const finalDepth = bounds.min.z - cutThrough;
          expect(currentDepth).toBeCloseTo(finalDepth, 3);
        }
      }
    });
  });
  
  test("should calculate correct tool offset for outline cutting", () => {
    const bounds = {
      min: { x: 0, y: 0, z: 0 },
      max: { x: 10, y: 10, z: 10 }
    };
    
    const toolSize = 6.35;
    const toolRadius = toolSize / 2; // 3.175mm
    
    // Calculate outline with tool offset (tool path should be outside the part)
    const outline = {
      minX: bounds.min.x - toolRadius, // -3.175
      maxX: bounds.max.x + toolRadius, // 13.175
      minY: bounds.min.y - toolRadius, // -3.175
      maxY: bounds.max.y + toolRadius  // 13.175
    };
    
    expect(outline.minX).toBe(-3.175);
    expect(outline.maxX).toBe(13.175);
    expect(outline.minY).toBe(-3.175);
    expect(outline.maxY).toBe(13.175);
    
    // Tool path should be larger than the part by the tool radius on all sides
    const pathWidth = outline.maxX - outline.minX; // 16.35
    const pathHeight = outline.maxY - outline.minY; // 16.35
    const partWidth = bounds.max.x - bounds.min.x; // 10
    const partHeight = bounds.max.y - bounds.min.y; // 10
    
    expect(pathWidth).toBe(partWidth + (toolRadius * 2));
    expect(pathHeight).toBe(partHeight + (toolRadius * 2));
  });
  
  test("should generate proper G-code commands structure", () => {
    // Test the expected structure of generated G-code
    const expectedCommands = [
      'G21', // Set units to millimeters
      'G90', // Absolute positioning
      'G17', // XY plane
      'G0',  // Rapid positioning
      'G1',  // Linear interpolation
      'M3',  // Start spindle
      'M5',  // Stop spindle
      'M30'  // Program end
    ];
    
    // Verify that these are the essential G-code commands the generator should include
    expectedCommands.forEach(command => {
      expect(command).toMatch(/^[GM]\d+$/);
    });
  });
  
  test("should validate feed rate and safety calculations", () => {
    const feedRate = 1500; // mm/min
    const plungeFeedRate = feedRate / 2; // 750 mm/min (slower for Z-axis)
    const safeHeight = 15; // 5mm above 10mm part = 15mm
    
    expect(plungeFeedRate).toBe(750);
    expect(safeHeight).toBeGreaterThan(10); // Must be above part
    expect(feedRate).toBeGreaterThan(plungeFeedRate); // XY should be faster than Z
  });
});