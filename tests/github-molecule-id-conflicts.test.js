import { describe, it, expect, beforeEach } from "vitest";

/**
 * Test to verify that importing GitHub molecules doesn't create ID conflicts
 * with the new short ID system. When a project is imported as a GitHub molecule,
 * all its internal IDs are remapped to new unique IDs.
 */

// Mock GlobalVariables with our new implementation
class MockGlobalVariables {
  constructor() {
    this.idCounter = 1;
  }

  generateUniqueID() {
    return `id-${this.idCounter++}`;
  }

  resetIdCounter(projectJson) {
    let maxId = 0;

    const extractIdNumber = (id) => {
      if (typeof id === 'string' && id.startsWith('id-')) {
        const num = parseInt(id.substring(3), 10);
        if (!isNaN(num)) {
          return num;
        }
      }
      return 0;
    };

    const scanForIds = (obj) => {
      if (!obj || typeof obj !== 'object') {
        return;
      }

      if (obj.uniqueID) {
        const idNum = extractIdNumber(obj.uniqueID);
        if (idNum > maxId) {
          maxId = idNum;
        }
      }

      if (Array.isArray(obj)) {
        obj.forEach(item => scanForIds(item));
      } else {
        Object.values(obj).forEach(value => scanForIds(value));
      }
    };

    scanForIds(projectJson);
    this.idCounter = maxId + 1;
  }
}

