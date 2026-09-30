/**
 * Tests for the local AI agent runtime (src/agent/runtime.js) against a real
 * atom graph. Constant and Equation atoms compute without the CAD worker, so
 * these run quickly in the headless browser.
 *
 * Run: npx vitest run --config=vitest.headless.config.ts tests/agent-runtime.test.js
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import "../src/prototypes/attachmentpoint.js";
import Molecule from "../src/molecules/molecule.js";
import GlobalVariables from "../src/js/globalvariables.js";
import { ValueChangeCommand } from "../src/js/undoCommands.js";
import { agentBridge } from "../src/agent/bridgeClient.js";
import { ERROR_CODES } from "../src/agent/protocol.js";
import {
  AGENT_EDIT_EVENT,
  AGENT_SELECT_EVENT,
  __test__,
  resolveAtom,
  runTool,
  summarizeValue,
} from "../src/agent/runtime.js";

const EDIT = { mode: "edit" };
const READ = { mode: "read" };

let top;

function freshProject() {
  const canvas = document.createElement("canvas");
  GlobalVariables.canvas = { current: canvas };
  GlobalVariables.c = canvas.getContext("2d");
  GlobalVariables.writeToDisplay = () => {};
  GlobalVariables.undoCommandStack = [];
  GlobalVariables.undoCaptureStack = null;
  GlobalVariables.currentAWSnode = { owner: "tester", repoName: "Proj" };
  top = new Molecule({
    x: 0.5,
    y: 0.5,
    parent: null,
    uniqueID: GlobalVariables.generateUniqueID(),
    topLevel: true,
  });
  top.name = "Proj";
  GlobalVariables.topLevelMolecule = top;
  GlobalVariables.currentMolecule = top;
}

/** Let synchronous-ish recomputes (Constant/Equation) finish. */
const settle = () => runTool("wait_for_settle", { timeout_ms: 5000 }, READ);

async function valueOf(ref) {
  await settle();
  return (await runTool("get_atom", { atom: ref }, READ)).output?.value;
}

/** ID of the Equation built by buildWidthAndDouble (built-in atoms can't be named). */
let D;
const nameOf = (ref) => resolveAtom(ref).name;

async function buildWidthAndDouble() {
  await runTool("add_atom", { type: "Constant", name: "Width" }, EDIT);
  D = (await runTool("add_atom", { type: "Equation" }, EDIT)).id;
  GlobalVariables.undoCommandStack = [];
}

async function expectToolError(promise, code, messagePattern) {
  let error;
  try {
    await promise;
  } catch (err) {
    error = err;
  }
  expect(error, "expected the tool to fail").toBeDefined();
  expect(error.code).toBe(code);
  if (messagePattern) expect(error.message).toMatch(messagePattern);
  return error;
}

beforeEach(() => {
  freshProject();
  agentBridge.saveHandler = null;
});

afterEach(() => {
  GlobalVariables.undoCaptureStack = null;
});

describe("resolving atoms", () => {
  it("finds atoms by path with or without the top-level name, and by ID", async () => {
    await buildWidthAndDouble();
    const width = top.nodesOnTheScreen.find((a) => a.name === "Width");
    expect(resolveAtom("Width")).toBe(width);
    expect(resolveAtom("Proj/Width")).toBe(width);
    expect(resolveAtom(width.uniqueID)).toBe(width);
    expect(resolveAtom("")).toBe(top);
  });

  it("explains ambiguous names with the IDs to use instead", async () => {
    await runTool("add_atom", { type: "Molecule", name: "Eq" }, EDIT);
    await runTool("add_atom", { type: "Molecule", name: "Eq" }, EDIT);
    const err = await expectToolError(
      runTool("get_atom", { atom: "Eq" }, READ),
      ERROR_CODES.CONFLICT,
    );
    const ids = top.nodesOnTheScreen
      .filter((a) => a.name === "Eq")
      .map((a) => a.uniqueID);
    ids.forEach((id) => expect(err.message).toContain(id));
  });

  it("lists what a molecule contains when a name is wrong", async () => {
    await buildWidthAndDouble();
    await expectToolError(
      runTool("get_atom", { atom: "Proj/Heigth" }, READ),
      ERROR_CODES.NOT_FOUND,
      /It contains: Width, /,
    );
  });
});

