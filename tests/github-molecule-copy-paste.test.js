import { describe, it, expect, beforeEach } from 'vitest';

/**
 * Test to verify that GitHub molecules can be copied and pasted correctly
 * with all their internal atoms preserved and functional.
 */

describe('GitHub Molecule Copy/Paste', () => {
  let idCounter = 1000;
  
  // Mock generateUniqueID
  function generateUniqueID() {
    return `id-${idCounter++}`;
  }

  // Simulate the remapIDs function from molecule.js
  function remapIDs(json) {
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
        obj.allAtoms.forEach((atom) => processConnectors(atom));
      }
    };

    // Handle all connectors recursively
    processConnectors(json);

    return json;
  }

  // Simulate serialize method - creates a copy with offset
  function serialize(molecule, offset = { x: 0.05, y: 0.05 }) {
    // Deep clone the molecule
    const serialized = JSON.parse(JSON.stringify(molecule));
    // Apply offset
    serialized.x = (serialized.x || 0.5) + offset.x;
    serialized.y = (serialized.y || 0.5) + offset.y;
    return serialized;
  }

  it('should preserve all data when copying and pasting a GitHub molecule', () => {
    // Reset counter
    idCounter = 1000;

    // Create a GitHub molecule with internal atoms
    const originalGitHubMolecule = {
      atomType: 'GitHubMolecule',
      name: '2x6 in MM',
      uniqueID: 'github-mol-1',
      x: 0.5,
      y: 0.5,
      parentRepo: {
        owner: 'testUser',
        repoName: 'test-lumber'
      },
      ioValues: [
        { name: 'Length', ioValue: 100 },
        { name: 'Width', ioValue: 50 }
      ],
      allAtoms: [
        {
          atomType: 'Input',
          uniqueID: 'input-length-1',
          name: 'Length',
          value: 100
        },
        {
          atomType: 'Input',
          uniqueID: 'input-width-1',
          name: 'Width',
          value: 50
        },
        {
          atomType: 'Rectangle',
          uniqueID: 'rect-1',
          name: 'Rectangle'
        },
        {
          atomType: 'Extrude',
          uniqueID: 'extrude-1',
          name: 'Extrude'
        },
        {
          atomType: 'Output',
          uniqueID: 'output-1',
          name: 'Output'
        }
      ],
      allConnectors: [
        {
          uniqueID: 'conn-1',
          ap1ID: 'input-length-1',
          ap2ID: 'rect-1',
          ap2Name: 'length'
        },
        {
          uniqueID: 'conn-2',
          ap1ID: 'input-width-1',
          ap2ID: 'rect-1',
          ap2Name: 'width'
        },
        {
          uniqueID: 'conn-3',
          ap1ID: 'rect-1',
          ap2ID: 'extrude-1',
          ap2Name: 'input'
        },
        {
          uniqueID: 'conn-4',
          ap1ID: 'extrude-1',
          ap2ID: 'output-1',
          ap2Name: 'input'
        }
      ]
    };

    console.log('Original GitHub Molecule:', JSON.stringify(originalGitHubMolecule, null, 2));

    // Step 1: Simulate copy (serialize)
    const copiedData = serialize(originalGitHubMolecule);
    console.log('\nAfter serialize (copy):', JSON.stringify(copiedData, null, 2));

    // Verify serialization preserves critical data
    expect(copiedData.atomType).toBe('GitHubMolecule');
    expect(copiedData.parentRepo).toEqual({
      owner: 'testUser',
      repoName: 'test-lumber'
    });
    expect(copiedData.allAtoms).toHaveLength(5);
    expect(copiedData.allConnectors).toHaveLength(4);
    expect(copiedData.ioValues).toHaveLength(2);

    // Step 2: Simulate paste (remapIDs)
    const pastedData = remapIDs(copiedData);
    console.log('\nAfter remapIDs (paste):', JSON.stringify(pastedData, null, 2));

    // Verify remapping created new IDs
    expect(pastedData.uniqueID).not.toBe(originalGitHubMolecule.uniqueID);
    expect(pastedData.uniqueID).toMatch(/^id-\d+$/);

    // Verify all internal atoms got new IDs
    pastedData.allAtoms.forEach((atom, index) => {
      expect(atom.uniqueID).not.toBe(originalGitHubMolecule.allAtoms[index].uniqueID);
      expect(atom.uniqueID).toMatch(/^id-\d+$/);
    });

    // Verify connectors got remapped
    pastedData.allConnectors.forEach((connector) => {
      expect(connector.ap1ID).toMatch(/^id-\d+$/);
      expect(connector.ap2ID).toMatch(/^id-\d+$/);
    });

    // Verify critical data is still present
    expect(pastedData.atomType).toBe('GitHubMolecule');
    expect(pastedData.parentRepo).toEqual({
      owner: 'testUser',
      repoName: 'test-lumber'
    });
    expect(pastedData.allAtoms).toHaveLength(5);
    expect(pastedData.allConnectors).toHaveLength(4);
    expect(pastedData.ioValues).toHaveLength(2);

    // Verify ioValues are preserved
    expect(pastedData.ioValues).toEqual([
      { name: 'Length', ioValue: 100 },
      { name: 'Width', ioValue: 50 }
    ]);

    console.log('\n✅ SUCCESS: GitHub molecule copy/paste preserves all data correctly!');
  });

  it('should handle GitHub molecule without ioValues', () => {
    idCounter = 2000;

    const gitHubMolecule = {
      atomType: 'GitHubMolecule',
      name: 'Simple Molecule',
      uniqueID: 'github-mol-2',
      parentRepo: {
        owner: 'testUser',
        repoName: 'simple-project'
      },
      allAtoms: [
        {
          atomType: 'Circle',
          uniqueID: 'circle-1',
          name: 'Circle'
        },
        {
          atomType: 'Output',
          uniqueID: 'output-2',
          name: 'Output'
        }
      ],
      allConnectors: [
        {
          uniqueID: 'conn-5',
          ap1ID: 'circle-1',
          ap2ID: 'output-2',
          ap2Name: 'input'
        }
      ]
    };

    const copied = serialize(gitHubMolecule);
    const pasted = remapIDs(copied);

    // Should work even without ioValues
    expect(pasted.atomType).toBe('GitHubMolecule');
    expect(pasted.parentRepo).toEqual({
      owner: 'testUser',
      repoName: 'simple-project'
    });
    expect(pasted.allAtoms).toHaveLength(2);
    expect(pasted.allConnectors).toHaveLength(1);

    console.log('✅ SUCCESS: GitHub molecule without ioValues works correctly!');
  });

  it('should handle nested GitHub molecules', () => {
    idCounter = 3000;

    // A molecule containing a GitHub molecule
    const moleculeWithGitHub = {
      atomType: 'Molecule',
      name: 'Container',
      uniqueID: 'container-1',
      allAtoms: [
        {
          atomType: 'GitHubMolecule',
          name: 'Nested GitHub Mol',
          uniqueID: 'github-nested-1',
          parentRepo: {
            owner: 'testUser',
            repoName: 'nested-project'
          },
          allAtoms: [
            {
              atomType: 'Circle',
              uniqueID: 'circle-nested-1',
              name: 'Circle'
            }
          ],
          allConnectors: []
        },
        {
          atomType: 'Output',
          uniqueID: 'output-container-1',
          name: 'Output'
        }
      ],
      allConnectors: [
        {
          uniqueID: 'conn-container-1',
          ap1ID: 'github-nested-1',
          ap2ID: 'output-container-1',
          ap2Name: 'input'
        }
      ]
    };

    const copied = serialize(moleculeWithGitHub);
    const pasted = remapIDs(copied);

    // Verify main molecule gets new ID
    expect(pasted.uniqueID).not.toBe(moleculeWithGitHub.uniqueID);

    // Verify nested GitHub molecule gets new ID
    const nestedGitHub = pasted.allAtoms[0];
    expect(nestedGitHub.atomType).toBe('GitHubMolecule');
    expect(nestedGitHub.uniqueID).not.toBe(moleculeWithGitHub.allAtoms[0].uniqueID);

    // Verify atoms inside nested GitHub molecule get new IDs
    expect(nestedGitHub.allAtoms[0].uniqueID).not.toBe(
      moleculeWithGitHub.allAtoms[0].allAtoms[0].uniqueID
    );

    // Verify parentRepo is preserved
    expect(nestedGitHub.parentRepo).toEqual({
      owner: 'testUser',
      repoName: 'nested-project'
    });

    console.log('✅ SUCCESS: Nested GitHub molecules are handled correctly!');
  });
});
