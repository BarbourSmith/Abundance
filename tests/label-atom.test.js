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
  it("draws a line between the ends with perpendicular end marks", () => {
    const label = makeLabel("MM", { color: "#ff0000", fontSize: 2 });
    const serialized = label.serializeLabel([0, 0, 0], [0, 0, 20]);

    expect(serialized.type).toBe("Label");
    expect(serialized.line).toMatchObject({
      start: [0, 0, 0],
      end: [0, 0, 20],
      color: "#ff0000",
    });
    expect(serialized.text).toMatchObject({
      value: "20 mm",
      position: [0, 0, 10],
      screenHeight: 56,
    });

    // 5% of the length, across the line
    const { p1, p2 } = serialized.endSegments.end;
    expect(Math.hypot(...p1.map((v, i) => p2[i] - v))).toBeCloseTo(1);
    expect(p1[2]).toBeCloseTo(20);
    expect(p2[2]).toBeCloseTo(20);
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
