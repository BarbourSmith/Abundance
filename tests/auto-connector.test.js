import { describe, it, expect } from "vitest";

describe("Auto Connector Feature", () => {
  // Test the logic of the helper functions without full class instantiation
  
  // Mock molecule structure
  function createMockMolecule() {
    return {
      nodesOnTheScreen: [],
      
      // Copy the helper functions we want to test
      findSelectedAtomsWithGeometryOutput() {
        return this.nodesOnTheScreen.filter((atom) => {
          return atom.selected && atom.output && atom.output.valueType === "geometry";
        });
      },

      findFirstAvailableGeometryInput(atom) {
        if (!atom.inputs) return null;
        
        return atom.inputs.find((input) => {
          return input.valueType === "geometry" && input.connectors.length === 0;
        }) || null;
      },

      findFirstGeometryInputForReplacement(atom) {
        if (!atom.inputs) return null;
        return atom.inputs.find((input) => input.valueType === "geometry") || null;
      },

      autoCreateConnector(newAtom) {
        const selectedGeometryAtoms = this.findSelectedAtomsWithGeometryOutput();
        if (selectedGeometryAtoms.length === 0) return;

        let geometryInput = this.findFirstAvailableGeometryInput(newAtom);

        // For Code atoms, if no free geometry input is found, allow replacement of an occupied one
        if (!geometryInput && newAtom.atomType === "Code") {
          geometryInput = this.findFirstGeometryInputForReplacement(newAtom);
        }

        if (!geometryInput) return;

        const sourceAtom = selectedGeometryAtoms[0];
        this.placeConnector({
          ap1ID: sourceAtom.uniqueID,
          ap2ID: newAtom.uniqueID,
          ap2Name: geometryInput.name,
        });
      }
    };
  }

  // Mock atom factory functions
  function createMockAtomWithGeometryOutput(atomType, selected = false) {
    return {
      atomType: atomType,
      selected: selected,
      output: {
        valueType: "geometry"
      },
      inputs: []
    };
  }

  function createMockAtomWithGeometryInput(atomType) {
    return {
      atomType: atomType,
      selected: false,
      output: null,
      inputs: [
        {
          name: "geometry",
          valueType: "geometry",
          connectors: []
        },
        {
          name: "height",
          valueType: "number",
          connectors: []
        }
      ]
    };
  }

  function createMockCodeAtomWithOccupiedGeometryInput() {
    return {
      atomType: "Code",
      selected: false,
      output: null,
      inputs: [
        {
          name: "shape",
          valueType: "geometry",
          connectors: [{ id: "existing-connector" }] // already connected
        },
        {
          name: "radius",
          valueType: "number",
          connectors: []
        }
      ]
    };
  }

  function createMockCodeAtomWithFreeGeometryInput() {
    return {
      atomType: "Code",
      selected: false,
      output: null,
      inputs: [
        {
          name: "shape",
          valueType: "geometry",
          connectors: []
        },
        {
          name: "radius",
          valueType: "number",
          connectors: []
        }
      ]
    };
  }

  function createMockAtomWithoutGeometry(atomType) {
    return {
      atomType: atomType,
      selected: false,
      output: null,
      inputs: [
        {
          name: "diameter",
          valueType: "number",
          connectors: []
        }
      ]
    };
  }

  it("should find selected atoms with geometry output", () => {
    const molecule = createMockMolecule();
    
    // Add a selected atom with geometry output
    const selectedCircle = createMockAtomWithGeometryOutput("Circle", true);
    molecule.nodesOnTheScreen.push(selectedCircle);
    
    // Add a non-selected atom with geometry output
    const unselectedCircle = createMockAtomWithGeometryOutput("Circle", false);
    molecule.nodesOnTheScreen.push(unselectedCircle);
    
    // Add a selected atom without geometry output
    const selectedNonGeometry = createMockAtomWithoutGeometry("Input");
    selectedNonGeometry.selected = true;
    molecule.nodesOnTheScreen.push(selectedNonGeometry);

    const result = molecule.findSelectedAtomsWithGeometryOutput();
    
    expect(result).toHaveLength(1);
    expect(result[0]).toBe(selectedCircle);
  });

  it("should find first available geometry input", () => {
    const molecule = createMockMolecule();
    
    // Test atom with geometry input
    const extrudeAtom = createMockAtomWithGeometryInput("Extrude");
    const geometryInput = molecule.findFirstAvailableGeometryInput(extrudeAtom);
    
    expect(geometryInput).toBeDefined();
    expect(geometryInput.name).toBe("geometry");
    expect(geometryInput.valueType).toBe("geometry");
    
    // Test atom without geometry input
    const circleAtom = createMockAtomWithoutGeometry("Circle");
    const noGeometryInput = molecule.findFirstAvailableGeometryInput(circleAtom);
    
    expect(noGeometryInput).toBeNull();
  });

  it("should not find geometry input if already connected", () => {
    const molecule = createMockMolecule();
    
    const extrudeAtom = createMockAtomWithGeometryInput("Extrude");
    
    // Mark the geometry input as already connected
    extrudeAtom.inputs[0].connectors.push({ id: "mock-connector" });
    
    const geometryInput = molecule.findFirstAvailableGeometryInput(extrudeAtom);
    
    expect(geometryInput).toBeNull();
  });

  it("should find multiple selected atoms with geometry outputs", () => {
    const molecule = createMockMolecule();
    
    const circle1 = createMockAtomWithGeometryOutput("Circle", true);
    const circle2 = createMockAtomWithGeometryOutput("Circle", true);
    const rectangle = createMockAtomWithGeometryOutput("Rectangle", false);
    
    molecule.nodesOnTheScreen.push(circle1, circle2, rectangle);
    
    const result = molecule.findSelectedAtomsWithGeometryOutput();
    
    expect(result).toHaveLength(2);
    expect(result).toContain(circle1);
    expect(result).toContain(circle2);
    expect(result).not.toContain(rectangle);
  });

  it("should handle empty molecule", () => {
    const molecule = createMockMolecule();
    
    expect(molecule.findSelectedAtomsWithGeometryOutput()).toHaveLength(0);
    
    const mockAtom = createMockAtomWithoutGeometry("Test");
    expect(molecule.findFirstAvailableGeometryInput(mockAtom)).toBeNull();
  });

  it("should validate the auto-connector logic flow", () => {
    const molecule = createMockMolecule();
    
    // Mock the placeConnector function
    let connectorCreated = false;
    let connectorData = null;
    molecule.placeConnector = function(connectorObj) {
      connectorCreated = true;
      connectorData = connectorObj;
    };
    
    // Setup: Selected atom with geometry output
    const selectedCircle = createMockAtomWithGeometryOutput("Circle", true);
    selectedCircle.uniqueID = "circle-1";
    molecule.nodesOnTheScreen.push(selectedCircle);
    
    // Action: Place new atom with geometry input
    const newExtrude = createMockAtomWithGeometryInput("Extrude");
    newExtrude.uniqueID = "extrude-1";
    
    molecule.autoCreateConnector(newExtrude);
    
    // Verify: Connector was created with correct parameters
    expect(connectorCreated).toBe(true);
    expect(connectorData).toEqual({
      ap1ID: "circle-1",
      ap2ID: "extrude-1", 
      ap2Name: "geometry"
    });
  });

  it("should not create connector when conditions are not met", () => {
    const molecule = createMockMolecule();
    
    let connectorCreated = false;
    molecule.placeConnector = function() {
      connectorCreated = true;
    };
    
    // Test 1: No selected atoms
    const newExtrude1 = createMockAtomWithGeometryInput("Extrude");
    molecule.autoCreateConnector(newExtrude1);
    expect(connectorCreated).toBe(false);
    
    // Test 2: Selected atom but new atom has no geometry input
    const selectedCircle = createMockAtomWithGeometryOutput("Circle", true);
    molecule.nodesOnTheScreen.push(selectedCircle);
    
    const newCircle = createMockAtomWithoutGeometry("Circle");
    molecule.autoCreateConnector(newCircle);
    expect(connectorCreated).toBe(false);
  });

  it("should find geometry input for replacement in Code atoms", () => {
    const molecule = createMockMolecule();

    // Code atom with connected geometry input - should still find it for replacement
    const codeAtom = createMockCodeAtomWithOccupiedGeometryInput();
    const replacementInput = molecule.findFirstGeometryInputForReplacement(codeAtom);
    
    expect(replacementInput).not.toBeNull();
    expect(replacementInput.name).toBe("shape");
    expect(replacementInput.valueType).toBe("geometry");
  });

  it("should allow auto-connector to replace existing geometry connection on Code atoms", () => {
    const molecule = createMockMolecule();

    let connectorCreated = false;
    let connectorData = null;
    molecule.placeConnector = function(connectorObj) {
      connectorCreated = true;
      connectorData = connectorObj;
    };

    // Setup: Selected atom with geometry output
    const selectedCircle = createMockAtomWithGeometryOutput("Circle", true);
    selectedCircle.uniqueID = "circle-2";
    molecule.nodesOnTheScreen.push(selectedCircle);

    // Code atom with geometry input ALREADY connected (should be replaceable)
    const codeAtom = createMockCodeAtomWithOccupiedGeometryInput();
    codeAtom.uniqueID = "code-1";

    molecule.autoCreateConnector(codeAtom);

    // Verify: Connector was created (replacement) - Code atoms support replacement
    expect(connectorCreated).toBe(true);
    expect(connectorData).toEqual({
      ap1ID: "circle-2",
      ap2ID: "code-1",
      ap2Name: "shape"
    });
  });

  it("should NOT replace existing geometry connection on non-Code atoms", () => {
    const molecule = createMockMolecule();

    let connectorCreated = false;
    molecule.placeConnector = function() {
      connectorCreated = true;
    };

    // Setup: Selected atom with geometry output
    const selectedCircle = createMockAtomWithGeometryOutput("Circle", true);
    selectedCircle.uniqueID = "circle-3";
    molecule.nodesOnTheScreen.push(selectedCircle);

    // Non-Code atom with geometry input ALREADY connected (should NOT be replaceable via autoCreateConnector)
    const extrudeAtom = createMockAtomWithGeometryInput("Extrude");
    extrudeAtom.inputs[0].connectors.push({ id: "existing-connector" }); // mark as connected
    extrudeAtom.uniqueID = "extrude-2";

    molecule.autoCreateConnector(extrudeAtom);

    // Verify: NO connector created for non-Code atoms when geometry input is occupied
    expect(connectorCreated).toBe(false);
  });

  it("should prefer free geometry input over replacement for Code atoms", () => {
    const molecule = createMockMolecule();

    let connectorCreated = false;
    let connectorData = null;
    molecule.placeConnector = function(connectorObj) {
      connectorCreated = true;
      connectorData = connectorObj;
    };

    // Setup: Selected atom with geometry output
    const selectedCircle = createMockAtomWithGeometryOutput("Circle", true);
    selectedCircle.uniqueID = "circle-4";
    molecule.nodesOnTheScreen.push(selectedCircle);

    // Code atom with FREE geometry input (should use free input, not replacement)
    const codeAtom = createMockCodeAtomWithFreeGeometryInput();
    codeAtom.uniqueID = "code-2";

    molecule.autoCreateConnector(codeAtom);

    // Verify: Connector connects to the FREE "shape" input (preferred over replacement)
    expect(connectorCreated).toBe(true);
    expect(connectorData.ap2Name).toBe("shape");
  });
});
