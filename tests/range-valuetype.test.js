import { describe, it, expect, beforeEach, vi } from "vitest";
import GlobalVariables from "../src/js/globalvariables.js";

// Import the atoms after GlobalVariables is loaded
let Input, Molecule, AttachmentPoint;

describe("Range valuetype for Input atoms", () => {
  let parentMolecule;

  beforeEach(async () => {
    // Dynamically import after GlobalVariables is available
    if (!Input) {
      Input = (await import("../src/molecules/input.js")).default;
      Molecule = (await import("../src/molecules/molecule.js")).default;
      AttachmentPoint = (await import("../src/prototypes/attachmentpoint.js")).default;
    }

    // Create a mock parent molecule
    parentMolecule = new Molecule({
      x: 0.5,
      y: 0.5,
      parent: null,
      topLevel: true,
      uniqueID: GlobalVariables.generateUniqueID(),
    });
  });

  it("should add 'range' to available input type options", () => {
    const input = new Input({
      x: 0.3,
      y: 0.3,
      parent: parentMolecule,
      uniqueID: GlobalVariables.generateUniqueID(),
    });

    // Mock setInputChanged callback
    const setInputChanged = vi.fn();
    const params = input.createInputParams(setInputChanged);

    // Check that the type selector includes 'range'
    const typeParam = params[input.uniqueID + "type"];
    expect(typeParam).toBeDefined();
    expect(typeParam.options).toContain("range");
  });

  it("should create min/max controls when type is set to range", () => {
    const input = new Input({
      x: 0.3,
      y: 0.3,
      parent: parentMolecule,
      uniqueID: GlobalVariables.generateUniqueID(),
    });

    // Set type to range
    input.type = "range";
    input.min = 10;
    input.max = 50;

    const setInputChanged = vi.fn();
    const params = input.createInputParams(setInputChanged);

    // Check that min and max controls exist
    const minParam = params[input.uniqueID + "rangeMin"];
    const maxParam = params[input.uniqueID + "rangeMax"];

    expect(minParam).toBeDefined();
    expect(minParam.type).toBe("number");
    expect(minParam.value).toBe(10);
    expect(minParam.label).toBe("Min Value");

    expect(maxParam).toBeDefined();
    expect(maxParam.type).toBe("number");
    expect(maxParam.value).toBe(50);
    expect(maxParam.label).toBe("Max Value");
  });

  it("should initialize default min/max values when type is range", () => {
    const input = new Input({
      x: 0.3,
      y: 0.3,
      parent: parentMolecule,
      uniqueID: GlobalVariables.generateUniqueID(),
    });

    // Set type to range without setting min/max
    input.type = "range";

    const setInputChanged = vi.fn();
    const params = input.createInputParams(setInputChanged);

    const minParam = params[input.uniqueID + "rangeMin"];
    const maxParam = params[input.uniqueID + "rangeMax"];

    // Check that default values are set
    expect(input.min).toBe(0);
    expect(input.max).toBe(100);
    expect(minParam.value).toBe(0);
    expect(maxParam.value).toBe(100);
  });

  it("should serialize min and max values for range type", () => {
    const input = new Input({
      x: 0.3,
      y: 0.3,
      parent: parentMolecule,
      uniqueID: GlobalVariables.generateUniqueID(),
    });

    input.type = "range";
    input.min = 5;
    input.max = 95;

    const serialized = input.serialize();

    expect(serialized.type).toBe("range");
    expect(serialized.min).toBe(5);
    expect(serialized.max).toBe(95);
  });

  it("should preserve persisted import file type selection when rebuilding controls", () => {
    const input = new Input({
      x: 0.3,
      y: 0.3,
      parent: parentMolecule,
      uniqueID: GlobalVariables.generateUniqueID(),
      type: "import",
      fileType: "STL",
    });

    const setInputChanged = vi.fn();
    const params = input.createInputParams(setInputChanged);
    const fileTypeParam = params[input.uniqueID + "file_ops"];

    expect(input.importIndex).toBe(1);
    expect(fileTypeParam).toBeDefined();
    expect(fileTypeParam.value).toBe("STL");
  });

  it("should propagate min/max to parent attachment point options", () => {
    const input = new Input({
      x: 0.3,
      y: 0.3,
      parent: parentMolecule,
      uniqueID: GlobalVariables.generateUniqueID(),
    });

    // Create a simple mock parent AP (avoid AttachmentPoint constructor issues)
    input.parentAP = {
      options: {},
    };

    input.type = "range";
    input.min = 20;
    input.max = 80;

    const setInputChanged = vi.fn();
    const params = input.createInputParams(setInputChanged);

    // Trigger onChange for min
    const minParam = params[input.uniqueID + "rangeMin"];
    minParam.onChange(25);

    // Check that parentAP options were updated
    expect(input.parentAP.options.min).toBe(25);
    expect(input.parentAP.options.max).toBe(80);

    // Trigger onChange for max
    const maxParam = params[input.uniqueID + "rangeMax"];
    maxParam.onChange(85);

    expect(input.parentAP.options.min).toBe(25);
    expect(input.parentAP.options.max).toBe(85);
  });

  it("should create rangeSlider control for range type inputs in molecule", () => {
    // Set up minimal GlobalVariables.currentAWSnode to avoid errors
    GlobalVariables.currentAWSnode = {
      repoName: "test-repo",
      description: "Test description",
    };

    const molecule = new Molecule({
      x: 0.5,
      y: 0.5,
      parent: null,
      uniqueID: GlobalVariables.generateUniqueID(),
      topLevel: true,
    });

    // Create a simple mock attachment point (avoid constructor issues)
    const mockAP = {
      name: "testRange",
      valueType: "range",
      value: 50,
      options: { min: 0, max: 100, step: 1 },
      connectors: [],
      getValue: () => 50,
      setValue: (val) => {
        mockAP.value = val;
      },
    };

    molecule.inputs = [mockAP];

    // Create input params for the molecule
    const params = molecule.createInputParams();

    // Check that the rangeSlider control was created
    const rangeControl = params[molecule.uniqueID + "testRange"];
    expect(rangeControl).toBeDefined();
    expect(rangeControl.type).toBe("rangeSlider");
    expect(rangeControl.min).toBe(0);
    expect(rangeControl.max).toBe(100);
    expect(rangeControl.step).toBe(1);
    expect(rangeControl.value).toBe(50);
  });
});
