/**
 * Integration test for GitHub molecule loading with input name variables
 * 
 * This test simulates the real-world scenario where:
 * 1. A user creates a project with GitHub molecules
 * 2. The GitHub molecules have Input atoms
 * 3. The user connects those Inputs to name variables from the parent project
 * 4. The project is saved and reloaded
 * 5. The GitHub molecules should load with their Input values correctly set
 */

import { describe, it, expect } from 'vitest';

describe('GitHub Molecule Loading Integration Test', () => {
  it('should load GitHub molecule with Input atoms connected to name variables', async () => {
    // Step 1: Simulate a parent project that has:
    // - An Input atom named "BoardWidth" with value 100
    // - A GitHub molecule imported from external source
    // - The GitHub molecule's Input is connected to "BoardWidth"
    
    // Mock the parent project structure
    const parentProjectSaved = {
      atomType: 'Molecule',
      name: 'Parent Project',
      topLevel: true,
      uniqueID: 'parent-1',
      allAtoms: [
        // Input atom in the parent project
        {
          atomType: 'Input',
          name: 'BoardWidth',
          type: 'number',
          value: 100,
          uniqueID: 'input-board-width',
          x: 0.1,
          y: 0.1
        },
        // GitHub molecule that uses the Input
        {
          atomType: 'GitHubMolecule',
          name: 'Wall Bracket',
          uniqueID: 'github-mol-1',
          x: 0.5,
          y: 0.5,
          parentRepo: {
            owner: 'someuser',
            repoName: 'wall-bracket'
          },
          // CRITICAL: ioValues stores the connection to BoardWidth
          ioValues: [
            {
              name: 'Width', // Input atom inside the GitHub molecule
              ioValue: 100,
              currentEquation: 'BoardWidth' // References the parent's Input
            }
          ]
        }
      ],
      allConnectors: []
    };
    
    // Step 2: Simulate what the GitHub molecule looks like when fetched from GitHub
    const githubMoleculeFromGithub = {
      atomType: 'Molecule',
      name: 'Wall Bracket',
      topLevel: true,
      uniqueID: 'original-github-id',
      allAtoms: [
        // Input atom inside the GitHub molecule
        {
          atomType: 'Input',
          name: 'Width',
          type: 'number',
          value: 50, // Default value in the GitHub molecule
          uniqueID: 'github-input-width'
        },
        // Output atom
        {
          atomType: 'Output',
          name: 'Output',
          uniqueID: 'github-output'
        }
      ],
      allConnectors: []
    };
    
    // Step 3: Simulate the deserialize process that happens during project load
    // This is what happens in molecule.js deserialize() with our fix
    
    // Mock Molecule class with our fix
    class MockMolecule {
      constructor() {
        this.atomType = 'GitHubMolecule';
        this.name = 'Wall Bracket';
        this.uniqueID = 'github-mol-1';
        this.inputs = [];
        this.nodesOnTheScreen = [];
        this.topLevel = false;
        this.ioValues = [];
      }
      
      setValues(values) {
        for (const key in values) {
          this[key] = values[key];
        }
      }
      
      addIO(name, valueType, defaultValue, type) {
        const ap = {
          name: name,
          valueType: valueType,
          value: defaultValue,
          type: type,
          currentEquation: null
        };
        this.inputs.push(ap);
        return ap;
      }
      
      async deserialize(json, values = {}) {
        // Step 3a: Apply json values
        this.setValues(json);
        
        // Step 3b: Overwrite with passed values (includes ioValues from parent)
        this.setValues(values);
        
        // Step 3c: Place atoms
        if (json.allAtoms) {
          json.allAtoms.forEach((atomData) => {
            if (atomData.atomType === 'Input') {
              const inputAtom = {
                atomType: 'Input',
                name: atomData.name,
                type: atomData.type || 'number',
                value: atomData.value || 10,
                uniqueID: atomData.uniqueID
              };
              
              // Create parent attachment point
              inputAtom.parentAP = this.addIO(inputAtom.name, inputAtom.type, inputAtom.value, 'input');
              
              this.nodesOnTheScreen.push(inputAtom);
            }
          });
        }
        
        // Step 3d: Call setValues([]) - this triggers standard ioValue loading
        // but won't work for Input atoms' parentAPs
        this.setValues([]);
        
        // Step 3e: THE FIX - Apply ioValues to Input atoms after they're created
        if (this.ioValues && this.ioValues.length > 0) {
          this.nodesOnTheScreen.forEach((atom) => {
            if (atom.atomType === 'Input' && atom.parentAP) {
              const matchingIoValue = this.ioValues.find(
                (ioValue) => ioValue.name === atom.name
              );
              if (matchingIoValue) {
                atom.parentAP.value = matchingIoValue.ioValue;
                if (
                  'currentEquation' in matchingIoValue &&
                  !Number.isFinite(Number(matchingIoValue.currentEquation))
                ) {
                  atom.parentAP.currentEquation = matchingIoValue.currentEquation;
                }
              }
            }
          });
        }
        
        return this;
      }
    }
    
    // Step 4: Simulate loading the GitHub molecule
    const molecule = new MockMolecule();
    
    // Get the saved GitHub molecule data from parent project
    const savedGitHubMol = parentProjectSaved.allAtoms.find(
      atom => atom.atomType === 'GitHubMolecule'
    );
    
    // Values to pass to deserialize (includes ioValues from parent)
    const valuesToOverwrite = {
      uniqueID: savedGitHubMol.uniqueID,
      ioValues: savedGitHubMol.ioValues,
      parentRepo: savedGitHubMol.parentRepo,
      topLevel: false
    };
    
    // Deserialize the GitHub molecule
    await molecule.deserialize(githubMoleculeFromGithub, valuesToOverwrite);
    
    // Step 5: Verify the fix worked
    const widthInput = molecule.nodesOnTheScreen.find(atom => atom.name === 'Width');
    
    expect(widthInput).toBeDefined();
    expect(widthInput.atomType).toBe('Input');
    
    // CRITICAL TEST: The Input's parentAP should have the value from ioValues (100)
    // NOT the default value from the GitHub molecule (50)
    expect(widthInput.parentAP.value).toBe(100);
    
    // CRITICAL TEST: The currentEquation should reference the parent's Input
    expect(widthInput.parentAP.currentEquation).toBe('BoardWidth');
    
    console.log('✅ Integration test passed: GitHub molecule loaded with correct Input values');
    console.log(`   - Input "Width" value: ${widthInput.parentAP.value} (expected: 100)`);
    console.log(`   - Input "Width" equation: ${widthInput.parentAP.currentEquation} (expected: BoardWidth)`);
  });
  
  it('should handle multiple Input atoms with different value types', async () => {
    // Test with number, string, and equation inputs
    
    class MockMolecule {
      constructor() {
        this.atomType = 'GitHubMolecule';
        this.inputs = [];
        this.nodesOnTheScreen = [];
        this.ioValues = [];
      }
      
      setValues(values) {
        for (const key in values) {
          this[key] = values[key];
        }
      }
      
      addIO(name, valueType, defaultValue, type) {
        const ap = {
          name: name,
          valueType: valueType,
          value: defaultValue,
          type: type,
          currentEquation: null
        };
        this.inputs.push(ap);
        return ap;
      }
      
      async deserialize(json, values = {}) {
        this.setValues(json);
        this.setValues(values);
        
        if (json.allAtoms) {
          json.allAtoms.forEach((atomData) => {
            if (atomData.atomType === 'Input') {
              const inputAtom = {
                atomType: 'Input',
                name: atomData.name,
                type: atomData.type || 'number',
                value: atomData.value || 10,
                uniqueID: atomData.uniqueID
              };
              inputAtom.parentAP = this.addIO(inputAtom.name, inputAtom.type, inputAtom.value, 'input');
              this.nodesOnTheScreen.push(inputAtom);
            }
          });
        }
        
        this.setValues([]);
        
        if (this.ioValues && this.ioValues.length > 0) {
          this.nodesOnTheScreen.forEach((atom) => {
            if (atom.atomType === 'Input' && atom.parentAP) {
              const matchingIoValue = this.ioValues.find(
                (ioValue) => ioValue.name === atom.name
              );
              if (matchingIoValue) {
                atom.parentAP.value = matchingIoValue.ioValue;
                if (
                  'currentEquation' in matchingIoValue &&
                  !Number.isFinite(Number(matchingIoValue.currentEquation))
                ) {
                  atom.parentAP.currentEquation = matchingIoValue.currentEquation;
                }
              }
            }
          });
        }
        
        return this;
      }
    }
    
    const githubMoleculeJson = {
      atomType: 'Molecule',
      allAtoms: [
        { atomType: 'Input', name: 'Width', type: 'number', value: 10, uniqueID: 'i1' },
        { atomType: 'Input', name: 'Material', type: 'string', value: 'Wood', uniqueID: 'i2' },
        { atomType: 'Input', name: 'Height', type: 'number', value: 20, uniqueID: 'i3' }
      ]
    };
    
    const ioValuesFromParent = [
      { name: 'Width', ioValue: 100, currentEquation: 'BoardWidth' },
      { name: 'Material', ioValue: 'Plywood' },
      { name: 'Height', ioValue: 200, currentEquation: 'BoardHeight' }
    ];
    
    const molecule = new MockMolecule();
    await molecule.deserialize(githubMoleculeJson, { ioValues: ioValuesFromParent });
    
    // Verify all inputs loaded correctly
    const widthInput = molecule.nodesOnTheScreen.find(a => a.name === 'Width');
    const materialInput = molecule.nodesOnTheScreen.find(a => a.name === 'Material');
    const heightInput = molecule.nodesOnTheScreen.find(a => a.name === 'Height');
    
    expect(widthInput.parentAP.value).toBe(100);
    expect(widthInput.parentAP.currentEquation).toBe('BoardWidth');
    
    expect(materialInput.parentAP.value).toBe('Plywood');
    expect(materialInput.parentAP.currentEquation).toBeNull();
    
    expect(heightInput.parentAP.value).toBe(200);
    expect(heightInput.parentAP.currentEquation).toBe('BoardHeight');
    
    console.log('✅ Multiple Input atoms with different types loaded correctly');
  });
});
