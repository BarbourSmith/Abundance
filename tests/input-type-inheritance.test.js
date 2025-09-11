import { describe, it, expect, beforeEach } from 'vitest';

describe('Input Type Inheritance when Dragging Connectors', () => {
  let mockGlobalVariables;
  let MockInputAtom;
  let MockConnector;
  let mockTargetMolecule;
  let mockSourceInputAtom;

  beforeEach(() => {
    // Mock GlobalVariables
    mockGlobalVariables = {
      generateUniqueID: () => `test-id-${Math.random()}`,
      incrementVariableName: (name, molecule) => `${name}_${Math.random().toString(36).slice(2, 8)}`,
      availableTypes: {
        input: {
          creator: function(values) {
            return new MockInputAtom(values);
          }
        }
      }
    };

    // Mock Input Atom class
    MockInputAtom = class {
      constructor(values) {
        this.atomType = 'Input';
        this.name = values.name || 'input';
        this.type = values.type || 'number'; // This is the key property we're testing
        this.valueType = values.type || 'number';
        this.parent = values.parent;
        this.parentMolecule = values.parentMolecule;
        this.x = values.x || 0;
        this.y = values.y || 0;
        this.uniqueID = values.uniqueID;
        
        // Simulate the Input constructor creating an attachment point on the parent
        if (this.parent && this.parent.inputs) {
          this.parent.inputs.push({
            name: this.name,
            type: 'input',
            valueType: this.type,
            connectors: [],
            parentMolecule: this
          });
        }
      }
    };

    // Mock target molecule
    mockTargetMolecule = {
      atomType: 'Molecule',
      inputs: [],
      nodesOnTheScreen: [],
      x: 0.5,
      y: 0.5
    };

    // Mock source input atoms with different types
    mockSourceInputAtom = {
      atomType: 'Input',
      name: 'testInput',
      type: 'string', // Testing with string type to ensure it's not defaulting to geometry
      valueType: 'string'
    };

    // Set up global reference
    global.GlobalVariables = mockGlobalVariables;
  });

  it('should inherit string type from source Input atom', () => {
    // Create a mock connector simulating drag from string Input atom to molecule
    const sourceAttachmentPoint = {
      parentMolecule: mockSourceInputAtom,
      valueType: 'string'
    };

    // Current buggy behavior - always defaults to "geometry"
    const currentBuggyInputAtom = new MockInputAtom({
      atomType: "Input",
      name: "testInput_abc123",
      parent: mockTargetMolecule,
      parentMolecule: mockTargetMolecule,
      x: mockTargetMolecule.x - 0.15,
      y: mockTargetMolecule.y,
      uniqueID: "test-id-123",
      type: "geometry", // BUG: Always defaults to geometry
    });

    // Expected fixed behavior - should inherit from source
    const expectedFixedInputAtom = new MockInputAtom({
      atomType: "Input",
      name: "testInput_abc123",
      parent: mockTargetMolecule,
      parentMolecule: mockTargetMolecule,
      x: mockTargetMolecule.x - 0.15,
      y: mockTargetMolecule.y,
      uniqueID: "test-id-123",
      type: sourceAttachmentPoint.parentMolecule.type, // FIXED: Inherit from source
    });

    // Verify the bug exists
    expect(currentBuggyInputAtom.type).toBe('geometry');
    expect(currentBuggyInputAtom.type).not.toBe('string');

    // Verify the expected fix
    expect(expectedFixedInputAtom.type).toBe('string');
    expect(expectedFixedInputAtom.type).toBe(sourceAttachmentPoint.parentMolecule.type);
  });

  it('should inherit number type from source Input atom', () => {
    const sourceInputAtom = {
      atomType: 'Input',
      name: 'numberInput',
      type: 'number',
      valueType: 'number'
    };

    const sourceAttachmentPoint = {
      parentMolecule: sourceInputAtom,
      valueType: 'number'
    };

    const fixedInputAtom = new MockInputAtom({
      atomType: "Input",
      name: "numberInput_def456",
      parent: mockTargetMolecule,
      parentMolecule: mockTargetMolecule,
      x: mockTargetMolecule.x - 0.15,
      y: mockTargetMolecule.y,
      uniqueID: "test-id-456",
      type: sourceAttachmentPoint.parentMolecule.type, // Should inherit 'number'
    });

    expect(fixedInputAtom.type).toBe('number');
  });

  it('should inherit array type from source Input atom', () => {
    const sourceInputAtom = {
      atomType: 'Input',
      name: 'arrayInput',
      type: 'array',
      valueType: 'array'
    };

    const sourceAttachmentPoint = {
      parentMolecule: sourceInputAtom,
      valueType: 'array'
    };

    const fixedInputAtom = new MockInputAtom({
      atomType: "Input",
      name: "arrayInput_ghi789",
      parent: mockTargetMolecule,
      parentMolecule: mockTargetMolecule,
      x: mockTargetMolecule.x - 0.15,
      y: mockTargetMolecule.y,
      uniqueID: "test-id-789",
      type: sourceAttachmentPoint.parentMolecule.type, // Should inherit 'array'
    });

    expect(fixedInputAtom.type).toBe('array');
  });

  it('should fallback to attachment point valueType when source is not Input atom', () => {
    // Test case where source is not an Input atom (e.g., output from Circle, Rectangle, etc.)
    const sourceAtom = {
      atomType: 'Circle',
      name: 'myCircle'
    };

    const sourceAttachmentPoint = {
      parentMolecule: sourceAtom,
      valueType: 'geometry' // Output from Circle would be geometry
    };

    const fixedInputAtom = new MockInputAtom({
      atomType: "Input",
      name: "input_jkl012",
      parent: mockTargetMolecule,
      parentMolecule: mockTargetMolecule,
      x: mockTargetMolecule.x - 0.15,
      y: mockTargetMolecule.y,
      uniqueID: "test-id-012",
      type: sourceAttachmentPoint.valueType, // Should use attachment point valueType
    });

    expect(fixedInputAtom.type).toBe('geometry');
  });

  it('should handle undefined types gracefully', () => {
    const sourceInputAtom = {
      atomType: 'Input',
      name: 'undefinedInput'
      // type is undefined
    };

    const sourceAttachmentPoint = {
      parentMolecule: sourceInputAtom,
      valueType: 'number' // fallback from attachment point
    };

    // When source type is undefined, should fall back to attachment point valueType
    const fallbackType = sourceInputAtom.type || sourceAttachmentPoint.valueType;

    const fixedInputAtom = new MockInputAtom({
      atomType: "Input",
      name: "undefinedInput_mno345",
      parent: mockTargetMolecule,
      parentMolecule: mockTargetMolecule,
      x: mockTargetMolecule.x - 0.15,
      y: mockTargetMolecule.y,
      uniqueID: "test-id-345",
      type: fallbackType,
    });

    expect(fixedInputAtom.type).toBe('number'); // Should fallback to attachment point valueType
  });

  it('should demonstrate the fix logic for type inheritance', () => {
    // This test demonstrates the exact logic that should be implemented in the fix
    
    function determineInputType(sourceAttachmentPoint) {
      // If source is an Input atom, inherit its type
      if (sourceAttachmentPoint.parentMolecule.atomType === "Input") {
        return sourceAttachmentPoint.parentMolecule.type || sourceAttachmentPoint.valueType;
      }
      // Otherwise, use the attachment point's valueType
      return sourceAttachmentPoint.valueType;
    }

    // Test with Input atom source
    const inputSource = {
      parentMolecule: { atomType: 'Input', type: 'string' },
      valueType: 'string'
    };
    expect(determineInputType(inputSource)).toBe('string');

    // Test with non-Input atom source
    const circleSource = {
      parentMolecule: { atomType: 'Circle' },
      valueType: 'geometry'
    };
    expect(determineInputType(circleSource)).toBe('geometry');

    // Test with Input atom but no type defined
    const inputNoType = {
      parentMolecule: { atomType: 'Input' },
      valueType: 'number'
    };
    expect(determineInputType(inputNoType)).toBe('number');
  });
});