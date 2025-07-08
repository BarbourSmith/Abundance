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
    expect(isAssembly(library[boxId])).toBe(false);
    expect(is3D(library[boxId])).toBe(true);

    const serialization_metadata = await serialize(boxId);

    expect(serialization_metadata).toEqual({
      geometry: `${boxId}_0.brep`,
      tags: [],
      plane: `${boxId}_0_plane.brep`,
    });
  });
});
