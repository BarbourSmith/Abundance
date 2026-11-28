import { describe, it, expect, beforeEach } from "vitest";
import AttachmentPoint from "../src/prototypes/attachmentpoint.js";
import Molecule from "../src/molecules/molecule.js";
import Input from "../src/molecules/input.js";
import Constant from "../src/molecules/constant.js";
import Equation from "../src/molecules/equation.js";
import Atom from "../src/prototypes/atom.js";
import { Status } from "../src/prototypes/observableEntity.js";
import GlobalVariables from "../src/js/globalvariables.js";
import {
  replaceVariableName,
  findNameReferences,
} from "../src/js/nameReferences.js";

/**
 * Equations refer to Inputs by name. Renaming an Input used to rename only
 * its own port, and a name that matched nothing was skipped without an
 * error, so equations quietly stopped following the Input. Renames now
 * rewrite those equations, and names that match nothing are errors.
 */

function makeMolecule(parent = null) {
  const molecule = new Molecule({
    x: 0.5,
    y: 0.5,
    parent,
    uniqueID: GlobalVariables.generateUniqueID(),
    topLevel: !parent,
  });
  if (parent) parent.nodesOnTheScreen.push(molecule);
  return molecule;
}

function makeInput(molecule, name, value) {
  const input = new Input({
    x: 0.2,
    y: 0.3,
    parent: molecule,
    uniqueID: GlobalVariables.generateUniqueID(),
    name,
    value,
    type: "number",
  });
  molecule.nodesOnTheScreen.push(input);
  input.setReady(value);
  return input;
}

function makeAtomWithPort(molecule, portName = "height") {
  const atom = new Atom({
    x: 0.6,
    y: 0.6,
    parent: molecule,
    uniqueID: GlobalVariables.generateUniqueID(),
    atomType: "TestAtom",
  });
  atom.parent = molecule;
  atom.parentMolecule = molecule;
  molecule.nodesOnTheScreen.push(atom);
  const ap = new AttachmentPoint({
    parentMolecule: atom,
    uniqueID: GlobalVariables.generateUniqueID(),
    type: "input",
    name: portName,
    valueType: "number",
    defaultValue: 10,
  });
  atom.inputs.push(ap);
  return { atom, ap };
}

/** Renames the way the properties panel does. */
function renameInPanel(atom, newName) {
  const params = atom.createInputParams(() => {});
  const field = params[atom.uniqueID] ?? params[atom.uniqueID + "name"];
  field.onChange(newName);
}

describe("replaceVariableName", () => {
  it("replaces whole variable names only", () => {
    expect(replaceVariableName("thickness * 2", "thickness", "ply")).toBe(
      "ply * 2",
    );
    expect(
      replaceVariableName("thickness2 + thickness", "thickness", "ply"),
    ).toBe("thickness2 + ply");
  });

  it("leaves quoted text and function names alone", () => {
    expect(
      replaceVariableName("'thickness: ' + thickness", "thickness", "ply"),
    ).toBe("'thickness: ' + ply");
    expect(replaceVariableName("max(max, 2)", "max", "top")).toBe(
      "max(top, 2)",
    );
  });
});

