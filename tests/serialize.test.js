import { 
  library, 
  started, 
  circle, 
  rectangle,
  extrude,
  serialize,
  deserialize,
  is3D,
  tag,
  bom,
  color,
} from '../src/worker.js';

import { isAssembly } from './utils.js';

describe('serialize', () => {
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
  it('serialize a sketch with tags and BOM', async () => {
    // 1. Create a 2D rectangle in the library
    const inputID = 'rect1';
    const taggedRectId = 'taggedRect1';
    const bomRectId = 'bomRect1';
    const testSubjectId = 'test1';
    const tags = ['test', 'rectangle'];
    const BOM = {"proj": "p1"};
    
    // Create rectangle with accessory values
    await rectangle(inputID, 10, 5);
    await tag(taggedRectId, inputID, tags);
    await bom(bomRectId, inputID, BOM);
    await color(testSubjectId, bomRectId, "#ff0000");

    // Verify the rectangle was created
    expect(isAssembly(library[testSubjectId])).toBe(false);
    expect(is3D(library[testSubjectId])).toBe(false);

    const serialization_metadata = await serialize(testSubjectId);

    expect(serialization_metadata).toEqual({
      geometry: `${testSubjectId}_0.brep`,
      tags: tags,
      bom: BOM,
      plane: `${testSubjectId}_0_plane.brep`,
      color: "#ff0000",
    });
  });

  // Assertion library is defined here: https://vitest.dev/api/expect
  it('serialize a 3d shape', async () => {
    // 1. Create a 2D rectangle in the library
    const inputID = 'rect1';
    const boxId = 'box1';
    
    // Create rectangle with accessory values
    await rectangle(inputID, 10, 5);
    await extrude(boxId, inputID, 3);

    // Verify the rectangle was created
    const result = library[boxId];
    delete result.plane; // serialization for 2d forms currently broken.

    const serialization_metadata = await serialize(boxId);

    expect(serialization_metadata).toEqual({
      geometry: `${boxId}_0.brep`,
      bom: [],
      color: "#aad7f2", // Default color
      tags: []
    });
  });


  // Assertion library is defined here: https://vitest.dev/api/expect
  it('check opencascade value equality function', async () => {
    // 1. Create a 2D rectangle in the library
    const inputID = 'rect1';
    const box1 = 'box1';
    const input2 = 'rect2';
    const box2 = 'box2';

    // Create rectangle with accessory values
    await rectangle(inputID, 10, 5);
    await extrude(box1, inputID, 3);
    await rectangle(input2, 10, 5);
    await extrude(box2, input2, 3);

    // Verify the rectangle was created
    expect(library[box1].geometry[0]._wrapped.IsEqual(library[box2].geometry[0]._wrapped)).toBe(true);
  });


  // Assertion library is defined here: https://vitest.dev/api/expect
  it('deserialize produces an equivalent shape', async () => {
    // 1. Create a 2D rectangle in the library
    const inputID = 'rect1';
    const boxId = 'box1';
    
    // Create rectangle with accessory values
    await rectangle(inputID, 10, 5);
    await extrude(boxId, inputID, 3);

    // Verify the rectangle was created
    const result = library[boxId];
    delete result.plane; // Remove plane for serialization test

    const serialization_metadata = await serialize(boxId);
    const deserialized = await deserialize(serialization_metadata);


    expect(deserialized).toBeDefined();
    expect(deserialized.geometry).toHaveLength(1);

    expect(deserialized.tags).toEqual(result.tags);
    expect(deserialized.bom).toEqual(result.bom);
    expect(deserialized.color).toEqual(result.color);
    expect(deserialized.geometry[0]._wrapped.IsEqual(result.geometry[0]._wrapped)).toBe(true);
  });
});