describe("permissions and validation", () => {
  it("refuses every edit tool in read-only mode", async () => {
    await buildWidthAndDouble();
    for (const [name, args] of [
      ["set_param", { atom: D, param: "x", value: 3 }],
      ["add_atom", { type: "Constant" }],
      ["delete_atoms", { atoms: ["Width"] }],
      [
        "apply_edits",
        {
          description: "x",
          edits: [{ tool: "add_atom", arguments: { type: "Constant" } }],
        },
      ],
    ]) {
      await expectToolError(
        runTool(name, args, READ),
        ERROR_CODES.PERMISSION_DENIED,
        /Allow edits/,
      );
    }
    expect(top.nodesOnTheScreen).toHaveLength(2);
  });

  it("rejects unknown, missing, and mistyped arguments", async () => {
    await expectToolError(
      runTool("wait_for_settle", { timout_ms: 10 }, READ),
      ERROR_CODES.INVALID_PARAMS,
      /unknown argument "timout_ms"/,
    );
    await expectToolError(
      runTool("get_atom", {}, READ),
      ERROR_CODES.INVALID_PARAMS,
      /"atom" is required/,
    );
    await expectToolError(
      runTool("render_image", { view: "sideways" }, READ),
      ERROR_CODES.INVALID_PARAMS,
      /must be one of/,
    );
    await expectToolError(
      runTool("no_such_tool", {}, READ),
      ERROR_CODES.METHOD_NOT_FOUND,
    );
  });
});

describe("reading the project", () => {
  it("summarizes the project and lists atoms with their wiring", async () => {
    await buildWidthAndDouble();
    const project = await runTool("get_project", {}, READ);
    expect(project).toMatchObject({
      project: { owner: "tester", repo: "Proj" },
      top_level: { name: "Proj" },
      open_molecule: { path: "Proj" },
      edits_enabled: false,
      can_save: false,
    });
    const { atoms } = await runTool("list_atoms", {}, READ);
    expect(atoms.map((a) => a.name)).toEqual(["Width", nameOf(D)]);
    expect(atoms[1].inputs.map((i) => i.name)).toEqual(["x", "y"]);
  });

  it("exposes the properties-panel fields as params", async () => {
    await buildWidthAndDouble();
    const atom = await runTool("get_atom", { atom: D }, READ);
    expect(atom.params.map((p) => p.label)).toEqual([
      "x",
      "y",
      "Current Equation",
    ]);
    expect(atom.output).toEqual({ value: 2 });
  });

  it("keeps summarized values small", () => {
    expect(summarizeValue("a".repeat(1000))).toMatch(/… \(1000 chars\)$/);
    expect(summarizeValue({ geometry: "abc", dimension: "3D" })).toBe(
      "<3D geometry>",
    );
    expect(summarizeValue([1, 2, 3])).toEqual([1, 2, 3]);
    expect(summarizeValue(new Array(50).fill({ a: 1 }))).toBe("<array of 50>");
    expect(summarizeValue(Infinity)).toBe("Infinity");
  });
});

