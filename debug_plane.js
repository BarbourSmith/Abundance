import { init } from "./src/worker/util.js";
import { Plane } from "replicad";

async function testPlaneTransformations() {
  await init();
  
  // Create a default plane
  const originalPlane = new Plane();
  console.log("Original plane:");
  console.log("- Origin:", originalPlane.origin);
  console.log("- X Direction:", originalPlane.xDir);
  console.log("- Y Direction:", originalPlane.yDir);
  console.log("- Z Direction:", originalPlane.zDir);
  
  // Rotate plane around Y axis by 45 degrees
  const rotatedPlane = originalPlane.pivot(45, "Y");
  console.log("\nAfter Y rotation by 45 degrees:");
  console.log("- Origin:", rotatedPlane.origin);
  console.log("- X Direction:", rotatedPlane.xDir);
  console.log("- Y Direction:", rotatedPlane.yDir);
  console.log("- Z Direction:", rotatedPlane.zDir);
  
  // Test coordinate transformation
  // If we have a point (5, 3, 0) in the rotated plane's local coordinates,
  // what are its world coordinates?
  const localX = 5;
  const localY = 3;
  
  // In the rotated plane, the local X and Y directions have changed
  const worldX = localX * rotatedPlane.xDir.x + localY * rotatedPlane.yDir.x;
  const worldY = localX * rotatedPlane.xDir.y + localY * rotatedPlane.yDir.y;
  const worldZ = localX * rotatedPlane.xDir.z + localY * rotatedPlane.yDir.z;
  
  console.log(`\nLocal coordinates (${localX}, ${localY}) in rotated plane become:`);
  console.log(`World coordinates (${worldX}, ${worldY}, ${worldZ})`);
}

testPlaneTransformations().catch(console.error);