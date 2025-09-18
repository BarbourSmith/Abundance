import { describe, it, expect } from 'vitest';

describe('ID Remapping Logic Test', () => {
  // Mock the generateUniqueID function
  let idCounter = 1000;
  function generateUniqueID() {
    return `id-${idCounter++}`;
  }

  // Replicate the remapIDsForPaste logic from globalvariables.js
  function remapIDsForPaste(atomsArray) {
    // First pass: create mapping of old IDs to new IDs for all atoms
    const idMapping = {};
    atomsArray.forEach((atom) => {
      const oldID = atom.uniqueID;
      const newID = generateUniqueID();
      idMapping[oldID] = newID;

      // Also map any nested atom IDs (for complex molecules)
      if (atom.allAtoms) {
        atom.allAtoms.forEach((nestedAtom) => {
          const oldNestedID = nestedAtom.uniqueID;
          const newNestedID = generateUniqueID();
          idMapping[oldNestedID] = newNestedID;
        });
      }
    });

    // Second pass: apply the ID mapping to all atoms and their connectors
    return atomsArray.map((atom) => {
      // Create a deep copy to avoid modifying the original
      const atomCopy = JSON.parse(JSON.stringify(atom));

      // Update the main atom's unique ID
      if (idMapping[atomCopy.uniqueID]) {
        atomCopy.uniqueID = idMapping[atomCopy.uniqueID];
      }

      // Update nested atoms (for complex molecules)
      if (atomCopy.allAtoms) {
        atomCopy.allAtoms.forEach((nestedAtom) => {
          if (idMapping[nestedAtom.uniqueID]) {
            nestedAtom.uniqueID = idMapping[nestedAtom.uniqueID];
          }
        });
      }

      // Update connector references
      if (atomCopy.allConnectors) {
        atomCopy.allConnectors.forEach((connector) => {
          if (connector.ap1ID && idMapping[connector.ap1ID]) {
            connector.ap1ID = idMapping[connector.ap1ID];
          }
          if (connector.ap2ID && idMapping[connector.ap2ID]) {
            connector.ap2ID = idMapping[connector.ap2ID];
          }
          // Also remap connector's own uniqueID if it exists
          if (connector.uniqueID) {
            connector.uniqueID = generateUniqueID();
          }
        });
      }

      return atomCopy;
    });
  }

  // Replicate the FIXED molecule remapIDs logic
  function moleculeRemapIDs(json) {
    let idPairs = {};
    
    // Always ensure the main atom/molecule gets a new ID if it doesn't already have one assigned
    if (json.uniqueID && !json.uniqueID.toString().startsWith('temp-new-')) {
      let oldMainID = json.uniqueID;
      let newMainID = generateUniqueID();
      idPairs[oldMainID] = newMainID;
      json.uniqueID = newMainID;
    }
    
    // Handle nested atoms if they exist
    if (json.allAtoms) {
      json.allAtoms.forEach((atom) => {
        let oldID = atom.uniqueID;
        let newID = generateUniqueID();
        idPairs[oldID] = newID;
        atom.uniqueID = newID;
      });
      
      // Handle connectors if they exist
      if (json.allConnectors) {
        json.allConnectors.forEach((connector) => {
          if (connector.ap1ID && idPairs[connector.ap1ID]) {
            connector.ap1ID = idPairs[connector.ap1ID];
          }
          if (connector.ap2ID && idPairs[connector.ap2ID]) {
            connector.ap2ID = idPairs[connector.ap2ID];
          }
          // Also remap connector's own uniqueID if it exists
          if (connector.uniqueID) {
            connector.uniqueID = generateUniqueID();
          }
        });
      }
    }

    return json;
  }

  it('should properly remap IDs with GlobalVariables.remapIDsForPaste', () => {
    const mockMoleculeData = {
      atomType: 'GitHubMolecule',
      name: 'TestGitHubMolecule',
      uniqueID: 'molecule-123',
      x: 0.3,
      y: 0.3,
      allAtoms: [
        {
          atomType: 'Circle',
          name: 'InternalCircle1',
          uniqueID: 'atom-456',
          x: 0.2,
          y: 0.2
        },
        {
          atomType: 'Rectangle',
          name: 'InternalRectangle',
          uniqueID: 'atom-789',
          x: 0.4,
          y: 0.4
        }
      ],
      allConnectors: [
        {
          ap1ID: 'atom-456',
          ap2ID: 'atom-789',
          uniqueID: 'connector-101'
        }
      ]
    };

    console.log('Original data:', JSON.stringify(mockMoleculeData, null, 2));

    const remappedArray = remapIDsForPaste([mockMoleculeData]);
    
    expect(remappedArray).toHaveLength(1);
    const remappedMolecule = remappedArray[0];

    console.log('Remapped data:', JSON.stringify(remappedMolecule, null, 2));

    // Main molecule should have new ID
    expect(remappedMolecule.uniqueID).not.toBe('molecule-123');
    expect(remappedMolecule.uniqueID).toBeDefined();

    // Nested atoms should have new IDs
    expect(remappedMolecule.allAtoms).toHaveLength(2);
    expect(remappedMolecule.allAtoms[0].uniqueID).not.toBe('atom-456');
    expect(remappedMolecule.allAtoms[1].uniqueID).not.toBe('atom-789');

    // Connectors should reference the new IDs and have new uniqueIDs
    expect(remappedMolecule.allConnectors).toHaveLength(1);
    const connector = remappedMolecule.allConnectors[0];
    expect(connector.ap1ID).toBe(remappedMolecule.allAtoms[0].uniqueID);
    expect(connector.ap2ID).toBe(remappedMolecule.allAtoms[1].uniqueID);
    // FIXED: Connector should also get a new uniqueID
    expect(connector.uniqueID).not.toBe('connector-101');
    expect(connector.uniqueID).toBeDefined();
  });

  it('should demonstrate the issue with molecule.remapIDs', () => {
    const mockAtomData = {
      atomType: 'GitHubMolecule',
      name: 'TestGitHubMolecule',
      uniqueID: 'molecule-123',
      x: 0.3,
      y: 0.3,
      // This is how molecule.serialize() structures nested atoms
      allAtoms: [
        {
          atomType: 'Circle',
          name: 'InternalCircle1',
          uniqueID: 'atom-456',
          x: 0.2,
          y: 0.2
        }
      ],
      allConnectors: []
    };

    // Simulate the regular paste case from flowCanvas.jsx (lines 256-268)
    let newAtomID = generateUniqueID();
    const originalMainID = mockAtomData.uniqueID;
    const originalInternalID = mockAtomData.allAtoms[0].uniqueID;
    
    mockAtomData.uniqueID = newAtomID;
    
    console.log(`Changed main atom ID from ${originalMainID} to ${newAtomID}`);
    console.log('Original internal atom ID:', originalInternalID);

    // Apply molecule remapIDs
    const remapped = moleculeRemapIDs(mockAtomData);

    console.log('After molecule.remapIDs:', JSON.stringify(remapped, null, 2));

    // The main molecule gets a new ID
    expect(remapped.uniqueID).not.toBe(originalMainID);
    
    // BUT the internal atoms should also get new IDs - this should work with molecule.remapIDs
    expect(remapped.allAtoms[0].uniqueID).not.toBe(originalInternalID);
    expect(remapped.allAtoms[0].uniqueID).toBeDefined();
    
    console.log('After molecule.remapIDs - internal atom has new ID:', remapped.allAtoms[0].uniqueID);
  });

  it('should demonstrate the fix for molecule.remapIDs', () => {
    const mockAtomData = {
      atomType: 'GitHubMolecule',
      name: 'TestGitHubMolecule',
      uniqueID: 'molecule-123',
      x: 0.3,
      y: 0.3,
      // This is how molecule.serialize() structures nested atoms
      allAtoms: [
        {
          atomType: 'Circle',
          name: 'InternalCircle1',
          uniqueID: 'atom-456',
          x: 0.2,
          y: 0.2
        }
      ],
      allConnectors: [
        {
          ap1ID: 'some-attachment-point',
          ap2ID: 'atom-456',
          uniqueID: 'connector-789'
        }
      ]
    };

    // Apply the fixed molecule remapIDs
    const remapped = moleculeRemapIDs(mockAtomData);

    console.log('After FIXED molecule.remapIDs:', JSON.stringify(remapped, null, 2));

    // The main molecule should get a new ID
    expect(remapped.uniqueID).not.toBe('molecule-123');
    expect(remapped.uniqueID).toBeDefined();
    
    // Internal atoms should get new IDs
    expect(remapped.allAtoms[0].uniqueID).not.toBe('atom-456');
    expect(remapped.allAtoms[0].uniqueID).toBeDefined();
    
    // Connectors should be updated where applicable
    expect(remapped.allConnectors[0].uniqueID).not.toBe('connector-789');
    expect(remapped.allConnectors[0].uniqueID).toBeDefined();
    
    // ap2ID should be updated to match the new internal atom ID
    expect(remapped.allConnectors[0].ap2ID).toBe(remapped.allAtoms[0].uniqueID);
    
    console.log('Fixed molecule.remapIDs - all IDs properly remapped');
  });

  it('should demonstrate the potential issue with the current flowCanvas logic', () => {
    const mockAtomData = {
      atomType: 'GitHubMolecule',
      name: 'TestGitHubMolecule',
      uniqueID: 'molecule-123',
      x: 0.3,
      y: 0.3,
      // This is how molecule.serialize() structures nested atoms
      allAtoms: [
        {
          atomType: 'Circle',
          name: 'InternalCircle1',
          uniqueID: 'atom-456',
          x: 0.2,
          y: 0.2
        }
      ],
      allConnectors: []
    };

    // Simulate ONLY the simple ID assignment that happens BEFORE remapIDs call
    let newAtomID = generateUniqueID();
    const originalMainID = mockAtomData.uniqueID;
    const originalInternalID = mockAtomData.allAtoms[0].uniqueID;
    
    mockAtomData.uniqueID = newAtomID;
    
    console.log(`Changed main atom ID from ${originalMainID} to ${newAtomID}`);
    console.log('Original internal atom ID:', originalInternalID);

    // The main molecule gets a new ID
    expect(mockAtomData.uniqueID).not.toBe(originalMainID);
    
    // But if remapIDs is not called properly, internal atoms keep old IDs
    expect(mockAtomData.allAtoms[0].uniqueID).toBe(originalInternalID);
    
    console.log('Without proper remapping - internal atom still has old ID:', mockAtomData.allAtoms[0].uniqueID);
  });
});