describe("editing", () => {
  it("changes a parameter through the panel handler as one agent undo step", async () => {
    await buildWidthAndDouble();
    const edits = [];
    const onEdit = (e) => edits.push(e.detail.tool);
    window.addEventListener(AGENT_EDIT_EVENT, onEdit);

    const id = D;
    const before = nameOf(D);
    const result = await runTool(
      "set_param",
      { atom: D, param: "Current Equation", value: "x * 10" },
      EDIT,
    );
    // Equation atoms take their equation as their name; the result says so.
    expect(result.renamed).toMatchObject({ from: before, to: "x * 10" });
    expect(await valueOf(id)).toBe(10);
    expect(edits).toEqual(["set_param"]);

    const history = await runTool("get_undo_history", {}, READ);
    expect(history.steps).toEqual([
      { description: `AI: set Current Equation on ${before}`, by_agent: true },
    ]);

    await runTool("undo", {}, EDIT);
    expect(await valueOf(id)).toBe(2);
    window.removeEventListener(AGENT_EDIT_EVENT, onEdit);
  });

  it("accepts numbers for equation-backed number inputs", async () => {
    await buildWidthAndDouble();
    await runTool("set_param", { atom: D, param: "x", value: 41 }, EDIT);
    expect(await valueOf(D)).toBe(42);
  });

  it("refuses to edit a parameter that is driven by a connection", async () => {
    await buildWidthAndDouble();
    await runTool("connect", { from: "Width", to: D, input: "x" }, EDIT);
    await expectToolError(
      runTool("set_param", { atom: D, param: "x", value: 5 }, EDIT),
      ERROR_CODES.CONFLICT,
      /driven by a connection/,
    );
  });

  it("groups apply_edits into one undo step", async () => {
    await buildWidthAndDouble();
    await runTool(
      "apply_edits",
      {
        description: "add a tripler",
        edits: [
          { tool: "add_atom", arguments: { type: "Equation", ref: "Triple" } },
          {
            tool: "set_param",
            arguments: {
              atom: "Triple",
              param: "Current Equation",
              value: "x * 3",
            },
          },
          {
            tool: "connect",
            arguments: { from: "Width", to: "Triple", input: "x" },
          },
        ],
      },
      EDIT,
    );
    // The new Equation renamed itself to "x * 3"; the batch used its ref.
    expect(await valueOf("x * 3")).toBe(30);
    expect(GlobalVariables.undoCommandStack).toHaveLength(1);
    expect(GlobalVariables.undoCommandStack[0].description).toBe(
      "AI: add a tripler",
    );

    await runTool("undo", {}, EDIT);
    await settle();
    expect(top.nodesOnTheScreen.map((a) => a.uniqueID)).toEqual([
      resolveAtom("Width").uniqueID,
      D,
    ]);
  });

  it("builds a molecule and wires its inside in one batch", async () => {
    await buildWidthAndDouble();
    const { results } = await runTool(
      "apply_edits",
      {
        description: "add a doubler part",
        edits: [
          {
            tool: "add_atom",
            arguments: { type: "Molecule", name: "Doubler", ref: "dbl" },
          },
          {
            tool: "add_atom",
            arguments: { type: "Input", name: "Size", molecule: "dbl" },
          },
          {
            tool: "add_atom",
            arguments: { type: "Equation", molecule: "dbl", ref: "twice" },
          },
          {
            tool: "set_param",
            arguments: {
              atom: "twice",
              param: "Current Equation",
              value: "x * 2",
            },
          },
          {
            tool: "connect",
            arguments: { from: "dbl/Size", to: "twice", input: "x" },
          },
          {
            tool: "connect",
            arguments: {
              from: "twice",
              to: "dbl/Output",
              input: "number or geometry",
            },
          },
          {
            tool: "connect",
            arguments: { from: "Width", to: "dbl", input: "Size" },
          },
        ],
      },
      EDIT,
    );
    const doubler = results[0].result;
    expect(doubler.output).toEqual({
      id: expect.any(String),
      path: "Proj/Doubler/Output",
    });
    expect(nameOf(doubler.output.id)).toBe("Output");
    expect(resolveAtom("Doubler").inputs.map((i) => i.name)).toContain("Size");
    expect(await valueOf("Doubler")).toBe(20);
    expect(GlobalVariables.undoCommandStack).toHaveLength(1);
  });

  it("wires several shapes into an Assembly in one batch", async () => {
    const { results } = await runTool(
      "apply_edits",
      {
        description: "assemble three parts",
        edits: [
          { tool: "add_atom", arguments: { type: "Molecule", name: "A" } },
          { tool: "add_atom", arguments: { type: "Molecule", name: "B" } },
          { tool: "add_atom", arguments: { type: "Molecule", name: "C" } },
          { tool: "add_atom", arguments: { type: "Assembly", ref: "asm" } },
          {
            tool: "connect",
            arguments: { from: "A", to: "asm", input: "Shape 1" },
          },
          {
            tool: "connect",
            arguments: { from: "B", to: "asm", input: "Shape 2" },
          },
          {
            tool: "connect",
            arguments: { from: "C", to: "asm", input: "Shape3" },
          },
        ],
      },
      EDIT,
    );
    const connects = results.filter((r) => r.tool === "connect");
    expect(connects.map((r) => r.result.input)).toEqual([
      "Shape 1",
      "Shape2",
      "Shape3",
    ]);
    expect(connects.map((r) => r.result.next_free_input)).toEqual([
      "Shape2",
      "Shape3",
      "Shape4",
    ]);
    const asm = resolveAtom(results[3].result.id);
    const free = asm.inputs.filter(
      (i) => i.name.startsWith("Shape") && !i.connectors.length,
    );
    expect(free.map((i) => i.name)).toEqual(["Shape4"]);
  });

  it("rolls back every edit in a batch when one fails", async () => {
    await buildWidthAndDouble();
    const err = await expectToolError(
      runTool(
        "apply_edits",
        {
          description: "broken",
          edits: [
            { tool: "add_atom", arguments: { type: "Equation", ref: "Temp" } },
            {
              tool: "set_param",
              arguments: { atom: D, param: "x", value: 7 },
            },
            {
              tool: "set_param",
              arguments: { atom: "Temp", param: "nope", value: 1 },
            },
          ],
        },
        EDIT,
      ),
      ERROR_CODES.NOT_FOUND,
    );
    expect(err.message).toMatch(
      /Edit 3 \(set_param\) failed, so none of the 3 edits were applied/,
    );
    expect(top.nodesOnTheScreen.map((a) => a.uniqueID)).toEqual([
      resolveAtom("Width").uniqueID,
      D,
    ]);
    expect(await valueOf(D)).toBe(2);
    expect(GlobalVariables.undoCommandStack).toHaveLength(0);
  });

  it("refuses tools that can't be batched", async () => {
    await expectToolError(
      runTool(
        "apply_edits",
        { description: "x", edits: [{ tool: "save_project", arguments: {} }] },
        EDIT,
      ),
      ERROR_CODES.INVALID_PARAMS,
      /can't be used in apply_edits/,
    );
  });

  it("connects atoms, and undoing a fresh connection resets the input", async () => {
    await buildWidthAndDouble();
    await runTool("connect", { from: "Width", to: D, input: "x" }, EDIT);
    expect(await valueOf(D)).toBe(11);

    // Regression: undoing a fresh connection used to delete it silently, so
    // the target kept the removed upstream value and never recomputed.
    await runTool("undo", {}, EDIT);
    expect(await valueOf(D)).toBe(2);
  });

  it("disconnects and deletes atoms, both undoable", async () => {
    await buildWidthAndDouble();
    await runTool("connect", { from: "Width", to: D, input: "x" }, EDIT);
    expect(await valueOf(D)).toBe(11);

    await runTool("disconnect", { atom: D, input: "x" }, EDIT);
    expect(await valueOf(D)).toBe(2);
    await runTool("undo", {}, EDIT);
    expect(await valueOf(D)).toBe(11);

    const { deleted } = await runTool(
      "delete_atoms",
      { atoms: ["Width"] },
      EDIT,
    );
    expect(deleted[0].path).toBe("Proj/Width");
    expect(top.nodesOnTheScreen.map((a) => a.uniqueID)).toEqual([D]);
    await runTool("undo", {}, EDIT);
    expect(top.nodesOnTheScreen.map((a) => a.uniqueID)).toEqual([
      D,
      resolveAtom("Width").uniqueID,
    ]);
    expect(await valueOf(D)).toBe(11);
  });

  it("checks connection targets and types", async () => {
    await buildWidthAndDouble();
    await expectToolError(
      runTool("connect", { from: "Width", to: D, input: "z" }, EDIT),
      ERROR_CODES.NOT_FOUND,
      /Inputs: x, y/,
    );
    await expectToolError(
      runTool("disconnect", { atom: D, input: "x" }, EDIT),
      ERROR_CODES.CONFLICT,
      /not connected/,
    );
  });

  it("keeps the default type of named Inputs and Constants", async () => {
    // Regression: placeAtom copied an undefined `type` onto named atoms.
    await runTool("add_atom", { type: "Input", name: "Height" }, EDIT);
    await runTool("add_atom", { type: "Constant", name: "Gap" }, EDIT);
    expect(resolveAtom("Height").type).toBe("number");
    expect(resolveAtom("Gap").type).toBe("constant");
    const { params } = await runTool("get_atom", { atom: "Height" }, READ);
    expect(params.find((p) => p.label === "Input Type").value).toBe("number");
  });

  it("won't add helper or unknown atom types", async () => {
    for (const type of ["Box", "Output", "GitHubMolecule", "Sphere"]) {
      await expectToolError(
        runTool("add_atom", { type }, EDIT),
        ERROR_CODES.NOT_FOUND,
        /list_atom_types/,
      );
    }
    const { categories } = await runTool("list_atom_types", {}, READ);
    const all = Object.values(categories)
      .flat()
      .map((t) => t.type);
    expect(all).toContain("Equation");
    expect(all).not.toContain("Box");
  });

  it("won't undo a change the user made", async () => {
    await buildWidthAndDouble();
    GlobalVariables.pushUndoCommand(
      new ValueChangeCommand(
        "x",
        top,
        "field",
        1,
        () => {},
        "User typed a value",
      ),
    );
    await expectToolError(
      runTool("undo", {}, EDIT),
      ERROR_CODES.CONFLICT,
      /made by the user/,
    );
    expect(GlobalVariables.undoCommandStack).toHaveLength(1);
  });

  it("refuses to edit inside an imported GitHub molecule", async () => {
    await runTool("add_atom", { type: "Molecule", name: "Imported" }, EDIT);
    const imported = top.nodesOnTheScreen.find((a) => a.name === "Imported");
    imported.atomType = "GitHubMolecule";
    await expectToolError(
      runTool("add_atom", { type: "Constant", molecule: "Imported" }, EDIT),
      ERROR_CODES.PERMISSION_DENIED,
      /read-only/,
    );
  });
});

