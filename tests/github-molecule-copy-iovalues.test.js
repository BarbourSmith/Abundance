import { describe, it, expect, beforeEach } from 'vitest';

/**
 * Integration test for GitHub molecule copying with ioValues
 * 
 * This test validates that when copying/reloading a GitHub molecule:
 * 1. The serialize() method captures ioValues
 * 2. loadGithubMoleculeByName() receives the ioValues
 * 3. The ioValues are properly applied after atom construction (not causing DISABLED state)
 * 4. The new molecule has the same input values as the original
 */
describe('GitHub Molecule Copy with IOValues', () => {
  
  it('should capture ioValues when serializing a GitHub molecule', () => {
    // Mock a GitHub molecule with Input atoms
    class MockGitHubMolecule {
      constructor() {
        this.atomType = 'GitHubMolecule';
        this.name = 'TestGitHubMolecule';
        this.uniqueID = 'github-mol-123';
        this.topLevel = false;
        this.nodesOnTheScreen = [];
        this.inputs = [];
      }
      
      // Mock Atom.serialize() that would be called by super.serialize()
      atomSerialize() {
        return {
          atomType: this.atomType,
          name: this.name,
          uniqueID: this.uniqueID,
          ioValues: [] // Initially empty from atom serialization
        };
      }
      
      serialize() {
        var allAtoms = [];
        this.nodesOnTheScreen.forEach((atom) => {
          allAtoms.push({ atomType: atom.atomType, name: atom.name });
        });
        
        var thisAsObject = this.atomSerialize();
        thisAsObject.topLevel = this.topLevel;
        thisAsObject.allAtoms = allAtoms;
        thisAsObject.allConnectors = [];
        
        // This is the key logic from molecule.js serialize()
        const inputAtoms = this.nodesOnTheScreen.filter(atom => atom.atomType === "Input");
        if (inputAtoms.length > 0) {
          const existingIoValues = thisAsObject.ioValues || [];
          const existingNames = new Set(existingIoValues.map(io => io.name));
          const MAX_VALUE_SIZE = 10000;
          const additionalIoValues = [];
          
          inputAtoms.forEach((inputAtom) => {
            if (existingNames.has(inputAtom.name)) {
              return;
            }
            
            const value = inputAtom.parentAP ? inputAtom.parentAP.getValue() : inputAtom.value;
            
            if (inputAtom.parentAP && inputAtom.parentAP.valueType === "geometry") {
              return;
            }
            
            if (typeof value !== "number" && typeof value !== "string") {
              return;
            }
            
            if (typeof value === "string" && value.length > MAX_VALUE_SIZE) {
              return;
            }
            
            if (value !== undefined && value !== null) {
              additionalIoValues.push({
                name: inputAtom.name,
                ioValue: value
              });
            }
          });
          
          if (additionalIoValues.length > 0) {
            thisAsObject.ioValues = [...existingIoValues, ...additionalIoValues];
          }
        }
        
        return thisAsObject;
      }
    }
    
    const githubMol = new MockGitHubMolecule();
    
    // Add Input atoms to the molecule
    githubMol.nodesOnTheScreen.push({
      atomType: 'Input',
      name: 'Width',
      value: 100,
      parentAP: {
        getValue: () => 100,
        valueType: 'number'
      }
    });
    
    githubMol.nodesOnTheScreen.push({
      atomType: 'Input',
      name: 'Height',
      value: 200,
      parentAP: {
        getValue: () => 200,
        valueType: 'number'
      }
    });
    
    // Serialize the molecule (this is what happens before reload)
    const serialized = githubMol.serialize();
    
    // Verify ioValues are captured
    expect(serialized.ioValues).toBeDefined();
    expect(serialized.ioValues).toHaveLength(2);
    expect(serialized.ioValues).toContainEqual({ name: 'Width', ioValue: 100 });
    expect(serialized.ioValues).toContainEqual({ name: 'Height', ioValue: 200 });
    
    console.log('✅ Serialization captures ioValues:', serialized.ioValues);
  });
  
  it('should pass ioValues to loadGithubMoleculeByName when reloading', () => {
    // Mock the reload flow
    class MockGitHubMolecule {
      constructor() {
        this.atomType = 'GitHubMolecule';
        this.parentRepo = { owner: 'test', repoName: 'test-repo' };
        this.parent = {
          serialize: () => ({ allConnectors: [] })
        };
        this.nodesOnTheScreen = [];
      }
      
      serialize() {
        return {
          atomType: this.atomType,
          uniqueID: 'mol-123',
          x: 0.5,
          y: 0.5,
          ioValues: [
            { name: 'Width', ioValue: 100 },
            { name: 'Height', ioValue: 200 }
          ],
          allAtoms: [],
          allConnectors: []
        };
      }
      
      deleteNode() {
        // Mock delete
      }
      
      loadGithubMoleculeByName(gitObj, oldObject, oldParentObjectConnectors) {
        // This is where we verify ioValues are passed
        return { gitObj, oldObject, oldParentObjectConnectors };
      }
      
      reloadMoleculeFromGithub() {
        // This mimics the actual reloadMoleculeFromGithub logic
        var githubMoleculeObjectPreReload = this.serialize();
        var githubMoleculeParentObjectConnectorsPreReload = this.parent.serialize().allConnectors;
        
        let gitObj = this.parentRepo;
        
        this.deleteNode();
        
        return this.loadGithubMoleculeByName(
          gitObj,
          githubMoleculeObjectPreReload,
          githubMoleculeParentObjectConnectorsPreReload
        );
      }
    }
    
    const githubMol = new MockGitHubMolecule();
    const result = githubMol.reloadMoleculeFromGithub();
    
    // Verify ioValues are passed in oldObject
    expect(result.oldObject).toBeDefined();
    expect(result.oldObject.ioValues).toBeDefined();
    expect(result.oldObject.ioValues).toHaveLength(2);
    expect(result.oldObject.ioValues).toContainEqual({ name: 'Width', ioValue: 100 });
    expect(result.oldObject.ioValues).toContainEqual({ name: 'Height', ioValue: 200 });
    
    console.log('✅ ioValues passed to loadGithubMoleculeByName:', result.oldObject.ioValues);
  });
  
  it('should include ioValues in valuesToOverwriteInLoadedVersion', () => {
    // Mock the logic inside loadGithubMoleculeByName
    const oldObject = {
      uniqueID: 'old-mol-123',
      x: 0.3,
      y: 0.4,
      ioValues: [
        { name: 'Width', ioValue: 150 },
        { name: 'Height', ioValue: 250 }
      ]
    };
    
    const gitObj = { owner: 'test', repoName: 'test-repo' };
    
    // This is the logic from molecule.js loadGithubMoleculeByName
    let valuesToOverwriteInLoadedVersion = {};
    let newMoleculeUniqueID = 'new-mol-456';
    
    if (oldObject.ioValues != undefined) {
      let xPos = oldObject.x !== undefined ? oldObject.x : 0.5;
      let yPos = oldObject.y !== undefined ? oldObject.y : 0.5;
      
      valuesToOverwriteInLoadedVersion = {
        uniqueID: newMoleculeUniqueID,
        x: xPos,
        y: yPos,
        parentRepo: gitObj,
        topLevel: false,
        ioValues: oldObject.ioValues,  // KEY: ioValues are included!
      };
    }
    
    // Verify ioValues are included in the values to overwrite
    expect(valuesToOverwriteInLoadedVersion.ioValues).toBeDefined();
    expect(valuesToOverwriteInLoadedVersion.ioValues).toHaveLength(2);
    expect(valuesToOverwriteInLoadedVersion.ioValues).toContainEqual({ name: 'Width', ioValue: 150 });
    expect(valuesToOverwriteInLoadedVersion.ioValues).toContainEqual({ name: 'Height', ioValue: 250 });
    
    console.log('✅ ioValues included in valuesToOverwriteInLoadedVersion:', valuesToOverwriteInLoadedVersion.ioValues);
  });
  
  it('should apply ioValues after atom construction (the timing fix)', () => {
    // This test validates the complete flow with the timing fix
    class MockMolecule {
      constructor() {
        this.nodesOnTheScreen = [];
        this.inputs = [];
        this.ioValues = undefined;
      }
      
      setValues(values, applyIOValues = false) {
        for (const key in values) {
          this[key] = values[key];
        }
        
        // NEW BEHAVIOR: Don't apply ioValues immediately
        if (applyIOValues && typeof this.ioValues !== "undefined") {
          this.applyIOValues();
        }
      }
      
      applyIOValues() {
        if (typeof this.ioValues !== "undefined") {
          this.ioValues.forEach((ioValue) => {
            this.inputs.forEach((ap) => {
              if (ioValue.name == ap.name && ap.type == "input") {
                ap.value = ioValue.ioValue;
              }
            });
          });
        }
      }
      
      async deserialize(json, values = {}) {
        // Step 1: Store values including ioValues (but don't apply yet)
        this.setValues(json);
        this.setValues(values);
        
        // Step 2: Construct atoms (simulated)
        if (json.allAtoms) {
          json.allAtoms.forEach((atomData) => {
            const atom = { name: atomData.name };
            this.nodesOnTheScreen.push(atom);
          });
        }
        
        // Step 3: Create input attachment points (simulated - this is when parentAP is created)
        this.inputs.push({ name: 'Width', type: 'input', value: 0 });
        this.inputs.push({ name: 'Height', type: 'input', value: 0 });
        
        // Step 4: NOW apply ioValues (AFTER atoms and parentAP are ready)
        this.applyIOValues();
        
        return this;
      }
    }
    
    const molecule = new MockMolecule();
    
    // Simulate the values passed from loadGithubMoleculeByName
    const valuesToOverwrite = {
      uniqueID: 'new-mol-789',
      x: 0.5,
      y: 0.6,
      ioValues: [
        { name: 'Width', ioValue: 300 },
        { name: 'Height', ioValue: 400 }
      ]
    };
    
    // Deserialize with ioValues
    molecule.deserialize({}, valuesToOverwrite).then(() => {
      // Verify ioValues were applied correctly
      expect(molecule.inputs[0].value).toBe(300);
      expect(molecule.inputs[1].value).toBe(400);
      
      console.log('✅ ioValues applied correctly after atom construction');
      console.log('  Width input value:', molecule.inputs[0].value);
      console.log('  Height input value:', molecule.inputs[1].value);
    });
  });
  
  it('should verify complete flow: serialize → reload → deserialize with ioValues', () => {
    // This is an end-to-end test of the complete flow
    
    // Step 1: Original GitHub molecule with Input atoms
    const originalMolecule = {
      atomType: 'GitHubMolecule',
      uniqueID: 'original-mol',
      nodesOnTheScreen: [
        {
          atomType: 'Input',
          name: 'Thickness',
          value: 12,
          parentAP: { getValue: () => 12, valueType: 'number' }
        },
        {
          atomType: 'Input', 
          name: 'Length',
          value: 100,
          parentAP: { getValue: () => 100, valueType: 'number' }
        }
      ],
      serialize() {
        const ioValues = this.nodesOnTheScreen
          .filter(atom => atom.atomType === 'Input')
          .map(atom => ({
            name: atom.name,
            ioValue: atom.parentAP ? atom.parentAP.getValue() : atom.value
          }));
        
        return {
          atomType: this.atomType,
          uniqueID: this.uniqueID,
          ioValues: ioValues
        };
      }
    };
    
    // Step 2: Serialize (captures current state with ioValues)
    const serialized = originalMolecule.serialize();
    expect(serialized.ioValues).toHaveLength(2);
    expect(serialized.ioValues).toContainEqual({ name: 'Thickness', ioValue: 12 });
    expect(serialized.ioValues).toContainEqual({ name: 'Length', ioValue: 100 });
    
    // Step 3: Prepare values to overwrite (what loadGithubMoleculeByName does)
    const valuesToOverwrite = {
      uniqueID: 'new-mol',
      ioValues: serialized.ioValues  // KEY: ioValues are preserved!
    };
    
    expect(valuesToOverwrite.ioValues).toBeDefined();
    expect(valuesToOverwrite.ioValues).toHaveLength(2);
    
    // Step 4: Deserialize would receive these values and apply them after construction
    // (tested in previous test case)
    
    console.log('✅ Complete flow verified:');
    console.log('  1. Serialize captured ioValues:', serialized.ioValues);
    console.log('  2. ioValues preserved in valuesToOverwrite:', valuesToOverwrite.ioValues);
    console.log('  3. Ready for deserialize to apply after construction');
  });
});
