import { describe, it, expect, beforeEach } from 'vitest';
// Load attachmentpoint (and through it the molecule registry) before Atom,
// as the app does; importing atom.js first hits a circular import.
import AttachmentPoint from '../src/prototypes/attachmentpoint.js';
import Atom from '../src/prototypes/atom.js';
import {
  MAX_SAVED_VALUE_LENGTH,
  takeDroppedValues,
} from '../src/js/savedValueLimit.js';

describe('Serialize Protection Against Large Values', () => {
  let testAtom;

  beforeEach(() => {
    takeDroppedValues();
    // Create a test atom
    testAtom = new Atom({
      atomType: 'TestAtom',
      name: 'Test',
      x: 0,
      y: 0,
      uniqueID: 'test-123'
    });
  });

  it('should exclude geometry valueType even if value is a string', () => {
    // Create an attachment point with geometry valueType
    const geomAP = new AttachmentPoint({
      name: 'geometry',
      type: 'input',
      valueType: 'geometry',
      parentMolecule: testAtom,
      uniqueID: 1
    });
    
    // Simulate the problematic scenario: geometry data stored as string
    geomAP.value = JSON.stringify({ vertices: [1, 2, 3], faces: [4, 5, 6] });
    testAtom.inputs = [geomAP];

    const serialized = testAtom.serialize();
    
    // Geometry should NOT be in the serialized output
    expect(serialized.ioValues).toBeDefined();
    expect(serialized.ioValues.length).toBe(0);
  });

  it('should save long text values such as point data (15K chars)', () => {
    const stringAP = new AttachmentPoint({
      name: 'points',
      type: 'input',
      valueType: 'string',
      parentMolecule: testAtom,
      defaultValue: '',
      uniqueID: 1
    });
    const points = JSON.stringify(
      Array.from({ length: 1000 }, (_, i) => [i * 1.25, i * 2.5]),
    );
    expect(points.length).toBeGreaterThan(10000);
    stringAP.value = points;
    testAtom.inputs = [stringAP];

    const serialized = testAtom.serialize();

    expect(serialized.ioValues).toHaveLength(1);
    expect(serialized.ioValues[0].ioValue).toBe(points);
    expect(takeDroppedValues()).toEqual([]);
  });

  it('should exclude runaway string values and record them', () => {
    // Create a normal number input
    const numberAP = new AttachmentPoint({
      name: 'testValue',
      type: 'input',
      valueType: 'number',
      parentMolecule: testAtom,
      defaultValue: 10,
      uniqueID: 1
    });
    
    // Set a very large string value (simulating accidentally stringified data)
    const largeString = 'x'.repeat(MAX_SAVED_VALUE_LENGTH + 1);
    numberAP.value = largeString;
    testAtom.inputs = [numberAP];

    const serialized = testAtom.serialize();
    
    // Large string should NOT be saved, and the save is told about it
    expect(serialized.ioValues).toBeUndefined();
    expect(takeDroppedValues()).toEqual([
      { atomName: testAtom.name, key: 'testValue', length: MAX_SAVED_VALUE_LENGTH + 1 },
    ]);
  });

  it('should include normal string values under size limit', () => {
    const stringAP = new AttachmentPoint({
      name: 'testString',
      type: 'input',
      valueType: 'string',
      parentMolecule: testAtom,
      defaultValue: '',
      uniqueID: 1
    });
    
    // Set a normal-sized string
    stringAP.value = 'This is a normal string value';
    testAtom.inputs = [stringAP];

    const serialized = testAtom.serialize();
    
    // Normal string should be saved
    expect(serialized.ioValues).toBeDefined();
    expect(serialized.ioValues.length).toBe(1);
    expect(serialized.ioValues[0].ioValue).toBe('This is a normal string value');
  });

  it('should include normal number values', () => {
    const numberAP = new AttachmentPoint({
      name: 'diameter',
      type: 'input',
      valueType: 'number',
      parentMolecule: testAtom,
      defaultValue: 10,
      uniqueID: 1
    });
    
    numberAP.value = 25.5;
    testAtom.inputs = [numberAP];

    const serialized = testAtom.serialize();
    
    expect(serialized.ioValues).toBeDefined();
    expect(serialized.ioValues.length).toBe(1);
    expect(serialized.ioValues[0].ioValue).toBe(25.5);
  });

  it('should exclude runaway equations', () => {
    const numberAP = new AttachmentPoint({
      name: 'calculated',
      type: 'input',
      valueType: 'number',
      parentMolecule: testAtom,
      defaultValue: 10,
      uniqueID: 1
    });
    
    // Set a very large equation (unlikely but test the protection)
    const largeEquation = 'x + y + '.repeat(MAX_SAVED_VALUE_LENGTH / 8 + 1);
    numberAP.currentEquation = largeEquation;
    numberAP.value = 20; // Different from default
    testAtom.inputs = [numberAP];

    const serialized = testAtom.serialize();
    
    // Value should be saved but equation should be excluded
    expect(serialized.ioValues).toBeDefined();
    expect(serialized.ioValues.length).toBe(1);
    expect(serialized.ioValues[0].ioValue).toBe(20);
    expect(serialized.ioValues[0].currentEquation).toBeUndefined();
    expect(takeDroppedValues().map((d) => d.key)).toEqual([
      'calculated equation',
    ]);
  });

  it('should include normal equations under size limit', () => {
    const numberAP = new AttachmentPoint({
      name: 'calculated',
      type: 'input',
      valueType: 'number',
      parentMolecule: testAtom,
      defaultValue: 10,
      uniqueID: 1
    });
    
    numberAP.currentEquation = 'x * 2 + y / 3';
    numberAP.value = 15;
    testAtom.inputs = [numberAP];

    const serialized = testAtom.serialize();
    
    expect(serialized.ioValues).toBeDefined();
    expect(serialized.ioValues.length).toBe(1);
    expect(serialized.ioValues[0].currentEquation).toBe('x * 2 + y / 3');
  });

  it('should exclude default values without equations', () => {
    const numberAP = new AttachmentPoint({
      name: 'diameter',
      type: 'input',
      valueType: 'number',
      parentMolecule: testAtom,
      defaultValue: 10,
      uniqueID: 1
    });
    
    // Keep the default value
    numberAP.value = 10;
    testAtom.inputs = [numberAP];

    const serialized = testAtom.serialize();
    
    // Default value without equation should NOT be saved
    expect(serialized.ioValues).toBeDefined();
    expect(serialized.ioValues.length).toBe(0);
  });

  it('should handle mixed scenarios correctly', () => {
    // Normal number (changed from default) - should be saved
    const normalNumber = new AttachmentPoint({
      name: 'height',
      type: 'input',
      valueType: 'number',
      parentMolecule: testAtom,
      defaultValue: 10,
      uniqueID: 1
    });
    normalNumber.value = 20;

    // Geometry (should be excluded)
    const geometry = new AttachmentPoint({
      name: 'shape',
      type: 'input',
      valueType: 'geometry',
      parentMolecule: testAtom,
      uniqueID: 2
    });
    geometry.value = 'stringified-geometry-data';

    // Large string (should be excluded)
    const largeString = new AttachmentPoint({
      name: 'bigData',
      type: 'input',
      valueType: 'string',
      parentMolecule: testAtom,
      defaultValue: '',
      uniqueID: 3
    });
    largeString.value = 'x'.repeat(MAX_SAVED_VALUE_LENGTH + 1);

    // Normal string (should be saved)
    const normalString = new AttachmentPoint({
      name: 'label',
      type: 'input',
      valueType: 'string',
      parentMolecule: testAtom,
      defaultValue: '',
      uniqueID: 4
    });
    normalString.value = 'My Label';

    testAtom.inputs = [normalNumber, geometry, largeString, normalString];

    const serialized = testAtom.serialize();
    
    // The runaway string is left out; the rest are kept (geometry as a
    // placeholder, never its value)
    const saved = Object.fromEntries(
      serialized.ioValues.map((io) => [io.name, io.ioValue]),
    );
    expect(saved).toEqual({
      height: 20,
      shape: '__GEOMETRY_INPUT__',
      label: 'My Label',
    });
  });

  it('should calculate reasonable file size for typical project', () => {
    // Simulate a project with 50 atoms, each with 2-3 inputs
    const atoms = [];
    for (let i = 0; i < 50; i++) {
      const atom = new Atom({
        atomType: 'Circle',
        name: `Circle${i}`,
        x: i * 0.1,
        y: i * 0.1,
        uniqueID: `atom-${i}`
      });

      // Add typical inputs
      const diameter = new AttachmentPoint({
        name: 'diameter',
        type: 'input',
        valueType: 'number',
        parentMolecule: atom,
        defaultValue: 10,
        uniqueID: i * 10 + 1
      });
      diameter.value = 10 + i; // Changed from default

      const height = new AttachmentPoint({
        name: 'height',
        type: 'input',
        valueType: 'number',
        parentMolecule: atom,
        defaultValue: 5,
        uniqueID: i * 10 + 2
      });
      height.value = 5; // Default value, should not be saved

      atom.inputs = [diameter, height];
      atoms.push(atom);
    }

    // Serialize all atoms and calculate size
    const serializedProject = {
      topLevel: true,
      allAtoms: atoms.map(atom => atom.serialize()),
      allConnectors: []
    };

    const jsonString = JSON.stringify(serializedProject, null, 2);
    const sizeInKB = jsonString.length / 1024;

    // Should be reasonable size (under 100KB for 50 atoms)
    expect(sizeInKB).toBeLessThan(100);
    console.log(`50-atom project size: ${sizeInKB.toFixed(2)} KB`);
  });
});