describe("errors and settling", () => {
  it("lists atoms that failed, with their paths", async () => {
    await buildWidthAndDouble();
    const id = D;
    await runTool(
      "set_param",
      { atom: D, param: "Current Equation", value: "x +" },
      EDIT,
    );
    await settle();
    const { errors } = await runTool("get_errors", {}, READ);
    expect(errors).toEqual([
      expect.objectContaining({
        id,
        path: "Proj/x +",
        message: expect.stringMatching(/Invalid mathematical expression/),
      }),
    ]);
  });

  it("reports a settled project with progress", async () => {
    await buildWidthAndDouble();
    const progress = [];
    const result = await runTool(
      "wait_for_settle",
      { timeout_ms: 5000 },
      { mode: "read", progress: (p) => progress.push(p) },
    );
    expect(result.settled).toBe(true);
    expect(result.errors).toEqual([]);
    expect(progress.length).toBeGreaterThan(0);
  });
});

describe("project description", () => {
  it("shows, replaces, and undoes the project description", async () => {
    GlobalVariables.currentAWSnode.description = "Old words";
    expect((await runTool("get_project", {}, READ)).description).toBe(
      "Old words",
    );
    await expectToolError(
      runTool("set_project_description", { description: "New" }, READ),
      ERROR_CODES.PERMISSION_DENIED,
    );
    await expectToolError(
      runTool(
        "set_project_description",
        { description: "x".repeat(501) },
        EDIT,
      ),
      ERROR_CODES.INVALID_PARAMS,
      /at most 500 characters/,
    );
    const result = await runTool(
      "set_project_description",
      { description: "  A chair cut from plywood.  " },
      EDIT,
    );
    expect(result).toEqual({
      description: "A chair cut from plywood.",
      previous: "Old words",
    });
    expect(GlobalVariables.currentAWSnode.description).toBe(
      "A chair cut from plywood.",
    );
    const { steps } = await runTool("get_undo_history", {}, READ);
    expect(steps[0].description).toMatch(/project description/);
    await runTool("undo", {}, EDIT);
    expect(GlobalVariables.currentAWSnode.description).toBe("Old words");
  });
});

