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

async function buildWidthAndDouble() {
  await runTool("add_atom", { type: "Constant", name: "Width" }, EDIT);
  await runTool("add_atom", { type: "Equation", name: "Double" }, EDIT);
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
    await runTool("add_atom", { type: "Equation", name: "Eq" }, EDIT);
    await runTool("add_atom", { type: "Equation", name: "Eq" }, EDIT);
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
      /It contains: Width, Double/,
    );
  });
});

describe("permissions and validation", () => {
  it("refuses every edit tool in read-only mode", async () => {
    await buildWidthAndDouble();
    for (const [name, args] of [
      ["set_param", { atom: "Double", param: "x", value: 3 }],
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
    expect(atoms.map((a) => a.name)).toEqual(["Width", "Double"]);
    expect(atoms[1].inputs.map((i) => i.name)).toEqual(["x", "y"]);
  });

  it("exposes the properties-panel fields as params", async () => {
    await buildWidthAndDouble();
    const atom = await runTool("get_atom", { atom: "Double" }, READ);
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

    const id = resolveAtom("Double").uniqueID;
    const result = await runTool(
      "set_param",
      { atom: "Double", param: "Current Equation", value: "x * 10" },
      EDIT,
    );
    // Equation atoms take their equation as their name; the result says so.
    expect(result.renamed).toMatchObject({ from: "Double", to: "x * 10" });
    expect(await valueOf(id)).toBe(10);
    expect(edits).toEqual(["set_param"]);

    const history = await runTool("get_undo_history", {}, READ);
    expect(history.steps).toEqual([
      { description: "AI: set Current Equation on Double", by_agent: true },
    ]);

    await runTool("undo", {}, EDIT);
    expect(await valueOf(id)).toBe(2);
    window.removeEventListener(AGENT_EDIT_EVENT, onEdit);
  });

  it("accepts numbers for equation-backed number inputs", async () => {
    await buildWidthAndDouble();
    await runTool("set_param", { atom: "Double", param: "x", value: 41 }, EDIT);
    expect(await valueOf("Double")).toBe(42);
  });

  it("refuses to edit a parameter that is driven by a connection", async () => {
    await buildWidthAndDouble();
    await runTool("connect", { from: "Width", to: "Double", input: "x" }, EDIT);
    await expectToolError(
      runTool("set_param", { atom: "Double", param: "x", value: 5 }, EDIT),
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
          { tool: "add_atom", arguments: { type: "Equation", name: "Triple" } },
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
    // "Triple" renamed itself to "x * 3", but the batch could still use the name it gave.
    expect(await valueOf("x * 3")).toBe(30);
    expect(GlobalVariables.undoCommandStack).toHaveLength(1);
    expect(GlobalVariables.undoCommandStack[0].description).toBe(
      "AI: add a tripler",
    );

    await runTool("undo", {}, EDIT);
    await settle();
    expect(top.nodesOnTheScreen.map((a) => a.name)).toEqual([
      "Width",
      "Double",
    ]);
  });

  it("rolls back every edit in a batch when one fails", async () => {
    await buildWidthAndDouble();
    const err = await expectToolError(
      runTool(
        "apply_edits",
        {
          description: "broken",
          edits: [
            { tool: "add_atom", arguments: { type: "Equation", name: "Temp" } },
            {
              tool: "set_param",
              arguments: { atom: "Double", param: "x", value: 7 },
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
    expect(top.nodesOnTheScreen.map((a) => a.name)).toEqual([
      "Width",
      "Double",
    ]);
    expect(await valueOf("Double")).toBe(2);
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
    await runTool("connect", { from: "Width", to: "Double", input: "x" }, EDIT);
    expect(await valueOf("Double")).toBe(11);

    // Regression: undoing a fresh connection used to delete it silently, so
    // the target kept the removed upstream value and never recomputed.
    await runTool("undo", {}, EDIT);
    expect(await valueOf("Double")).toBe(2);
  });

  it("disconnects and deletes atoms, both undoable", async () => {
    await buildWidthAndDouble();
    await runTool("connect", { from: "Width", to: "Double", input: "x" }, EDIT);
    expect(await valueOf("Double")).toBe(11);

    await runTool("disconnect", { atom: "Double", input: "x" }, EDIT);
    expect(await valueOf("Double")).toBe(2);
    await runTool("undo", {}, EDIT);
    expect(await valueOf("Double")).toBe(11);

    const { deleted } = await runTool(
      "delete_atoms",
      { atoms: ["Width"] },
      EDIT,
    );
    expect(deleted[0].path).toBe("Proj/Width");
    expect(top.nodesOnTheScreen.map((a) => a.name)).toEqual(["Double"]);
    await runTool("undo", {}, EDIT);
    expect(top.nodesOnTheScreen.map((a) => a.name)).toEqual([
      "Double",
      "Width",
    ]);
    expect(await valueOf("Double")).toBe(11);
  });

  it("checks connection targets and types", async () => {
    await buildWidthAndDouble();
    await expectToolError(
      runTool("connect", { from: "Width", to: "Double", input: "z" }, EDIT),
      ERROR_CODES.NOT_FOUND,
      /Inputs: x, y/,
    );
    await expectToolError(
      runTool("disconnect", { atom: "Double", input: "x" }, EDIT),
      ERROR_CODES.CONFLICT,
      /not connected/,
    );
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
    const all = Object.values(categories).flat();
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
    const id = String(resolveAtom("Double").uniqueID);
    await runTool(
      "set_param",
      { atom: "Double", param: "Current Equation", value: "x +" },
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
