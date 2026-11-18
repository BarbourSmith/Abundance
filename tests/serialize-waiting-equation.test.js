import { describe, it, expect, beforeEach } from "vitest";
import AttachmentPoint from "../src/prototypes/attachmentpoint.js";
import Molecule from "../src/molecules/molecule.js";
import Input from "../src/molecules/input.js";
import Atom from "../src/prototypes/atom.js";
import { Status } from "../src/prototypes/observableEntity.js";
import GlobalVariables from "../src/js/globalvariables.js";

/**
 * Saving while the project recomputes must keep equations whose inputs are
 * still processing. Such an input has no value until they finish, and saving
 * used to skip it, so the equation was lost and the input reloaded at its
 * default.
 */
describe("Saving an equation whose inputs are still computing", () => {
  let molecule;
  let inputAtom;
  let childAtom;
  let ap;

  beforeEach(() => {
    molecule = new Molecule({
      x: 0.5,
      y: 0.5,
      parent: null,
      uniqueID: GlobalVariables.generateUniqueID(),
      topLevel: true,
    });

    inputAtom = new Input({
      x: 0.2,
      y: 0.3,
      parent: molecule,
      uniqueID: GlobalVariables.generateUniqueID(),
      name: "Wall",
      value: 2,
      type: "number",
    });
    molecule.nodesOnTheScreen.push(inputAtom);
    inputAtom.setReady(2);

    childAtom = new Atom({
      x: 0.6,
      y: 0.6,
      parent: molecule,
      uniqueID: GlobalVariables.generateUniqueID(),
      atomType: "TestAtom",
    });
    childAtom.parent = molecule;
    childAtom.parentMolecule = molecule;

    ap = new AttachmentPoint({
      parentMolecule: childAtom,
      uniqueID: GlobalVariables.generateUniqueID(),
      type: "input",
      name: "height",
      valueType: "number",
      defaultValue: 10,
    });
    childAtom.inputs.push(ap);
  });

  it("saves the equation while its input is processing", () => {
    ap.setValue("8 + Wall");
    expect(ap.getValue()).toBe(10);

    inputAtom.setStatus(Status.PROCESSING);
    expect(ap.getValue()).toBeNull();

    const saved = childAtom.serialize().ioValues?.find(
      (io) => io.name === "height",
    );
    expect(saved?.currentEquation).toBe("8 + Wall");
  });

  it("reloads the saved equation and computes it", () => {
    ap.setValue("8 + Wall");
    inputAtom.setStatus(Status.PROCESSING);
    const saved = childAtom.serialize();

    const reloaded = new AttachmentPoint({
      parentMolecule: childAtom,
      uniqueID: GlobalVariables.generateUniqueID(),
      type: "input",
      name: "height",
      valueType: "number",
      defaultValue: 10,
    });
    childAtom.inputs = [reloaded];
    childAtom.setValues({ ioValues: saved.ioValues });
    expect(reloaded.currentEquation).toBe("8 + Wall");

    inputAtom.setReady(3);
    expect(reloaded.getValue()).toBe(11);
  });

  it("still leaves out an input with no equation and no value", () => {
    ap.setStatus(Status.WAITING);
    const saved = childAtom.serialize().ioValues?.find(
      (io) => io.name === "height",
    );
    expect(saved).toBeUndefined();
  });
});
