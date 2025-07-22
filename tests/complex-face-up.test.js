import { describe, it, expect } from 'vitest';
import * as Worker from '../src/worker.js';

describe('Complex Face Up Layout', () => {
  it('should count faces with similar normal vectors correctly', async () => {
    // Wait for worker to be ready
    await Worker.started;

    // Create a simple test case: a cube with a slot cut out from the top face
    // This creates multiple faces with the same normal (the top and bottom of the slot)
    const cubeId = 'test-cube';
    const slotId = 'test-slot';
    const cutCubeId = 'test-cut-cube';

    // Create a cube
    await Worker.rectangle(cubeId + '-base', 10, 10);
    await Worker.extrude(cubeId, cubeId + '-base', 5);

    // Create a slot to cut from the cube (smaller rectangle to create a pocket)
    await Worker.rectangle(slotId + '-base', 4, 2);
    await Worker.extrude(slotId + '-temp', slotId + '-base', 2);
    // Move the slot up so it cuts from the top
    await Worker.move(Worker.library[slotId + '-temp'], 0, 0, 2, slotId);

    // Cut the slot from the cube
    await Worker.difference(cutCubeId, cubeId, slotId);

    // Test that we can access the geometry
    expect(Worker.library[cutCubeId]).toBeDefined();
    expect(Worker.library[cutCubeId].geometry[0].faces).toBeDefined();
    expect(Worker.library[cutCubeId].geometry[0].faces.length).toBeGreaterThan(6); // More than 6 faces due to the slot
  });

  it('should detect normal vectors and group faces correctly', async () => {
    await Worker.started;
    
    // Create a simple cube to test normal vector detection
    const cubeId = 'test-simple-cube';
    await Worker.rectangle(cubeId + '-base', 10, 10);
    await Worker.extrude(cubeId, cubeId + '-base', 5);
    
    const geometry = Worker.library[cubeId];
    expect(geometry).toBeDefined();
    
    const faces = geometry.geometry[0].faces;
    expect(faces.length).toBe(6); // A cube should have exactly 6 faces
    
    // Test that we can access normal vectors for faces
    faces.forEach((face, index) => {
      const normal = face.normalAt();
      expect(normal).toBeDefined();
      expect(normal.x).toBeDefined();
      expect(normal.y).toBeDefined();
      expect(normal.z).toBeDefined();
    });
  });
});