// Mock the remapIDs function that's used when loading GitHub molecules
function remapIDs(json, globalVars) {
  let idPairs = {};

  const processNestedAtoms = (obj) => {
    if (obj.allAtoms) {
      obj.allAtoms.forEach((atom) => {
        let oldID = atom.uniqueID;
        let newID = globalVars.generateUniqueID();
        idPairs[oldID] = newID;
        atom.uniqueID = newID;
        
        processNestedAtoms(atom);
      });
    }
  };

  if (json.uniqueID && !json.uniqueID.toString().startsWith("temp-new-")) {
    let oldMainID = json.uniqueID;
    let newMainID = globalVars.generateUniqueID();
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
          connector.uniqueID = globalVars.generateUniqueID();
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

describe("GitHub Molecule ID Conflict Prevention", () => {
  let globalVars;

  beforeEach(() => {
    globalVars = new MockGlobalVariables();
  });

  it("should prevent ID conflicts when importing a GitHub molecule", () => {
    // Create a parent project with some atoms
    const parentProject = {
      uniqueID: globalVars.generateUniqueID(),
      name: "Parent Project",
      allAtoms: [
        { uniqueID: globalVars.generateUniqueID(), name: "Circle 1" },
        { uniqueID: globalVars.generateUniqueID(), name: "Rectangle 1" }
      ]
    };

    expect(parentProject.uniqueID).toBe("id-1");
    expect(parentProject.allAtoms[0].uniqueID).toBe("id-2");
    expect(parentProject.allAtoms[1].uniqueID).toBe("id-3");

    // Create a project to be imported as a GitHub molecule
    // This project has IDs that would conflict if not remapped
    const externalProject = {
      uniqueID: "id-1",  // Same as parent project!
      name: "External Project",
      allAtoms: [
        { uniqueID: "id-2", name: "External Circle" },   // Same as parent!
        { uniqueID: "id-3", name: "External Rectangle" }, // Same as parent!
        { uniqueID: "id-4", name: "External Extrude" }
      ],
      allConnectors: [
        { ap1ID: "id-2", ap2ID: "id-3" },
        { ap1ID: "id-3", ap2ID: "id-4" }
      ]
    };

    // Simulate importing the external project as a GitHub molecule
    // The remapIDs function gives it all new IDs
    const importedMolecule = remapIDs(JSON.parse(JSON.stringify(externalProject)), globalVars);

    // All IDs should be remapped to new unique values
    expect(importedMolecule.uniqueID).toBe("id-4");
    expect(importedMolecule.allAtoms[0].uniqueID).toBe("id-5");
    expect(importedMolecule.allAtoms[1].uniqueID).toBe("id-6");
    expect(importedMolecule.allAtoms[2].uniqueID).toBe("id-7");

    // Connectors should reference the new IDs
    expect(importedMolecule.allConnectors[0].ap1ID).toBe("id-5");
    expect(importedMolecule.allConnectors[0].ap2ID).toBe("id-6");
    expect(importedMolecule.allConnectors[1].ap1ID).toBe("id-6");
    expect(importedMolecule.allConnectors[1].ap2ID).toBe("id-7");

    // Add the imported molecule to the parent project
    parentProject.allAtoms.push(importedMolecule);

    // Verify no ID conflicts
    const allIds = [
      parentProject.uniqueID,
      ...parentProject.allAtoms.slice(0, 2).map(a => a.uniqueID),
      importedMolecule.uniqueID,
      ...importedMolecule.allAtoms.map(a => a.uniqueID)
    ];

    const uniqueIds = new Set(allIds);
    expect(uniqueIds.size).toBe(allIds.length);
    console.log("All IDs are unique:", allIds);
  });

  it("should handle multiple GitHub molecule imports without conflicts", () => {
    // Start with a parent project
    const parentProject = {
      uniqueID: globalVars.generateUniqueID(),
      allAtoms: []
    };

    // Import first GitHub molecule
    const githubMolecule1 = remapIDs({
      uniqueID: "id-1",
      name: "GitHub Molecule 1",
      allAtoms: [
        { uniqueID: "id-1", name: "Atom A" },
        { uniqueID: "id-2", name: "Atom B" }
      ]
    }, globalVars);

    parentProject.allAtoms.push(githubMolecule1);

    // Import second GitHub molecule (with overlapping original IDs)
    const githubMolecule2 = remapIDs({
      uniqueID: "id-1",  // Same original ID as first molecule!
      name: "GitHub Molecule 2",
      allAtoms: [
        { uniqueID: "id-1", name: "Atom C" },  // Same original IDs!
        { uniqueID: "id-2", name: "Atom D" }
      ]
    }, globalVars);

    parentProject.allAtoms.push(githubMolecule2);

    // Import third GitHub molecule
    const githubMolecule3 = remapIDs({
      uniqueID: "id-1",
      name: "GitHub Molecule 3",
      allAtoms: [
        { uniqueID: "id-1", name: "Atom E" }
      ]
    }, globalVars);

    parentProject.allAtoms.push(githubMolecule3);

    // Collect all IDs
    const allIds = [parentProject.uniqueID];
    parentProject.allAtoms.forEach(mol => {
      allIds.push(mol.uniqueID);
      if (mol.allAtoms) {
        mol.allAtoms.forEach(atom => allIds.push(atom.uniqueID));
      }
    });

    // Verify all IDs are unique
    const uniqueIds = new Set(allIds);
    expect(uniqueIds.size).toBe(allIds.length);
    console.log(`Imported 3 GitHub molecules with ${allIds.length} total IDs, all unique`);
  });

  it("should handle nested GitHub molecules correctly", () => {
    // Create a project with nested GitHub molecules
    const outerMolecule = remapIDs({
      uniqueID: "id-1",
      name: "Outer Molecule",
      allAtoms: [
        {
          uniqueID: "id-2",
          atomType: "GitHubMolecule",
          name: "Inner GitHub Molecule",
          allAtoms: [
            { uniqueID: "id-10", name: "Nested Atom 1" },
            { uniqueID: "id-11", name: "Nested Atom 2" }
          ]
        },
        { uniqueID: "id-3", name: "Regular Atom" }
      ]
    }, globalVars);

    // Verify nested atoms got remapped
    expect(outerMolecule.uniqueID).toBe("id-1");
    expect(outerMolecule.allAtoms[0].uniqueID).toBe("id-2");
    expect(outerMolecule.allAtoms[0].allAtoms[0].uniqueID).toBe("id-3");
    expect(outerMolecule.allAtoms[0].allAtoms[1].uniqueID).toBe("id-4");
    expect(outerMolecule.allAtoms[1].uniqueID).toBe("id-5");

    // Collect all IDs recursively
    const collectIds = (obj) => {
      const ids = [];
      if (obj.uniqueID) ids.push(obj.uniqueID);
      if (obj.allAtoms) {
        obj.allAtoms.forEach(atom => {
          ids.push(...collectIds(atom));
        });
      }
      return ids;
    };

    const allIds = collectIds(outerMolecule);
    const uniqueIds = new Set(allIds);
    expect(uniqueIds.size).toBe(allIds.length);
  });

  it("should work after loading and continuing to work on a project", () => {
    // Simulate a complete workflow:
    
    // 1. Create initial project and save
    const project = {
      uniqueID: globalVars.generateUniqueID(),
      allAtoms: [
        { uniqueID: globalVars.generateUniqueID(), name: "Atom 1" },
        { uniqueID: globalVars.generateUniqueID(), name: "Atom 2" }
      ]
    };
    
    const saved = JSON.stringify(project);
    
    // 2. Load project (resets counter)
    const loaded = JSON.parse(saved);
    globalVars.resetIdCounter(loaded);
    expect(globalVars.idCounter).toBe(4);
    
    // 3. Import a GitHub molecule
    const imported = remapIDs({
      uniqueID: "id-100",
      allAtoms: [
        { uniqueID: "id-101", name: "Imported Atom" }
      ]
    }, globalVars);
    
    // Imported molecule should get new sequential IDs
    expect(imported.uniqueID).toBe("id-4");
    expect(imported.allAtoms[0].uniqueID).toBe("id-5");
    
    loaded.allAtoms.push(imported);
    
    // 4. Continue working, add more atoms
    loaded.allAtoms.push({
      uniqueID: globalVars.generateUniqueID(),
      name: "New Atom After Import"
    });
    
    expect(loaded.allAtoms[loaded.allAtoms.length - 1].uniqueID).toBe("id-6");
    
    // 5. Verify no conflicts
    const collectAllIds = (obj) => {
      const ids = [];
      if (obj.uniqueID) ids.push(obj.uniqueID);
      if (obj.allAtoms) {
        obj.allAtoms.forEach(atom => {
          if (atom.uniqueID) ids.push(atom.uniqueID);
          if (atom.allAtoms) {
            atom.allAtoms.forEach(nested => {
              if (nested.uniqueID) ids.push(nested.uniqueID);
            });
          }
        });
      }
      return ids;
    };
    
    const allIds = collectAllIds(loaded);
    const uniqueIds = new Set(allIds);
    expect(uniqueIds.size).toBe(allIds.length);
  });

  it("should maintain connector integrity after remapping", () => {
    const externalProject = {
      uniqueID: "id-100",
      allAtoms: [
        { uniqueID: "id-101", name: "Circle" },
        { uniqueID: "id-102", name: "Extrude" },
        { uniqueID: "id-103", name: "Move" }
      ],
      allConnectors: [
        { ap1ID: "id-101", ap2ID: "id-102", uniqueID: "conn-1" },
        { ap1ID: "id-102", ap2ID: "id-103", uniqueID: "conn-2" }
      ]
    };

    const remapped = remapIDs(JSON.parse(JSON.stringify(externalProject)), globalVars);

    // Create a mapping of old to new IDs for verification
    const oldToNew = {
      "id-100": remapped.uniqueID,
      "id-101": remapped.allAtoms[0].uniqueID,
      "id-102": remapped.allAtoms[1].uniqueID,
      "id-103": remapped.allAtoms[2].uniqueID
    };

    // Verify connectors reference the new IDs
    expect(remapped.allConnectors[0].ap1ID).toBe(oldToNew["id-101"]);
    expect(remapped.allConnectors[0].ap2ID).toBe(oldToNew["id-102"]);
    expect(remapped.allConnectors[1].ap1ID).toBe(oldToNew["id-102"]);
    expect(remapped.allConnectors[1].ap2ID).toBe(oldToNew["id-103"]);

    // Connector IDs themselves should also be remapped
    expect(remapped.allConnectors[0].uniqueID).not.toBe("conn-1");
    expect(remapped.allConnectors[1].uniqueID).not.toBe("conn-2");

    console.log("Connectors properly remapped:", {
      connector1: `${remapped.allConnectors[0].ap1ID} -> ${remapped.allConnectors[0].ap2ID}`,
      connector2: `${remapped.allConnectors[1].ap1ID} -> ${remapped.allConnectors[1].ap2ID}`
    });
  });
});
