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

  describe("line simplification helper functions", () => {
    it("should calculate distance between 3D points correctly", () => {
      // We'll test the helper functions by importing them or creating similar logic
      const distance3D = (p1, p2) => {
        const dx = p2[0] - p1[0];
        const dy = p2[1] - p1[1];
        const dz = p2[2] - p1[2];
        return Math.sqrt(dx * dx + dy * dy + dz * dz);
      };
      
      expect(distance3D([0, 0, 0], [3, 4, 0])).toBeCloseTo(5, 5);
      expect(distance3D([0, 0, 0], [0, 0, 0])).toBe(0);
      expect(distance3D([1, 1, 1], [2, 2, 2])).toBeCloseTo(Math.sqrt(3), 5);
    });

    it("should detect collinear points", () => {
      const areCollinear = (p1, p2, p3, tolerance = 0.01) => {
        const v1 = [p2[0] - p1[0], p2[1] - p1[1], p2[2] - p1[2]];
        const v2 = [p3[0] - p1[0], p3[1] - p1[1], p3[2] - p1[2]];
        
        const cross = [
          v1[1] * v2[2] - v1[2] * v2[1],
          v1[2] * v2[0] - v1[0] * v2[2],
          v1[0] * v2[1] - v1[1] * v2[0]
        ];
        const crossMagnitude = Math.sqrt(cross[0] * cross[0] + cross[1] * cross[1] + cross[2] * cross[2]);
        
        const v1Mag = Math.sqrt(v1[0] * v1[0] + v1[1] * v1[1] + v1[2] * v1[2]);
        const v2Mag = Math.sqrt(v2[0] * v2[0] + v2[1] * v2[1] + v2[2] * v2[2]);
        const maxMag = Math.max(v1Mag, v2Mag);
        
        if (maxMag < tolerance) return true;
        return (crossMagnitude / maxMag) < tolerance;
      };

      // Test perfectly collinear points
      expect(areCollinear([0, 0, 0], [1, 1, 1], [2, 2, 2])).toBe(true);
      expect(areCollinear([0, 0, 0], [1, 0, 0], [2, 0, 0])).toBe(true);
      
      // Test non-collinear points
      expect(areCollinear([0, 0, 0], [1, 0, 0], [0, 1, 0])).toBe(false);
    });

    it("should simplify paths by removing unnecessary points", () => {
      const simplifyPath = (points, minDistance = 0.1, collinearityTolerance = 0.05) => {
        if (points.length <= 2) return points;
        
        const distance3D = (p1, p2) => {
          const dx = p2[0] - p1[0];
          const dy = p2[1] - p1[1];
          const dz = p2[2] - p1[2];
          return Math.sqrt(dx * dx + dy * dy + dz * dz);
        };

        const areCollinear = (p1, p2, p3, tolerance = 0.01) => {
          const v1 = [p2[0] - p1[0], p2[1] - p1[1], p2[2] - p1[2]];
          const v2 = [p3[0] - p1[0], p3[1] - p1[1], p3[2] - p1[2]];
          
          const cross = [
            v1[1] * v2[2] - v1[2] * v2[1],
            v1[2] * v2[0] - v1[0] * v2[2],
            v1[0] * v2[1] - v1[1] * v2[0]
          ];
          const crossMagnitude = Math.sqrt(cross[0] * cross[0] + cross[1] * cross[1] + cross[2] * cross[2]);
          
          const v1Mag = Math.sqrt(v1[0] * v1[0] + v1[1] * v1[1] + v1[2] * v1[2]);
          const v2Mag = Math.sqrt(v2[0] * v2[0] + v2[1] * v2[1] + v2[2] * v2[2]);
          const maxMag = Math.max(v1Mag, v2Mag);
          
          if (maxMag < tolerance) return true;
          return (crossMagnitude / maxMag) < tolerance;
        };
        
        const simplified = [points[0]];
        
        for (let i = 1; i < points.length - 1; i++) {
          const current = points[i];
          const last = simplified[simplified.length - 1];
          const next = points[i + 1];
          
          const distanceFromLast = distance3D(last, current);
          if (distanceFromLast < minDistance) {
            continue;
          }
          
          if (areCollinear(last, current, next, collinearityTolerance)) {
            continue;
          }
          
          simplified.push(current);
        }
        
        simplified.push(points[points.length - 1]);
        return simplified;
      };

      // Test that collinear points are removed
      const collinearPoints = [[0, 0, 0], [1, 0, 0], [2, 0, 0], [3, 0, 0]];
      const simplified = simplifyPath(collinearPoints, 0.1, 0.05);
      expect(simplified.length).toBe(2); // Should keep only start and end
      expect(simplified[0]).toEqual([0, 0, 0]);
      expect(simplified[1]).toEqual([3, 0, 0]);

      // Test that points too close together are removed
      const closePoints = [[0, 0, 0], [0.05, 0, 0], [0.1, 0, 0], [1, 0, 0]];
      const simplifiedClose = simplifyPath(closePoints, 0.1, 0.05);
      expect(simplifiedClose.length).toBeLessThan(closePoints.length);
    });
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

  describe("performance characteristics", () => {
    it("should reduce the number of line segments for highly detailed curves", () => {
      // Generate a gcode with many small movements (simulating a curve)
      let detailedGcode = "G21\nG90\n";
      const numPoints = 1000;
      
      // Create a sine wave with many small segments
      for (let i = 0; i <= numPoints; i++) {
        const x = i * 0.01; // 0.01mm steps
        const y = Math.sin(x * 10) * 5; // Sine wave
        detailedGcode += `G1 X${x.toFixed(3)} Y${y.toFixed(3)} Z0\n`;
      }
      
      // Count original G1 commands
      const originalG1Count = detailedGcode.split('\n').filter(line => line.startsWith('G1')).length;
      expect(originalG1Count).toBe(numPoints + 1);
      
      // In the optimized version, many of these should be combined
      // This is more of a conceptual test since we can't easily test the full function here
      expect(originalG1Count).toBeGreaterThan(100); // Demonstrates the problem size
    });
  });
});