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
    
    it("understand how 2D geometry bounding boxes work with planes", async () => {
      const { circle } = await import("../src/worker/shapes.js");
      const originalCircle = await circle(10);
      console.log("Original circle bounding box center:", originalCircle.geometry[0].boundingBox.center);
      
      const original3D = originalCircle.geometry[0].sketchOnPlane(originalCircle.plane);
      console.log("Original circle 3D:", original3D);
      if (original3D && original3D.boundingBox) {
        console.log("Original circle 3D bounding box center:", original3D.boundingBox.center);
      }
      
      const rotatedCircle = await rotate(originalCircle, 0, 45, 0);
      console.log("Rotated circle bounding box center:", rotatedCircle.geometry[0].boundingBox.center);
      
      const rotated3D = rotatedCircle.geometry[0].sketchOnPlane(rotatedCircle.plane);
      console.log("Rotated circle 3D:", rotated3D);
      if (rotated3D && rotated3D.boundingBox) {
        console.log("Rotated circle 3D bounding box center:", rotated3D.boundingBox.center);
      }
      
      const movedCircle = await move(rotatedCircle, 10, 0, 0);
      console.log("Moved circle bounding box center:", movedCircle.geometry[0].boundingBox.center);
      
      const moved3D = movedCircle.geometry[0].sketchOnPlane(movedCircle.plane);
      console.log("Moved circle 3D:", moved3D);
      if (moved3D && moved3D.boundingBox) {
        console.log("Moved circle 3D bounding box center:", moved3D.boundingBox.center);
      }
      
      // For now, just check that the sketchOnPlane returns something valid
      expect(rotated3D).toBeDefined();
      expect(moved3D).toBeDefined();
    });
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
