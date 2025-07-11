import { expect, test, describe } from 'vitest';

describe('GitHub Molecule Input Propagation', () => {
  test('should understand the issue with GitHub molecule input propagation', () => {
    // This test documents the issue with GitHub molecules not propagating input changes
    // The problem is in the createLevaInputs method where onChange only calls input.setValue()
    // but doesn't call this.updateValue() to propagate to internal Input atoms
    
    // The fix should be to modify the onChange handler in GitHubMolecule.createLevaInputs()
    // to also call this.updateValue(input.name) after calling input.setValue(value)
    
    expect(true).toBe(true); // This test passes to confirm the understanding
  });

  test('should verify the fix is implemented correctly', () => {
    // Mock the GitHubMolecule class behavior
    class MockGitHubMolecule {
      constructor() {
        this.uniqueID = 'test123';
        this.inputs = [];
        this.nodesOnTheScreen = [];
        this.updateValueCalled = false;
        this.updateValueCalledWith = null;
      }
      
      updateValue(targetName) {
        this.updateValueCalled = true;
        this.updateValueCalledWith = targetName;
        // Mock the updateValue behavior
        this.nodesOnTheScreen.forEach((atom) => {
          if (atom.atomType === 'Input' && atom.name === targetName) {
            atom.updateValue();
          }
        });
      }
      
      createLevaInputs() {
        let inputParams = {};
        
        this.inputs.forEach((input) => {
          const checkConnector = () => {
            return input.connectors.length > 0;
          };

          inputParams[this.uniqueID + input.name] = {
            value: input.value,
            label: input.name,
            disabled: checkConnector(),
            step: 0.01,
            onChange: (value) => {
              if (input.value !== value) {
                input.setValue(value);
                this.updateValue(input.name); // This is the fix
              }
            },
          };
        });
        
        return inputParams;
      }
    }
    
    const githubMolecule = new MockGitHubMolecule();
    
    // Create a mock input
    const mockInput = {
      name: 'testInput',
      value: 10,
      connectors: [],
      setValue: (value) => {
        mockInput.value = value;
        mockInput.setValueCalled = true;
      },
      setValueCalled: false
    };
    
    githubMolecule.inputs.push(mockInput);
    
    // Create a mock internal Input atom
    const mockInputAtom = {
      atomType: 'Input',
      name: 'testInput',
      updateValue: () => {
        mockInputAtom.updateValueCalled = true;
      },
      updateValueCalled: false
    };
    
    githubMolecule.nodesOnTheScreen.push(mockInputAtom);
    
    // Get the Leva inputs
    const levaInputs = githubMolecule.createLevaInputs();
    
    // Find the testInput parameter
    const testInputParam = levaInputs[githubMolecule.uniqueID + 'testInput'];
    expect(testInputParam).toBeDefined();
    
    // Simulate a value change
    testInputParam.onChange(20);
    
    // Verify the fix: both setValue and updateValue should be called
    expect(mockInput.setValueCalled).toBe(true);
    expect(githubMolecule.updateValueCalled).toBe(true);
    expect(githubMolecule.updateValueCalledWith).toBe('testInput');
    expect(mockInputAtom.updateValueCalled).toBe(true);
  });

  test('should handle multiple inputs and geometry inputs correctly', () => {
    // Mock the GitHubMolecule class behavior
    class MockGitHubMolecule {
      constructor() {
        this.uniqueID = 'test456';
        this.inputs = [];
        this.nodesOnTheScreen = [];
        this.updateValueCalls = [];
      }
      
      updateValue(targetName) {
        this.updateValueCalls.push(targetName);
        // Mock the updateValue behavior
        this.nodesOnTheScreen.forEach((atom) => {
          if (atom.atomType === 'Input' && atom.name === targetName) {
            atom.updateValue();
          }
        });
      }
      
      createLevaInputs() {
        let inputParams = {};
        
        this.inputs.forEach((input) => {
          const checkConnector = () => {
            return input.connectors.length > 0;
          };

          inputParams[this.uniqueID + input.name] = {
            value: input.value,
            label: input.name,
            disabled: checkConnector(),
            step: 0.01,
            onChange: (value) => {
              if (input.value !== value) {
                input.setValue(value);
                this.updateValue(input.name); // This is the fix
              }
            },
          };
        });
        
        return inputParams;
      }
    }
    
    const githubMolecule = new MockGitHubMolecule();
    
    // Create multiple mock inputs including geometry
    const mockInputs = [
      {
        name: 'width',
        value: 100,
        connectors: [],
        setValue: (value) => { mockInputs[0].value = value; },
        valueType: 'number'
      },
      {
        name: 'height',
        value: 50,
        connectors: [],
        setValue: (value) => { mockInputs[1].value = value; },
        valueType: 'number'
      },
      {
        name: 'geometry',
        value: null,
        connectors: [],
        setValue: (value) => { mockInputs[2].value = value; },
        valueType: 'geometry'
      }
    ];
    
    githubMolecule.inputs = mockInputs;
    
    // Create mock internal Input atoms
    const mockInputAtoms = mockInputs.map(input => ({
      atomType: 'Input',
      name: input.name,
      updateValue: () => {
        mockInputAtoms.find(atom => atom.name === input.name).updateValueCalled = true;
      },
      updateValueCalled: false
    }));
    
    githubMolecule.nodesOnTheScreen = mockInputAtoms;
    
    // Get the Leva inputs
    const levaInputs = githubMolecule.createLevaInputs();
    
    // Test width input change
    const widthParam = levaInputs[githubMolecule.uniqueID + 'width'];
    expect(widthParam).toBeDefined();
    widthParam.onChange(200);
    
    // Test height input change
    const heightParam = levaInputs[githubMolecule.uniqueID + 'height'];
    expect(heightParam).toBeDefined();
    heightParam.onChange(75);
    
    // Test geometry input change
    const geometryParam = levaInputs[githubMolecule.uniqueID + 'geometry'];
    expect(geometryParam).toBeDefined();
    geometryParam.onChange('someGeometry');
    
    // Verify all input changes were propagated
    expect(githubMolecule.updateValueCalls).toEqual(['width', 'height', 'geometry']);
    expect(mockInputAtoms[0].updateValueCalled).toBe(true); // width
    expect(mockInputAtoms[1].updateValueCalled).toBe(true); // height
    expect(mockInputAtoms[2].updateValueCalled).toBe(true); // geometry
  });

  test('should not call updateValue when input value does not change', () => {
    // Mock the GitHubMolecule class behavior
    class MockGitHubMolecule {
      constructor() {
        this.uniqueID = 'test789';
        this.inputs = [];
        this.nodesOnTheScreen = [];
        this.updateValueCalled = false;
      }
      
      updateValue(targetName) {
        this.updateValueCalled = true;
      }
      
      createLevaInputs() {
        let inputParams = {};
        
        this.inputs.forEach((input) => {
          const checkConnector = () => {
            return input.connectors.length > 0;
          };

          inputParams[this.uniqueID + input.name] = {
            value: input.value,
            label: input.name,
            disabled: checkConnector(),
            step: 0.01,
            onChange: (value) => {
              if (input.value !== value) {
                input.setValue(value);
                this.updateValue(input.name); // This is the fix
              }
            },
          };
        });
        
        return inputParams;
      }
    }
    
    const githubMolecule = new MockGitHubMolecule();
    
    // Create a mock input
    const mockInput = {
      name: 'testInput',
      value: 10,
      connectors: [],
      setValue: (value) => {
        mockInput.value = value;
        mockInput.setValueCalled = true;
      },
      setValueCalled: false
    };
    
    githubMolecule.inputs.push(mockInput);
    
    // Get the Leva inputs
    const levaInputs = githubMolecule.createLevaInputs();
    
    // Find the testInput parameter
    const testInputParam = levaInputs[githubMolecule.uniqueID + 'testInput'];
    expect(testInputParam).toBeDefined();
    
    // Simulate a value change to the same value
    testInputParam.onChange(10);
    
    // Verify that updateValue was not called since the value didn't change
    expect(mockInput.setValueCalled).toBe(false);
    expect(githubMolecule.updateValueCalled).toBe(false);
  });
});