describe("cut layout", () => {
  it("only runs Cut Layout atoms that have geometry to lay out", async () => {
    await buildWidthAndDouble();
    await expectToolError(
      runTool("compute_cut_layout", { atom: D }, EDIT),
      ERROR_CODES.INVALID_PARAMS,
      /not a Cut Layout atom/,
    );
    const { id } = await runTool("add_atom", { type: "CutLayout" }, EDIT);
    await expectToolError(
      runTool("compute_cut_layout", { atom: id }, EDIT),
      ERROR_CODES.CONFLICT,
      /no geometry to lay out/,
    );
    await expectToolError(
      runTool("compute_cut_layout", { atom: id }, READ),
      ERROR_CODES.PERMISSION_DENIED,
    );
  });

  it("presses Compute Layout and waits for the nesting to finish", async () => {
    const { id } = await runTool("add_atom", { type: "CutLayout" }, EDIT);
    const layout = resolveAtom(id);
    layout.inputsAreReady = () => true;
    let pressed = 0;
    layout.computeValueButton = () => {
      pressed += 1;
      layout.computing = true;
      layout.setProcessing();
      setTimeout(() => {
        layout.placements = [[{ id: 0 }, { id: 1 }], [{ id: 2 }]];
        layout.computing = false;
        layout.setReady({ geometry: [] });
      }, 600);
    };
    const result = await runTool("compute_cut_layout", { atom: id }, EDIT);
    expect(pressed).toBe(1);
    expect(result).toMatchObject({
      status: "ready",
      sheets: 2,
      parts_placed: 3,
    });
  });
});

describe("navigation", () => {
  it("opens nested molecules and asks the UI to select atoms", async () => {
    await runTool("add_atom", { type: "Molecule", name: "Sub" }, EDIT);
    await runTool(
      "add_atom",
      { type: "Constant", name: "Inner", molecule: "Sub" },
      EDIT,
    );
    const selected = [];
    const onSelect = (e) => selected.push(e.detail.atom.name);
    window.addEventListener(AGENT_SELECT_EVENT, onSelect);

    const result = await runTool("select_atom", { atom: "Sub/Inner" }, READ);
    expect(result.open_molecule.path).toBe("Proj/Sub");
    expect(GlobalVariables.currentMolecule.name).toBe("Sub");
    expect(resolveAtom("Sub/Inner").selected).toBe(true);

    await runTool("open_molecule", { molecule: "" }, READ);
    expect(GlobalVariables.currentMolecule).toBe(top);
    expect(selected).toEqual(["Inner", "Proj"]);
    window.removeEventListener(AGENT_SELECT_EVENT, onSelect);
  });
});

