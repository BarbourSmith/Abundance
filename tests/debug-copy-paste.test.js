import { describe, it, expect } from 'vitest';

describe('Debug Copy/Paste Issue', () => {
  // Mock the generateUniqueID function for consistent testing
  let idCounter = 6000;
  function generateUniqueID() {
    return `id-${idCounter++}`;
  }

  // Replicate the FIXED molecule remapIDs logic 
  function fixedRemapIDs(json) {
    let idPairs = {};

    // Helper function to recursively process nested atoms
    const processNestedAtoms = (obj) => {
      if (obj.allAtoms) {
        obj.allAtoms.forEach((atom) => {
          let oldID = atom.uniqueID;
          let newID = generateUniqueID();
          idPairs[oldID] = newID;
          atom.uniqueID = newID;
          
          // Recursively process any nested atoms (e.g., within GitHubMolecules)
          processNestedAtoms(atom);
        });
      }
    };

    // Always ensure the main atom/molecule gets a new ID if it doesn't already have one assigned
    if (json.uniqueID && !json.uniqueID.toString().startsWith("temp-new-")) {
      let oldMainID = json.uniqueID;
      let newMainID = generateUniqueID();
      idPairs[oldMainID] = newMainID;
      json.uniqueID = newMainID;
    }

    // Process all nested atoms recursively
    processNestedAtoms(json);

    // Helper function to recursively process connectors
    const processConnectors = (obj) => {
      if (obj.allConnectors) {
        obj.allConnectors.forEach((connector) => {
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
      
      // Process connectors in nested atoms recursively
      if (obj.allAtoms) {
        obj.allAtoms.forEach(atom => processConnectors(atom));
      }
    };

    // Handle all connectors recursively
    processConnectors(json);

    return json;
  }

  it('should simulate the exact copy/paste workflow that user is experiencing', () => {
    // Create test data that simulates what would be serialized during copy
    // This might be what's happening - the serialize method might NOT be including allAtoms
    const serializedGitHubMolecule = {
      "atomType": "GitHubMolecule",
      "name": "2x6 in MM",
      "x": 0.25,
      "y": 0.33,
      "uniqueID": "b2c56f34-edc7-4f75-a62c-170c6cf3d638",
      "ioValues": [
        {
          "name": "Input (1)",
          "ioValue": 558.8,
          "currentEquation": "22*25.4"
        }
      ],
      "description": "Project imported from GitHub"
      // NOTICE: NO allAtoms or allConnectors here!
      // This might be what's causing the issue
    };

    console.log('🐛 DEBUGGING: What user might be experiencing');
    console.log('Serialized GitHubMolecule (what copy produces):', JSON.stringify(serializedGitHubMolecule, null, 2));

    // Apply remapIDs to this serialized data
    const remapped = fixedRemapIDs(JSON.parse(JSON.stringify(serializedGitHubMolecule)));

    console.log('After remapIDs:', JSON.stringify(remapped, null, 2));

    // The issue: if the serialized data doesn't include allAtoms/allConnectors,
    // then remapIDs can't fix internal IDs because they're not there!
    expect(remapped.allAtoms).toBeUndefined(); // This would be the problem
    expect(remapped.allConnectors).toBeUndefined(); // This too

    console.log('🔍 POTENTIAL ISSUE: If GitHubMolecules serialize without their internal structure,');
    console.log('   then remapIDs cannot fix the internal atom IDs because they are not copied!');
  });

  it('should test what happens when GitHubMolecule does serialize with internal structure', () => {
    // This is what SHOULD happen if serialize includes the internal structure
    const completeSerializedGitHubMolecule = {
      "atomType": "GitHubMolecule",
      "name": "2x6 in MM", 
      "x": 0.25,
      "y": 0.33,
      "uniqueID": "b2c56f34-edc7-4f75-a62c-170c6cf3d638",
      "ioValues": [
        {
          "name": "Input (1)",
          "ioValue": 558.8,
          "currentEquation": "22*25.4"
        }
      ],
      "description": "Project imported from GitHub",
      // CRITICAL: These SHOULD be included during serialize
      "allAtoms": [
        {
          "atomType": "Output",
          "uniqueID": "62d66dcc-8599-4609-98b3-3216f68170a9"
        },
        {
          "atomType": "Rectangle",
          "uniqueID": "0e5d86b6-bfe7-4927-a03c-e9fc0c9bd2e9"
        },
        {
          "atomType": "Extrude",
          "uniqueID": "3db445bb-6cdb-46b3-9ddb-3c5d955b2c49"
        }
      ],
      "allConnectors": [
        {
          "ap1ID": "0e5d86b6-bfe7-4927-a03c-e9fc0c9bd2e9",
          "ap2ID": "3db445bb-6cdb-46b3-9ddb-3c5d955b2c49"
        }
      ]
    };

    console.log('✅ CORRECT: GitHubMolecule with internal structure');
    console.log('Complete serialized data:', JSON.stringify(completeSerializedGitHubMolecule, null, 2));

    const remapped = fixedRemapIDs(JSON.parse(JSON.stringify(completeSerializedGitHubMolecule)));

    console.log('After remapIDs with internal structure:', JSON.stringify(remapped, null, 2));

    // Now the internal atoms should get new IDs
    expect(remapped.allAtoms).toBeDefined();
    expect(remapped.allAtoms).toHaveLength(3);
    expect(remapped.allAtoms[0].uniqueID).not.toBe("62d66dcc-8599-4609-98b3-3216f68170a9");
    expect(remapped.allAtoms[1].uniqueID).not.toBe("0e5d86b6-bfe7-4927-a03c-e9fc0c9bd2e9");
    expect(remapped.allAtoms[2].uniqueID).not.toBe("3db445bb-6cdb-46b3-9ddb-3c5d955b2c49");

    console.log('✅ SUCCESS: When internal structure is serialized, remapIDs works correctly');
  });

  it('should reveal the exact issue: GitHubMolecule serialize method', () => {
    console.log('🔍 HYPOTHESIS: The issue is that GitHubMolecule.serialize() might not be');
    console.log('   including allAtoms and allConnectors from its loaded GitHub content.');
    console.log('');
    console.log('   When a GitHubMolecule is loaded from GitHub, it has internal structure,');
    console.log('   but when it is serialized for copy/paste, it might only serialize');
    console.log('   its basic atom properties, not the internal loaded structure.');
    console.log('');
    console.log('🔧 SOLUTION: Ensure GitHubMolecule serialize includes its internal structure');
    console.log('   OR fix the deserialization to reload from GitHub during paste');
  });
});