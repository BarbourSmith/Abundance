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
    it("should move 2d shape correctly by translating plane origin", async () => {
      const width = 80;
      const height = 5;
      const moveX = 3;
      const moveY = 9.3;
      const moveZ = 2;

      // Create a rectangle
      const rect = await rectangle(width, height);

      // Move it - this should move the plane origin, not the geometry center
      const result = await move(rect, moveX, moveY, moveZ);

      // Verify input was not destroyed
      expect(rect).toBeDefined();
      expect(rect.geometry).toHaveLength(1);
      
      // With the corrected implementation:
      // - The 2D geometry itself doesn't change (stays at origin of its coordinate system)
      // - The plane origin moves by the specified amount
      // - X,Y movements are in plane-local coordinates, Z movement is in world coordinates
      
      expect(result).toBeDefined();
      expect(result.geometry).toHaveLength(1);
      
      // The 2D geometry center should stay the same relative to its plane
      const initialBoundingBox = rect.geometry[0].boundingBox;
      const movedBoundingBox = result.geometry[0].boundingBox;
      
      expect(movedBoundingBox.width).toBeCloseTo(initialBoundingBox.width, 4);
      expect(movedBoundingBox.height).toBeCloseTo(initialBoundingBox.height, 4);
      expect(movedBoundingBox.center[0]).toBeCloseTo(initialBoundingBox.center[0], 4);
      expect(movedBoundingBox.center[1]).toBeCloseTo(initialBoundingBox.center[1], 4);

      // The plane origin should have moved by the calculated world offset
      // For an unrotated plane, moveX and moveY translate directly to world coordinates
      const originalPlane = rect.plane;
      const movedPlane = result.plane;
      
      const expectedWorldX = moveX * originalPlane.xDir.x + moveY * originalPlane.yDir.x;
      const expectedWorldY = moveX * originalPlane.xDir.y + moveY * originalPlane.yDir.y;  
      const expectedWorldZ = moveX * originalPlane.xDir.z + moveY * originalPlane.yDir.z + moveZ;
      
      expect(movedPlane.origin.x).toBeCloseTo(originalPlane.origin.x + expectedWorldX, 4);
      expect(movedPlane.origin.y).toBeCloseTo(originalPlane.origin.y + expectedWorldY, 4);
      expect(movedPlane.origin.z).toBeCloseTo(originalPlane.origin.z + expectedWorldZ, 4);
    });
    // TODO: add tests for moving a 3d object
    
    it("should fix the GitHub issue: 2D shapes translate correctly after Y rotation", async () => {
      // This test reproduces and validates the fix for the exact issue described:
      // "After rotating 45 degrees on the Y axis a circle will move in the z-axis direction 
      // when either the z-axis value or the x-axis value of the translate atom is adjusted."
      
      const { circle } = await import("../src/worker/shapes.js");
      const originalCircle = await circle(10);
      
      // Rotate 45 degrees around Y axis (exact scenario from issue)
      const rotatedCircle = await rotate(originalCircle, 0, 45, 0);
      
      // Test X movement after rotation
      const movedInX = await move(rotatedCircle, 10, 0, 0);
      
      // Test Z movement after rotation  
      const movedInZ = await move(rotatedCircle, 0, 0, 5);
      
      // To verify the fix works, we need to check the 3D position of the geometries
      // by converting them to 3D using sketchOnPlane
      const rotated3D = rotatedCircle.geometry[0].sketchOnPlane(rotatedCircle.plane);
      const movedX3D = movedInX.geometry[0].sketchOnPlane(movedInX.plane);
      const movedZ3D = movedInZ.geometry[0].sketchOnPlane(movedInZ.plane);
      
      // Get the 3D world positions
      const rotatedPos = rotated3D.wire.boundingBox.center;
      const movedXPos = movedX3D.wire.boundingBox.center;
      const movedZPos = movedZ3D.wire.boundingBox.center;
      
      console.log("After rotation 3D position:", rotatedPos);
      console.log("After X move 3D position:", movedXPos);
      console.log("After Z move 3D position:", movedZPos);
      
      // Calculate actual movement deltas
      const deltaX = {
        x: movedXPos[0] - rotatedPos[0],
        y: movedXPos[1] - rotatedPos[1],
        z: movedXPos[2] - rotatedPos[2]
      };
      
      const deltaZ = {
        x: movedZPos[0] - rotatedPos[0],
        y: movedZPos[1] - rotatedPos[1],
        z: movedZPos[2] - rotatedPos[2]
      };
      
      console.log("X movement delta in 3D:", deltaX);
      console.log("Z movement delta in 3D:", deltaZ);
      
      // Verify the fix: 
      // 1. X movement should follow the rotated plane's X axis (not just world X)
      // 2. Z movement should only move the plane in world Z direction
      
      const plane = rotatedCircle.plane;
      
      // For X movement: should move along the plane's X direction
      expect(deltaX.x).toBeCloseTo(10 * plane.xDir.x, 4);
      expect(deltaX.y).toBeCloseTo(10 * plane.xDir.y, 4);
      expect(deltaX.z).toBeCloseTo(10 * plane.xDir.z, 4);
      
      // For Z movement: should only move in world Z direction
      expect(deltaZ.x).toBeCloseTo(0, 4);
      expect(deltaZ.y).toBeCloseTo(0, 4);
      expect(deltaZ.z).toBeCloseTo(5, 4);
      
      console.log("✅ Fix verified: 2D shapes now translate correctly after rotation!");
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