describe("saving", () => {
  it("refuses when the page can't save", async () => {
    await expectToolError(
      runTool("save_project", {}, EDIT),
      ERROR_CODES.CONFLICT,
      /can't save/,
    );
  });

  it("asks the editor's save handler, which asks the user", async () => {
    const reasons = [];
    agentBridge.saveHandler = async (reason) => {
      reasons.push(reason);
      return { saved: false, message: "The user declined to save." };
    };
    const result = await runTool(
      "save_project",
      { reason: "Finished the bracket" },
      EDIT,
    );
    expect(result).toEqual({
      saved: false,
      message: "The user declined to save.",
    });
    expect(reasons).toEqual(["Finished the bracket"]);
    expect((await runTool("get_project", {}, READ)).can_save).toBe(true);
  });
});

describe("waiting for a project", () => {
  it("waits for a project to load instead of failing", async () => {
    GlobalVariables.topLevelMolecule = null;
    setTimeout(() => {
      GlobalVariables.topLevelMolecule = top;
    }, 400);
    const progress = [];
    const result = await runTool(
      "wait_for_settle",
      { timeout_ms: 5000 },
      { mode: "read", progress: (p) => progress.push(p.message) },
    );
    expect(result.settled).toBe(true);
    expect(progress[0]).toBe("Waiting for a project to load");
  });

  it("gives up with NO_PROJECT when nothing loads in time", async () => {
    GlobalVariables.topLevelMolecule = null;
    await expectToolError(
      runTool("wait_for_settle", { timeout_ms: 1000 }, READ),
      ERROR_CODES.NO_PROJECT,
    );
  });
});