describe("Renaming an Input", () => {
  let molecule;
  let input;

  beforeEach(() => {
    GlobalVariables.undoCommandStack = [];
    molecule = makeMolecule();
    input = makeInput(molecule, "thickness", 4);
  });

  it("rewrites port equations, which keep following it", () => {
    const { ap } = makeAtomWithPort(molecule);
    ap.setValue("thickness * 2");
    expect(ap.getValue()).toBe(8);

    renameInPanel(input, "ply");

    expect(ap.currentEquation).toBe("ply * 2");
    input.setReady(5);
    expect(ap.getValue()).toBe(10);
  });

  it("rewrites Equation and Constant atoms that use it", () => {
    const equation = new Equation({
      x: 0.5,
      y: 0.5,
      parent: molecule,
      uniqueID: GlobalVariables.generateUniqueID(),
      currentEquation: "thickness + 3",
    });
    molecule.nodesOnTheScreen.push(equation);
    const constant = new Constant({
      x: 0.5,
      y: 0.5,
      parent: molecule,
      uniqueID: GlobalVariables.generateUniqueID(),
      currentEquation: "thickness / 2",
    });
    molecule.nodesOnTheScreen.push(constant);

    renameInPanel(input, "ply");

    expect(equation.currentEquation).toBe("ply + 3");
    expect(equation.evaluateEquation(equation.currentEquation)).toBe(7);
    expect(equation.inputs.some((ap) => ap.name === "thickness")).toBe(false);
    expect(constant.currentEquation).toBe("ply / 2");
  });

  it("reaches nested molecules, but not ones with their own Input of that name", () => {
    const inner = makeMolecule(molecule);
    const { ap: innerPort } = makeAtomWithPort(inner);
    innerPort.setValue("thickness + 1");

    const shadowing = makeMolecule(molecule);
    makeInput(shadowing, "thickness", 100);
    const { ap: shadowedPort } = makeAtomWithPort(shadowing);
    shadowedPort.setValue("thickness + 1");

    expect(findNameReferences(input).map((r) => r.ap)).toEqual([innerPort]);

    renameInPanel(input, "ply");

    expect(innerPort.currentEquation).toBe("ply + 1");
    expect(shadowedPort.currentEquation).toBe("thickness + 1");
  });

  it("puts the equations back on undo", async () => {
    const { ap } = makeAtomWithPort(molecule);
    ap.setValue("thickness * 2");

    renameInPanel(input, "ply");
    expect(ap.currentEquation).toBe("ply * 2");

    await GlobalVariables.undoCommandStack.at(-1).undo();

    expect(input.name).toBe("thickness");
    expect(ap.currentEquation).toBe("thickness * 2");
    expect(ap.getValue()).toBe(8);
  });

  it("doesn't merge a variable that already uses the new name", () => {
    makeInput(molecule, "other", 1);
    const { ap } = makeAtomWithPort(molecule);
    ap.setValue("thickness + other");

    renameInPanel(input, "other");

    // The panel won't reuse a name in the same molecule
    expect(input.name).toBe("other_1");
    expect(ap.currentEquation).toBe("other_1 + other");
  });
});

describe("Renaming a Constant", () => {
  it("rewrites port equations that use it", () => {
    GlobalVariables.undoCommandStack = [];
    const molecule = makeMolecule();
    const constant = new Constant({
      x: 0.5,
      y: 0.5,
      parent: molecule,
      uniqueID: GlobalVariables.generateUniqueID(),
      name: "gap",
      currentEquation: "3",
    });
    molecule.nodesOnTheScreen.push(constant);
    constant.setReady(3);
    const { ap } = makeAtomWithPort(molecule);
    ap.setValue("gap * 2");
    expect(ap.getValue()).toBe(6);

    renameInPanel(constant, "spacing");

    expect(ap.currentEquation).toBe("spacing * 2");
    constant.setReady(4);
    expect(ap.getValue()).toBe(8);
  });
});

