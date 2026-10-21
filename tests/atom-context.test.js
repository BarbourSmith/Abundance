// Regression tests for Atom.getContext() going stale.
//
// A new top-level molecule gets a temporary uniqueID, and loading a project
// into it replaces that ID with the saved one. getContext() used to keep the
// first context it computed, so if anything asked for it before the load, the
// molecule kept looking up geometry in a cache under the temporary ID. Its
// child atoms used the saved ID, so the molecule's own output was "not found
// in cache" and the 3D view showed "No output to display".

import { describe, it, expect, beforeEach } from "vitest";
// Import order matters: loading AttachmentPoint first avoids a circular-import
// initialization error between Atom and the molecule modules.
import AttachmentPoint from "../src/prototypes/attachmentpoint.js"; // eslint-disable-line no-unused-vars
import Molecule from "../src/molecules/molecule.js";
import Atom from "../src/prototypes/atom.js";
import GlobalVariables from "../src/js/globalvariables.js";

function makeMolecule(parent = null) {
  return new Molecule({
    x: 0.5,
    y: 0.5,
    parent,
    uniqueID: GlobalVariables.generateUniqueID(),
    topLevel: parent === null,
  });
}

function makeAtom(parent) {
  const atom = new Atom({
    x: 0.5,
    y: 0.5,
    parent,
    uniqueID: GlobalVariables.generateUniqueID(),
  });
  atom.setValues({ parent });
  return atom;
}

describe("Atom.getContext", () => {
  let topLevel;

  beforeEach(() => {
    topLevel = makeMolecule();
  });

  it("follows the top-level molecule's uniqueID when a project loads into it", () => {
    const temporaryID = topLevel.uniqueID;
    expect(topLevel.getContext()).toEqual({ project: temporaryID });

    topLevel.setValues({ uniqueID: "id-saved" });
    const child = makeAtom(topLevel);

    expect(topLevel.getContext()).toEqual({ project: "id-saved" });
    expect(child.getContext()).toEqual(topLevel.getContext());
  });

  it("updates a nested atom's context when the root's uniqueID changes", () => {
    const inner = makeMolecule(topLevel);
    const atom = makeAtom(inner);
    expect(atom.getContext()).toEqual({ project: topLevel.uniqueID });

    topLevel.uniqueID = "id-renamed";

    expect(atom.getContext()).toEqual({ project: "id-renamed" });
  });

  it("updates when an atom moves to a different project", () => {
    const atom = makeAtom(topLevel);
    atom.getContext();

    const otherProject = makeMolecule();
    atom.parent = otherProject;

    expect(atom.getContext()).toEqual({ project: otherProject.uniqueID });
  });

  it("returns the same object while the project is unchanged", () => {
    const atom = makeAtom(topLevel);
    expect(atom.getContext()).toBe(atom.getContext());
  });
});
