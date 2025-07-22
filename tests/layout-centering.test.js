// Test to verify that parts are centered at origin before packing
import { 
  library, 
  started, 
  rectangle,
  extrude,
  move,
  assembly,
  rotateForLayout,
  actOnLeafs
} from '../src/worker.js';
import { vi } from 'vitest';

describe('layout centering', () => {
  beforeAll(async () => {
    await started;
  });

  afterEach(() => {
    // Reset library after each test
    for (const key of Object.keys(library)) {
      delete library[key];
    }
  });

  it('should center parts at origin based on bounding box, not face center', async () => {
    // Create a simple 3D part that's offset from origin
    const rectID = 'rect1';
    const extrudedID = 'extruded1';
    const movedID = 'moved1';
    
    // Create a rectangle
    await rectangle(rectID, 10, 5);
    
    // Extrude it to make it 3D
    await extrude(extrudedID, rectID, 2);
    
    // Move it away from origin to test centering behavior
    await move(library[extrudedID], 20, 30, 0, movedID);
    
    // Verify the part is now offset from origin
    const movedPart = library[movedID];
    expect(movedPart).toBeDefined();
    expect(movedPart.geometry[0]).toBeDefined();
    
    const originalBounds = movedPart.geometry[0].boundingBox;
    const originalCenter = originalBounds.center;
    
    // The part should be offset from origin (not centered at 0,0,0)
    expect(Math.abs(originalCenter[0])).toBeGreaterThan(1);
    expect(Math.abs(originalCenter[1])).toBeGreaterThan(1);
    
    // Create a layout configuration
    const layoutConfig = {
      width: 100,
      height: 100,
      partPadding: 5,
      units: 'MM'
    };
    
    const warningCallback = vi.fn();
    
    // Use internal rotateForLayout function to test the centering behavior
    // This simulates what happens inside the layout function
    const targetID = 'rotated1';
    const shapesForLayout = rotateForLayout(targetID, movedID, layoutConfig, warningCallback);
    
    // Verify that the rotated part is now centered at origin
    const rotatedPart = library[targetID];
    expect(rotatedPart).toBeDefined();
    expect(rotatedPart.geometry).toBeDefined();
    
    // Check that the leafs are centered at origin
    const leafs = [];
    actOnLeafs(rotatedPart, (leaf) => {
      leafs.push(leaf);
      return leaf;
    });
    
    expect(leafs.length).toBeGreaterThan(0);
    
    // Each leaf should have its bounding box center close to origin
    leafs.forEach(leaf => {
      const bounds = leaf.geometry[0].boundingBox;
      const center = bounds.center;
      
      // The bounding box center should be very close to origin (within tolerance)
      expect(Math.abs(center[0])).toBeLessThan(0.001);
      expect(Math.abs(center[1])).toBeLessThan(0.001);
      // Z can be non-zero since we only center X,Y
    });
  });

  it('should handle assemblies with multiple parts correctly', async () => {
    // Create two parts at different positions
    const rect1ID = 'rect1';
    const rect2ID = 'rect2';
    const extruded1ID = 'extruded1';
    const extruded2ID = 'extruded2';
    const moved1ID = 'moved1';
    const moved2ID = 'moved2';
    const assemblyID = 'assembly1';
    
    // Create two rectangles
    await rectangle(rect1ID, 10, 5);
    await rectangle(rect2ID, 8, 4);
    
    // Extrude both
    await extrude(extruded1ID, rect1ID, 2);
    await extrude(extruded2ID, rect2ID, 3);
    
    // Move them to different positions
    await move(library[extruded1ID], 15, 20, 0, moved1ID);
    await move(library[extruded2ID], -25, 35, 0, moved2ID);
    
    // Create assembly
    await assembly([moved1ID, moved2ID], assemblyID);
    
    // Test layout on the assembly
    const layoutConfig = {
      width: 200,
      height: 200,
      partPadding: 5,
      units: 'MM'
    };
    
    const warningCallback = vi.fn();
    const targetID = 'rotated_assembly';
    
    const shapesForLayout = rotateForLayout(targetID, assemblyID, layoutConfig, warningCallback);
    
    // Verify that shapes for layout were created
    expect(shapesForLayout).toBeDefined();
    expect(Array.isArray(shapesForLayout)).toBe(true);
    expect(shapesForLayout.length).toBeGreaterThan(0);
    
    const rotatedAssembly = library[targetID];
    expect(rotatedAssembly).toBeDefined();
  });
});