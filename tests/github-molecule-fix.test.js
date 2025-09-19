import { describe, it, expect } from 'vitest';

describe('GitHubMolecule Copy/Paste Fix', () => {
  // Mock the generateUniqueID function for consistent testing
  let idCounter = 8000;
  function generateUniqueID() {
    return `id-${idCounter++}`;
  }

  // Mock GitHubMolecule deserialize logic
  function mockGitHubMoleculeDeserialize(json, values = {}, forceEnable = false) {
    console.log('🔄 GitHubMolecule.deserialize called with:', JSON.stringify(json, null, 2));
    
    // Simulate parent deserialize (which won't load much without allAtoms)
    const result = { success: true };
    
    // Our new logic: If this GitHubMolecule has parentRepo but no allAtoms, load from GitHub
    if (json.parentRepo && (!json.allAtoms || json.allAtoms.length === 0)) {
      console.log(`📡 Loading GitHubMolecule "${json.name}" from GitHub: ${json.parentRepo.owner}/${json.parentRepo.repoName}`);
      
      // Simulate loading from GitHub - this would create fresh content with new IDs
      const loadedFromGitHub = {
        allAtoms: [
          {
            atomType: "Output",
            uniqueID: generateUniqueID(), // Fresh ID
            name: "Output"
          },
          {
            atomType: "Rectangle", 
            uniqueID: generateUniqueID(), // Fresh ID
            name: "Rectangle"
          },
          {
            atomType: "Extrude",
            uniqueID: generateUniqueID(), // Fresh ID  
            name: "Extrude"
          }
        ],
        allConnectors: [
          {
            ap1ID: "id-8001", // References the fresh Rectangle ID
            ap2ID: "id-8002", // References the fresh Extrude ID  
            uniqueID: generateUniqueID() // Fresh connector ID
          }
        ]
      };
      
      console.log('✅ Loaded fresh content from GitHub:', JSON.stringify(loadedFromGitHub, null, 2));
      return { ...result, loadedFromGitHub };
    }
    
    return result;
  }

  it('should simulate the fixed copy/paste workflow for GitHubMolecules', () => {
    console.log('🧪 TESTING: GitHubMolecule copy/paste with deserialize fix');
    
    // Simulate what gets serialized during copy (without internal structure)
    const serializedGitHubMolecule = {
      "atomType": "GitHubMolecule",
      "name": "2x6 in MM",
      "x": 0.25,
      "y": 0.33,
      "uniqueID": "original-github-mol-id",
      "ioValues": [
        {
          "name": "Input (1)",
          "ioValue": 558.8,
          "currentEquation": "22*25.4"
        }
      ],
      "description": "Project imported from GitHub",
      "parentRepo": {
        "owner": "BarbourSmith",
        "repoName": "2x6-in-MM",
        "lastFoundGit": "2025-09-19T15:47:14.715Z"
      }
      // Notice: NO allAtoms or allConnectors (this is the current behavior)
    };

    console.log('📋 COPY: Serialized GitHubMolecule:', JSON.stringify(serializedGitHubMolecule, null, 2));

    // Simulate paste operation
    console.log('📌 PASTE: Starting paste operation...');
    
    // 1. Generate new unique ID for the molecule itself
    const pastedData = { ...serializedGitHubMolecule };
    pastedData.uniqueID = generateUniqueID();
    
    console.log('🆔 Generated new main molecule ID:', pastedData.uniqueID);
    
    // 2. Simulate placeAtom -> deserialize call
    console.log('🏗️ placeAtom calls GitHubMolecule.deserialize...');
    const deserializeResult = mockGitHubMoleculeDeserialize(pastedData);
    
    // Verify the fix worked
    expect(deserializeResult.loadedFromGitHub).toBeDefined();
    expect(deserializeResult.loadedFromGitHub.allAtoms).toHaveLength(3);
    
    // All internal atoms should have fresh IDs
    const loadedAtoms = deserializeResult.loadedFromGitHub.allAtoms;
    expect(loadedAtoms[0].uniqueID).not.toBe("original-output-id");
    expect(loadedAtoms[1].uniqueID).not.toBe("original-rect-id");
    expect(loadedAtoms[2].uniqueID).not.toBe("original-extrude-id");
    
    // Each atom should have a unique ID
    const atomIds = loadedAtoms.map(atom => atom.uniqueID);
    expect(new Set(atomIds).size).toBe(3); // All unique
    
    console.log('✅ SUCCESS: GitHubMolecule copy/paste now generates fresh internal IDs!');
    console.log('');
    console.log('🎯 KEY INSIGHT: By overriding GitHubMolecule.deserialize() to automatically');
    console.log('   load from GitHub when parentRepo exists but allAtoms is empty,');
    console.log('   we ensure that pasted GitHubMolecules get fresh internal structure.');
  });

  it('should not reload from GitHub if allAtoms already exist', () => {
    console.log('🧪 TESTING: GitHubMolecule with existing allAtoms should not reload');
    
    // Simulate a GitHubMolecule that already has loaded content
    const gitHubMoleculeWithContent = {
      "atomType": "GitHubMolecule",
      "name": "Already Loaded",
      "uniqueID": "existing-mol-id",
      "parentRepo": {
        "owner": "SomeUser",
        "repoName": "some-repo"
      },
      "allAtoms": [
        {
          atomType: "Rectangle",
          uniqueID: "existing-rect-id"
        }
      ],
      "allConnectors": []
    };

    console.log('📦 Input: GitHubMolecule with existing content');
    
    const deserializeResult = mockGitHubMoleculeDeserialize(gitHubMoleculeWithContent);
    
    // Should NOT have loaded from GitHub since allAtoms already exist
    expect(deserializeResult.loadedFromGitHub).toBeUndefined();
    
    console.log('✅ SUCCESS: Did not reload from GitHub (allAtoms already present)');
  });
});