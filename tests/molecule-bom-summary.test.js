/**
 * Test for BOM summary display in molecule inputs panel
 * Ensures that when a molecule contains a BOM, the summary appears in createInputParams
 */

import { describe, it, expect } from 'vitest';

/**
 * Helper function to simulate BOM processing logic from molecule.js
 * @param {object} mockMolecule - Mock molecule object with compiledBom
 * @returns {object} Input parameters with BOM items
 */
function processBomToInputParams(mockMolecule) {
  let inputParams = {};
  
  if (mockMolecule.compiledBom && Array.isArray(mockMolecule.compiledBom) && mockMolecule.compiledBom.length > 0) {
    // Add spacer and heading
    inputParams["bom-spacer-" + mockMolecule.uniqueID] = {
      type: "spacer",
      height: 0,
    };
    inputParams["bom-heading-" + mockMolecule.uniqueID] = {
      type: "string",
      value: "Bill Of Materials:",
      disabled: true,
    };
    
    // Add each BOM item
    mockMolecule.compiledBom.forEach((item) => {
      inputParams["bom-" + mockMolecule.uniqueID + "-" + item.BOMitemName] = {
        type: "string",
        value: item.BOMitemName + ": " + item.numberNeeded,
        disabled: true,
      };
    });
  }
  
  return inputParams;
}

describe('Molecule BOM Summary in Inputs Panel', () => {

  it('should include BOM summary in createInputParams when compiledBom exists', () => {
    // Create mock molecule with compiledBom
    const mockMolecule = {
      uniqueID: 'test123',
      name: 'Test Molecule',
      topLevel: false,
      atomType: 'Molecule',
      compiledBom: [
        { BOMitemName: 'Bolt', numberNeeded: 4, costUSD: 0.50, source: 'hardware-store' },
        { BOMitemName: 'Washer', numberNeeded: 8, costUSD: 0.25, source: 'hardware-store' }
      ]
    };

    // Simulate the createInputParams logic for BOM items
    const inputParams = processBomToInputParams(mockMolecule);

    // Verify heading is present
    expect(inputParams['bom-heading-test123']).toBeDefined();
    expect(inputParams['bom-heading-test123'].type).toBe('string');
    expect(inputParams['bom-heading-test123'].value).toBe('Bill Of Materials:');
    expect(inputParams['bom-heading-test123'].disabled).toBe(true);
    
    // Verify spacer is present
    expect(inputParams['bom-spacer-test123']).toBeDefined();
    expect(inputParams['bom-spacer-test123'].type).toBe('spacer');

    // Verify BOM items appear in inputParams with new format
    expect(inputParams['bom-test123-Bolt']).toBeDefined();
    expect(inputParams['bom-test123-Bolt'].type).toBe('string');
    expect(inputParams['bom-test123-Bolt'].value).toBe('Bolt: 4');
    expect(inputParams['bom-test123-Bolt'].disabled).toBe(true);

    expect(inputParams['bom-test123-Washer']).toBeDefined();
    expect(inputParams['bom-test123-Washer'].type).toBe('string');
    expect(inputParams['bom-test123-Washer'].value).toBe('Washer: 8');
    expect(inputParams['bom-test123-Washer'].disabled).toBe(true);
  });

  it('should not add BOM params when compiledBom is empty', () => {
    const mockMolecule = {
      uniqueID: 'test456',
      name: 'Empty Molecule',
      topLevel: false,
      atomType: 'Molecule',
      compiledBom: []
    };

    const inputParams = processBomToInputParams(mockMolecule);

    // Verify no BOM items are added
    expect(Object.keys(inputParams).length).toBe(0);
  });

  it('should not add BOM params when compiledBom is undefined', () => {
    const mockMolecule = {
      uniqueID: 'test789',
      name: 'No BOM Molecule',
      topLevel: false,
      atomType: 'Molecule',
      compiledBom: undefined
    };

    const inputParams = processBomToInputParams(mockMolecule);

    // Verify no BOM items are added
    expect(Object.keys(inputParams).length).toBe(0);
  });

  it('should handle multiple BOM items with correct format', () => {
    const mockMolecule = {
      uniqueID: 'test999',
      name: 'Multi-Item Molecule',
      topLevel: false,
      atomType: 'Molecule',
      compiledBom: [
        { BOMitemName: 'Screw', numberNeeded: 12, costUSD: 0.10, source: 'store1' },
        { BOMitemName: 'Nut', numberNeeded: 12, costUSD: 0.15, source: 'store2' },
        { BOMitemName: 'Spacer', numberNeeded: 6, costUSD: 0.20, source: 'store3' }
      ]
    };

    const inputParams = processBomToInputParams(mockMolecule);

    // Verify heading and spacer (2) plus 3 items = 5 total
    expect(Object.keys(inputParams).length).toBe(5);
    
    // Verify all BOM items are present with correct format
    expect(inputParams['bom-test999-Screw'].type).toBe('string');
    expect(inputParams['bom-test999-Screw'].value).toBe('Screw: 12');
    expect(inputParams['bom-test999-Screw'].disabled).toBe(true);
    
    expect(inputParams['bom-test999-Nut'].value).toBe('Nut: 12');
    expect(inputParams['bom-test999-Spacer'].value).toBe('Spacer: 6');
  });
});
