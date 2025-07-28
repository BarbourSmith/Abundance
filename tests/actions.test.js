import { extrude, move, rotate } from "../src/worker/actions.js";
import { rectangle } from "../src/worker/shapes.js";
import { init, is3D, defaultColor } from "../src/worker/util.js";

function vectorEquals(vector, x, y, z) {
  expect(vector.x).toEqual(x);
  expect(vector.y).toEqual(y);
  expect(vector.z).toEqual(z);
}

describe("shapes.js", () => {
  beforeAll(async () => {
    await init();
  });

  describe("move", () => {
    it("should move 2d shape in 3 dimensions", async () => {
      const width = 80;
      const height = 5;
      const moveX = 3;
      const moveY = 9.3;
      const moveZ = 2;

      // Create a rectangle
      const rect = await rectangle(width, height);

      // Move it
      const result = await move(rect, moveX, moveY, moveZ);

      // Verify input was not destroyed
      expect(rect).toBeDefined();
      expect(rect.geometry).toHaveLength(1);
      const initialBoundingBox = rect.geometry[0].boundingBox;

      // Verify move in the xy plane.
      expect(result).toBeDefined();
      expect(result.geometry).toHaveLength(1);
      const movedBoundingBox = result.geometry[0].boundingBox;

      expect(movedBoundingBox.width).toBeCloseTo(initialBoundingBox.width, 4);
      expect(movedBoundingBox.height).toBeCloseTo(initialBoundingBox.height, 4);
      expect(movedBoundingBox.center[0]).toBeCloseTo(
        initialBoundingBox.center[0] + moveX,
        4
      );
      expect(movedBoundingBox.center[1]).toBeCloseTo(
        initialBoundingBox.center[1] + moveY,
        4
      );

      // Verify the Z movement was applied to the plane.
      vectorEquals(result.plane.origin, 0, 0, moveZ);
    });
    // TODO: add tests for moving a 3d object
    // TODO: add test for moving a 2d object in 3 dimension after it's plane has been rotated.
  });

  describe("rotate", () => {
    it("simple 2D rotation within plane", async () => {
      const width = 80;
      const height = 5;

      // Create a rectangle
      const rect = await rectangle(width, height);

      // Move it
      const result = await rotate(rect, 0, 0, 90);

      // Verify input was not destroyed
      expect(rect).toBeDefined();
      expect(rect.geometry).toHaveLength(1);
      const initialBoundingBox = rect.geometry[0].boundingBox;

      // Verify was rotated in degrees.
      const movedBoundingBox = result.geometry[0].boundingBox;

      expect(movedBoundingBox.width).toBeCloseTo(initialBoundingBox.height, 4);
      expect(movedBoundingBox.height).toBeCloseTo(initialBoundingBox.width, 4);
    });
    // TODO: add test for rotation a 2D object around other axes
    // TODO: add test for rottating 3d object.
  });
});
