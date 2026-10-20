/**
 * Values typed with a unit ("5 inches", "12mm") convert to the units of the
 * atom they're typed into.
 *
 * Run: npx vitest run --config=vitest.headless.config.ts tests/equation-units.test.js
 */
import { describe, expect, it } from "vitest";
import "../src/prototypes/attachmentpoint.js";
import Molecule from "../src/molecules/molecule.js";
import GlobalVariables from "../src/js/globalvariables.js";

function project(unitsKey) {
  return new Molecule({
    x: 0.5,
    y: 0.5,
    parent: null,
    uniqueID: GlobalVariables.generateUniqueID(),
    topLevel: true,
    unitsKey,
  });
}

describe("Units typed into equations", () => {
  it("converts inches and cm into an MM project", () => {
    const atom = project("MM");
    expect(atom.evaluateEquation("5 inches")).toBeCloseTo(127);
    expect(atom.evaluateEquation("1inch")).toBeCloseTo(25.4);
    expect(atom.evaluateEquation("1/2 inch")).toBeCloseTo(12.7);
    expect(atom.evaluateEquation("2cm + 3")).toBeCloseTo(23);
    expect(atom.evaluateEquation("-12mm")).toBeCloseTo(-12);
  });

  it("converts mm into an Inches project", () => {
    const atom = project("Inches");
    expect(atom.evaluateEquation("25.4mm")).toBeCloseTo(1);
    expect(atom.evaluateEquation("2 inches * 3")).toBeCloseTo(6);
  });

  it("leaves equations without units alone", () => {
    const atom = project("MM");
    expect(atom.evaluateEquation("5 + 2")).toBe(7);
    expect(atom.evaluateEquation("2.5")).toBe(2.5);
  });

  it("keeps an input named like a unit as a variable", () => {
    const atom = project("MM");
    atom.getInputsFromAncestors = () => [
      { name: "cm", value: 3, getValue: () => 3 },
    ];
    expect(atom.evaluateEquation("cm * 2")).toBe(6);
  });

  it("explains that a project without units can't convert", () => {
    const atom = project("Unitless");
    expect(() => atom.evaluateEquation("5 inches")).toThrow(/no units set/);
  });
});
