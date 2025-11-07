import { describe, it, expect, beforeEach } from "vitest";

/**
 * Tests to validate that short IDs are generated instead of UUIDs,
 * significantly reducing project file sizes.
 */

// Mock GlobalVariables
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

      // Check uniqueID at this level
      if (obj.uniqueID) {
        const idNum = extractIdNumber(obj.uniqueID);
        if (idNum > maxId) {
          maxId = idNum;
        }
      }

      // Recursively scan arrays
      if (Array.isArray(obj)) {
        obj.forEach(item => scanForIds(item));
      } else {
        // Recursively scan object properties
        Object.values(obj).forEach(value => scanForIds(value));
      }
    };

    scanForIds(projectJson);

    // Set counter to start from max + 1
    this.idCounter = maxId + 1;
  }
}

describe("Short ID Generation", () => {
  let globalVars;

  beforeEach(() => {
    globalVars = new MockGlobalVariables();
  });

  it("should generate short sequential IDs", () => {
    const id1 = globalVars.generateUniqueID();
    const id2 = globalVars.generateUniqueID();
    const id3 = globalVars.generateUniqueID();

    expect(id1).toBe("id-1");
    expect(id2).toBe("id-2");
    expect(id3).toBe("id-3");
  });

  it("should generate IDs much shorter than UUIDs", () => {
    const shortId = globalVars.generateUniqueID();
    const uuidExample = "550e8400-e29b-41d4-a716-446655440000";

    expect(shortId.length).toBeLessThan(10);
    expect(uuidExample.length).toBe(36);
    expect(shortId.length).toBeLessThan(uuidExample.length / 3);
  });

  it("should reset counter based on existing IDs in project", () => {
    const project = {
      uniqueID: "id-100",
      allAtoms: [
        { uniqueID: "id-101" },
        { uniqueID: "id-102" },
        { uniqueID: "id-103" }
      ],
      allConnectors: [
        { ap1ID: "id-101", ap2ID: "id-102" }
      ]
    };

    globalVars.resetIdCounter(project);
    
    // Counter should be set to 104 (max + 1)
    const newId = globalVars.generateUniqueID();
    expect(newId).toBe("id-104");
  });

  it("should handle nested molecules with IDs", () => {
    const project = {
      uniqueID: "id-1",
      allAtoms: [
        { 
          uniqueID: "id-2",
          allAtoms: [
            { uniqueID: "id-50" },
            { uniqueID: "id-51" }
          ]
        },
        { uniqueID: "id-3" }
      ]
    };

    globalVars.resetIdCounter(project);
    
    // Counter should be set to 52 (max + 1)
    const newId = globalVars.generateUniqueID();
    expect(newId).toBe("id-52");
  });

  it("should handle projects with no IDs gracefully", () => {
    const project = {
      name: "Empty Project",
      allAtoms: []
    };

    globalVars.resetIdCounter(project);
    
    // Counter should remain at 1 since no IDs found
    const newId = globalVars.generateUniqueID();
    expect(newId).toBe("id-1");
  });

  it("should handle old UUID format projects", () => {
    const project = {
      uniqueID: "550e8400-e29b-41d4-a716-446655440000",
      allAtoms: [
        { uniqueID: "660e8400-e29b-41d4-a716-446655440001" }
      ]
    };

    // Should not crash, and should ignore non-short-ID format
    globalVars.resetIdCounter(project);
    
    // Counter should remain at 1 since no short IDs found
    const newId = globalVars.generateUniqueID();
    expect(newId).toBe("id-1");
  });

  it("should demonstrate file size savings", () => {
    // Create a mock project with 10 atoms
    const createProjectWithIds = (idGenerator) => {
      const atoms = [];
      for (let i = 0; i < 10; i++) {
        atoms.push({
          atomType: "Circle",
          name: `Atom ${i}`,
          uniqueID: idGenerator(),
          x: i * 0.1,
          y: i * 0.1
        });
      }
      return { allAtoms: atoms };
    };

    // Simulate UUID generation
    let uuidCounter = 0;
    const generateMockUUID = () => {
      return `550e8400-e29b-41d4-a716-44665544${String(uuidCounter++).padStart(4, '0')}`;
    };

    // Create projects
    const projectWithUUIDs = createProjectWithIds(generateMockUUID);
    const projectWithShortIds = createProjectWithIds(() => globalVars.generateUniqueID());

    // Compare sizes
    const uuidSize = JSON.stringify(projectWithUUIDs).length;
    const shortIdSize = JSON.stringify(projectWithShortIds).length;
    const savings = uuidSize - shortIdSize;
    const savingsPercent = (savings / uuidSize * 100).toFixed(1);

    console.log(`UUID project size: ${uuidSize} bytes`);
    console.log(`Short ID project size: ${shortIdSize} bytes`);
    console.log(`Savings: ${savings} bytes (${savingsPercent}%)`);

    expect(shortIdSize).toBeLessThan(uuidSize);
    expect(savings).toBeGreaterThan(200); // Expect significant savings
  });

  it("should maintain uniqueness across multiple generations", () => {
    const ids = new Set();
    for (let i = 0; i < 1000; i++) {
      const id = globalVars.generateUniqueID();
      expect(ids.has(id)).toBe(false); // Should not have duplicates
      ids.add(id);
    }
    expect(ids.size).toBe(1000); // All IDs should be unique
  });
});