describe("Equation names that match nothing", () => {
  let molecule;

  beforeEach(() => {
    molecule = makeMolecule();
    makeInput(molecule, "thickness", 4);
  });

  it("are an error on the port and its atom", () => {
    const { atom, ap } = makeAtomWithPort(molecule);
    atom.isEnabled = () => true;
    atom.compute = async () => 1;
    atom._subscribeToInputs();

    ap.setValue("thicknes * 2");

    expect(ap.status).toBe(Status.ERROR);
    expect(ap.equationError).toMatch(/"thicknes".*doesn't match/);
    expect(atom.status).toBe(Status.ERROR);
    expect(atom.alert.message).toMatch(/"thicknes"/);
  });

  it("are an error even when other names in it match", () => {
    const { ap } = makeAtomWithPort(molecule);
    ap.setValue("thickness + gone");
    expect(ap.status).toBe(Status.ERROR);
    expect(ap.equationError).toMatch(/"gone"/);
    expect(ap.equationError).not.toMatch(/"thickness"/);
  });

  it("clear once the equation is fixed", () => {
    const { ap } = makeAtomWithPort(molecule);
    ap.setValue("thicknes * 2");
    ap.setValue("thickness * 2");
    expect(ap.equationError).toBeNull();
    expect(ap.getValue()).toBe(8);
  });

  it("don't count lengths with units or built-in constants", () => {
    molecule.unitsKey = "MM";
    const { ap } = makeAtomWithPort(molecule);
    expect(ap.missingVariables("2 * pi * thickness")).toEqual([]);
  });

  it("aren't checked in text ports", () => {
    const { ap } = makeAtomWithPort(molecule, "label");
    ap.valueType = "string";
    ap.setValue("hello world");
    expect(ap.equationError).toBeNull();
    expect(ap.getValue()).toBe("hello world");
  });

  it("aren't reported while a project loads, until the molecule checks", () => {
    const { ap } = makeAtomWithPort(molecule);
    GlobalVariables.projectIsLoading = true;
    try {
      ap.currentEquation = "later * 2";
      expect(ap.equationError).toBeNull();
    } finally {
      GlobalVariables.projectIsLoading = false;
    }
    ap.subscribeToVariablesInEquation(ap.currentEquation, {
      reportMissing: true,
    });
    expect(ap.equationError).toMatch(/"later"/);
  });
});

describe("Loading a saved Equation atom", () => {
  it("doesn't make a port set to 1 for a name whose Input is gone", () => {
    const molecule = makeMolecule();
    makeInput(molecule, "ply", 4); // was "thickness" when saved
    const equation = new Equation({
      x: 0.5,
      y: 0.5,
      parent: molecule,
      uniqueID: GlobalVariables.generateUniqueID(),
      currentEquation: "thickness + 3",
    });
    expect(equation.inputs.map((ap) => ap.name)).toEqual([]);
    expect(() => equation.evaluateEquation(equation.currentEquation)).toThrow(
      /thickness/,
    );
  });

  it("gets back the ports it was saved with", () => {
    const molecule = makeMolecule();
    const equation = new Equation({
      x: 0.5,
      y: 0.5,
      parent: molecule,
      uniqueID: GlobalVariables.generateUniqueID(),
      currentEquation: "x + y",
      ioValues: [
        { name: "x", ioValue: 2 },
        { name: "y", ioValue: 5 },
      ],
    });
    expect(equation.inputs.map((ap) => ap.name).sort()).toEqual(["x", "y"]);
    expect(equation.evaluateEquation("x + y")).toBe(7);
  });

  it("still makes a port for a name a saved connection uses", () => {
    const molecule = makeMolecule();
    const equation = new Equation({
      x: 0.5,
      y: 0.5,
      parent: molecule,
      uniqueID: GlobalVariables.generateUniqueID(),
      currentEquation: "x * 2",
    });
    expect(equation.inputs).toEqual([]);
    const port = equation.inputForConnection("x");
    expect(port?.name).toBe("x");
    expect(equation.inputForConnection("z")).toBeUndefined();
  });

  it("makes ports for every name when added new", () => {
    const molecule = makeMolecule();
    const equation = new Equation({
      x: 0.5,
      y: 0.5,
      parent: molecule,
      uniqueID: GlobalVariables.generateUniqueID(),
    });
    expect(equation.inputs.map((ap) => ap.name).sort()).toEqual(["x", "y"]);
  });
});

describe("Loading a project whose Input was renamed", () => {
  function savedProject() {
    return {
      atomType: "Molecule",
      name: "Top",
      uniqueID: 1000,
      topLevel: true,
      unitsKey: "MM",
      allAtoms: [
        // The port comes before the Input in the file, so its name only
        // resolves once the whole molecule is placed
        {
          atomType: "Rectangle",
          uniqueID: 1002,
          x: 0.5,
          y: 0.5,
          ioValues: [
            { name: "x length", ioValue: 8, currentEquation: "thickness * 2" },
            { name: "y length", ioValue: 5, currentEquation: "ply + 1" },
          ],
        },
        {
          atomType: "Molecule",
          name: "Inner",
          uniqueID: 1003,
          x: 0.3,
          y: 0.3,
          allAtoms: [
            {
              atomType: "Rectangle",
              uniqueID: 1004,
              x: 0.5,
              y: 0.5,
              ioValues: [
                { name: "x length", ioValue: 5, currentEquation: "ply + 1" },
              ],
            },
          ],
          allConnectors: [],
        },
        {
          atomType: "Input",
          name: "ply",
          uniqueID: 1001,
          x: 0.1,
          y: 0.5,
          type: "number",
          value: 4,
        },
      ],
      allConnectors: [],
    };
  }

  it("shows the old name as an error and keeps names that still match", async () => {
    const top = new Molecule({
      x: 0,
      y: 0,
      parent: null,
      uniqueID: 1000,
      topLevel: true,
    });
    GlobalVariables.currentMolecule = null;
    await top.deserialize(savedProject());

    const rectangle = top.nodesOnTheScreen.find((a) => a.uniqueID === 1002);
    const width = rectangle.inputs.find((ap) => ap.name === "x length");
    const length = rectangle.inputs.find((ap) => ap.name === "y length");
    expect(width.equationError).toMatch(/"thickness"/);
    expect(width.status).toBe(Status.ERROR);
    expect(length.equationError).toBeNull();

    const inner = top.nodesOnTheScreen.find((a) => a.uniqueID === 1003);
    const innerWidth = inner.nodesOnTheScreen
      .find((a) => a.uniqueID === 1004)
      .inputs.find((ap) => ap.name === "x length");
    expect(innerWidth.equationError).toBeNull();
  });
});
