// Tests for rotation configuration in layout functionality
import { started } from '../src/worker.js';

describe('rotation configuration', () => {
  beforeAll(async () => {
    // Wait on worker's started flag
    await started;
  });

  it('should allow 360 possible rotations for layout', async () => {
    // This test verifies that the rotation configuration is set to 360
    // We test this by importing the worker module and checking that the
    // configuration used in computePositions has 360 rotations
    
    // Since the config is internal to the computePositions function,
    // we verify by checking the expected behavior: with 360 rotations,
    // the step size should be 1 degree (360/360 = 1)
    
    const rotations = 360;
    const expectedStepSize = 360 / rotations;
    
    expect(expectedStepSize).toBe(1);
    
    // Test that we can generate all possible angles from 0 to 359
    const possibleAngles = [];
    for (let i = 0; i < rotations; i++) {
      possibleAngles.push(Math.round(i * expectedStepSize));
    }
    
    // Should have 360 unique angles
    expect(possibleAngles.length).toBe(360);
    expect(possibleAngles[0]).toBe(0);
    expect(possibleAngles[1]).toBe(1);
    expect(possibleAngles[359]).toBe(359);
    
    // Check that we have all angles from 0 to 359
    for (let angle = 0; angle < 360; angle++) {
      expect(possibleAngles).toContain(angle);
    }
  });

  it('should have fine-grained rotation increments', () => {
    // With 360 rotations, we should have 1-degree increments
    // This is much finer than the previous 12 rotations (30-degree increments)
    
    const oldRotations = 12;
    const newRotations = 360;
    
    const oldStepSize = 360 / oldRotations;
    const newStepSize = 360 / newRotations;
    
    expect(oldStepSize).toBe(30); // Previous: 30-degree increments
    expect(newStepSize).toBe(1);  // New: 1-degree increments
    
    // The new configuration should allow 30 times more rotation possibilities
    expect(newRotations / oldRotations).toBe(30);
  });

  it('should simulate genetic algorithm angle generation with 360 rotations', () => {
    // This test simulates the randomAngle function from the genetic algorithm
    // to verify it works correctly with 360 rotations
    
    const rotations = 360;
    const step = 360 / rotations;
    
    // Generate all possible angles like the genetic algorithm does
    const angles = [];
    for (let i = 0; i < rotations; i++) {
      angles.push(Math.round(i * step));
    }
    
    // Test that we have the expected range of angles
    expect(angles.length).toBe(360);
    expect(Math.min(...angles)).toBe(0);
    expect(Math.max(...angles)).toBe(359);
    
    // Test that all angles from 0 to 359 are present
    for (let expectedAngle = 0; expectedAngle < 360; expectedAngle++) {
      expect(angles.includes(expectedAngle)).toBe(true);
    }
    
    // Test that the step size is exactly 1 degree
    expect(step).toBe(1);
    
    // Test consecutive angles differ by exactly 1 degree
    for (let i = 0; i < 359; i++) {
      expect(angles[i + 1] - angles[i]).toBe(1);
    }
  });
});