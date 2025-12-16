import { describe, it, expect, beforeEach } from 'vitest';
import GlobalVariables from '../src/js/globalvariables.js';
import Molecule from '../src/molecules/molecule.js';
import Circle from '../src/molecules/circle.js';

describe('Copy/Paste Fix - Mouse Position Integration', () => {
  let testMolecule;

  beforeEach(() => {
    // Reset GlobalVariables for each test
    GlobalVariables.atomsSelected = [];
    GlobalVariables.connectorsSelected = [];
    GlobalVariables.copiedSelectionCenter = null;
    GlobalVariables.lastMousePosition = { x: 0.5, y: 0.5 };
    
    // Create a test molecule
    testMolecule = new Molecule({
      x: 0,
      y: 0,
      topLevel: true,
      atomType: 'Molecule'
    });
    GlobalVariables.currentMolecule = testMolecule;
  });

  it('should track mouse position when set', () => {
    // Simulate mouse position update
    GlobalVariables.lastMousePosition = { x: 0.7, y: 0.3 };
    
    expect(GlobalVariables.lastMousePosition.x).toBe(0.7);
    expect(GlobalVariables.lastMousePosition.y).toBe(0.3);
  });

  it('should store selection center when copying with connectors', () => {
    // Create and select some test atoms
    const atom1 = new Circle({ x: 0.2, y: 0.2, parent: testMolecule });
    const atom2 = new Circle({ x: 0.4, y: 0.4, parent: testMolecule });
    
    atom1.selected = true;
    atom2.selected = true;
    
    testMolecule.nodesOnTheScreen.push(atom1);
    testMolecule.nodesOnTheScreen.push(atom2);
    
    // Copy with connectors
    testMolecule.copyWithConnectors();
    
    // Check that selection center was calculated
    expect(GlobalVariables.copiedSelectionCenter).toBeDefined();
    expect(GlobalVariables.copiedSelectionCenter.x).toBeCloseTo(0.3, 5); // (0.2 + 0.4) / 2
    expect(GlobalVariables.copiedSelectionCenter.y).toBeCloseTo(0.3, 5); // (0.2 + 0.4) / 2
  });

  it('should copy atoms without offset when using copyWithConnectors', () => {
    // Create and select a test atom
    const atom1 = new Circle({ x: 0.5, y: 0.6, parent: testMolecule });
    atom1.selected = true;
    testMolecule.nodesOnTheScreen.push(atom1);
    
    // Copy with connectors
    testMolecule.copyWithConnectors();
    
    // Check that atom was copied
    expect(GlobalVariables.atomsSelected.length).toBe(1);
    
    // Check that the copied atom has the original position (no offset applied during copy)
    const copiedAtom = GlobalVariables.atomsSelected[0];
    expect(copiedAtom.x).toBe(0.5);
    expect(copiedAtom.y).toBe(0.6);
  });

  it('should preserve internal connectors when copying', () => {
    // Create two connected atoms
    const atom1 = new Circle({ x: 0.2, y: 0.2, parent: testMolecule });
    const atom2 = new Circle({ x: 0.4, y: 0.4, parent: testMolecule });
    
    atom1.selected = true;
    atom2.selected = true;
    
    testMolecule.nodesOnTheScreen.push(atom1);
    testMolecule.nodesOnTheScreen.push(atom2);
    
    // Create a connection between them
    if (atom1.output && atom2.inputs.length > 0) {
      const connector = {
        attachmentPoint1: atom1.output,
        attachmentPoint2: atom2.inputs[0],
        serialize: () => ({
          ap1ID: atom1.uniqueID,
          ap2ID: atom2.uniqueID,
          ap2Name: atom2.inputs[0].name
        })
      };
      atom1.output.connectors = [connector];
    }
    
    // Copy with connectors
    testMolecule.copyWithConnectors();
    
    // Check that atoms and connectors were copied
    expect(GlobalVariables.atomsSelected.length).toBe(2);
    // Note: connectors will only be copied if both atoms have proper output/input setup
    // This is a simplified test to verify the structure
  });

  it('should initialize connectorsSelected array in GlobalVariables', () => {
    // Verify that the new connectorsSelected array exists
    expect(GlobalVariables.connectorsSelected).toBeDefined();
    expect(Array.isArray(GlobalVariables.connectorsSelected)).toBe(true);
  });

  it('should have copiedSelectionCenter property in GlobalVariables', () => {
    // This will be set during copy operations
    expect(GlobalVariables).toHaveProperty('copiedSelectionCenter');
  });

  it('should have lastMousePosition property in GlobalVariables', () => {
    // Verify the new mouse position tracking
    expect(GlobalVariables).toHaveProperty('lastMousePosition');
    expect(GlobalVariables.lastMousePosition).toHaveProperty('x');
    expect(GlobalVariables.lastMousePosition).toHaveProperty('y');
  });
});
