import { describe, it, expect, beforeEach } from "vitest";
import AttachmentPoint from "../src/prototypes/attachmentpoint.js";
import Molecule from "../src/molecules/molecule.js";
import Input from "../src/molecules/input.js";
import Atom from "../src/prototypes/atom.js";
import Connector from "../src/prototypes/connector.js";
import { Status } from "../src/prototypes/observableEntity.js";
import GlobalVariables from "../src/js/globalvariables.js";

describe("AttachmentPoint name-based Input subscription", () => {
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

    // Create an Input atom named "wood" with initial value 42
    inputAtom = new Input({
      x: 0.2,
      y: 0.3,
      parent: molecule,
      uniqueID: GlobalVariables.generateUniqueID(),
      name: "wood",
      value: 42,
      type: "number",
    });
    
    // Add the Input atom to the molecule's nodesOnTheScreen
    molecule.nodesOnTheScreen.push(inputAtom);
    
    // Set the input atom to ready state with value 42
    // Since we subscribe to the Input atom itself (not its output), this is all we need
    inputAtom.setReady(42);

    // Create a simple child atom (we'll use a minimal Atom object)
    childAtom = new Atom({
      x: 0.6,
      y: 0.6,
      parent: molecule,
      uniqueID: GlobalVariables.generateUniqueID(),
      atomType: "TestAtom",
    });
    // Set both parent and parentMolecule to ensure proper hierarchy
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

  it("should subscribe to Input atom by name and receive initial value", () => {
    // Set the attachment point value to the name of the input atom
    attachmentPoint.setValue("wood");

    // The AP should have subscribed to the input atom and received its value
    expect(attachmentPoint.getValue()).toBe(42);
    expect(attachmentPoint.status).toBe(Status.READY);

    // Verify subscription exists (check that the inputAtom has this AP as a subscriber)
    expect(inputAtom.subscribers[attachmentPoint.uniqueID]).toBeDefined();
  });

  it("should update AP value when Input atom value changes", () => {
    // Subscribe by setting name
    attachmentPoint.setValue("wood");
    expect(attachmentPoint.getValue()).toBe(42);

    // Change the input atom value - since we subscribe to the Input atom itself,
    // calling setReady on it will notify our subscription
    inputAtom.setReady(100);

    // The AP should have been notified and updated
    expect(attachmentPoint.getValue()).toBe(100);
    expect(attachmentPoint.status).toBe(Status.READY);
  });

  it("should unsubscribe when connector is attached", () => {
    // First establish name-based subscription
    attachmentPoint.setValue("wood");
    expect(attachmentPoint.getValue()).toBe(42);
    expect(inputAtom.subscribers[attachmentPoint.uniqueID]).toBeDefined();

    // Create an output attachment point from another atom
    const outputAtom = new Atom({
      x: 0.4,
      y: 0.4,
      parent: molecule,
      uniqueID: GlobalVariables.generateUniqueID(),
      atomType: "SourceAtom",
    });
    outputAtom.parentMolecule = molecule;

    const outputAP = new AttachmentPoint({
      parentMolecule: outputAtom,
      uniqueID: GlobalVariables.generateUniqueID(),
      type: "output",
      name: "output",
      valueType: "number",
    });

    // Set the output atom to ready with value 200
    outputAtom.setReady(200);

    // Create a connector from outputAP to attachmentPoint
    const connector = new Connector({
      atomType: "Connector",
      attachmentPoint1: outputAP,
      attachmentPoint2: attachmentPoint,
    });

    // The name-based subscription should be removed
    expect(inputAtom.subscribers[attachmentPoint.uniqueID]).toBeUndefined();

    // The AP should now receive value from the connector
    expect(attachmentPoint.getValue()).toBe(200);
  });

  it("should re-establish name subscription when connector is deleted", () => {
    // Set up name-based subscription
    attachmentPoint.setValue("wood");
    expect(attachmentPoint.getValue()).toBe(42);

    // Create connector from another source
    const outputAtom = new Atom({
      x: 0.4,
      y: 0.4,
      parent: molecule,
      uniqueID: GlobalVariables.generateUniqueID(),
      atomType: "SourceAtom",
    });
    outputAtom.parentMolecule = molecule;

    const outputAP = new AttachmentPoint({
      parentMolecule: outputAtom,
      uniqueID: GlobalVariables.generateUniqueID(),
      type: "output",
      name: "output",
      valueType: "number",
    });
    outputAtom.setReady(200);

    const connector = new Connector({
      atomType: "Connector",
      attachmentPoint1: outputAP,
      attachmentPoint2: attachmentPoint,
    });

    // Name subscription should be removed
    expect(inputAtom.subscribers[attachmentPoint.uniqueID]).toBeUndefined();

    // Delete the connector
    attachmentPoint.deleteConnector(connector);

    // The name-based subscription should be re-established
    expect(inputAtom.subscribers[attachmentPoint.uniqueID]).toBeDefined();
    expect(attachmentPoint.getValue()).toBe(42);
  });

  it("should not subscribe for geometry type APs", () => {
    // Create a geometry type AP
    const geometryAP = new AttachmentPoint({
      parentMolecule: childAtom,
      uniqueID: GlobalVariables.generateUniqueID(),
      type: "input",
      name: "geometry",
      valueType: "geometry",
      defaultValue: null,
    });

    // Try to set a name value
    geometryAP.setValue("wood", "geometry");

    // Geometry APs should not subscribe to Input atoms by name
    expect(inputAtom.subscribers[geometryAP.uniqueID]).toBeUndefined();
    expect(geometryAP.status).toBe(Status.WAITING);
  });

  it("should report non-existent Input atom names as an error", () => {
    // Try to subscribe to a non-existent input
    attachmentPoint.setValue("nonexistent");

    // Should not have subscribed to anything
    expect(inputAtom.subscribers[attachmentPoint.uniqueID]).toBeUndefined();
    
    // A name that matches nothing is an error, not a silently kept value
    expect(attachmentPoint.status).toBe(Status.ERROR);
    expect(attachmentPoint.equationError).toMatch(/"nonexistent"/);
  });

  it("should update subscription when name changes", () => {
    // Create another input atom
    const inputAtom2 = new Input({
      x: 0.2,
      y: 0.4,
      parent: molecule,
      uniqueID: GlobalVariables.generateUniqueID(),
      name: "metal",
      value: 75,
      type: "number",
    });
    molecule.nodesOnTheScreen.push(inputAtom2);
    inputAtom2.setReady(75);

    // Subscribe to first input
    attachmentPoint.setValue("wood");
    expect(attachmentPoint.getValue()).toBe(42);
    expect(inputAtom.subscribers[attachmentPoint.uniqueID]).toBeDefined();

    // Change to subscribe to second input
    attachmentPoint.setValue("metal");
    expect(attachmentPoint.getValue()).toBe(75);
    expect(inputAtom.subscribers[attachmentPoint.uniqueID]).toBeUndefined();
    expect(inputAtom2.subscribers[attachmentPoint.uniqueID]).toBeDefined();
  });

  it("should handle Input atom status changes (not just READY)", () => {
    // Subscribe to input
    attachmentPoint.setValue("wood");
    expect(attachmentPoint.getValue()).toBe(42);
    expect(attachmentPoint.status).toBe(Status.READY);

    // Change input status to PROCESSING - since we subscribe to the Input atom itself,
    // calling setProcessing on it will notify our subscription
    inputAtom.setProcessing();

    // AP should reflect the new status
    expect(attachmentPoint.status).toBe(Status.PROCESSING);

    // Change input status to WAITING
    inputAtom.setWaiting();
    expect(attachmentPoint.status).toBe(Status.WAITING);

    // Return to READY
    inputAtom.setReady(99);
    expect(attachmentPoint.status).toBe(Status.READY);
    expect(attachmentPoint.getValue()).toBe(99);
  });

  it("should subscribe to variables in complex expressions", () => {
    // Valid identifier names should work
    attachmentPoint.setValue("wood");
    expect(inputAtom.subscribers[attachmentPoint.uniqueID]).toBeDefined();

    // Clean up subscription
    attachmentPoint.setValue(10);
    expect(inputAtom.subscribers[attachmentPoint.uniqueID]).toBeUndefined();
    
    // Expressions with variables should subscribe to those variables
    attachmentPoint.setValue("wood+10");
    expect(inputAtom.subscribers[attachmentPoint.uniqueID]).toBeDefined();

    // Clean up
    attachmentPoint.setValue(10);
    
    // Expression with multiplication should also subscribe
    attachmentPoint.setValue("wood * 2");
    expect(inputAtom.subscribers[attachmentPoint.uniqueID]).toBeDefined();
  });
});
