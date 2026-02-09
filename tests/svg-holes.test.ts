// Test to verify SVG export properly handles shapes with interior profiles (holes)
import { describe, it, expect, beforeEach } from "vitest";
import { circle, rectangle } from "../src/worker/shapes";
import { extrude, move } from "../src/worker/actions";
import { difference } from "../src/worker/interaction";
import { init } from "../src/worker/util";
import { RequestContext } from "../src/worker/geometryProvider";
import * as worker from "../src/worker/worker";

describe("SVG Export with Interior Profiles", () => {
  const context: RequestContext = { project: "test-svg-holes" };
  
  beforeEach(async () => {
    await init();
  });

  it("should preserve holes in SVG export for 3D shapes with cutouts", async () => {
    // Create a box with a hole in it
    const outerRect = await rectangle(20, 20, context);
    const outerBox = await extrude(outerRect, 10, context);
    
    // Create a smaller cylinder to cut out
    const innerCircle = await circle(5, context);
    const innerCylinder = await extrude(innerCircle, 10, context);
    
    // Cut the hole
    const boxWithHole = await difference(outerBox, innerCylinder, context);
    
    // Export to SVG through visExport (this projects to 2D)
    const svgExport = await (worker as any).visExport(
      boxWithHole, 
      "SVG", 
      context
    );
    
    expect(svgExport).toBeDefined();
    expect(svgExport.geometry).toBeDefined();
    
    // Get the actual geometry
    const geom = await (worker as any).util.geometryProvider.get(
      svgExport.geometry,
      context
    );
    
    // Convert to SVG string
    const svgString = geom.toSVG();
    
    expect(svgString).toBeDefined();
    expect(svgString.length).toBeGreaterThan(0);
    
    // Check if SVG contains what looks like multiple paths or subpaths
    // Multiple paths would have multiple <path> elements
    // Or a single path with multiple M (moveto) commands indicating subpaths
    const pathCount = (svgString.match(/<path/g) || []).length;
    const moveToCount = (svgString.match(/M[\s\-\d.,]+/g) || []).length;
    
    // We expect either:
    // 1. Multiple path elements (one for outline, one for hole), OR
    // 2. A single path with multiple moveto commands (subpaths)
    expect(pathCount >= 1).toBe(true);
    
    // If there's only one path element, it should have multiple M commands
    // to represent both the outer contour and the inner hole
    if (pathCount === 1) {
      expect(moveToCount).toBeGreaterThan(1);
    }
  });

  it("should preserve holes in 2D drawings with cutouts", async () => {
    // Create a 2D shape with a hole
    const outerCircle = await circle(15, context);
    const innerCircle = await circle(7, context);
    
    // Cut the hole (2D boolean operation)
    const circleWithHole = await difference(outerCircle, innerCircle, context);
    
    expect(circleWithHole).toBeDefined();
    expect(circleWithHole.geometry).toHaveLength(1);
    
    // Get the geometry
    const geom = await (worker as any).util.geometryProvider.get(
      circleWithHole.geometry[0],
      context
    );
    
    // Convert to SVG string
    const svgString = geom.toSVG();
    
    expect(svgString).toBeDefined();
    expect(svgString.length).toBeGreaterThan(0);
    
    // Check for multiple contours
    const pathCount = (svgString.match(/<path/g) || []).length;
    const moveToCount = (svgString.match(/M[\s\-\d.,]+/g) || []).length;
    
    // Should have multiple contours
    expect(pathCount + moveToCount).toBeGreaterThan(1);
  });
});
