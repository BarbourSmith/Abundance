// Rewiring a TypeScript Code atom's inputs in one apply_edits batch (add Input
// atoms, connect them, set the molecule's values) changes each input several
// times. The Code atom must not run while an input's new value is still on its
// way, and the worker should only see the first run and the final one.
//
// Run: npx vitest run --config=vitest.headless.config.ts tests/code-atom-rewire-dispatch.test.js

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("comlink", async (importOriginal) => ({
  ...(await importOriginal()),
  wrap: (rawWorker) => rawWorker.__proxy,
}));

import "../src/prototypes/attachmentpoint.js";
import Molecule from "../src/molecules/molecule.js";
import GlobalVariables from "../src/js/globalvariables.js";
import { Status } from "../src/prototypes/observableEntity.js";
import { resolveAtom, runTool } from "../src/agent/runtime.js";
import { CadWorkerManager } from "../src/worker/cadWorkerManager.js";

const EDIT = { mode: "edit" };
const READ = { mode: "read" };

const AREA_TS =
  "function run(width: number = 40, depth: number = 30, extra?: Assembly) { return width * depth; }";
const AREA_JS =
  "function run(width = 40, depth = 30, extra) { return width * depth; }";

let realCad;

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
});

afterEach(() => {
  GlobalVariables.cad = realCad;
  GlobalVariables.undoCaptureStack = null;
});

const settle = () => runTool("wait_for_settle", { timeout_ms: 5000 }, READ);

/** A molecule holding a TS Code atom that multiplies its two inputs. */
async function buildAreaAtom() {
  const part = (
    await runTool("add_atom", { type: "Molecule", name: "Part" }, EDIT)
  ).id;
  const code = (
    await runTool(
      "add_atom",
      { type: "Code", molecule: part, reason: "test" },
      EDIT,
    )
  ).id;
  await runTool(
    "set_code",
    { atom: code, code: AREA_TS, compiled_code: AREA_JS },
    EDIT,
  );
  await settle();
  return { part, code };
}

/** The batch from the incident: new Input atoms, wired, then given values. */
function rewire(part, code) {
  return runTool(
    "apply_edits",
    {
      description: "rewire",
      edits: [
        {
          tool: "add_atom",
          arguments: { type: "Input", molecule: part, name: "W" },
        },
        {
          tool: "add_atom",
          arguments: { type: "Input", molecule: part, name: "D" },
        },
        { tool: "connect", arguments: { from: "W", to: code, input: "width" } },
        { tool: "connect", arguments: { from: "D", to: code, input: "depth" } },
        {
          tool: "set_param",
          arguments: { atom: part, param: "W", value: 120 },
        },
        { tool: "set_param", arguments: { atom: part, param: "D", value: 80 } },
      ],
    },
    EDIT,
  );
}

const area = (args) => args.width * args.depth;

describe("Code atom input rewiring", () => {
  it("never runs the code while an input's new value is on its way", async () => {
    const runs = [];
    GlobalVariables.cad = {
      code: async (_code, args) => {
        runs.push({ width: args.width, depth: args.depth });
        return area(args);
      },
    };
    const { part, code } = await buildAreaAtom();
    runs.length = 0;

    await rewire(part, code);
    await settle();

    // Each input passes through PROCESSING on its way to a new value. An
    // optional input (one with a default) used to count as ready then, so the
    // atom ran once with that input null for every change.
    expect(runs.length).toBeGreaterThan(0);
    for (const run of runs) {
      expect(run.width, JSON.stringify(runs)).toEqual(expect.any(Number));
      expect(run.depth, JSON.stringify(runs)).toEqual(expect.any(Number));
    }
    expect(runs.at(-1)).toEqual({ width: 120, depth: 80 });
    expect(resolveAtom(code).status).toBe(Status.READY);
    expect(resolveAtom(code).value).toBe(9600);
  });

  it("still runs without an optional input whose source has no value", async () => {
    GlobalVariables.cad = { code: async (_code, args) => area(args) };
    const { part, code } = await buildAreaAtom();
    // An Extrude with nothing connected waits forever, so `extra` never gets a
    // value. Being optional, it mustn't hold the Code atom back.
    const extrude = (
      await runTool("add_atom", { type: "Extrude", molecule: part }, EDIT)
    ).id;
    await runTool("connect", { from: extrude, to: code, input: "extra" }, EDIT);
    await runTool("set_param", { atom: code, param: "width", value: 7 }, EDIT);
    await settle();

    expect(resolveAtom(extrude).status).toBe(Status.WAITING);
    expect(resolveAtom(code).status).toBe(Status.READY);
    expect(resolveAtom(code).value).toBe(7 * 30);
  });

  it("sends the worker only the first and the final run", async () => {
    const workerRuns = [];
    let holdNext = false;
    let releaseHeld;
    const cad = new CadWorkerManager(function () {
      return {
        addEventListener() {},
        removeEventListener() {},
        terminate() {},
        postMessage() {},
        __proxy: new Proxy(
          {},
          {
            get: (_target, method) => (_code, args) => {
              if (method !== "code") return Promise.resolve(null);
              workerRuns.push({ width: args.width, depth: args.depth });
              if (!holdNext) return Promise.resolve(area(args));
              // Keep the batch's first run busy so the later ones queue up.
              holdNext = false;
              return new Promise((resolve) => {
                releaseHeld = () => resolve(area(args));
              });
            },
          },
        ),
      };
    }, 60_000);
    GlobalVariables.cad = cad;
    const { part, code } = await buildAreaAtom();
    const atom = resolveAtom(code);
    atom.clearConsoleEntries();
    workerRuns.length = 0;
    holdNext = true;

    await rewire(part, code);
    expect(workerRuns).toHaveLength(1);
    expect(cad.getQueueSnapshot().queue.map((e) => e.sentToWorker)).toEqual([
      true,
      false,
    ]);

    releaseHeld();
    await settle();

    expect(workerRuns).toEqual([workerRuns[0], { width: 120, depth: 80 }]);
    expect(atom.status).toBe(Status.READY);
    expect(atom.value).toBe(9600);
    // Replaced runs neither mark the atom red nor log a failed run.
    expect(atom.consoleEntries.map((e) => e.message)).toEqual([
      "run finished",
      "run finished",
    ]);
  });
});
