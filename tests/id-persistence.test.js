import { describe, it, expect, beforeEach } from "vitest";

/**
 * Integration test to verify ID counter persistence across save/load cycles.
 * This simulates the real-world workflow of creating a project, saving it,
 * and loading it back.
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

describe("ID Persistence Integration Tests", () => {
  let globalVars;

  beforeEach(() => {
    globalVars = new MockGlobalVariables();
  });

  it("should maintain ID uniqueness across save and load", () => {
    // Phase 1: Create initial project
    const project = {
      uniqueID: globalVars.generateUniqueID(),
      name: "Test Project",
      allAtoms: [
        { uniqueID: globalVars.generateUniqueID(), name: "Atom 1" },
        { uniqueID: globalVars.generateUniqueID(), name: "Atom 2" },
        { uniqueID: globalVars.generateUniqueID(), name: "Atom 3" },
      ]
    };

    expect(project.uniqueID).toBe("id-1");
    expect(project.allAtoms[0].uniqueID).toBe("id-2");
    expect(project.allAtoms[1].uniqueID).toBe("id-3");
    expect(project.allAtoms[2].uniqueID).toBe("id-4");

    // Phase 2: Simulate save (serialize to JSON)
    const savedProject = JSON.stringify(project);
    console.log("Saved project size:", savedProject.length, "bytes");

    // Phase 3: Simulate load (deserialize from JSON)
    const loadedProject = JSON.parse(savedProject);
    
    // Phase 4: Reset counter based on loaded project
    globalVars.resetIdCounter(loadedProject);
    expect(globalVars.idCounter).toBe(5); // Should be max + 1

    // Phase 5: Create new atoms after loading
    const newAtom1 = { uniqueID: globalVars.generateUniqueID(), name: "New Atom 1" };
    const newAtom2 = { uniqueID: globalVars.generateUniqueID(), name: "New Atom 2" };

    // New atoms should have IDs continuing from where we left off
    expect(newAtom1.uniqueID).toBe("id-5");
    expect(newAtom2.uniqueID).toBe("id-6");

    // Verify no ID collisions
    const allIds = [
      ...loadedProject.allAtoms.map(a => a.uniqueID),
      newAtom1.uniqueID,
      newAtom2.uniqueID
    ];
    const uniqueIds = new Set(allIds);
    expect(uniqueIds.size).toBe(allIds.length);
  });

  it("should handle multiple save/load cycles", () => {
    // Cycle 1: Create and save
    let project = {
      uniqueID: globalVars.generateUniqueID(),
      allAtoms: [
        { uniqueID: globalVars.generateUniqueID() },
        { uniqueID: globalVars.generateUniqueID() }
      ]
    };

    let saved = JSON.stringify(project);
    let loaded = JSON.parse(saved);
    globalVars.resetIdCounter(loaded);
    expect(globalVars.idCounter).toBe(4);

    // Cycle 2: Add more atoms and save again
    loaded.allAtoms.push({ uniqueID: globalVars.generateUniqueID() });
    loaded.allAtoms.push({ uniqueID: globalVars.generateUniqueID() });
    
    saved = JSON.stringify(loaded);
    loaded = JSON.parse(saved);
    globalVars.resetIdCounter(loaded);
    expect(globalVars.idCounter).toBe(6);

    // Cycle 3: Add even more atoms
    loaded.allAtoms.push({ uniqueID: globalVars.generateUniqueID() });
    
    saved = JSON.stringify(loaded);
    loaded = JSON.parse(saved);
    globalVars.resetIdCounter(loaded);
    expect(globalVars.idCounter).toBe(7);

    // Verify all IDs are unique
    const allIds = loaded.allAtoms.map(a => a.uniqueID);
    const uniqueIds = new Set(allIds);
    expect(uniqueIds.size).toBe(allIds.length);
  });

  it("should handle nested molecules correctly", () => {
    // Create a project with nested structure
    const project = {
      uniqueID: globalVars.generateUniqueID(),
      name: "Parent Molecule",
      allAtoms: [
        {
          uniqueID: globalVars.generateUniqueID(),
          name: "Child Molecule",
          allAtoms: [
            { uniqueID: globalVars.generateUniqueID(), name: "Nested Atom 1" },
            { uniqueID: globalVars.generateUniqueID(), name: "Nested Atom 2" }
          ]
        },
        { uniqueID: globalVars.generateUniqueID(), name: "Regular Atom" }
      ]
    };

    // Save and load
    const saved = JSON.stringify(project);
    const loaded = JSON.parse(saved);
    globalVars.resetIdCounter(loaded);

    // Should find the highest nested ID and set counter accordingly
    expect(globalVars.idCounter).toBe(6); // Max is 5, so counter is 6

    // New IDs should continue from there
    const newId = globalVars.generateUniqueID();
    expect(newId).toBe("id-6");
  });

  it("should demonstrate file size benefit", () => {
    // Create two identical projects, one with UUIDs and one with short IDs
    const createProject = (idFunc) => {
      const project = {
        uniqueID: idFunc(),
        name: "Comparison Project",
        allAtoms: []
      };
      
      for (let i = 0; i < 30; i++) {
        project.allAtoms.push({
          uniqueID: idFunc(),
          atomType: "Circle",
          name: `Circle ${i}`,
          x: i * 0.1,
          y: i * 0.1
        });
      }
      
      return project;
    };

    // UUID version
    let uuidCounter = 0;
    const mockUUID = () => `550e8400-e29b-41d4-a716-44665544${String(uuidCounter++).padStart(4, '0')}`;
    const uuidProject = createProject(mockUUID);
    
    // Short ID version
    globalVars.idCounter = 1;
    const shortIdProject = createProject(() => globalVars.generateUniqueID());

    const uuidSize = JSON.stringify(uuidProject).length;
    const shortIdSize = JSON.stringify(shortIdProject).length;
    const savings = uuidSize - shortIdSize;

    console.log("\nFile Size Comparison (30 atoms):");
    console.log(`  UUID-based:  ${uuidSize} bytes`);
    console.log(`  Short-ID:    ${shortIdSize} bytes`);
    console.log(`  Savings:     ${savings} bytes (${(savings/uuidSize*100).toFixed(1)}%)`);

    expect(shortIdSize).toBeLessThan(uuidSize);
    expect(savings).toBeGreaterThan(600);
  });

  it("should handle edge case: project with no IDs", () => {
    const emptyProject = {
      name: "Empty Project",
      allAtoms: []
    };

    // Should not crash
    globalVars.resetIdCounter(emptyProject);
    
    // Counter should remain at 1
    expect(globalVars.idCounter).toBe(1);
    
    // First new ID should be id-1
    const newId = globalVars.generateUniqueID();
    expect(newId).toBe("id-1");
  });

  it("should handle edge case: project with mixed old and new ID formats", () => {
    const mixedProject = {
      uniqueID: "id-10",
      allAtoms: [
        { uniqueID: "550e8400-e29b-41d4-a716-446655440000" }, // Old UUID
        { uniqueID: "id-15" }, // New short ID
        { uniqueID: "id-20" }, // New short ID
        { uniqueID: "770e8400-e29b-41d4-a716-446655440000" }  // Old UUID
      ]
    };

    // Should scan and find highest short ID (20)
    globalVars.resetIdCounter(mixedProject);
    expect(globalVars.idCounter).toBe(21);

    // New IDs should continue from there
    const newId = globalVars.generateUniqueID();
    expect(newId).toBe("id-21");
  });
});
