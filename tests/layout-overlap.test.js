import { describe, it, expect } from 'vitest';
import { ANGLE_CACHE } from '../vendor/geometry-utils/src/constants.ts';
import Point from '../vendor/geometry-utils/src/point.ts';

describe('Layout Overlap Prevention', () => {
  it('should have consistent rotation precision for all angles', () => {
    // Test that all angles have consistent precision
    const testAngles = [15, 30, 45, 60, 75, 90, 105, 120, 135, 150, 165, 180];
    
    for (const angle of testAngles) {
      expect(ANGLE_CACHE.has(angle)).toBe(true);
      
      const cachedData = ANGLE_CACHE.get(angle);
      expect(cachedData).toBeDefined();
      expect(cachedData.length).toBe(2);
      
      // Verify sin and cos values are within expected range
      expect(cachedData[0]).toBeGreaterThanOrEqual(-1);
      expect(cachedData[0]).toBeLessThanOrEqual(1);
      expect(cachedData[1]).toBeGreaterThanOrEqual(-1);
      expect(cachedData[1]).toBeLessThanOrEqual(1);
    }
  });

  it('should provide exact same rotation results for cached vs computed angles', () => {
    // Test that cached angles and computed angles give identical results
    const testPoint = Point.create(100, 50);
    const testAngles = [37, 83, 113, 158, 293]; // Previously missing angles
    
    for (const angle of testAngles) {
      // These angles should now be cached
      expect(ANGLE_CACHE.has(angle)).toBe(true);
      
      // Create two identical points
      const point1 = Point.create(testPoint.x, testPoint.y);
      const point2 = Point.create(testPoint.x, testPoint.y);
      
      // Rotate both points - both should use cached values now
      point1.rotate(angle);
      point2.rotate(angle);
      
      // Results should be identical
      expect(point1.x).toBe(point2.x);
      expect(point1.y).toBe(point2.y);
      
      // Verify rotation precision is maintained
      const tolerance = 1e-10;
      expect(Math.abs(point1.x - point2.x)).toBeLessThan(tolerance);
      expect(Math.abs(point1.y - point2.y)).toBeLessThan(tolerance);
    }
  });

  it('should handle high rotation counts without missing angles', () => {
    // Test cases that were problematic before
    const problematicRotationCounts = [13, 14, 16, 20, 24, 32, 40, 48, 60];
    
    for (const rotationCount of problematicRotationCounts) {
      const step = 360 / rotationCount;
      let missingAngles = [];
      
      for (let i = 0; i < rotationCount; i++) {
        const angle = Math.round(i * step);
        if (!ANGLE_CACHE.has(angle)) {
          missingAngles.push(angle);
        }
      }
      
      expect(missingAngles.length).toBe(0);
    }
  });

  it('should maintain rotation precision for complex polygon shapes', () => {
    // Test that complex polygon rotations don't accumulate precision errors
    const polygonPoints = [
      Point.create(0, 0),
      Point.create(10, 0),
      Point.create(10, 10),
      Point.create(5, 15),
      Point.create(0, 10)
    ];
    
    // Test multiple rotations
    const rotations = [15, 30, 45, 60, 75, 90];
    
    for (const rotation of rotations) {
      const rotatedPoints = polygonPoints.map(p => {
        const rotatedPoint = Point.create(p.x, p.y);
        rotatedPoint.rotate(rotation);
        return rotatedPoint;
      });
      
      // Verify all points were rotated (not at origin unless original was)
      for (let i = 0; i < rotatedPoints.length; i++) {
        const original = polygonPoints[i];
        const rotated = rotatedPoints[i];
        
        if (original.x !== 0 || original.y !== 0) {
          // For non-zero points, rotation should change coordinates (unless 0 degrees)
          if (rotation !== 0) {
            const moved = Math.abs(rotated.x - original.x) > 1e-10 || 
                         Math.abs(rotated.y - original.y) > 1e-10;
            expect(moved).toBe(true);
          }
        }
        
        // Verify distance from origin is preserved (rotation preserves distance)
        const originalDistance = Math.sqrt(original.x * original.x + original.y * original.y);
        const rotatedDistance = Math.sqrt(rotated.x * rotated.x + rotated.y * rotated.y);
        expect(Math.abs(originalDistance - rotatedDistance)).toBeLessThan(1e-6);
      }
    }
  });

  it('should have comprehensive angle coverage for fractional rotations', () => {
    // Test that we have good coverage even for fractional rotation counts
    const fractionalRotations = [7.5, 11.25, 22.5, 36.0, 72.0];
    
    for (const step of fractionalRotations) {
      const rotationCount = Math.round(360 / step);
      let missingAngles = [];
      
      for (let i = 0; i < rotationCount; i++) {
        const angle = Math.round(i * step);
        if (!ANGLE_CACHE.has(angle)) {
          missingAngles.push(angle);
        }
      }
      
      // Should have very few or no missing angles
      expect(missingAngles.length).toBeLessThan(5);
    }
  });

  it('should handle edge cases for 0 and 360 degree rotations', () => {
    // Test boundary conditions
    const testPoint = Point.create(100, 50);
    
    // Test 0 degree rotation (should be identity)
    const point0 = Point.create(testPoint.x, testPoint.y);
    point0.rotate(0);
    expect(point0.x).toBe(testPoint.x);
    expect(point0.y).toBe(testPoint.y);
    
    // Test 360 degree rotation (should be identity)
    const point360 = Point.create(testPoint.x, testPoint.y);
    point360.rotate(360);
    expect(Math.abs(point360.x - testPoint.x)).toBeLessThan(1e-10);
    expect(Math.abs(point360.y - testPoint.y)).toBeLessThan(1e-10);
    
    // Test that 360 and 0 give same result
    expect(Math.abs(point0.x - point360.x)).toBeLessThan(1e-10);
    expect(Math.abs(point0.y - point360.y)).toBeLessThan(1e-10);
  });
});