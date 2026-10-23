// Tests for the Label atom's text and the label data it serializes.

import { describe, it, expect } from "vitest";
// Import order matters: loading AttachmentPoint first avoids a circular-import
// initialization error between Atom and the molecule modules.
import "../src/prototypes/attachmentpoint.js";
import Molecule from "../src/molecules/molecule.js";
import Label from "../src/molecules/label.js";
import GlobalVariables from "../src/js/globalvariables.js";

function makeLabel(unitsKey, values = {}) {
  const parent = new Molecule({
    x: 0.5,
    y: 0.5,
    uniqueID: GlobalVariables.generateUniqueID(),
    topLevel: true,
  });
  parent.unitsKey = unitsKey;
  const label = new Label({
    x: 0.5,
    y: 0.5,
    parent,
    uniqueID: GlobalVariables.generateUniqueID(),
  });
  label.findIOValue = (name) =>
    name in values
      ? values[name]
      : label.inputs.find((input) => input.name === name)?.getValue();
  return label;
}

describe("Label text", () => {
  it("shows the measured length in the project's units", () => {
    expect(makeLabel("MM").labelText(14.142)).toBe("14.1 mm");
    expect(makeLabel("Inches").labelText(2.5)).toBe("2.5 in");
  });

  it("shows typed text instead of the length", () => {
    expect(makeLabel("MM", { text: " Gap " }).labelText(14)).toBe("Gap");
  });

  it("shows the length when Length is chosen, even with typed text", () => {
    const label = makeLabel("MM", { text: "Gap" });
    label.textMode = "measure";
    expect(label.labelText(14)).toBe("14 mm");
  });

  it("shows the text input only for custom text", () => {
    const label = makeLabel("MM");
    label.refreshAnchors = () => {};
    const hasInput = () =>
      Object.keys(label.createInputParams()).includes(label.uniqueID + "text");
    expect(label.currentTextMode()).toBe("measure");
    expect(hasInput()).toBe(false);

    label.chooseTextMode("custom");
    expect(hasInput()).toBe(true);
    expect(label.serialize().textMode).toBe("custom");
  });

  it("treats the old default text 'label' as showing the length", () => {
    expect(makeLabel("MM", { text: "label" }).labelText(16)).toBe("16 mm");
  });

  it("uses size 1 for old projects' font size of 40", () => {
    expect(makeLabel("MM", { fontSize: 40 }).textScale()).toBe(1);
    expect(makeLabel("MM", { fontSize: 2 }).textScale()).toBe(2);
    expect(makeLabel("MM", { fontSize: 0.1 }).textScale()).toBe(0.5);
  });
});

describe("Label.serializeLabel", () => {
  it("draws a thin line with arrows and the text on a tag", () => {
    const label = makeLabel("MM", { color: "#ff0000", fontSize: 2 });
    const serialized = label.serializeLabel([0, 0, 0], [0, 0, 20]);

    expect(serialized.type).toBe("Label");
    expect(serialized.line).toMatchObject({
      start: [0, 0, 0],
      end: [0, 0, 20],
      color: "#ff0000",
      linewidth: 1.5,
    });
    expect(serialized.arrows).toBe(true);
    // Text between 10 and 16 pixels, times the text size
    expect(serialized.text).toMatchObject({
      value: "20 mm",
      position: [0, 0, 10],
      size: 32,
      minSize: 20,
    });
    // No offset, no extension lines
    expect(serialized.endSegments).toBeUndefined();
  });
});

describe("Label anchors", () => {
  it("saves picks and restores them", () => {
    const label = makeLabel("MM");
    expect(label.serialize().anchors).toBeUndefined();

    const edge = { kind: "edge", leaf: 0, index: 3 };
    label.anchors = { ...label.anchors, edge };
    const saved = label.serialize();
    expect(saved.anchors).toEqual({ edge, start: null, end: null });

    const restored = new Label({ ...saved, parent: label.parent });
    expect(restored.anchors).toEqual({ edge, start: null, end: null });
  });
});

describe("Label choices", () => {
  const params = (label) =>
    Object.values(label.createInputParams()).filter(
      (param) => param.type === "buttongroup" && param.label !== "Text",
    );

  it("follows the picks of labels saved before the choices", () => {
    const edge = { kind: "edge", leaf: 0, index: 3 };
    const label = new Label({
      parent: makeLabel("MM").parent,
      anchors: { edge, start: null, end: null },
    });
    expect(label.anchorModes).toEqual({ start: "edge", end: "point" });
  });

  it("grays out the end's choices while measuring an edge", () => {
    const label = makeLabel("MM");
    const [, end] = params(label);
    expect(end.buttons.map((button) => Boolean(button.disabled))).toEqual([
      true,
      false,
      false,
    ]);

    label.anchorModes = { start: "edge", end: "point" };
    const [start, grayed] = params(label);
    expect(start.buttons.find((button) => button.selected).key).toBe("edge");
    expect(grayed.buttons.every((button) => button.disabled)).toBe(true);
  });

  it("shows a point input for Point and drops the pick", () => {
    const label = makeLabel("MM");
    label.refreshAnchors = () => {};
    label.anchors = { edge: null, start: { kind: "face", leaf: 0, index: 1 } };
    label.anchorModes = { start: "face", end: "point" };

    label.chooseAnchor("start", "point");
    expect(label.anchors.start).toBeNull();
    const labels = Object.values(label.createInputParams()).map((p) => p.label);
    expect(labels).toContain("Start point");
    expect(labels).toContain("End point");
  });
});

