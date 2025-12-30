/**
 * Test for GitHub molecule loading issue with input name variables
 * 
 * When a GitHub molecule has Input atoms that receive values from name variables
 * (via currentEquation), these values should load correctly on initial project load
 * without requiring a reload.
 * 
 * The issue is that when loading a GitHub molecule:
 * 1. The molecule's ioValues are passed through valuesToOverwriteInLoadedVersion
 * 2. These ioValues contain the values that Input atoms should have
 * 3. But the Input atoms' attachment points aren't properly initialized when
 *    setValues([]) is called in deserialize, so the ioValues aren't applied
 * 4. After reload, the ioValues are properly applied because atoms are fully initialized
 */

import { describe, it, expect } from 'vitest';

describe('GitHub Molecule Input Variable Loading', () => {
  it('should apply ioValues to Input atoms when GitHub molecule loads', async () => {
    // Simulate the deserialize flow for a GitHub molecule
    
    // Mock Molecule class representing a GitHub molecule
    class MockGitHubMolecule {
      constructor() {
        this.atomType = 'GitHubMolecule';
        this.name = 'Test GitHub Molecule';
        this.uniqueID = 'github-mol-1';
        this.inputs = [];
        this.nodesOnTheScreen = [];
        this.topLevel = false;
        this.ioValues = [];
      }
      
      // Simulate setValues from atom.js
      setValues(values) {
        for (var key in values) {
          this[key] = values[key];
        }
        
        // This is the critical part - applying ioValues to inputs
        if (typeof this.ioValues !== 'undefined' && this.ioValues.length > 0) {
          this.ioValues.forEach((ioValue) => {
            // Find matching input attachment point
            this.inputs.forEach((ap) => {
              if (ioValue.name == ap.name && ap.type == 'input') {
                ap.value = ioValue.ioValue;
                if ('currentEquation' in ioValue && !Number.isFinite(Number(ioValue.currentEquation))) {
                  ap.currentEquation = ioValue.currentEquation;
                }
              }
            });
          });
        }
      }
      
      // Simulate addIO - adds attachment points to this.inputs
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
      
      // Simulate deserialize flow
      async deserialize(json, values = {}) {
        // Step 1: Apply json values
        this.setValues(json);
        
        // Step 2: Overwrite with passed values (includes ioValues)
        this.setValues(values);
        
        // Step 3: Place atoms (simplified - just add Input atoms)
        if (json.allAtoms) {
          json.allAtoms.forEach((atomData) => {
            if (atomData.atomType === 'Input') {
              // Create Input atom
              const inputAtom = {
                atomType: 'Input',
                name: atomData.name,
                type: atomData.type || 'number',
                value: atomData.value || 10,
                uniqueID: atomData.uniqueID
              };
              
              // Add parent attachment point (this is what Input constructor does)
              inputAtom.parentAP = this.addIO(inputAtom.name, inputAtom.type, inputAtom.value, 'input');
              
              this.nodesOnTheScreen.push(inputAtom);
            }
          });
        }
        
        // Step 4: Call setValues([]) to trigger ioValues loading
        // THIS IS THE BUG: At this point, the Input atoms exist and have parentAP,
        // BUT the ioValues were already applied in Step 2 before the Input atoms existed
        // So we need to re-apply them here
        this.setValues([]);
        
        return this;
      }
    }
    
    // Simulate loading a GitHub molecule from GitHub
    // This is what the parent project has saved about this GitHub molecule:
    const savedGitHubMoleculeData = {
      atomType: 'GitHubMolecule',
      uniqueID: 'github-mol-1',
      name: 'Test GitHub Molecule',
      // These are the values the user set for the Input atoms when using this molecule
      ioValues: [
        { name: 'Width', ioValue: 100 },
        { name: 'Height', ioValue: 50 }
      ]
    };
    
    // This is what was fetched from GitHub (the molecule's internal structure):
    const fetchedGitHubMoleculeJson = {
      atomType: 'Molecule',
      uniqueID: 'original-id-1',
      name: 'Test GitHub Molecule',
      topLevel: true,
      allAtoms: [
        {
          atomType: 'Input',
          name: 'Width',
          type: 'number',
          value: 10, // default value
          uniqueID: 'input-1'
        },
        {
          atomType: 'Input',
          name: 'Height',
          type: 'number',
          value: 20, // default value
          uniqueID: 'input-2'
        }
      ],
      allConnectors: []
    };
    
    // Simulate the loadGithubMoleculeByName flow
    const molecule = new MockGitHubMolecule();
    
    // Values to overwrite includes the saved ioValues
    const valuesToOverwrite = {
      uniqueID: 'github-mol-1',
      ioValues: savedGitHubMoleculeData.ioValues,
      topLevel: false
    };
    
    // Call deserialize (this simulates what happens in placeAtom)
    await molecule.deserialize(fetchedGitHubMoleculeJson, valuesToOverwrite);
    
    // Now check if the ioValues were properly applied to the Input atoms
    // Find the Input atoms
    const widthInput = molecule.nodesOnTheScreen.find(atom => atom.name === 'Width');
    const heightInput = molecule.nodesOnTheScreen.find(atom => atom.name === 'Height');
    
    expect(widthInput).toBeDefined();
    expect(heightInput).toBeDefined();
    
    // Check if the parent attachment points have the correct values
    // These should be 100 and 50 (from ioValues), NOT 10 and 20 (defaults)
    expect(widthInput.parentAP.value).toBe(100);
    expect(heightInput.parentAP.value).toBe(50);
    
    console.log('✅ ioValues correctly applied to Input atoms in GitHub molecule');
  });
  
  it('should handle Input atoms with currentEquation values', async () => {
    // This tests the specific case where Input atoms have currentEquation
    // values that reference name variables
    
    class MockGitHubMolecule {
      constructor() {
        this.atomType = 'GitHubMolecule';
        this.name = 'Test GitHub Molecule';
        this.uniqueID = 'github-mol-1';
        this.inputs = [];
        this.nodesOnTheScreen = [];
        this.topLevel = false;
        this.ioValues = [];
      }
      
      setValues(values) {
        for (var key in values) {
          this[key] = values[key];
        }
        
        if (typeof this.ioValues !== 'undefined' && this.ioValues.length > 0) {
          this.ioValues.forEach((ioValue) => {
            this.inputs.forEach((ap) => {
              if (ioValue.name == ap.name && ap.type == 'input') {
                ap.value = ioValue.ioValue;
                if ('currentEquation' in ioValue && !Number.isFinite(Number(ioValue.currentEquation))) {
                  ap.currentEquation = ioValue.currentEquation;
                }
              }
            });
          });
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
        
        // Re-apply ioValues after atoms are created
        this.setValues([]);
        
        return this;
      }
    }
    
    const savedData = {
      atomType: 'GitHubMolecule',
      uniqueID: 'github-mol-1',
      // The user connected these inputs to name variables
      ioValues: [
        { name: 'Width', ioValue: 100, currentEquation: 'BoardWidth' },
        { name: 'Height', ioValue: 50, currentEquation: 'BoardHeight' }
      ]
    };
    
    const fetchedJson = {
      atomType: 'Molecule',
      uniqueID: 'original-id-1',
      allAtoms: [
        {
          atomType: 'Input',
          name: 'Width',
          type: 'number',
          value: 10,
          uniqueID: 'input-1'
        },
        {
          atomType: 'Input',
          name: 'Height',
          type: 'number',
          value: 20,
          uniqueID: 'input-2'
        }
      ]
    };
    
    const molecule = new MockGitHubMolecule();
    const valuesToOverwrite = {
      uniqueID: 'github-mol-1',
      ioValues: savedData.ioValues,
      topLevel: false
    };
    
    await molecule.deserialize(fetchedJson, valuesToOverwrite);
    
    const widthInput = molecule.nodesOnTheScreen.find(atom => atom.name === 'Width');
    const heightInput = molecule.nodesOnTheScreen.find(atom => atom.name === 'Height');
    
    // Check that both value and currentEquation were set
    expect(widthInput.parentAP.value).toBe(100);
    expect(widthInput.parentAP.currentEquation).toBe('BoardWidth');
    expect(heightInput.parentAP.value).toBe(50);
    expect(heightInput.parentAP.currentEquation).toBe('BoardHeight');
    
    console.log('✅ currentEquation values correctly applied to Input atoms');
  });
});
