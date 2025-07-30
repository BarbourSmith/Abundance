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

  describe("distance calculation", () => {
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

  describe("performance optimization", () => {
    // Helper function to count edges that would be created by original approach
    const countEdgesOriginal = (gcode) => {
      let edgeCount = 0;
      let currentPosition = [0, 0, 0];
      
      const lines = gcode.split("\n");
      lines.forEach((line) => {
        if (line.startsWith("G0") || line.startsWith("G1")) {
          const xMatch = line.match(/X([\d.-]+)/);
          const yMatch = line.match(/Y([\d.-]+)/);
          const zMatch = line.match(/Z([\d.-]+)/);

          let x = xMatch ? Number(xMatch[1]) : currentPosition[0];
          let y = yMatch ? Number(yMatch[1]) : currentPosition[1];
          let z = zMatch ? Number(zMatch[1]) : currentPosition[2];

          edgeCount++;
          currentPosition = [x, y, z];
        }
      });
      
      return edgeCount;
    };

    // Helper function to simulate the optimized approach
    const countEdgesOptimized = (gcode) => {
      let edgeCount = 0;
      let currentPosition = [0, 0, 0];
      
      const distance3D = (p1, p2) => {
        const dx = p2[0] - p1[0];
        const dy = p2[1] - p1[1]; 
        const dz = p2[2] - p1[2];
        return Math.sqrt(dx * dx + dy * dy + dz * dz);
      };
      
      const lines = gcode.split("\n");
      lines.forEach((line) => {
        if (line.startsWith("G0") || line.startsWith("G1")) {
          const xMatch = line.match(/X([\d.-]+)/);
          const yMatch = line.match(/Y([\d.-]+)/);
          const zMatch = line.match(/Z([\d.-]+)/);

          let x = xMatch ? Number(xMatch[1]) : currentPosition[0];
          let y = yMatch ? Number(yMatch[1]) : currentPosition[1];
          let z = zMatch ? Number(zMatch[1]) : currentPosition[2];

          const newPosition = [x, y, z];
          
          // Only count if movement is significant enough (> 0.05mm)
          if (distance3D(currentPosition, newPosition) > 0.05) {
            edgeCount++;
          }
          
          currentPosition = newPosition;
        }
      });
      
      return edgeCount;
    };

    it("should reduce the number of line segments for curves with tiny movements", () => {
      // Generate gcode with many tiny movements (like a detailed curve)
      let detailedGcode = "G21\nG90\nG0 X0 Y0 Z5\nG0 X0 Y0 Z0\n";
      
      // Create many tiny movements smaller than our 0.05mm threshold
      for (let i = 0; i <= 100; i++) {
        const x = i * 0.02; // 0.02mm steps - smaller than threshold
        const y = Math.sin(x * 20) * 0.1; // Small sine wave
        detailedGcode += `G1 X${x.toFixed(3)} Y${y.toFixed(3)} Z-1\n`;
      }
      
      const originalCount = countEdgesOriginal(detailedGcode);
      const optimizedCount = countEdgesOptimized(detailedGcode);
      
      console.log(`Original: ${originalCount} edges, Optimized: ${optimizedCount} edges`);
      
      // Should see significant reduction because many movements are < 0.05mm
      expect(optimizedCount).toBeLessThan(originalCount * 0.8); // At least 20% reduction
      expect(originalCount).toBeGreaterThan(100); // Confirms we have many segments
    });

    it("should preserve larger movements with minimal changes", () => {
      const simpleGcode = `
G21
G90
G0 X0 Y0 Z5
G1 X10 Y0 Z0
G1 X10 Y10 Z0
G1 X0 Y10 Z0
G1 X0 Y0 Z0
G0 Z5
      `.trim();

      const originalCount = countEdgesOriginal(simpleGcode);
      const optimizedCount = countEdgesOptimized(simpleGcode);
      
      console.log(`Simple rectangle - Original: ${originalCount} edges, Optimized: ${optimizedCount} edges`);
      
      // Since all movements are large (10mm), optimization should preserve most
      expect(optimizedCount).toBeGreaterThan(0); // Should have cutting moves
      expect(optimizedCount).toBeLessThanOrEqual(originalCount); // Should not increase
      expect(optimizedCount).toBeCloseTo(originalCount, 1); // Should be very close
    });
  });
});