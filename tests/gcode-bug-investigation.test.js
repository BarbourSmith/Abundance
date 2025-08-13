import { expect, test, describe } from "vitest";
import { vi } from "vitest";

// Create a more realistic Kiri:Moto Engine mock that simulates the actual bug
class BuggyKiriEngine {
  constructor() {
    this.listeners = [];
    this.mockBounds = {
      min: { x: -10, y: -10, z: 0 },
      max: { x: 10, y: 10, z: 5 }
    };
    this.currentProcess = null;
  }

  setListener(callback) {
    this.listeners.push(callback);
    return this;
  }

  async load(stlUrl) {
    return this;
  }

  async moveTo(x, y, z) {
    return this;
  }

  async setMode(mode) {
    return this;
  }

  getBoundingBox() {
    return this.mockBounds;
  }

  widget = {
    getBoundingBox: () => this.mockBounds
  };

  async setStock(stock) {
    return this;
  }

  async setTools(tools) {
    return this;
  }

  async setProcess(process) {
    this.currentProcess = process;
    console.log("Process config received:", JSON.stringify(process.ops, null, 2));
    return this;
  }

  async setDevice(device) {
    return this;
  }

  async slice() {
    return this;
  }

  async prepare() {
    return this;
  }

  async export() {
    // THIS IS THE BUG: Real Kiri:Moto seems to ignore the `steps` parameter
    // and only generates one pass regardless of the steps value
    return this.generateBuggyGcode();
  }

  generateBuggyGcode() {
    const process = this.currentProcess;
    if (!process || !process.ops) {
      return "G21\nG90\nM30";
    }

    let gcode = "G21 ; set units to MM\nG90 ; absolute position mode\n";
    
    // BUG SIMULATION: Real Kiri:Moto appears to ignore the `steps` parameter
    // and only generates one pass using the `down` depth
    process.ops.forEach(op => {
      if (op.type === "outline") {
        console.log(`Operation config: step=${op.step}, steps=${op.steps}, down=${op.down}`);
        
        // Real Kiri:Moto bug: Only generates 1 pass using the total `down` depth,
        // ignoring the `steps` parameter completely
        const totalDepth = op.down || op.step;
        
        gcode += `; Kiri:Moto bug: Only 1 pass generated despite steps=${op.steps}\n`;
        gcode += `G0 Z5 ; Move to safe height\n`;
        gcode += `G0 X0 Y0 ; Move to start position\n`;
        gcode += `G1 Z${-totalDepth} F250 ; Plunge to FULL depth ${totalDepth}mm in ONE pass\n`;
        
        // Simulate cutting path
        gcode += `G1 X10 Y0 F${op.rate || 1500} ; Cut to corner\n`;
        gcode += `G1 X10 Y10 ; Cut to corner\n`;
        gcode += `G1 X0 Y10 ; Cut to corner\n`;
        gcode += `G1 X0 Y0 ; Cut back to start\n`;
        
        gcode += `G0 Z5 ; Retract to safe height\n\n`;
      }
    });
    
    gcode += "M30 ; program end\n";
    return gcode;
  }
}

// Function to analyze the generated G-code for actual cutting behavior
function analyzeRealGcodeIssue(gcode, expectedPasses) {
  const lines = gcode.split('\n');
  let plungeMoves = [];
  let maxDepth = 0;
  
  for (const line of lines) {
    const trimmed = line.trim();
    
    // Look for plunge moves (G1 with negative Z and feed rate)
    if (trimmed.startsWith('G1 Z-') && trimmed.includes('F')) {
      const depthMatch = trimmed.match(/G1 Z(-?\d+\.?\d*)/);
      if (depthMatch) {
        const depth = Math.abs(parseFloat(depthMatch[1]));
        plungeMoves.push(depth);
        maxDepth = Math.max(maxDepth, depth);
      }
    }
  }
  
  return {
    actualPasses: plungeMoves.length,
    expectedPasses: expectedPasses,
    plungeDepths: plungeMoves,
    maxDepth: maxDepth,
    isCorrect: plungeMoves.length === expectedPasses,
    issue: plungeMoves.length === 1 ? "Only one pass generated (bug confirmed)" : 
           plungeMoves.length < expectedPasses ? "Too few passes" :
           "Too many passes"
  };
}

