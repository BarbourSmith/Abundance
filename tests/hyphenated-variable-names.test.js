import { describe, it, expect, beforeEach } from "vitest";
import AttachmentPoint from "../src/prototypes/attachmentpoint.js";
import Molecule from "../src/molecules/molecule.js";
import Input from "../src/molecules/input.js";
import Atom from "../src/prototypes/atom.js";
import { Status } from "../src/prototypes/observableEntity.js";
import GlobalVariables from "../src/js/globalvariables.js";

describe("Hyphenated variable name support", () => {
  let molecule;
  let inputAtom;
  let childAtom;
  let attachmentPoint;

  beforeEach(() => {
    // Create a parent molecule
    molecule = new Molecule({
      x: 0.5,
      y: 0.5,
      parent: null,
      uniqueID: GlobalVariables.generateUniqueID(),
      topLevel: true,
    });

    // Create an Input atom with a hyphenated name "wood-thick" with initial value 42
    inputAtom = new Input({
      x: 0.2,
      y: 0.3,
      parent: molecule,
      uniqueID: GlobalVariables.generateUniqueID(),
      name: "wood-thick",
      value: 42,
      type: "number",
    });
    
    // Add the Input atom to the molecule's nodesOnTheScreen
    molecule.nodesOnTheScreen.push(inputAtom);
    
    // Set the input atom to ready state with value 42
    inputAtom.setReady(42);

    // Create a simple child atom
    childAtom = new Atom({
      x: 0.6,
      y: 0.6,
      parent: molecule,
      uniqueID: GlobalVariables.generateUniqueID(),
      atomType: "TestAtom",
    });
    childAtom.parent = molecule;
    childAtom.parentMolecule = molecule;

    // Create an input attachment point on the child atom
    attachmentPoint = new AttachmentPoint({
      parentMolecule: childAtom,
      uniqueID: GlobalVariables.generateUniqueID(),
      type: "input",
      name: "diameter",
      valueType: "number",
      defaultValue: 10,
    });
  });

  it("should subscribe to Input atom with hyphenated name and receive initial value", () => {
    // Set the attachment point value to the hyphenated input atom name
    attachmentPoint.setValue("wood-thick");

    // The AP should have subscribed to the input atom and received its value
    expect(attachmentPoint.getValue()).toBe(42);
    expect(attachmentPoint.status).toBe(Status.READY);

    // Verify subscription exists
    expect(inputAtom.subscribers[attachmentPoint.uniqueID]).toBeDefined();
  });

  it("should update AP value when hyphenated Input atom value changes", () => {
    // Subscribe by setting hyphenated name
    attachmentPoint.setValue("wood-thick");
    expect(attachmentPoint.getValue()).toBe(42);

    // Change the input atom value
    inputAtom.setReady(100);

    // The AP should have been notified and updated
    expect(attachmentPoint.getValue()).toBe(100);
    expect(attachmentPoint.status).toBe(Status.READY);
  });

  it("should extract hyphenated variable name from simple equation", () => {
    // Test that extractVariablesFromEquation correctly identifies hyphenated names
    const variables = attachmentPoint.extractVariablesFromEquation("wood-thick");
    
    expect(variables).toContain("wood-thick");
    expect(variables).not.toContain("wood");
    expect(variables).not.toContain("thick");
  });

  it("should extract hyphenated variable name from complex equation", () => {
    // Test with multiplication
    const variables1 = attachmentPoint.extractVariablesFromEquation("wood-thick * 2");
    expect(variables1).toContain("wood-thick");
    
    // Test with addition
    const variables2 = attachmentPoint.extractVariablesFromEquation("wood-thick + 10");
    expect(variables2).toContain("wood-thick");
  });

  it("should handle equation with both hyphenated name and regular subtraction", () => {
    // Create another Input atom with a regular name
    const inputAtom2 = new Input({
      x: 0.2,
      y: 0.4,
      parent: molecule,
      uniqueID: GlobalVariables.generateUniqueID(),
      name: "offset",
      value: 5,
      type: "number",
    });
    molecule.nodesOnTheScreen.push(inputAtom2);
    inputAtom2.setReady(5);

    // Test equation that has both hyphenated name and regular subtraction
    // This tests that "wood-thick - offset" correctly identifies:
    // - "wood-thick" as a single variable (hyphenated Input name)
    // - "offset" as another variable
    const variables = attachmentPoint.extractVariablesFromEquation("wood-thick - offset");
    
    expect(variables).toContain("wood-thick");
    expect(variables).toContain("offset");
    expect(variables.length).toBe(2);
  });

  it("should subscribe and evaluate complex expression with hyphenated variable", () => {
    // Create another Input for arithmetic
    const inputAtom2 = new Input({
      x: 0.2,
      y: 0.4,
      parent: molecule,
      uniqueID: GlobalVariables.generateUniqueID(),
      name: "multiplier",
      value: 2,
      type: "number",
    });
    molecule.nodesOnTheScreen.push(inputAtom2);
    inputAtom2.setReady(2);

    // Set an expression that uses the hyphenated variable
    attachmentPoint.setValue("wood-thick * multiplier");
    
    // Should evaluate to 42 * 2 = 84
    expect(attachmentPoint.getValue()).toBe(84);
    expect(attachmentPoint.status).toBe(Status.READY);

    // Both Input atoms should be subscribed
    expect(inputAtom.subscribers[attachmentPoint.uniqueID]).toBeDefined();
    expect(inputAtom2.subscribers[attachmentPoint.uniqueID]).toBeDefined();
  });

  it("should handle multiple hyphenated names in one equation", () => {
    // Create another Input with hyphenated name
    const inputAtom2 = new Input({
      x: 0.2,
      y: 0.4,
      parent: molecule,
      uniqueID: GlobalVariables.generateUniqueID(),
      name: "panel-width",
      value: 10,
      type: "number",
    });
    molecule.nodesOnTheScreen.push(inputAtom2);
    inputAtom2.setReady(10);

    // Test equation with multiple hyphenated names
    const variables = attachmentPoint.extractVariablesFromEquation("wood-thick + panel-width");
    
    expect(variables).toContain("wood-thick");
    expect(variables).toContain("panel-width");
    expect(variables.length).toBe(2);
  });

  it("should handle input names that are not hyphenated alongside hyphenated ones", () => {
    // Create a non-hyphenated Input
    const inputAtom2 = new Input({
      x: 0.2,
      y: 0.4,
      parent: molecule,
      uniqueID: GlobalVariables.generateUniqueID(),
      name: "length",
      value: 20,
      type: "number",
    });
    molecule.nodesOnTheScreen.push(inputAtom2);
    inputAtom2.setReady(20);

    // Use both in an equation
    attachmentPoint.setValue("wood-thick + length");
    
    // Should evaluate to 42 + 20 = 62
    expect(attachmentPoint.getValue()).toBe(62);
    expect(attachmentPoint.status).toBe(Status.READY);
  });

  it("should not break regular subtraction when no hyphenated Input exists", () => {
    // Create only non-hyphenated Inputs
    const inputA = new Input({
      x: 0.2,
      y: 0.4,
      parent: molecule,
      uniqueID: GlobalVariables.generateUniqueID(),
      name: "valueA",
      value: 100,
      type: "number",
    });
    molecule.nodesOnTheScreen.push(inputA);
    inputA.setReady(100);

    const inputB = new Input({
      x: 0.2,
      y: 0.5,
      parent: molecule,
      uniqueID: GlobalVariables.generateUniqueID(),
      name: "valueB",
      value: 30,
      type: "number",
    });
    molecule.nodesOnTheScreen.push(inputB);
    inputB.setReady(30);

    // Test that regular subtraction still works
    attachmentPoint.setValue("valueA - valueB");
    
    // Should evaluate to 100 - 30 = 70
    expect(attachmentPoint.getValue()).toBe(70);
    expect(attachmentPoint.status).toBe(Status.READY);
  });
});
