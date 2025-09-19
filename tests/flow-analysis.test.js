import { describe, it, expect } from 'vitest';

describe('Copy/Paste Flow Analysis', () => {
  let idCounter = 7000;
  function generateUniqueID() {
    return `id-${idCounter++}`;
  }

  // Replicate the FIXED molecule remapIDs logic 
  function fixedRemapIDs(json) {
    let idPairs = {};

    const processNestedAtoms = (obj) => {
      if (obj.allAtoms) {
        obj.allAtoms.forEach((atom) => {
          let oldID = atom.uniqueID;
          let newID = generateUniqueID();
          idPairs[oldID] = newID;
          atom.uniqueID = newID;
          processNestedAtoms(atom);
        });
      }
    };

    if (json.uniqueID && !json.uniqueID.toString().startsWith("temp-new-")) {
      let oldMainID = json.uniqueID;
      let newMainID = generateUniqueID();
      idPairs[oldMainID] = newMainID;
      json.uniqueID = newMainID;
    }

    processNestedAtoms(json);

    const processConnectors = (obj) => {
      if (obj.allConnectors) {
        obj.allConnectors.forEach((connector) => {
          if (connector.ap1ID && idPairs[connector.ap1ID]) {
            connector.ap1ID = idPairs[connector.ap1ID];
          }
          if (connector.ap2ID && idPairs[connector.ap2ID]) {
            connector.ap2ID = idPairs[connector.ap2ID];
          }
          if (connector.uniqueID) {
            connector.uniqueID = generateUniqueID();
          }
        });
      }
      
      if (obj.allAtoms) {
        obj.allAtoms.forEach(atom => processConnectors(atom));
      }
    };

    processConnectors(json);
    return json;
  }

  it('should test the "with connectors" paste path', () => {
    // This simulates the path taken when GlobalVariables.connectorsSelected has values
    
    // Simulate copied atoms and connectors
    const atomsSelected = [
      {
        "atomType": "GitHubMolecule",
        "name": "2x6 in MM",
        "uniqueID": "github-mol-1",
        // Key question: Are allAtoms included in the serialized GitHubMolecule?
        "allAtoms": [
          {
            "atomType": "Rectangle",
            "uniqueID": "rect-1"
          },
          {
            "atomType": "Extrude", 
            "uniqueID": "extrude-1"
          }
        ],
        "allConnectors": [
          {
            "ap1ID": "rect-1",
            "ap2ID": "extrude-1"
          }
        ]
      }
    ];

    const connectorsSelected = [
      {
        "ap1ID": "some-other-atom",
        "ap2ID": "github-mol-1"
      }
    ];

    // Create the moleculeData structure as done in flowCanvas.jsx lines 228-232
    const moleculeData = {
      allAtoms: atomsSelected,
      allConnectors: connectorsSelected,
      fileTypeVersion: 1,
    };

    console.log('💡 Testing "with connectors" path');
    console.log('Input moleculeData:', JSON.stringify(moleculeData, null, 2));

    // Apply remapIDs as done in line 235-236
    const remappedData = fixedRemapIDs(moleculeData);

    console.log('Output remappedData:', JSON.stringify(remappedData, null, 2));

    // Check if internal atoms got new IDs
    const remappedGitHubMol = remappedData.allAtoms[0];
    expect(remappedGitHubMol.allAtoms[0].uniqueID).not.toBe("rect-1");
    expect(remappedGitHubMol.allAtoms[1].uniqueID).not.toBe("extrude-1");

    console.log('✅ "With connectors" path works when allAtoms are included');
  });

  it('should test the "without connectors" paste path', () => {
    // This simulates the path taken when GlobalVariables.connectorsSelected is empty
    
    const atomsSelected = [
      {
        "atomType": "GitHubMolecule",
        "name": "2x6 in MM", 
        "uniqueID": "github-mol-1",
        "allAtoms": [
          {
            "atomType": "Rectangle",
            "uniqueID": "rect-1"
          },
          {
            "atomType": "Extrude",
            "uniqueID": "extrude-1"
          }
        ],
        "allConnectors": [
          {
            "ap1ID": "rect-1",
            "ap2ID": "extrude-1"
          }
        ]
      }
    ];

    console.log('💡 Testing "without connectors" path');
    console.log('Input atom:', JSON.stringify(atomsSelected[0], null, 2));

    // Simulate the forEach loop from lines 260-272
    const item = JSON.parse(JSON.stringify(atomsSelected[0])); // Deep copy
    
    if (item.atomType == "Molecule" || item.atomType == "GitHubMolecule") {
      // Apply remapIDs as done in line 266
      const remappedItem = fixedRemapIDs(item);
      
      console.log('Output remapped item:', JSON.stringify(remappedItem, null, 2));
      
      // Check if internal atoms got new IDs
      expect(remappedItem.allAtoms[0].uniqueID).not.toBe("rect-1");
      expect(remappedItem.allAtoms[1].uniqueID).not.toBe("extrude-1");
      
      console.log('✅ "Without connectors" path works when allAtoms are included');
    }
  });

  it('should reveal the core issue: what if allAtoms are missing from serialized GitHubMolecule?', () => {
    // This is what I suspect is happening - serialized GitHubMolecules might not include internal structure
    
    const problematicSerializedGitHubMolecule = {
      "atomType": "GitHubMolecule",
      "name": "2x6 in MM",
      "uniqueID": "github-mol-1",
      "ioValues": [
        {
          "name": "Input (1)",
          "ioValue": 558.8
        }
      ],
      "description": "Project imported from GitHub",
      "parentRepo": {
        "owner": "BarbourSmith",
        "repoName": "2x6-in-MM"
      }
      // MISSING: allAtoms and allConnectors
      // This could be what's actually happening during copy
    };

    console.log('🐛 PROBLEMATIC: GitHubMolecule without internal structure');
    console.log('Input:', JSON.stringify(problematicSerializedGitHubMolecule, null, 2));

    const remapped = fixedRemapIDs(JSON.parse(JSON.stringify(problematicSerializedGitHubMolecule)));

    console.log('After remapIDs (no change in internal structure):', JSON.stringify(remapped, null, 2));

    // This would be the issue - remapIDs can't fix what's not there
    expect(remapped.allAtoms).toBeUndefined();
    expect(remapped.allConnectors).toBeUndefined();

    console.log('❌ ISSUE IDENTIFIED: If GitHubMolecule serialize() doesn\'t include');
    console.log('   allAtoms/allConnectors, then remapIDs fix is ineffective!');
    console.log('');
    console.log('🔧 SOLUTION NEEDED: Ensure GitHubMolecule serialization includes');
    console.log('   its loaded internal structure, OR handle the missing structure');
    console.log('   during paste by reloading from GitHub.');
  });
});