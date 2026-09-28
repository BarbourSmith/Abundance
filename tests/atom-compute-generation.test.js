// Regression tests for stale async results and display ownership in Atom.
//
// 1. An atom whose inputs change while a compute is in flight starts a second
//    compute. If the first one settles last, its outdated result used to win.
//    Each upstream change now starts a new compute generation and results from
//    older generations are dropped.
// 2. With several atoms selected, each one re-rendered as it finished
//    recomputing, so the last to finish took over the 3D view. Only the atom
//    that owns the display re-renders now.

import { describe, it, expect, beforeEach, vi } from "vitest";
// Import order matters: loading AttachmentPoint first avoids a circular-import
// initialization error between Atom and the molecule modules.
import AttachmentPoint from "../src/prototypes/attachmentpoint.js"; // eslint-disable-line no-unused-vars
import Molecule from "../src/molecules/molecule.js";
import Atom from "../src/prototypes/atom.js";
import GlobalVariables from "../src/js/globalvariables.js";
import { Status } from "../src/prototypes/observableEntity.js";

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

function makeAtom(molecule) {
  const atom = new Atom({
    x: 0.5,
    y: 0.5,
    parent: molecule,
    uniqueID: GlobalVariables.generateUniqueID(),
  });
  // Real atom subclasses assign these through setValues(); the base
  // constructor does not.
  atom.setValues({ parent: molecule });
  atom.atomType = "TestAtom";
  atom.inputs = [];
  atom.parentMolecule = molecule;
  return atom;
}

describe("Atom compute generations", () => {
  let molecule;
  let atom;
  let computes;

  beforeEach(() => {
    molecule = new Molecule({
      x: 0.5,
      y: 0.5,
      parent: null,
      uniqueID: GlobalVariables.generateUniqueID(),
      topLevel: true,
    });
    atom = makeAtom(molecule);
    computes = [];
    atom.compute = vi.fn(() => {
      const d = deferred();
      computes.push(d);
      return d.promise;
    });
    atom.setWaiting(); // leave DISABLED so onUpstreamChange runs
  });

  it("ignores an older compute that settles after a newer one", async () => {
    atom.onUpstreamChange();
    atom.onUpstreamChange();
    expect(computes).toHaveLength(2);

    computes[1].resolve({ geometry: "new", plane: null });
    await flush();
    computes[0].resolve({ geometry: "old", plane: null });
    await flush();

    expect(atom.status).toBe(Status.READY);
    expect(atom.value.geometry).toBe("new");
  });

  it("ignores an error from a superseded compute", async () => {
    atom.onUpstreamChange();
    atom.onUpstreamChange();

    computes[0].reject(new Error("stale failure"));
    await flush();
    expect(atom.status).toBe(Status.PROCESSING);

    computes[1].resolve({ geometry: "ok", plane: null });
    await flush();
    expect(atom.status).toBe(Status.READY);
  });

  it("does not become READY when disabled while computing", async () => {
    atom.onUpstreamChange();
    atom.disable();
    computes[0].resolve({ geometry: "late", plane: null });
    await flush();
    expect(atom.status).toBe(Status.DISABLED);
  });
});

describe("Atom display ownership", () => {
  let molecule;
  let writeToDisplay;
  let originalWrite;

  beforeEach(() => {
    molecule = new Molecule({
      x: 0.5,
      y: 0.5,
      parent: null,
      uniqueID: GlobalVariables.generateUniqueID(),
      topLevel: true,
    });
    originalWrite = GlobalVariables.writeToDisplay;
    writeToDisplay = vi.fn();
    GlobalVariables.writeToDisplay = writeToDisplay;
    GlobalVariables.displayedAtom = null;
    return () => {
      GlobalVariables.writeToDisplay = originalWrite;
      GlobalVariables.displayedAtom = null;
    };
  });

  it("a selected atom does not steal the display from the selected owner", () => {
    const owner = makeAtom(molecule);
    const other = makeAtom(molecule);
    owner.selected = true;
    other.selected = true;
    owner.sendToRender();
    writeToDisplay.mockClear();

    other.setReady({ geometry: "x", plane: null });
    expect(writeToDisplay).not.toHaveBeenCalled();

    owner.setReady({ geometry: "y", plane: null });
    expect(writeToDisplay).toHaveBeenCalledTimes(1);
  });

  it("re-renders on ready when the previous owner was deselected", () => {
    const owner = makeAtom(molecule);
    const other = makeAtom(molecule);
    owner.selected = true;
    owner.sendToRender();
    owner.selected = false;
    other.selected = true;
    writeToDisplay.mockClear();

    other.setReady({ geometry: "x", plane: null });
    expect(writeToDisplay).toHaveBeenCalledTimes(1);
    expect(GlobalVariables.displayedAtom).toBe(other);
  });

  it("re-renders on ready when nothing owns the display (project load)", () => {
    const atom = makeAtom(molecule);
    atom.selected = true;
    atom.setReady({ geometry: "x", plane: null });
    expect(writeToDisplay).toHaveBeenCalledTimes(1);
  });
});
