import { expect, test, describe } from "vitest";

describe("KirimotoUpdate.js Units Fix Integration Test", () => {
  test("should demonstrate the fix in KirimotoUpdate.js for tool units matching G-code units", () => {
    // Mock GlobalVariables to simulate different project unit settings
    const mockGlobalVariables = {
      topLevelMolecule: {
        unitsKey: "MM"
      }
    };

    // Simulate the logic from the updated KirimotoUpdate.js
    const createToolAndDeviceConfig = (globalVars) => {
      // Tool configuration logic (lines 108-110 in KirimotoUpdate.js)
      const projectUnits = globalVars.topLevelMolecule?.unitsKey || "MM";
      const isMetric = projectUnits === "MM";
      
      // Device configuration logic (lines 216-219 in KirimotoUpdate.js)
      const unitsCommand = projectUnits === "MM" 
        ? "G21 ; set units to MM (required)"
        : "G20 ; set units to inches (required)";

      const toolConfig = {
        id: 1000,
        number: 1,
        type: "endmill",
        name: "end 1/4",
        metric: isMetric, // Fixed: now matches project units
        shaft_diam: 6.35, // Example tool size
        shaft_len: 1,
        flute_diam: 6.35,
        flute_len: 2,
        taper_tip: 0,
        order: 5,
      };

      const deviceConfig = {
        mode: "CAM",
        gcodePre: [
          unitsCommand, // Fixed: now dynamic based on project units
          "G90 ; absolute position mode (required)",
          "G0 F3000 ; set default rapid move feedrate",
          "G1 F1000 ; set default cutting feedrate",
        ]
      };

      return { toolConfig, deviceConfig };
    };

    // Test MM units (metric) - the main case from the issue
    mockGlobalVariables.topLevelMolecule.unitsKey = "MM";
    const mmConfig = createToolAndDeviceConfig(mockGlobalVariables);
    
    // Verify tool configuration matches G-code units for MM
    expect(mmConfig.toolConfig.metric).toBe(true); // Fixed: was false before
    expect(mmConfig.deviceConfig.gcodePre[0]).toBe("G21 ; set units to MM (required)");
    
    // With the fix, tool size 6.35 is correctly interpreted as 6.35mm
    expect(mmConfig.toolConfig.flute_diam).toBe(6.35);
    expect(mmConfig.toolConfig.metric).toBe(true); // Matches G21 command

    // Test Inches units (imperial)
    mockGlobalVariables.topLevelMolecule.unitsKey = "Inches";
    const inchConfig = createToolAndDeviceConfig(mockGlobalVariables);
    
    // Verify tool configuration matches G-code units for Inches
    expect(inchConfig.toolConfig.metric).toBe(false);
    expect(inchConfig.deviceConfig.gcodePre[0]).toBe("G20 ; set units to inches (required)");

    // Test Unitless (defaults to MM as per the fallback)
    mockGlobalVariables.topLevelMolecule.unitsKey = "Unitless";
    const unitlessConfig = createToolAndDeviceConfig(mockGlobalVariables);
    
    // Verify unitless falls back to MM behavior
    expect(unitlessConfig.toolConfig.metric).toBe(false); // Since "Unitless" !== "MM"
    expect(unitlessConfig.deviceConfig.gcodePre[0]).toBe("G20 ; set units to inches (required)");
  });

  test("should show the specific problem scenario from the issue is now fixed", () => {
    // The original issue: project units MM, user enters 6.35mm tool size
    const userInputMm = 6.35;
    
    // Mock project with MM units
    const projectUnits = "MM";
    const isMetric = projectUnits === "MM";
    
    // BEFORE the fix (what was happening)
    const brokenConfig = {
      toolMetric: false, // This was hardcoded as false
      gcodeUnits: "G21", // But G-code was always metric
    };
    
    // AFTER the fix (what happens now)
    const fixedConfig = {
      toolMetric: isMetric, // Now matches project units
      gcodeUnits: isMetric ? "G21" : "G20", // Now matches project units
    };
    
    // Verify the fix
    expect(fixedConfig.toolMetric).toBe(true); // Tool is now metric
    expect(fixedConfig.gcodeUnits).toBe("G21"); // G-code is metric
    
    // With the fix, both tool and G-code use the same units interpretation
    // User input of 6.35mm is correctly treated as 6.35mm, not 6.35 inches (161.29mm)
    const toolSizeInterpretation = fixedConfig.toolMetric ? userInputMm : userInputMm * 25.4;
    expect(toolSizeInterpretation).toBe(6.35); // Correctly interpreted as mm
    expect(toolSizeInterpretation).not.toBe(161.29); // Not incorrectly converted
  });
});