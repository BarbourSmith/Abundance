/**
 * A part with no bill of materials, as a Code atom returns when user code
 * builds its own result object, mustn't break compiling the BOM.
 *
 * Run: npx vitest run --config=vitest.headless.config.ts tests/bom-missing-parts.test.js
 */
import { describe, expect, it } from "vitest";
import "../src/prototypes/attachmentpoint.js";
import Molecule from "../src/molecules/molecule.js";
import GlobalVariables from "../src/js/globalvariables.js";
import { extractBomList } from "../src/worker/util";

const bolt = {
  BOMitemName: "Bolt",
  numberNeeded: 2,
  costUSD: 0.5,
  source: "hardware store",
};

const value = {
  tags: [],
  bom: [],
  geometry: [
    { geometry: "part-without-bom", tags: [] },
    { geometry: "part-with-odd-bom", tags: [], bom: "none" },
    { geometry: "part-with-bom", tags: [], bom: [bolt] },
  ],
};

describe("BOM with parts that have none", () => {
  it("treats a missing or non-list bom as empty", () => {
    expect(extractBomList(value)).toEqual([bolt]);
  });

  it("compiles the rest of the molecule's BOM", () => {
    const molecule = new Molecule({
      x: 0.5,
      y: 0.5,
      parent: null,
      uniqueID: GlobalVariables.generateUniqueID(),
      topLevel: true,
    });
    molecule.value = value;

    const [entry, ...rest] = molecule.compileBom();
    expect(rest).toHaveLength(0);
    expect(entry.BOMitemName).toBe("Bolt");
    expect(entry.numberNeeded).toBe(2);
  });
});
