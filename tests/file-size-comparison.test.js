import { describe, it, expect } from "vitest";

/**
 * Test to demonstrate file size reduction from using short IDs instead of UUIDs
 * in realistic project scenarios.
 */

describe("File Size Comparison: UUIDs vs Short IDs", () => {
  // Simulate UUID generation (36 characters)
  function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  // Simulate short ID generation
  let shortIdCounter = 1;
  function generateShortID() {
    return `id-${shortIdCounter++}`;
  }

  // Helper to create a mock atom
  function createAtom(idGenerator, atomType, name) {
    return {
      atomType: atomType,
      name: name,
      uniqueID: idGenerator(),
      x: Math.random(),
      y: Math.random(),
      ioValues: []
    };
  }

  // Helper to create a mock connector
  function createConnector(idGenerator, atom1, atom2) {
    return {
      ap1Name: "output",
      ap2Name: "input",
      ap1ID: atom1.uniqueID,
      ap2ID: atom2.uniqueID
    };
  }

  // Helper to create a realistic project structure
  function createProject(idGenerator, numAtoms = 50) {
    const atoms = [];
    const connectors = [];

    // Create a variety of atom types like a real project might have
    const atomTypes = [
      "Circle", "Rectangle", "Extrude", "Move", "Rotate",
      "Intersection", "Difference", "Fusion", "Assembly",
      "Input", "Output", "Constant", "Molecule"
    ];

    for (let i = 0; i < numAtoms; i++) {
      const atomType = atomTypes[i % atomTypes.length];
      const atom = createAtom(idGenerator, atomType, `${atomType} ${i}`);
      atoms.push(atom);

      // Create connections between atoms
      if (i > 0 && Math.random() > 0.3) {
        const previousAtom = atoms[i - 1];
        connectors.push(createConnector(idGenerator, previousAtom, atom));
      }
    }

    return {
      atomType: "Molecule",
      name: "Test Project",
      uniqueID: idGenerator(),
      topLevel: true,
      allAtoms: atoms,
      allConnectors: connectors,
      fileTypeVersion: 1
    };
  }

  it("should demonstrate significant file size savings with 50 atoms", () => {
    // Reset counters
    shortIdCounter = 1;

    const projectWithUUIDs = createProject(generateUUID, 50);
    const projectWithShortIDs = createProject(generateShortID, 50);

    const uuidSize = JSON.stringify(projectWithUUIDs).length;
    const shortIdSize = JSON.stringify(projectWithShortIDs).length;
    const savings = uuidSize - shortIdSize;
    const savingsPercent = (savings / uuidSize * 100).toFixed(1);

    console.log("\n=== 50-Atom Project Comparison ===");
    console.log(`UUID-based file size: ${uuidSize.toLocaleString()} bytes`);
    console.log(`Short-ID file size:   ${shortIdSize.toLocaleString()} bytes`);
    console.log(`Bytes saved:          ${savings.toLocaleString()} bytes`);
    console.log(`Percentage reduction: ${savingsPercent}%`);

    // Verify significant savings
    expect(shortIdSize).toBeLessThan(uuidSize);
    expect(savings).toBeGreaterThan(1000);
    expect(parseFloat(savingsPercent)).toBeGreaterThan(15);
  });

  it("should demonstrate even larger savings with 200 atoms", () => {
    // Reset counters
    shortIdCounter = 1;

    const projectWithUUIDs = createProject(generateUUID, 200);
    const projectWithShortIDs = createProject(generateShortID, 200);

    const uuidSize = JSON.stringify(projectWithUUIDs).length;
    const shortIdSize = JSON.stringify(projectWithShortIDs).length;
    const savings = uuidSize - shortIdSize;
    const savingsPercent = (savings / uuidSize * 100).toFixed(1);

    console.log("\n=== 200-Atom Project Comparison ===");
    console.log(`UUID-based file size: ${uuidSize.toLocaleString()} bytes`);
    console.log(`Short-ID file size:   ${shortIdSize.toLocaleString()} bytes`);
    console.log(`Bytes saved:          ${savings.toLocaleString()} bytes`);
    console.log(`Percentage reduction: ${savingsPercent}%`);

    // Verify significant savings
    expect(shortIdSize).toBeLessThan(uuidSize);
    expect(savings).toBeGreaterThan(5000);
    expect(parseFloat(savingsPercent)).toBeGreaterThan(15);
  });

  it("should show savings scale with project complexity", () => {
    const sizes = [10, 50, 100, 200];
    const results = [];

    console.log("\n=== Scaling Analysis ===");
    console.log("Atoms | UUID Size | Short-ID Size | Savings | Savings %");
    console.log("------|-----------|---------------|---------|----------");

    sizes.forEach(numAtoms => {
      shortIdCounter = 1;
      const uuidProject = createProject(generateUUID, numAtoms);
      const shortIdProject = createProject(generateShortID, numAtoms);

      const uuidSize = JSON.stringify(uuidProject).length;
      const shortIdSize = JSON.stringify(shortIdProject).length;
      const savings = uuidSize - shortIdSize;
      const savingsPercent = (savings / uuidSize * 100).toFixed(1);

      console.log(
        `${numAtoms.toString().padStart(5)} | ` +
        `${uuidSize.toString().padStart(9)} | ` +
        `${shortIdSize.toString().padStart(13)} | ` +
        `${savings.toString().padStart(7)} | ` +
        `${savingsPercent.toString().padStart(7)}%`
      );

      results.push({ numAtoms, uuidSize, shortIdSize, savings, savingsPercent });
    });

    // Verify savings increase with project size
    for (let i = 1; i < results.length; i++) {
      expect(results[i].savings).toBeGreaterThan(results[i - 1].savings);
    }
  });

  it("should show ID length comparison", () => {
    const uuidExample = generateUUID();
    shortIdCounter = 1;
    const shortIdExample1 = generateShortID();
    shortIdCounter = 999;
    const shortIdExample999 = generateShortID();
    shortIdCounter = 9999;
    const shortIdExample9999 = generateShortID();

    console.log("\n=== ID Length Comparison ===");
    console.log(`UUID format:              "${uuidExample}" (${uuidExample.length} chars)`);
    console.log(`Short ID (early):         "${shortIdExample1}" (${shortIdExample1.length} chars)`);
    console.log(`Short ID (mid-project):   "${shortIdExample999}" (${shortIdExample999.length} chars)`);
    console.log(`Short ID (large project): "${shortIdExample9999}" (${shortIdExample9999.length} chars)`);

    // Even in worst case (10,000+ atoms), short IDs are much shorter
    expect(shortIdExample1.length).toBeLessThan(10);
    expect(shortIdExample999.length).toBeLessThan(10);
    expect(shortIdExample9999.length).toBeLessThan(12);
    expect(uuidExample.length).toBe(36);
  });
});