describe("built-in catalog and molecule library", () => {
  const realFetchers = { ...__test__.fetchers };
  afterEach(() => Object.assign(__test__.fetchers, realFetchers));

  /** A tiny public "molecule": Width input wired straight to the Output. */
  const fakeProject = () => ({
    atomType: "Molecule",
    name: "Doubler",
    uniqueID: "fake-top",
    topLevel: true,
    allAtoms: [
      { atomType: "Output", uniqueID: "fake-out", x: 0.9, y: 0.5 },
      {
        atomType: "Input",
        name: "Width",
        type: "number",
        uniqueID: "fake-in",
        x: 0.1,
        y: 0.5,
      },
    ],
    allConnectors: [
      { ap1ID: "fake-in", ap2ID: "fake-out", ap2Name: "number or geometry" },
    ],
    ioValues: [{ name: "Width", ioValue: 7 }],
  });

  it("describes built-in atoms with their inputs and defaults", async () => {
    const { categories } = await runTool("list_atom_types", {}, READ);
    const all = Object.values(categories).flat();
    const rect = all.find((t) => t.type === "Rectangle");
    expect(rect.description).toMatch(/rectangle/i);
    expect(rect.inputs).toEqual([
      { name: "x length", type: "number", default: 10 },
      { name: "y length", type: "number", default: 10 },
    ]);
    const move = all.find((t) => t.type === "Move");
    expect(move.inputs.map((i) => i.name)).toEqual([
      "geometry",
      "xDist",
      "yDist",
      "zDist",
    ]);
    expect(all.find((t) => t.type === "Box")).toBeUndefined();
  });

  it("lists the curated library and filters it", async () => {
    const all = await runTool("list_library_molecules", {}, READ);
    expect(all.molecules.length).toBeGreaterThanOrEqual(20);
    const patterns = await runTool(
      "list_library_molecules",
      { query: "pattern" },
      READ,
    );
    const rotate = patterns.molecules.find(
      (m) => m.repo === "BarbourSmith/RotatePattern",
    );
    expect(rotate.use_for).toMatch(/Angle = 360 \/ N/);
    expect(rotate.inputs.map((i) => i.name)).toEqual([
      "Shape",
      "Number",
      "Angle",
    ]);
  });

  it("searches shared molecules, most used first, without private ones", async () => {
    __test__.fetchers.search = async () => [
      { owner: "a", repoName: "Rarely", ranking: 1, description: "x" },
      { owner: "b", repoName: "Secret", ranking: 5, privateRepo: true },
      { owner: "BarbourSmith", repoName: "RotatePattern", ranking: 3 },
    ];
    const { molecules } = await runTool(
      "search_molecules",
      { query: "pattern" },
      READ,
    );
    expect(molecules.map((m) => m.repo)).toEqual([
      "BarbourSmith/RotatePattern",
      "a/Rarely",
    ]);
    expect(molecules[0].in_library).toBe(true);
  });

  it("searches each word's stem and ranks by how many words match", async () => {
    const searched = [];
    const unroll = {
      owner: "tristan-huber",
      repoName: "crv.Unroll",
      ranking: 2,
      searchField:
        "crv.unroll tristan-huber unroll a face to flat abundance-tool",
    };
    const vacuum = {
      owner: "someone",
      repoName: "FlatVacuum",
      ranking: 4,
      searchField: "flatvacuum someone a flat hose",
    };
    const copy = { ...unroll, repoName: "crv.Unroll-copy", ranking: 5 };
    const fork = {
      ...unroll,
      owner: "other",
      parentRepo: "tristan-huber/crv.Unroll",
    };
    __test__.fetchers.search = async (term) => {
      searched.push(term);
      return term === "flat" ? [vacuum, unroll, copy, fork] : [unroll];
    };
    const result = await runTool(
      "search_molecules",
      { query: "Flattening an unrollable face" },
      READ,
    );
    expect(searched.sort()).toEqual(["fac", "flat", "unrol"]);
    expect(result.molecules.map((m) => m.repo)).toEqual([
      "tristan-huber/crv.Unroll",
      "someone/FlatVacuum",
    ]);
    expect(result.copies_hidden).toBe(2);
  });

  it("imports a GitHub molecule as one undoable, read-only step", async () => {
    const requested = [];
    __test__.fetchers.search = async () => [];
    __test__.fetchers.projectFile = async (owner, repo) => {
      requested.push(`${owner}/${repo}`);
      return fakeProject();
    };
    const result = await runTool(
      "add_github_molecule",
      { repo: "someone/Doubler" },
      EDIT,
    );
    expect(requested).toEqual(["someone/Doubler"]);
    expect(result).toMatchObject({
      repo: "someone/Doubler",
      path: "Proj/Doubler",
    });
    expect(result.inputs).toEqual([{ name: "Width", type: "number" }]);

    const atom = resolveAtom(result.id);
    expect(atom.atomType).toBe("GitHubMolecule");
    expect(atom.parentRepo).toMatchObject({
      owner: "someone",
      repoName: "Doubler",
      privateRepo: false,
    });
    expect(await valueOf(result.id)).toBe(7);

    await runTool(
      "set_param",
      { atom: result.id, param: "Width", value: 9 },
      EDIT,
    );
    expect(await valueOf(result.id)).toBe(9);

    await expectToolError(
      runTool("add_atom", { type: "Constant", molecule: result.id }, EDIT),
      ERROR_CODES.PERMISSION_DENIED,
      /read-only/,
    );

    const history = await runTool("get_undo_history", {}, READ);
    expect(history.steps.map((s) => s.description)).toEqual([
      "AI: set Width on Doubler",
      "AI: import someone/Doubler",
    ]);
    await runTool("undo", {}, EDIT);
    await runTool("undo", {}, EDIT);
    expect(
      top.nodesOnTheScreen.find((a) => a.name === "Doubler"),
    ).toBeUndefined();
  });

  it("explains bad repository names and missing projects", async () => {
    await expectToolError(
      runTool("add_github_molecule", { repo: "not a repo" }, EDIT),
      ERROR_CODES.INVALID_PARAMS,
      /owner\/name/,
    );
    __test__.fetchers.search = async () => [];
    __test__.fetchers.projectFile = async () => {
      throw new Error("Not Found");
    };
    await expectToolError(
      runTool("add_github_molecule", { repo: "nobody/Nothing" }, EDIT),
      ERROR_CODES.NOT_FOUND,
      /Couldn't load nobody\/Nothing/,
    );
    expect(GlobalVariables.undoCommandStack).toHaveLength(0);
  });

  it("refuses private molecules found by search", async () => {
    __test__.fetchers.search = async () => [
      { owner: "b", repoName: "Secret", privateRepo: true },
    ];
    await expectToolError(
      runTool("add_github_molecule", { repo: "b/Secret" }, EDIT),
      ERROR_CODES.PERMISSION_DENIED,
      /private/,
    );
  });

  it("requires a reason to add a Code atom and shows it in the undo history", async () => {
    await expectToolError(
      runTool("add_atom", { type: "Code" }, EDIT),
      ERROR_CODES.INVALID_PARAMS,
      /needs a "reason"/,
    );
    // Tests have no CAD worker; a stub lets the new Code atom compute.
    const realCad = GlobalVariables.cad;
    GlobalVariables.cad = { code: async () => 0 };
    try {
      await runTool(
        "add_atom",
        { type: "Code", reason: "spiral layout math" },
        EDIT,
      );
    } finally {
      GlobalVariables.cad = realCad;
    }
    const history = await runTool("get_undo_history", {}, READ);
    expect(history.steps[0].description).toBe(
      "AI: add Code (spiral layout math)",
    );
  });

  it("can import inside apply_edits and wire the result by name", async () => {
    __test__.fetchers.search = async () => [];
    __test__.fetchers.projectFile = async () => fakeProject();
    await runTool(
      "apply_edits",
      {
        description: "import and wire",
        edits: [
          {
            tool: "add_github_molecule",
            arguments: { repo: "someone/Doubler", ref: "Doubler" },
          },
          { tool: "add_atom", arguments: { type: "Constant", name: "Size" } },
          {
            tool: "connect",
            arguments: { from: "Size", to: "Doubler", input: "Width" },
          },
        ],
      },
      EDIT,
    );
    expect(await valueOf("Doubler")).toBe(10);
    expect(GlobalVariables.undoCommandStack).toHaveLength(1);
  });

  it("keeps an imported GitHub molecule's name from its project", async () => {
    __test__.fetchers.search = async () => [];
    __test__.fetchers.projectFile = async () => fakeProject();
    await expectToolError(
      runTool(
        "add_github_molecule",
        { repo: "someone/Doubler", name: "Blade" },
        EDIT,
      ),
      ERROR_CODES.INVALID_PARAMS,
      /unknown argument "name"/,
    );
    const { id } = await runTool(
      "add_github_molecule",
      { repo: "someone/Doubler" },
      EDIT,
    );
    await expectToolError(
      runTool(
        "set_param",
        { atom: id, param: "Molecule Name", value: "Blade" },
        EDIT,
      ),
      ERROR_CODES.CONFLICT,
      /locked/,
    );
    expect(resolveAtom(id).name).toBe("Doubler");
  });
});

