/**
 * Lists of numbers wired into number inputs: Move and Rotate make one copy
 * per value (a grid for several lists) as an assembly with Make Disjoint off,
 * and Equation returns a list of results.
 *
 * Run: npx vitest run --config=vitest.headless.config.ts tests/array-number-inputs.test.js
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import AttachmentPoint from "../src/prototypes/attachmentpoint.js";
import Molecule from "../src/molecules/molecule.js";
import Move from "../src/molecules/move.js";
import Rotate from "../src/molecules/rotate.js";
import Equation from "../src/molecules/equation.js";
import Code from "../src/molecules/code.js";
import GlobalVariables from "../src/js/globalvariables.js";
import { combinationsOf, numbersIn } from "../src/js/arrayInputs.js";

const leaf = { geometry: ["shape"], geometryType: "solid", tags: [] };

function project() {
  return new Molecule({
    x: 0.5,
    y: 0.5,
    parent: null,
    uniqueID: GlobalVariables.generateUniqueID(),
    topLevel: true,
  });
}

function make(Type, parent, values = {}) {
  return new Type({
    x: 0.5,
    y: 0.5,
    parent,
    uniqueID: GlobalVariables.generateUniqueID(),
    ...values,
  });
}

describe("combinationsOf", () => {
  it("makes every combination, the first list changing slowest", () => {
    expect(
      combinationsOf([
        ["x", [1, 2]],
        ["y", [5, 6]],
      ]),
    ).toEqual([
      { x: 1, y: 5 },
      { x: 1, y: 6 },
      { x: 2, y: 5 },
      { x: 2, y: 6 },
    ]);
  });

  it("explains lists that aren't numbers", () => {
    expect(numbersIn("x", ["1", 2])).toEqual([1, 2]);
    expect(() => numbersIn("x", [])).toThrow(/empty list/);
    expect(() => numbersIn("x", ["a"])).toThrow(/isn't a number/);
  });
});

describe("Lists in Move and Rotate", () => {
  beforeEach(() => {
    GlobalVariables.cad = {
      move: vi.fn((geometry, x, y, z) =>
        Promise.resolve({ ...leaf, moved: [x, y, z] }),
      ),
      rotate: vi.fn((geometry, x, y, z) =>
        Promise.resolve({ ...leaf, rotated: [x, y, z] }),
      ),
    };
  });

  it("moves one copy per value into a non-disjoint assembly", async () => {
    const move = make(Move, project());
    const result = await move.computeOverLists({
      geometry: leaf,
      xDist: [1, 2, 3],
      yDist: 0,
      zDist: 0,
    });
    expect(result.metadata).toEqual({ mightOverlap: true });
    expect(result.geometry.map((part) => part.moved)).toEqual([
      [1, 0, 0],
      [2, 0, 0],
      [3, 0, 0],
    ]);
  });

  it("makes a grid from two lists", async () => {
    const move = make(Move, project());
    const result = await move.computeOverLists({
      geometry: leaf,
      xDist: [0, 10],
      yDist: [0, 20, 40],
      zDist: 5,
    });
    expect(result.geometry.map((part) => part.moved)).toEqual([
      [0, 0, 5],
      [0, 20, 5],
      [0, 40, 5],
      [10, 0, 5],
      [10, 20, 5],
      [10, 40, 5],
    ]);
  });

  it("rotates one copy per value", async () => {
    const rotate = make(Rotate, project());
    const result = await rotate.computeOverLists({
      geometry: leaf,
      "x-axis degrees": 0,
      "y-axis degrees": 0,
      "z-axis degrees": [0, 90],
    });
    expect(result.geometry.map((part) => part.rotated)).toEqual([
      [0, 0, 0],
      [0, 0, 90],
    ]);
  });

  it("computes once without lists", async () => {
    const move = make(Move, project());
    const result = await move.computeOverLists({
      geometry: leaf,
      xDist: 1,
      yDist: 2,
      zDist: 3,
    });
    expect(result.moved).toEqual([1, 2, 3]);
  });

  it("explains an empty list", async () => {
    const move = make(Move, project());
    await expect(
      move.computeOverLists({ geometry: leaf, xDist: [], yDist: 0, zDist: 0 }),
    ).rejects.toThrow(/"xDist" is an empty list/);
  });
});

describe("Lists in Equation", () => {
  it("evaluates once per value", () => {
    const equation = make(Equation, project(), { currentEquation: "x - y" });
    equation.findIOValue = (name) => ({ x: [1, 2, 3], y: 5 })[name];
    expect(equation.evaluateOverLists()).toEqual([-4, -3, -2]);
  });

  it("evaluates every combination of several lists", () => {
    const equation = make(Equation, project(), { currentEquation: "x * y" });
    equation.findIOValue = (name) => ({ x: [1, 2], y: [10, 100] })[name];
    expect(equation.evaluateOverLists()).toEqual([10, 100, 20, 200]);
  });

  it("uses lists from the molecule's inputs", () => {
    const equation = make(Equation, project(), { currentEquation: "w + 1" });
    equation.getInputsFromAncestors = () => [
      { name: "w", getValue: () => [1, 2] },
    ];
    expect(equation.evaluateOverLists()).toEqual([2, 3]);
  });

  it("returns a single number without lists", () => {
    const equation = make(Equation, project(), { currentEquation: "x - y" });
    equation.findIOValue = (name) => ({ x: 3, y: 1 })[name];
    expect(equation.evaluateOverLists()).toBe(2);
  });
});

describe("Wiring a list into a number input", () => {
  const listOutput = { valueType: "array" };
  const numberInputOf = (atom) => ({ valueType: "number", parentMolecule: atom });

  it("is allowed on atoms that take lists", () => {
    const parent = project();
    for (const atom of [
      make(Move, parent),
      make(Rotate, parent),
      make(Equation, parent),
    ]) {
      expect(
        AttachmentPoint.areTypesCompatible(listOutput, numberInputOf(atom)),
      ).toBe(true);
    }
  });

  it("is refused elsewhere", () => {
    const code = make(Code, project());
    expect(
      AttachmentPoint.areTypesCompatible(listOutput, numberInputOf(code)),
    ).toBe(false);
  });
});