describe("Label offset", () => {
  it("moves the line along X, with extension lines", () => {
    const label = makeLabel("MM", { offset: 5 });
    // A vertical edge: X is the default axis
    const serialized = label.serializeLabel([10, 0, 0], [10, 0, 20]);

    expect(serialized.line.start).toEqual([15, 0, 0]);
    expect(serialized.line.end).toEqual([15, 0, 20]);
    expect(serialized.text.position).toEqual([15, 0, 10]);
    expect(serialized.text.value).toBe("20 mm");
    // Faint, from just off the part to just past the line
    expect(serialized.endSegments.opacity).toBeLessThan(1);
    expect(serialized.endSegments.start.p1).toEqual([10.5, 0, 0]);
    expect(serialized.endSegments.start.p2[0]).toBeCloseTo(15.5);
  });

  it("moves to the - side with a negative distance", () => {
    const label = makeLabel("MM", { offset: -5 });
    label.offsetAxisChoice = "y";
    const serialized = label.serializeLabel([10, 0, 0], [10, 0, 20]);
    expect(serialized.line.start).toEqual([10, -5, 0]);
    expect(serialized.endSegments.start.p2[1]).toBeCloseTo(-5.5);
  });

  it("doesn't offset along the axis the line runs along", () => {
    const label = makeLabel("MM", { offset: 5 });
    label.offsetAxisChoice = "x";
    // Runs along X, so it moves along Y instead
    const serialized = label.serializeLabel([0, 0, 0], [20, 0, 0]);
    expect(serialized.line.start).toEqual([0, 5, 0]);

    const axis = Object.values(label.createInputParams()).find(
      (param) => param.label === "Offset",
    );
    expect(axis.buttons.map((button) => Boolean(button.disabled))).toEqual([
      true,
      false,
    ]);
    expect(axis.buttons.find((button) => button.selected).key).toBe("y");
  });

  it("keeps the line on the measured points with no offset", () => {
    const label = makeLabel("MM");
    const serialized = label.serializeLabel([10, 0, 0], [10, 0, 20]);
    expect(serialized.line.start).toEqual([10, 0, 0]);
  });

  it("centers the slider on 0, sized to about half the model", () => {
    const label = makeLabel("MM");
    label.modelBounds = { min: [-10, -10, 0], max: [10, 10, 20] };
    expect(label.offsetSliderMax()).toBe(10);
    const slider = Object.values(label.createInputParams()).find(
      (param) => param.label === "Distance",
    );
    expect([slider.min, slider.max]).toEqual([-10, 10]);

    label.modelBounds = { min: [0, 0, 0], max: [1200, 300, 40] };
    expect(label.offsetSliderMax()).toBe(1000);
  });
});

describe("Label picking", () => {
  it("lets another choice replace an edge that was never picked", () => {
    const label = makeLabel("MM");
    label.refreshAnchors = () => {};
    label.onUpstreamChange = () => {};
    const entered = [];
    const enter = GlobalVariables.enterSelectionMode;
    const exit = GlobalVariables.exitSelectionMode;
    GlobalVariables.enterSelectionMode = (atom) => {
      entered.push(atom.type);
      GlobalVariables.selectionModeAtom = atom;
    };
    GlobalVariables.exitSelectionMode = () => {
      GlobalVariables.selectionModeAtom = null;
    };
    try {
      const startChoices = () =>
        Object.values(label.createInputParams()).find(
          (param) => param.label === "Start",
        );
      const click = (key) =>
        startChoices()
          .buttons.find((button) => button.key === key)
          .onClick();

      click("edge");
      expect(GlobalVariables.selectionModeAtom?.type).toBe("edgeselect");

      // Waiting for an edge, choose Point instead
      click("point");
      expect(GlobalVariables.selectionModeAtom).toBeNull();
      expect(label.anchorModes.start).toBe("point");

      // And Face, which picks a face instead
      click("edge");
      click("face");
      expect(label.anchorModes.start).toBe("face");
      expect(GlobalVariables.selectionModeAtom?.type).toBe("faceselect");
      expect(entered).toEqual(["edgeselect", "edgeselect", "faceselect"]);
    } finally {
      GlobalVariables.enterSelectionMode = enter;
      GlobalVariables.exitSelectionMode = exit;
      GlobalVariables.selectionModeAtom = null;
    }
  });
});
