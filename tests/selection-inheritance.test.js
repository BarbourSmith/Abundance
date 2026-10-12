import { describe, it, expect, beforeEach } from "vitest";
import GlobalVariables from "../src/js/globalvariables.js";
import { Status } from "../src/prototypes/observableEntity.js";

let Input, Molecule;

// An upstream assembly with one leaf. `edges` is the selection the upstream
// atom left on it (e.g. an earlier selected.Fillet passing its own edges on).
const upstream = (edges, geometry = "g1") => ({
  geometry,
  selection: edges ? { edges } : undefined,
});

describe("Selection inputs and an upstream selection", () => {
  let parent;

  beforeEach(async () => {
    if (!Input) {
      Input = (await import("../src/molecules/input.js")).default;
      Molecule = (await import("../src/molecules/molecule.js")).default;
    }
    parent = new Molecule({
      x: 0.5,
      y: 0.5,
      parent: null,
      topLevel: true,
      uniqueID: GlobalVariables.generateUniqueID(),
    });
  });

  const makeInput = (values = {}) =>
    new Input({
      x: 0.3,
      y: 0.3,
      parent,
      type: "edgeselect",
      uniqueID: GlobalVariables.generateUniqueID(),
      ...values,
    });

  // Feed `assembly` to the input the way its parent molecule's AP does.
  const feed = (input, assembly) => {
    if (input.status === Status.DISABLED) input.setWaiting();
    input.parentAP.getState = () => ({
      status: Status.READY,
      value: assembly,
    });
    input.onUpstreamChange();
  };

  it("copies an upstream selection into a fresh input", () => {
    const input = makeInput();
    feed(input, upstream([23, 21]));
    expect(input.selectedEdgeData).toEqual({ 0: [23, 21] });
  });

  it("keeps a hand-made selection when the upstream geometry recomputes", () => {
    const input = makeInput();
    feed(input, upstream([23, 21]));
    input.toggleEdgeForLeaf(0, 23);
    input.toggleEdgeForLeaf(0, 21);
    input.toggleEdgeForLeaf(0, 5);
    feed(input, upstream([23, 21], "g2"));
    expect(input.selectedEdgeData).toEqual({ 0: [5] });
  });

  it("keeps a hand-made selection across save and reload", () => {
    const input = makeInput();
    feed(input, upstream([23, 21]));
    input.toggleEdgeForLeaf(0, 23);
    input.toggleEdgeForLeaf(0, 21);
    input.toggleEdgeForLeaf(0, 5);

    const saved = JSON.parse(JSON.stringify(input.serialize()));
    const reloaded = makeInput(saved);
    feed(reloaded, upstream([23, 21]));
    expect(reloaded.selectedEdgeData).toEqual({ 0: [5] });
  });

  it("keeps the saved selection of a project saved before the key existed", () => {
    const reloaded = makeInput({ selectedEdgeData: { 0: [5] } });
    feed(reloaded, upstream([23, 21]));
    expect(reloaded.selectedEdgeData).toEqual({ 0: [5] });
  });

  it("copies the upstream selection again when it changes", () => {
    const input = makeInput();
    feed(input, upstream([23, 21]));
    input.toggleEdgeForLeaf(0, 5);
    feed(input, upstream([7]));
    expect(input.selectedEdgeData).toEqual({ 0: [7] });
  });

  it("copies the upstream selection after a new connection", () => {
    const input = makeInput({ selectedEdgeData: { 0: [5] } });
    input.markPendingSelectionInheritance();
    feed(input, upstream([23, 21]));
    expect(input.selectedEdgeData).toEqual({ 0: [23, 21] });
  });

  it("ignores an upstream selection picked on different geometry", () => {
    // A selected.Fillet upstream picked edges on "g1" and filleted it into
    // "g2"; its edge numbers mean nothing on the filleted shape.
    const input = makeInput();
    feed(input, { geometry: "g2", selection: { edges: [23, 21], on: "g1" } });
    expect(input.selectedEdgeData).toEqual({});
    expect(input.value.selection).toEqual({ edges: [], on: "g2" });
  });

  it("copies an upstream selection picked on the same geometry", () => {
    // A molecule passing a selection straight through to an inner selector.
    const input = makeInput();
    feed(input, { geometry: "g1", selection: { edges: [23, 21], on: "g1" } });
    expect(input.selectedEdgeData).toEqual({ 0: [23, 21] });
  });

  it("drops other selection kinds picked on different geometry", () => {
    const input = makeInput();
    feed(input, { geometry: "g2", selection: { faces: [4], on: "g1" } });
    expect(input.value.selection).toEqual({ edges: [], on: "g2" });
  });

  it("keeps a fillet chain's selections apart when the first one changes", () => {
    const second = makeInput();
    feed(second, upstream(null, "g1"));
    second.toggleEdgeForLeaf(0, 7);
    // The first fillet gets edges picked and recomputes into new geometry.
    feed(second, { geometry: "g2", selection: { edges: [1, 2], on: "g1" } });
    expect(second.selectedEdgeData).toEqual({ 0: [7] });

    const saved = JSON.parse(JSON.stringify(second.serialize()));
    const reloaded = makeInput(saved);
    feed(reloaded, { geometry: "g2", selection: { edges: [1, 2], on: "g1" } });
    expect(reloaded.selectedEdgeData).toEqual({ 0: [7] });
  });

  it("passes this input's selection downstream, not the upstream one", () => {
    const input = makeInput();
    feed(input, upstream([23, 21]));
    input.toggleEdgeForLeaf(0, 23);
    input.toggleEdgeForLeaf(0, 21);
    input.toggleEdgeForLeaf(0, 5);
    feed(input, upstream([23, 21], "g2"));
    expect(input.value.selection.edges).toEqual([5]);
  });
});
