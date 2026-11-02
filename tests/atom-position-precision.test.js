// Atom positions are saved as fractions of the canvas, so rounding them to one
// decimal moved atoms by up to 5% of the canvas on reload.

import { describe, it, expect } from "vitest";
// Import order matters: loading AttachmentPoint first avoids a circular-import
// initialization error between Atom and the molecule modules.
import "../src/prototypes/attachmentpoint.js";
import Atom from "../src/prototypes/atom.js";
import GlobalVariables from "../src/js/globalvariables.js";

function makeAtom(x, y) {
  const atom = new Atom({ uniqueID: GlobalVariables.generateUniqueID() });
  atom.setValues({ x, y });
  return atom;
}

describe("Atom position serialization", () => {
  it("keeps positions to 4 decimals", () => {
    const saved = makeAtom(0.12344, 0.67896).serialize();
    expect(saved.x).toBe(0.1234);
    expect(saved.y).toBe(0.679);
  });

  it("keeps atoms placed close together apart", () => {
    const a = makeAtom(0.31, 0.5).serialize();
    const b = makeAtom(0.34, 0.5).serialize();
    expect(a.x).not.toBe(b.x);
  });

  it("applies the paste offset exactly", () => {
    const saved = makeAtom(0.3, 0.3).serialize({ x: 0.05, y: 0.05 });
    expect(saved.x).toBe(0.35);
    expect(saved.y).toBe(0.25);
  });
});