describe("atom names follow the editor's rules", () => {
  it("refuses to name atoms the editor doesn't let users rename", async () => {
    for (const type of ["Rectangle", "Extrude", "Equation", "Code"]) {
      await expectToolError(
        runTool("add_atom", { type, name: "Blade", reason: "x" }, EDIT),
        ERROR_CODES.INVALID_PARAMS,
        /keep their standard name/,
      );
    }
    expect(top.nodesOnTheScreen).toHaveLength(0);
    // Molecules, Inputs, and Constants can be named.
    await runTool("add_atom", { type: "Molecule", name: "Frame" }, EDIT);
    await runTool("add_atom", { type: "Constant", name: "Gap" }, EDIT);
    expect(nameOf("Frame")).toBe("Frame");
    expect(nameOf("Gap")).toBe("Gap");
  });

  it("lets a batch refer to new atoms by ref without renaming them", async () => {
    await buildWidthAndDouble();
    const { results } = await runTool(
      "apply_edits",
      {
        description: "times five",
        edits: [
          { tool: "add_atom", arguments: { type: "Equation", ref: "five" } },
          {
            tool: "set_param",
            arguments: {
              atom: "five",
              param: "Current Equation",
              value: "x * 5",
            },
          },
          {
            tool: "connect",
            arguments: { from: "Width", to: "five", input: "x" },
          },
        ],
      },
      EDIT,
    );
    const id = results[0].result.id;
    expect(await valueOf(id)).toBe(50);
    expect(nameOf(id)).not.toBe("five");
    // Refs only live for their batch.
    await expectToolError(
      runTool("get_atom", { atom: "five" }, READ),
      ERROR_CODES.NOT_FOUND,
    );
  });

  it("restores standard names changed by older bridge versions, undoably", async () => {
    const realCad = GlobalVariables.cad;
    GlobalVariables.cad = { code: async () => 0 };
    try {
      const { id } = await runTool(
        "add_atom",
        { type: "Code", reason: "test" },
        EDIT,
      );
      await runTool("add_atom", { type: "Molecule", name: "Frame" }, EDIT);
      await runTool("add_atom", { type: "Constant", name: "Gap" }, EDIT);
      // Simulate the old bug: a built-in atom with a custom name.
      resolveAtom(id).name = "Curl";
      const result = await runTool("reset_atom_names", {}, EDIT);
      expect(result.renamed).toEqual([{ id, from: "Curl", to: "Code" }]);
      expect(nameOf(id)).toBe("Code");
      expect(nameOf("Frame")).toBe("Frame");
      expect(nameOf("Gap")).toBe("Gap");
      await runTool("undo", {}, EDIT);
      expect(nameOf(id)).toBe("Curl");
    } finally {
      GlobalVariables.cad = realCad;
    }
  });
});
