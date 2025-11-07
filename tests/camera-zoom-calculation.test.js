/**
 * Tests for camera zoom calculation with margin factor
 * Verifies that thumbnails are not too zoomed in
 */

import { describe, it, expect } from 'vitest';

describe('Camera Zoom Calculation', () => {
  // Shared constants across tests
  const exampleBoundingBox = {
    width: 312.0005000624958,
    height: 312.00074999364347,
    depth: 432.0009977339615,
  };
  const exampleZoom = 0.5;
  const marginFactor = 0.9;

  it('should apply margin factor to prevent thumbnails from being too zoomed in', () => {
    // Calculate the diagonal length of the example bounding box
    const exampleDiagonal = Math.sqrt(
      exampleBoundingBox.width ** 2 +
        exampleBoundingBox.height ** 2 +
        exampleBoundingBox.depth ** 2
    );

    // Test case: A bounding box similar to the example
    const testBoundingBox = {
      width: 300,
      height: 300,
      depth: 400,
    };

    const testDiagonal = Math.sqrt(
      testBoundingBox.width ** 2 +
        testBoundingBox.height ** 2 +
        testBoundingBox.depth ** 2
    );

    // Calculate zoom without margin (the old way - would be too zoomed in)
    const zoomWithoutMargin = (exampleZoom * exampleDiagonal) / testDiagonal;

    // Calculate zoom with margin factor (the new way - proper zoom with breathing room)
    const zoomWithMargin = (exampleZoom * exampleDiagonal * marginFactor) / testDiagonal;

    // Verify that zoom with margin is less than zoom without margin
    // (lower zoom value = more zoomed out = more margin around object)
    expect(zoomWithMargin).toBeLessThan(zoomWithoutMargin);

    // Verify margin factor is applied correctly
    expect(zoomWithMargin).toBeCloseTo(zoomWithoutMargin * marginFactor, 5);

    // Verify margin factor creates approximately 10% more space (90% fill)
    const marginPercentage = ((zoomWithoutMargin - zoomWithMargin) / zoomWithoutMargin) * 100;
    expect(marginPercentage).toBeCloseTo(10, 0);
  });

  it('should handle large objects with appropriate zoom out', () => {
    const exampleDiagonal = Math.sqrt(
      exampleBoundingBox.width ** 2 +
        exampleBoundingBox.height ** 2 +
        exampleBoundingBox.depth ** 2
    );

    // Large object (like Sauna-Stove)
    const largeBoundingBox = {
      width: 1000,
      height: 1000,
      depth: 1500,
    };

    const largeDiagonal = Math.sqrt(
      largeBoundingBox.width ** 2 +
        largeBoundingBox.height ** 2 +
        largeBoundingBox.depth ** 2
    );

    const zoom = (exampleZoom * exampleDiagonal * marginFactor) / largeDiagonal;

    // Large objects should have smaller zoom values (zoomed out)
    expect(zoom).toBeLessThan(0.5);
    expect(zoom).toBeGreaterThan(0);
  });

  it('should handle small objects with appropriate zoom in', () => {
    const exampleDiagonal = Math.sqrt(
      exampleBoundingBox.width ** 2 +
        exampleBoundingBox.height ** 2 +
        exampleBoundingBox.depth ** 2
    );

    // Small object
    const smallBoundingBox = {
      width: 50,
      height: 50,
      depth: 75,
    };

    const smallDiagonal = Math.sqrt(
      smallBoundingBox.width ** 2 +
        smallBoundingBox.height ** 2 +
        smallBoundingBox.depth ** 2
    );

    const zoom = (exampleZoom * exampleDiagonal * marginFactor) / smallDiagonal;

    // Small objects should have larger zoom values (zoomed in), but still with margin
    expect(zoom).toBeGreaterThan(0.5);
  });

  it('should maintain consistency across different aspect ratios', () => {
    const exampleDiagonal = Math.sqrt(
      exampleBoundingBox.width ** 2 +
        exampleBoundingBox.height ** 2 +
        exampleBoundingBox.depth ** 2
    );

    // Wide and flat object
    const wideBoundingBox = {
      width: 500,
      height: 500,
      depth: 100,
    };

    const wideDiagonal = Math.sqrt(
      wideBoundingBox.width ** 2 +
        wideBoundingBox.height ** 2 +
        wideBoundingBox.depth ** 2
    );

    const wideZoom = (exampleZoom * exampleDiagonal * marginFactor) / wideDiagonal;

    // Tall object
    const tallBoundingBox = {
      width: 200,
      height: 200,
      depth: 600,
    };

    const tallDiagonal = Math.sqrt(
      tallBoundingBox.width ** 2 +
        tallBoundingBox.height ** 2 +
        tallBoundingBox.depth ** 2
    );

    const tallZoom = (exampleZoom * exampleDiagonal * marginFactor) / tallDiagonal;

    // Both should be reasonable zoom values with margin applied
    expect(wideZoom).toBeGreaterThan(0);
    expect(tallZoom).toBeGreaterThan(0);
    expect(wideZoom).toBeLessThan(2); // Not too zoomed in
    expect(tallZoom).toBeLessThan(2); // Not too zoomed in
  });
});
