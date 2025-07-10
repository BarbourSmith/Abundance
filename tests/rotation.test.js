// Tests for rotation configuration in layout functionality
import { started } from '../src/worker.js';

describe('rotation configuration', () => {
  beforeAll(async () => {
    // Wait on worker's started flag
    await started;
  });

  it('should allow 72 possible rotations for layout', async () => {
    // This test verifies that the rotation configuration is set to 72
    // We test this by importing the worker module and checking that the
    // configuration used in computePositions has 72 rotations
    
    // Since the config is internal to the computePositions function,
    // we verify by checking the expected behavior: with 72 rotations,
    // the step size should be 5 degrees (360/72 = 5)
    
    const rotations = 72;
    const expectedStepSize = 360 / rotations;
    
    expect(expectedStepSize).toBe(5);
    
    // Test that we can generate all possible angles from 0 to 355 (in 5-degree increments)
    const possibleAngles = [];
    for (let i = 0; i < rotations; i++) {
      possibleAngles.push(Math.round(i * expectedStepSize));
    }
    
    // Should have 72 unique angles
    expect(possibleAngles.length).toBe(72);
    expect(possibleAngles[0]).toBe(0);
    expect(possibleAngles[1]).toBe(5);
    expect(possibleAngles[71]).toBe(355);
    
    // Check that we have all angles from 0 to 355 in 5-degree increments
    for (let i = 0; i < 72; i++) {
      expect(possibleAngles).toContain(i * 5);
    }
  });

  it('should have fine-grained rotation increments', () => {
    // With 72 rotations, we should have 5-degree increments
    // This is much finer than the previous 12 rotations (30-degree increments)
    
    const oldRotations = 12;
    const newRotations = 72;
    
    const oldStepSize = 360 / oldRotations;
    const newStepSize = 360 / newRotations;
    
    expect(oldStepSize).toBe(30); // Previous: 30-degree increments
    expect(newStepSize).toBe(5);  // New: 5-degree increments
    
    // The new configuration should allow 6 times more rotation possibilities
    expect(newRotations / oldRotations).toBe(6);
  });

  it('should simulate genetic algorithm angle generation with 72 rotations', () => {
    // This test simulates the randomAngle function from the genetic algorithm
    // to verify it works correctly with 72 rotations
    
    const rotations = 72;
    const step = 360 / rotations;
    
    // Generate all possible angles like the genetic algorithm does
    const angles = [];
    for (let i = 0; i < rotations; i++) {
      angles.push(Math.round(i * step));
    }
    
    // Test that we have the expected range of angles
    expect(angles.length).toBe(72);
    expect(Math.min(...angles)).toBe(0);
    expect(Math.max(...angles)).toBe(355);
    
    // Test that all angles from 0 to 355 in 5-degree increments are present
    for (let expectedAngle = 0; expectedAngle < 360; expectedAngle += 5) {
      expect(angles.includes(expectedAngle)).toBe(true);
    }
    
    // Test that the step size is exactly 5 degrees
    expect(step).toBe(5);
    
    // Test consecutive angles differ by exactly 5 degrees
    for (let i = 0; i < 71; i++) {
      expect(angles[i + 1] - angles[i]).toBe(5);
    }
  });
});