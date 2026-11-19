// An edge picked upstream (for example by selected.EdgesByShape) has to reach
// the code behind an edge-select input, even when that input is wired to a
// source that has already computed. Wiring used to clear the pick right after
// the ready value had delivered it, and the next delivery of the same value
// then skipped re-reading the pick, so the code saw no selected edges.
//
// Run: npx vitest run --config=vitest.headless.config.ts tests/edge-select-inherited-pick.test.js

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("comlink", async (importOriginal) => ({
  ...(await importOriginal()),
  wrap: (rawWorker) => rawWorker.__proxy,
}));

import "../src/prototypes/attachmentpoint.js";
import Molecule from "../src/molecules/molecule.js";
import GlobalVariables from "../src/js/globalvariables.js";
import { resolveAtom, runTool } from "../src/agent/runtime.js";

const EDIT = { mode: "edit" };
const READ = { mode: "read" };

const PICKER_TS = "function run(): Assembly { return undefined as any; }";
const PICKER_JS = "function run() { return undefined; }";
const WIRE_TS =
  "function run(startShape: Assembly | undefined = undefined) { return 1; }";
const WIRE_JS = "function run(startShape = undefined) { return 1; }";

/** A single part with edge 3 picked, as a picker atom returns it. */
const picked = () => ({
  geometry: "stub-leaf",
  geometryType: "replicad.Shape3D",
  plane: null,
  color: "#5A5A5A",
  tags: ["cable end"],
  bom: [],
  selection: { edges: [3] },
});

/** The same picks on a two-part assembly: edge 3 on its second part. */
const pickedAssembly = () => ({
  geometry: [
    { ...picked(), geometry: "plug-leaf", selection: { edges: [] } },
    picked(),
  ],
  plane: null,
  color: "#5A5A5A",
  tags: [],
  bom: [],
});

let realCad;
let pickerValue;
let wireRuns;

beforeEach(() => {
  realCad = GlobalVariables.cad;
  const canvas = document.createElement("canvas");
  GlobalVariables.canvas = { current: canvas };
  GlobalVariables.c = canvas.getContext("2d");
  GlobalVariables.writeToDisplay = () => {};
  GlobalVariables.undoCommandStack = [];
  GlobalVariables.undoCaptureStack = null;
  GlobalVariables.currentAWSnode = { owner: "tester", repoName: "Proj" };
  const top = new Molecule({
    x: 0.5,
    y: 0.5,
    parent: null,
    uniqueID: GlobalVariables.generateUniqueID(),
    topLevel: true,
  });
  top.name = "Proj";
  GlobalVariables.topLevelMolecule = top;
  GlobalVariables.currentMolecule = top;

  wireRuns = [];
  GlobalVariables.cad = {
    code: async (code, args) => {
      if (code === PICKER_JS) return pickerValue();
      wireRuns.push(args.startShape);
      return 1;
    },
  };
});

afterEach(() => {
  GlobalVariables.cad = realCad;
  GlobalVariables.undoCaptureStack = null;
});

const settle = () => runTool("wait_for_settle", { timeout_ms: 5000 }, READ);

/** Edge indexes picked on any part of an assembly, in leaf order. */
function pickedEdges(value) {
  if (!value) return [];
  if (Array.isArray(value.geometry)) return value.geometry.flatMap(pickedEdges);
  return value.selection?.edges ?? [];
}

/** A picker atom that has already computed, and a Wire molecule beside it. */
async function build() {
  const picker = (
    await runTool("add_atom", { type: "Code", reason: "test picker" }, EDIT)
  ).id;
  await runTool(
    "set_code",
    { atom: picker, code: PICKER_TS, compiled_code: PICKER_JS },
    EDIT,
  );
  await settle();

  const wire = (
    await runTool("add_atom", { type: "Molecule", name: "Wire" }, EDIT)
  ).id;
  const input = (
    await runTool(
      "add_atom",
      {
        type: "Input",
        molecule: wire,
        name: "Start Shape",
        params: { "Input Type": "edgeselect" },
      },
      EDIT,
    )
  ).id;
  const code = (
    await runTool(
      "add_atom",
      { type: "Code", molecule: wire, reason: "test wire" },
      EDIT,
    )
  ).id;
  await runTool(
    "set_code",
    { atom: code, code: WIRE_TS, compiled_code: WIRE_JS },
    EDIT,
  );
  await runTool(
    "connect",
    { from: input, to: code, input: "startShape" },
    EDIT,
  );
  await settle();
  return { picker, wire, input };
}

describe("an edge picked upstream of an edge-select input", () => {
  for (const [label, value] of [
    ["a single part", picked],
    ["a two-part assembly", pickedAssembly],
  ]) {
    it(`reaches the code when the source of ${label} has already computed`, async () => {
      pickerValue = value;
      const { picker, wire, input } = await build();
      expect(pickedEdges(resolveAtom(picker).value)).toEqual([3]);

      await runTool(
        "connect",
        { from: picker, to: wire, input: "Start Shape" },
        EDIT,
      );
      await settle();
      expect(pickedEdges(wireRuns.at(-1))).toEqual([3]);
      expect(Object.values(resolveAtom(input).selectedEdgeData).flat()).toEqual(
        [3],
      );

      // The same value arriving again keeps the pick.
      resolveAtom(picker).setReady(value());
      await settle();
      expect(pickedEdges(wireRuns.at(-1))).toEqual([3]);
      expect(Object.values(resolveAtom(input).selectedEdgeData).flat()).toEqual(
        [3],
      );
    });
  }
});
