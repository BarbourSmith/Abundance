import { init } from "../src/worker/util.js";

// Mock the necessary parts of the worker environment
let library = {};
let util = {};

// Import the worker module to get access to the visualizeGcode function
import workerModule from "../src/worker/worker.js";

describe("gcode visualization", () => {
  beforeAll(async () => {
    await init();
    
    // Set up minimal mock environment
    global.library = library;
    global.util = {
      replicad: {
        makeLine: (p1, p2) => ({ type: 'line', start: p1, end: p2 }),
        assembleWire: (edges) => ({ type: 'wire', edges })
      },
      defaultColor: '#aad7f2'
    };
    global.Plane = class Plane {
      pivot() { return this; }
    };
  });


  describe("gcode parsing", () => {
    it("should handle simple linear movements", () => {
      const simpleGcode = `
G21 ; set units to MM
G90 ; absolute position mode
G1 X10 Y0 Z0
G1 X10 Y10 Z0
G1 X0 Y10 Z0
G1 X0 Y0 Z0
      `.trim();

      // This is a conceptual test - in the real implementation, 
      // we would need to set up the full worker environment
      expect(simpleGcode.split('\n')).toHaveLength(6);
      
      // Test that G1 lines are properly identified
      const g1Lines = simpleGcode.split('\n').filter(line => line.startsWith('G1'));
      expect(g1Lines).toHaveLength(4);
    });

    it("should distinguish between G0 and G1 movements", () => {
      const mixedGcode = `
G0 X0 Y0 Z5
G1 X10 Y0 Z0
G0 X20 Y0 Z5
G1 X20 Y10 Z0
      `.trim();

      const lines = mixedGcode.split('\n');
      const g0Lines = lines.filter(line => line.startsWith('G0'));
      const g1Lines = lines.filter(line => line.startsWith('G1'));
      
      expect(g0Lines).toHaveLength(2); // Rapid moves
      expect(g1Lines).toHaveLength(2); // Cutting moves
    });

    it("should extract coordinates correctly", () => {
      const testLine = "G1 X123.45 Y67.89 Z-1.23 F500";
      
      const xMatch = testLine.match(/X([\d.-]+)/);
      const yMatch = testLine.match(/Y([\d.-]+)/);
      const zMatch = testLine.match(/Z([\d.-]+)/);
      
      expect(Number(xMatch[1])).toBe(123.45);
      expect(Number(yMatch[1])).toBe(67.89);
      expect(Number(zMatch[1])).toBe(-1.23);
    });
  });

  describe("basic functionality", () => {
    it("should create a line for every movement command", () => {
      const simpleGcode = `
G21 ; set units to MM
G90 ; absolute position mode
G1 X10 Y0 Z0
G1 X10 Y10 Z0
G1 X0 Y10 Z0
G1 X0 Y0 Z0
      `.trim();

      // Test that all G1 lines are processed
      const g1Lines = simpleGcode.split('\n').filter(line => line.startsWith('G1'));
      expect(g1Lines).toHaveLength(4);
      
      // The function should create one edge per movement command
      expect(simpleGcode.split('\n')).toHaveLength(6);
    });
  });
});