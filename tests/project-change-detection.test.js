import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "../src/prototypes/attachmentpoint.js";
import Atom from "../src/prototypes/atom.js";
import Connector from "../src/prototypes/connector.js";
import Molecule from "../src/molecules/molecule.js";
import Input from "../src/molecules/input.js";
import Readme from "../src/molecules/readme.js";
import Assembly from "../src/molecules/assembly.js";
import { addOrDeletePorts } from "../src/js/alwaysOneFreeInput.js";
import GlobalVariables from "../src/js/globalvariables.js";
import {
  hasProjectChanges,
  serializeProjectForChangeDetection,
} from "../src/js/projectSaveBaseline.js";

describe("authored project change detection", () => {
  const projectKey = "owner/project";
  let top, nested, source, target, diameter, height;

  function addAtom(parent, id) {
    const atom = new Atom({ uniqueID: id });
    atom.setValues({
      atomType: "Test",
      name: "Test",
      parent,
      x: 0.2,
      y: 0.3,
    });
    parent.nodesOnTheScreen.push(atom);
    return atom;
  }

  function connect(upstream, input) {
    return new Connector({
      attachmentPoint1: upstream.output,
      attachmentPoint2: input,
    });
  }

  function snapshot() {
    return serializeProjectForChangeDetection(top);
  }

  beforeEach(() => {
    top = new Molecule({ uniqueID: "top", topLevel: true, unitsKey: "MM" });
    vi.spyOn(GlobalVariables, "topLevelMolecule", "get").mockReturnValue(top);
    nested = new Molecule({ uniqueID: "nested", parent: top });
    top.nodesOnTheScreen.push(nested);
    diameter = new Input({
      uniqueID: "diameter",
      name: "Diameter",
      type: "number",
      parent: nested,
    });
    nested.nodesOnTheScreen.push(diameter);
    source = addAtom(top, "source");
    source.addIO("number", "number", 10, "output");
    target = addAtom(nested, "target");
    height = target.addIO("Height", "number", 10, "input");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("ignores wired values through nested molecule interfaces during computation", () => {
    connect(source, diameter.parentAP);
    const before = snapshot();
    const savedBefore = JSON.stringify(top.serialize());
    source.setReady(205);
    const savedAfter = JSON.stringify(top.serialize());
    expect(savedAfter).not.toBe(savedBefore);
    expect(snapshot()).toBe(before);
    source.setProcessing();
    expect(snapshot()).toBe(before);
    source.setReady(200);
    expect(snapshot()).toBe(before);
  });

  it("retains formula text even when evaluation is waiting or errors", () => {
    height.currentEquation = "Diameter / 2";
    diameter.setWaiting();
    const before = snapshot();
    const savedBefore = JSON.stringify(top.serialize());
    diameter.setReady(205);
    expect(height.getValue()).toBe(102.5);
    expect(JSON.stringify(top.serialize())).not.toBe(savedBefore);
    expect(snapshot()).toBe(before);
    diameter.setError();
    expect(snapshot()).toBe(before);
    diameter.setReady(200);
    expect(snapshot()).toBe(before);
    height.currentEquation = "Diameter / 3";
    expect(snapshot()).not.toBe(before);
  });

  it.each([
    ["number", 10, 25],
    ["boolean", true, false],
    ["string", "Base", "Cap"],
    ["array", [1, 2], [2, 1]],
    ["point3d", [0, 0, 0], [0, 0, 1]],
  ])("detects edits to literal %s inputs", (type, initial, edited) => {
    const input = target.addIO("Literal", type, initial, "input");
    const before = snapshot();
    input.setValue(edited);
    expect(snapshot()).not.toBe(before);
    input.setValue(initial);
    expect(snapshot()).toBe(before);
  });

  it("detects unconnected nested interface edits", () => {
    const before = snapshot();
    diameter.parentAP.setValue(205);
    expect(snapshot()).not.toBe(before);
  });

  it("ignores evaluated molecule input formulas regardless of property order", () => {
    diameter.parentAP.currentEquation = "Unknown / 2";
    diameter.parentAP.setWaiting();
    const before = snapshot();
    diameter.parentAP.setReady(102.5);
    expect(snapshot()).toBe(before);
    diameter.parentAP.setReady(100);
    expect(snapshot()).toBe(before);
    diameter.parentAP.currentEquation = "Unknown / 3";
    expect(snapshot()).not.toBe(before);
  });

  it("ignores wired arrays and strings but detects connecting and disconnecting", () => {
    const input = target.addIO("Data", "array", [], "input");
    const disconnected = snapshot();
    const wire = connect(source, input);
    const connected = snapshot();
    expect(connected).not.toBe(disconnected);
    source.setReady([1, 2]);
    expect(snapshot()).toBe(connected);
    source.setReady("computed");
    expect(snapshot()).toBe(connected);
    wire.deleteSelf(true);
    expect(snapshot()).not.toBe(connected);
  });

  it("ignores geometry spare sockets added after an Assembly computes", () => {
    const assembly = new Assembly({
      uniqueID: "assembly",
      parent: top,
      ioValues: [{ name: "Shape1", ioValue: "__GEOMETRY_INPUT__" }],
    });
    top.nodesOnTheScreen.push(assembly);
    connect(source, assembly.inputs.find((ap) => ap.name === "Shape1"));
    const before = snapshot();
    const payloadBefore = JSON.stringify(top.serialize());
    addOrDeletePorts(assembly);
    expect(JSON.stringify(top.serialize())).not.toBe(payloadBefore);
    expect(snapshot()).toBe(before);
    assembly.inputs.find((ap) => ap.name === "makeDisjoint").setValue(false);
    expect(snapshot()).not.toBe(before);
  });

  it("detects structure, names, positions, units and README edits", () => {
    const readme = new Readme({ uniqueID: "readme", parent: nested });
    nested.nodesOnTheScreen.push(readme);
    const before = snapshot();
    readme.readMeText = "How to modify this part";
    expect(snapshot()).not.toBe(before);
    const documented = snapshot();
    target.name = "Renamed";
    expect(snapshot()).not.toBe(documented);
    const renamed = snapshot();
    target.x += 0.2;
    expect(snapshot()).not.toBe(renamed);
    const moved = snapshot();
    top.unitsKey = "Inches";
    expect(snapshot()).not.toBe(moved);
    const changedUnits = snapshot();
    addAtom(nested, "new-atom");
    expect(snapshot()).not.toBe(changedUnits);
  });

  it("does not mutate the saved payload or depend on atom/input ordering", () => {
    connect(source, diameter.parentAP);
    source.setReady(205);
    target.addIO("Width", "number", 20, "input");
    height.currentEquation = "Diameter / 2";
    diameter.setReady(205);
    const saved = top.serialize();
    const savedJson = JSON.stringify(saved);
    const before = serializeProjectForChangeDetection(top, saved);
    expect(JSON.stringify(saved)).toBe(savedJson);
    expect(JSON.stringify(top.serialize())).toBe(savedJson);
    top.nodesOnTheScreen.reverse();
    nested.nodesOnTheScreen.reverse();
    target.inputs.reverse();
    expect(snapshot()).toBe(before);
  });

  it("keeps edits made during a save pending against the captured snapshot", () => {
    const captured = snapshot();
    height.setValue(25);
    const baseline = { projectKey, json: captured, bom: "BOM" };
    expect(hasProjectChanges(baseline, projectKey, snapshot(), "BOM")).toBe(true);
    const saved = { ...baseline, json: snapshot() };
    expect(hasProjectChanges(saved, projectKey, snapshot(), "BOM")).toBe(false);
    expect(hasProjectChanges(null, projectKey, snapshot(), "BOM")).toBe(true);
  });

  it("ignores compiled Code output but retains source and user layout choices", () => {
    const atom = addAtom(nested, "custom");
    atom.atomType = "Code";
    const payload = top.serialize();
    const savedAtom = payload.allAtoms
      .find((child) => child.uniqueID === nested.uniqueID)
      .allAtoms.find((child) => child.uniqueID === atom.uniqueID);
    savedAtom.code = "return 1";
    savedAtom.compiledCode = "compiled 1";
    const before = serializeProjectForChangeDetection(top, payload);
    savedAtom.compiledCode = "compiled 2";
    expect(serializeProjectForChangeDetection(top, payload)).toBe(before);
    savedAtom.code = "return 2";
    expect(serializeProjectForChangeDetection(top, payload)).not.toBe(before);
    atom.atomType = "Cut Orient";
    savedAtom.orientations = [{ downwardFaceIndex: 1 }];
    const oriented = serializeProjectForChangeDetection(top, payload);
    savedAtom.orientations[0].downwardFaceIndex = 2;
    expect(serializeProjectForChangeDetection(top, payload)).not.toBe(oriented);
  });
});
