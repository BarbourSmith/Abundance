// Worker.js integration tests. These tests use the real Replicad library.
import { 
  library, 
  started, 
  circle, 
  rectangle, 
  extrude, 
  is3D 
} from '../src/worker.js';

describe('extrude', () => {
  beforeAll(async () => {
    // Wait on worker's started flag.
    await started;
  });

  afterEach(() => {
    // Reset library after each test
    for (const key of Object.keys(library)) {
      delete library[key];
    }
  });


  // Assertion library is defined here: https://vitest.dev/api/expect
  it('extrudes a rectangle sketch into a 3D box', async () => {
    // 1. Create a 2D rectangle in the library
    const inputID = 'rect1';
    const targetID = 'box1';
    const width = 10;
    const height = 5;
    const extrudeHeight = 3;

    // Create the rectangle first
    await rectangle(inputID, width, height);
    
    // Verify the rectangle was created
    expect(library[inputID]).toBeDefined();
    expect(library[inputID].geometry).toHaveLength(1);
    expect(is3D(library[inputID])).toBe(false); // Should be 2D sketch

    // 2. Call extrude
    await extrude(targetID, inputID, extrudeHeight);

    // 3. Check the result in the library
    const result = library[targetID];
    expect(result).toBeDefined();
    expect(result.geometry).toHaveLength(1);
    
    const solid = result.geometry[0];
    expect(solid).toBeDefined();
    expect(is3D(result)).toBe(true); // Should now be 3D
    
    // Check bounding box dimensions
    const bounds = solid.boundingBox;
    expect(bounds).toBeDefined();
    // Assert accuracy to 4 decimal places
    expect(bounds.width).toBeCloseTo(width, 4);
    expect(bounds.height).toBeCloseTo(height, 4);
    expect(bounds.depth).toBeCloseTo(extrudeHeight, 4);
  });
});