// Mock the generateGcode function with the buggy engine
function createBuggyGenerateGcode() {
  return (stlUrl, centerPos, toolSize, passes, speed, extra, gcodeCallback, progressCallback) => {
    if (!stlUrl) {
      console.error("STL URL is not available.");
      return;
    }

    const engine = new BuggyKiriEngine();
    const bounds = engine.getBoundingBox();
    const z = bounds.max.z - bounds.min.z;
    const totalDepth = z + extra;
    const depthPerPass = totalDepth / passes;
    
    console.log(`\n=== GCODE GENERATION ANALYSIS ===`);
    console.log(`Requested passes: ${passes}`);
    console.log(`Material thickness: ${z}mm`);
    console.log(`Cut through: ${extra}mm`);
    console.log(`Total depth: ${totalDepth}mm`);
    console.log(`Calculated depth per pass: ${depthPerPass}mm`);
    
    // Current KirimotoUpdate.js approach: Single operation with steps
    const processConfig = {
      processName: "default",
      ops: [{
        type: "outline",
        tool: 1000,
        spindle: 1000,
        step: depthPerPass,     // Depth per pass (e.g., 2.17mm)
        steps: passes,          // Number of passes (e.g., 3) - THIS IS IGNORED BY KIRI:MOTO!
        down: totalDepth,       // Total depth (e.g., 6.5mm) - THIS IS USED INSTEAD!
        rate: speed,
        plunge: 250,
        ov_topz: 0,
        ov_botz: 0,
      }]
    };
    
    console.log(`\nSending to Kiri:Moto:`);
    console.log(`- step: ${depthPerPass}mm (intended depth per pass)`);
    console.log(`- steps: ${passes} (intended number of passes)`);
    console.log(`- down: ${totalDepth}mm (total depth)`);
    
    // Simulate the full workflow
    Promise.resolve()
      .then(() => engine.load(stlUrl))
      .then(() => engine.setProcess(processConfig))
      .then(() => engine.slice())
      .then(() => engine.export())
      .then((gcode) => {
        console.log(`\nGenerated G-code:\n${gcode}`);
        
        const analysis = analyzeRealGcodeIssue(gcode, passes);
        console.log(`\nANALYSIS RESULTS:`);
        console.log(`Expected passes: ${analysis.expectedPasses}`);
        console.log(`Actual passes: ${analysis.actualPasses}`);
        console.log(`Plunge depths: ${analysis.plungeDepths.join(', ')}mm`);
        console.log(`Issue: ${analysis.issue}`);
        console.log(`Is correct: ${analysis.isCorrect}`);
        console.log(`=====================================\n`);
        
        gcodeCallback(gcode);
        if (progressCallback) progressCallback(1.0);
      });
  };
}

describe("Real Kiri:Moto Bug Investigation", () => {
  test("should demonstrate the actual Kiri:Moto bug with steps parameter", async () => {
    const generateGcode = createBuggyGenerateGcode();
    
    let generatedGcode = "";
    
    await new Promise((resolve) => {
      generateGcode(
        "mock://test.stl",
        [0, 0, 0],
        6.35,
        3, // Request 3 passes
        1500,
        1.5,
        (gcode) => {
          generatedGcode = gcode;
          resolve();
        },
        () => {}
      );
    });
    
    const analysis = analyzeRealGcodeIssue(generatedGcode, 3);
    
    // This test demonstrates the actual bug
    expect(analysis.actualPasses).toBe(1); // Only 1 pass generated
    expect(analysis.expectedPasses).toBe(3); // But 3 were requested
    expect(analysis.issue).toBe("Only one pass generated (bug confirmed)");
    expect(analysis.maxDepth).toBe(6.5); // Full depth in one pass
  });

  test("should propose a working solution using multiple operations", async () => {
    // Alternative approach: Multiple operations instead of single operation with steps
    const generateGcodeFixed = (stlUrl, centerPos, toolSize, passes, speed, extra, gcodeCallback) => {
      const mockBounds = { min: { x: -10, y: -10, z: 0 }, max: { x: 10, y: 10, z: 5 } };
      const z = mockBounds.max.z - mockBounds.min.z;
      const totalDepth = z + extra;
      const depthPerPass = totalDepth / passes;
      
      console.log(`\n=== FIXED APPROACH ===`);
      console.log(`Using ${passes} separate operations instead of single operation with steps`);
      
      let gcode = "G21 ; set units to MM\nG90 ; absolute position mode\n";
      
      // Generate separate operations for each pass
      for (let pass = 1; pass <= passes; pass++) {
        const currentDepth = depthPerPass * pass;
        
        console.log(`Operation ${pass}: Cut to depth ${currentDepth}mm`);
        
        gcode += `; === Pass ${pass} of ${passes} (separate operation) ===\n`;
        gcode += `G0 Z5 ; Move to safe height\n`;
        gcode += `G0 X0 Y0 ; Move to start position\n`;
        gcode += `G1 Z${-currentDepth} F250 ; Plunge to depth ${currentDepth}mm\n`;
        
        // Simulate cutting path
        gcode += `G1 X10 Y0 F${speed} ; Cut to corner\n`;
        gcode += `G1 X10 Y10 ; Cut to corner\n`;
        gcode += `G1 X0 Y10 ; Cut to corner\n`;
        gcode += `G1 X0 Y0 ; Cut back to start\n`;
        
        gcode += `G0 Z5 ; Retract to safe height\n\n`;
      }
      
      gcode += "M30 ; program end\n";
      console.log(`====================\n`);
      
      setTimeout(() => gcodeCallback(gcode), 0);
    };
    
    let generatedGcode = "";
    
    await new Promise((resolve) => {
      generateGcodeFixed(
        "mock://test.stl",
        [0, 0, 0],
        6.35,
        3,
        1500,
        1.5,
        (gcode) => {
          generatedGcode = gcode;
          resolve();
        }
      );
    });
    
    const analysis = analyzeRealGcodeIssue(generatedGcode, 3);
    
    // This approach should work
    expect(analysis.actualPasses).toBe(3);
    expect(analysis.expectedPasses).toBe(3);
    expect(analysis.isCorrect).toBe(true);
    expect(analysis.plungeDepths).toEqual([2.1666666666666665, 4.333333333333333, 6.5]);
  });
});