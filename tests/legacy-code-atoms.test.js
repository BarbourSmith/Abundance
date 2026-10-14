/**
 * Older projects' Code atoms must keep working after the replicad 1.x upgrade:
 * legacy JavaScript saved with a TypeScript label runs as JavaScript, and a
 * number typed into a legacy atom's input survives a save.
 *
 * Run: npx vitest run --config=vitest.headless.config.ts tests/legacy-code-atoms.test.js
 */
import { beforeEach, describe, expect, it } from "vitest";
import "../src/prototypes/attachmentpoint.js";
import Molecule from "../src/molecules/molecule.js";
import GlobalVariables from "../src/js/globalvariables.js";

let top;

const LEGACY_CODE = `//Inputs:[Shape, Number, Dist];

let shapesArray = [];
for (let i = 0; i < Number; i++) {
    shapesArray.push(await Move(Shape, Dist * i, 0, 0));
}
return await Assembly(shapesArray);
`;

const TS_CODE = `function run(width: number = 10) {
  return width;
}
`;

function savedCode(extra = {}) {
  return {
    atomType: "Code",
    name: "Code",
    uniqueID: GlobalVariables.generateUniqueID(),
    x: 0.4,
    y: 0.4,
    ...extra,
  };
}

const ioValue = (serialized, name) =>
  serialized.ioValues.find((io) => io.name === name)?.ioValue;

beforeEach(() => {
  const canvas = document.createElement("canvas");
  GlobalVariables.canvas = { current: canvas };
  GlobalVariables.c = canvas.getContext("2d");
  GlobalVariables.writeToDisplay = () => {};
  top = new Molecule({
    x: 0.5,
    y: 0.5,
    parent: null,
    uniqueID: GlobalVariables.generateUniqueID(),
    topLevel: true,
    unitsKey: "MM",
  });
  GlobalVariables.topLevelMolecule = top;
  GlobalVariables.currentMolecule = top;
});

describe("Legacy Code atoms", () => {
  it("runs legacy JavaScript saved with a TypeScript label as JavaScript", async () => {
    const atom = await top.placeAtom(
      savedCode({ code: LEGACY_CODE, interpreterVersion: 1 }),
      false,
    );
    expect(atom.interpreterVersion).toBe(0);

    const constInputs = await top.placeAtom(
      savedCode({
        code: `const Inputs = [{ name: "Size", type: "number", default: 5 }];\nreturn Size;`,
        interpreterVersion: 1,
      }),
      false,
    );
    expect(constInputs.interpreterVersion).toBe(0);
  });

  it("keeps TypeScript atoms as TypeScript", async () => {
    const atom = await top.placeAtom(
      savedCode({ code: TS_CODE, interpreterVersion: 1 }),
      false,
    );
    expect(atom.interpreterVersion).toBe(1);
  });

  it("keeps a number typed into a legacy input when saving", async () => {
    const atom = await top.placeAtom(
      savedCode({
        code: LEGACY_CODE,
        interpreterVersion: 0,
        ioValues: [
          { name: "Number", ioValue: 4 },
          { name: "Dist", ioValue: 800 },
          { name: "Shape", ioValue: "__GEOMETRY_INPUT__" },
        ],
      }),
      false,
    );
    const serialized = atom.serialize();

    expect(ioValue(serialized, "Number")).toBe(4);
    expect(ioValue(serialized, "Dist")).toBe(800);
    expect(ioValue(serialized, "Shape")).toBe("__GEOMETRY_INPUT__");
  });

  it("saves a geometry input holding a string as the placeholder", async () => {
    const atom = await top.placeAtom(
      savedCode({ code: LEGACY_CODE, interpreterVersion: 0 }),
      false,
    );
    atom.inputs.find((input) => input.name === "Shape").setValue("10");

    expect(ioValue(atom.serialize(), "Shape")).toBe("__GEOMETRY_INPUT__");
  });
});
