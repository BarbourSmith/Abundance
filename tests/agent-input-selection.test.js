/**
 * set_input_selection: the agent picks edges, faces, and parts on a
 * molecule's edge-select, face-select, and part-select inputs, as the user
 * does in the 3D view. The CAD worker's functions run in-thread and the mesh
 * worker runs for real, so the edges and faces are real OpenCascade ones.
 *
 * Run: npx vitest run --config=vitest.headless.config.ts tests/agent-input-selection.test.js
 */
import { afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";

vi.mock("comlink", async (importOriginal) => ({
  ...(await importOriginal()),
  wrap: (rawWorker) => rawWorker.__proxy,
}));

import "../src/prototypes/attachmentpoint.js";
import Molecule from "../src/molecules/molecule.js";
import GlobalVariables from "../src/js/globalvariables.js";
import { CadWorkerManager } from "../src/worker/cadWorkerManager.js";
import * as workerpool from "workerpool";
import MeshWorkerURL from "../src/worker/meshWorker.ts?url&worker";
import * as interaction from "../src/worker/interaction.ts";
import * as worker from "../src/worker/worker.ts";
import { flattenAssembly } from "../src/worker/util";
import { resolveAtom, runTool } from "../src/agent/runtime.js";
import { ERROR_CODES } from "../src/agent/protocol.js";

const EDIT = { mode: "edit" };
const READ = { mode: "read" };

let realCad;
let realPool;
let meshPool;

/** A CadWorkerManager whose worker runs the real worker functions in-thread. */
function inThreadCad() {
  const api = { ...interaction, ...worker };
  return new CadWorkerManager(function () {
    return {
      addEventListener() {},
      removeEventListener() {},
      terminate() {},
      postMessage() {},
      __proxy: new Proxy(
        {},
        {
          get:
            (_target, method) =>
            async (...args) => {
              if (!api[method]) return undefined;
              const fn = worker.withReferencePolicy(method, api[method]);
              return fn(...structuredClone(args));
            },
        },
      ),
    };
  }, 60_000);
}

beforeAll(async () => {
  await worker.started;
  meshPool = workerpool.pool(MeshWorkerURL, {
    maxWorkers: 1,
    workerOpts: { type: "module" },
  });
  return () => meshPool.terminate();
});

beforeEach(() => {
  realPool = GlobalVariables.pool;
  GlobalVariables.pool = meshPool;
  realCad = GlobalVariables.cad;
  const canvas = document.createElement("canvas");
  GlobalVariables.canvas = { current: canvas };
  GlobalVariables.c = canvas.getContext("2d");
  GlobalVariables.writeToDisplay = () => {};
  GlobalVariables.undoCommandStack = [];
  GlobalVariables.undoCaptureStack = null;
  GlobalVariables.currentAWSnode = { owner: "tester", repoName: "Proj" };
  GlobalVariables.cad = inThreadCad();
  const top = new Molecule({
    x: 0.5,
    y: 0.5,
    parent: null,
    uniqueID: GlobalVariables.generateUniqueID(),
    topLevel: true,
  });
  top.name = "Proj";
  top.unitsKey = "MM";
  GlobalVariables.topLevelMolecule = top;
  GlobalVariables.currentMolecule = top;
});

afterEach(() => {
  GlobalVariables.cad = realCad;
  GlobalVariables.pool = realPool;
  GlobalVariables.undoCaptureStack = null;
});

const settle = () => runTool("wait_for_settle", { timeout_ms: 30000 }, READ);
const add = async (type, args = {}) =>
  (await runTool("add_atom", { type, ...args }, EDIT)).id;
const connect = (from, to, input) =>
  runTool("connect", { from, to, input }, EDIT);
const select = (atom, picks, extra = {}) =>
  runTool(
    "set_input_selection",
    { atom, input: "Shape", picks, ...extra },
    EDIT,
  );

/**
 * A cylinder 10 across and 20 tall standing on the origin. A Circle is drawn
 * as two half-circle arcs, so it has six edges (two arcs at z = 0, two at
 * z = 20, two straight seams at x = 5 and x = -5) and four faces (top,
 * bottom, two half-round sides).
 */
async function cylinder(xDist = 0) {
  const circle = await add("Circle", { params: { diameter: 10 } });
  const extrude = await add("Extrude", {
    params: { height: 20 },
    inputs: { geometry: circle },
  });
  if (!xDist) return extrude;
  return add("Move", { params: { xDist }, inputs: { geometry: extrude } });
}

/**
 * A molecule that passes the shape wired into its "Shape" input (an Input
 * atom of `type`) to its output, with the picks marked on it.
 */
async function picker(type, name = "Pick") {
  const mol = await add("Molecule", { name });
  const input = await add("Input", {
    molecule: mol,
    name: "Shape",
    params: { "Input Type": type },
  });
  await connect(input, `${resolveAtom(mol).name}/Output`, "number or geometry");
  return mol;
}

/** The selection marks on each leaf of an atom's output. */
async function marks(atom) {
  await settle();
  return flattenAssembly(resolveAtom(atom).value).map((leaf) => leaf.selection);
}

it("picks the circle centered on a point, and undoes it", async () => {
  const shape = await cylinder();
  const mol = await picker("edgeselect");
  await connect(shape, mol, "Shape");
  await settle();
  GlobalVariables.undoCommandStack = [];

  // One arc of the top circle, and a count of the other one, just as near
  const one = await select(mol, [{ center: [0, 0, 20], type: "circle" }]);
  expect(one).toMatchObject({
    input: "Shape",
    selects: "edges",
    pick_count: 1,
    units: "MM",
  });
  const [arc] = one.picked;
  expect(arc).toMatchObject({
    part: 0,
    type: "circle",
    radius: 5,
    arc: true,
    distance: 0,
    as_near: 1,
  });
  expect(arc.center).toEqual([0, 0, 20]);
  expect(Math.abs(arc.axis[2])).toBe(1);
  expect(await marks(mol)).toEqual([{ edges: [arc.index] }]);
  GlobalVariables.undoCommandStack = [];

  // The whole rim: both arcs. The bottom circle comes next, 20 away.
  const result = await select(mol, [
    { center: [0, 0, 20], type: "circle", all_nearest: true },
  ]);
  const [top] = result.picked;
  expect(top.as_near).toBeUndefined();
  expect(top.also_picked).toHaveLength(1);
  const other = top.also_picked[0];
  expect(other).toMatchObject({ type: "circle", radius: 5, distance: 0 });
  expect(other.center).toEqual([0, 0, 20]);
  expect(top.next_nearest[0]).toMatchObject({
    type: "circle",
    center: [0, 0, 0],
    distance: 20,
  });
  expect(result.pick_count).toBe(2);
  expect(await marks(mol)).toEqual([{ edges: [top.index, other.index] }]);
  const { inputs } = await runTool("get_atom", { atom: mol }, READ);
  expect(inputs[0].picks).toEqual([
    { part: 0, index: top.index },
    { part: 0, index: other.index },
  ]);

  // One undo step, labeled for the agent, back to the single arc
  expect(GlobalVariables.undoCommandStack).toHaveLength(1);
  expect(GlobalVariables.undoCommandStack[0].isAgentCommand).toBe(true);
  await runTool("undo", {}, EDIT);
  expect(await marks(mol)).toEqual([{ edges: [arc.index] }]);
});

it("picks the edge passing nearest a point, by number, and adds picks", async () => {
  const shape = await cylinder();
  const mol = await picker("edgeselect");
  await connect(shape, mol, "Shape");
  await settle();

  // A point beside the seam, halfway up
  const seam = (await select(mol, [{ point: [6, 0, 10] }])).picked[0];
  expect(seam).toMatchObject({ type: "line", length: 20, distance: 1 });

  const bottom = (await select(mol, [{ center: [0, 0, 0], type: "circle" }]))
    .picked[0];
  const both = await select(mol, [{ part: 0, index: seam.index }], {
    add: true,
  });
  expect(both.picked[0]).toMatchObject({ index: seam.index, type: "line" });
  expect(both.pick_count).toBe(2);
  expect(both.picks).toEqual([
    { part: 0, index: bottom.index },
    { part: 0, index: seam.index },
  ]);
  expect((await marks(mol))[0].edges).toEqual([bottom.index, seam.index]);

  // An empty list clears the picks
  expect((await select(mol, [])).pick_count).toBe(0);
  expect(await marks(mol)).toEqual([{ edges: [] }]);
});

it("says why a pick can't be made", async () => {
  const shape = await cylinder();
  const mol = await picker("edgeselect");
  await connect(shape, mol, "Shape");
  await settle();
  for (const [pick, message] of [
    [
      { part: 1, index: 0 },
      /has 1 part\(s\), numbered from 0; there is no part 1/,
    ],
    [
      { part: 0, index: 99 },
      /part 0 has 6 edges, numbered from 0; there is no edge 99/,
    ],
    [{ center: [0, 0, 0], type: "ellipse" }, /has no ellipse edges/],
  ]) {
    const error = await select(mol, [pick]).catch((e) => e);
    expect(error.code).toBe(ERROR_CODES.NOT_FOUND);
    expect(error.message).toMatch(message);
  }
  const wrongType = await select(mol, [
    { part: 0, index: 0, type: "plane" },
  ]).catch((e) => e);
  expect(wrongType.code).toBe(ERROR_CODES.INVALID_PARAMS);
});

it("connects and picks in one batch", async () => {
  const shape = await cylinder();
  const mol = await picker("edgeselect");
  await settle();
  const { results } = await runTool(
    "apply_edits",
    {
      description: "wire up",
      edits: [
        {
          tool: "connect",
          arguments: { from: shape, to: mol, input: "Shape" },
        },
        {
          tool: "set_input_selection",
          arguments: {
            atom: mol,
            input: "Shape",
            picks: [{ center: [0, 0, 20], type: "circle" }],
          },
        },
      ],
    },
    EDIT,
  );
  const picked = results[1].result.picked[0];
  expect(picked).toMatchObject({ type: "circle", center: [0, 0, 20] });
  expect(await marks(mol)).toEqual([{ edges: [picked.index] }]);
});

it("picks faces by a point on them, with their type, normal, and radius", async () => {
  const shape = await cylinder();
  const mol = await picker("faceselect");
  await connect(shape, mol, "Shape");
  await settle();

  const result = await select(mol, [
    { point: [1, 1, 20], type: "plane" },
    { point: [5, 0, 10] },
  ]);
  const [top, side] = result.picked;
  expect(top).toMatchObject({ type: "plane", center: [0, 0, 20], distance: 0 });
  expect(top.normal).toEqual([0, 0, 1]);
  expect(side).toMatchObject({ type: "cylinder", radius: 5, distance: 0 });
  expect(Math.abs(side.axis[2])).toBe(1);
  expect(await marks(mol)).toEqual([{ faces: [top.index, side.index] }]);
});

it("picks the part nearest a point on a part-select input", async () => {
  const assembly = await add("Assembly");
  await connect(await cylinder(), assembly, "Shape1");
  await connect(await cylinder(100), assembly, "Shape2");
  await runTool(
    "set_param",
    { atom: assembly, param: "makeDisjoint", value: false },
    EDIT,
  );
  const mol = await picker("partselect");
  await connect(assembly, mol, "Shape");
  await settle();

  const result = await select(mol, [{ point: [100, 0, 10] }]);
  expect(result.picked[0]).toMatchObject({ part: 1, distance: 0 });
  expect(result.picked[0].bounding_box.min).toEqual([95, -5, 0]);
  expect((await marks(mol)).map((mark) => mark.part)).toEqual([false, true]);

  const byNumber = await select(mol, [{ part: 0 }]);
  expect(byNumber.picked[0].part).toBe(0);
  expect((await marks(mol)).map((mark) => mark.part)).toEqual([true, false]);
});
