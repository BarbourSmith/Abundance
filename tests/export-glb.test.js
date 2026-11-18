/**
 * GLB export: one colored mesh per part, keep-outs left out, Y-up, and scaled
 * to meters as glTF defines its units. The CAD worker's functions run
 * in-thread here and the mesh worker runs for real, so geometry is real.
 *
 * Run: npx vitest run --config=vitest.headless.config.ts tests/export-glb.test.js
 */
import { afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";

vi.mock("comlink", async (importOriginal) => ({
  ...(await importOriginal()),
  wrap: (rawWorker) => rawWorker.__proxy,
}));

import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import "../src/prototypes/attachmentpoint.js";
import Molecule from "../src/molecules/molecule.js";
import GlobalVariables from "../src/js/globalvariables.js";
import { CadWorkerManager } from "../src/worker/cadWorkerManager.js";
import * as workerpool from "workerpool";
import MeshWorkerURL from "../src/worker/meshWorker.ts?url&worker";
import * as interaction from "../src/worker/interaction.ts";
import * as worker from "../src/worker/worker.ts";
import { resolveAtom, runTool } from "../src/agent/runtime.js";
import { exportGeometryAsGLB } from "../src/js/exportGLB.js";

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
});

const settle = () => runTool("wait_for_settle", { timeout_ms: 30000 }, READ);
const add = async (type) => (await runTool("add_atom", { type }, EDIT)).id;
const connect = (from, to, input) =>
  runTool("connect", { from, to, input }, EDIT);
const setParam = (atom, param, value) =>
  runTool("set_param", { atom, param, value }, EDIT);

/** A 10 x 20 x 30 box, centered on the Z axis, standing on the XY plane. */
async function box() {
  const rectangle = await add("Rectangle");
  await setParam(rectangle, "x length", 10);
  await setParam(rectangle, "y length", 20);
  const extrude = await add("Extrude");
  await connect(rectangle, extrude, "geometry");
  await setParam(extrude, "height", 30);
  return extrude;
}

/** `geometry` passed through a Color atom set to the color named `name`. */
async function colored(geometry, name) {
  const color = await add("Color");
  const atom = resolveAtom(color);
  atom.selectedColorIndex = Object.keys(atom.colorOptions).indexOf(name);
  await connect(geometry, color, "geometry");
  return color;
}

/** Two boxes 100 apart along X, the first red, in a non-disjoint Assembly. */
async function twoBoxes() {
  const first = await colored(await box(), "Red");
  const second = await box();
  const move = await add("Move");
  await connect(second, move, "geometry");
  await setParam(move, "xDist", 100);
  const assembly = await add("Assembly");
  await connect(first, assembly, "Shape1");
  await connect(move, assembly, "Shape2");
  await setParam(assembly, "makeDisjoint", false);
  await settle();
  return assembly;
}

async function parseGLB(buffer) {
  const gltf = await new GLTFLoader().parseAsync(buffer, "");
  const meshes = [];
  gltf.scene.traverse((o) => o.isMesh && meshes.push(o));
  return { scene: gltf.scene, meshes };
}

const size = (object) =>
  new THREE.Box3()
    .setFromObject(object)
    .getSize(new THREE.Vector3())
    .toArray()
    .map((v) => Math.round(v * 1e4) / 1e4);

it("exports each part as its own mesh, Y-up, in meters", async () => {
  const assembly = await twoBoxes();
  const result = await runTool(
    "export_geometry",
    { atom: assembly, format: "GLB" },
    READ,
  );
  expect(result.filename).toMatch(/\.glb$/);
  const bytes = Uint8Array.from(atob(result.base64), (c) => c.charCodeAt(0));
  expect(new TextDecoder().decode(bytes.slice(0, 4))).toBe("glTF");

  const { scene, meshes } = await parseGLB(bytes.buffer);
  expect(meshes).toHaveLength(2);
  // Normals are kept so viewers outside Abundance shade the model
  meshes.forEach((m) => expect(m.geometry.attributes.normal).toBeDefined());
  // Each part keeps its color
  const colors = meshes.map((m) => "#" + m.material.color.getHexString());
  expect(colors).toContain("#fc1010");
  expect(new Set(colors).size).toBe(2);
  // 10 x 20 x 30 mm boxes, 100 mm apart: CAD Z (height) is glTF Y, and CAD
  // Y is glTF -Z. No transform is left on the nodes.
  meshes.forEach((m) => expect(size(m)).toEqual([0.01, 0.03, 0.02]));
  expect(size(scene)).toEqual([0.11, 0.03, 0.02]);
  scene.traverse((o) => {
    expect(o.scale.toArray()).toEqual([1, 1, 1]);
    expect(o.rotation.toArray().slice(0, 3)).toEqual([0, 0, 0]);
  });
  const box3 = new THREE.Box3().setFromObject(scene);
  expect(box3.min.y).toBeCloseTo(0, 6);
});

it("scales inch projects to meters", async () => {
  GlobalVariables.topLevelMolecule.unitsKey = "Inches";
  const part = await box();
  await settle();
  const blob = await exportGeometryAsGLB(
    resolveAtom(part).value,
    "Inches",
    resolveAtom(part).getContext(),
    0.002,
  );
  const { scene } = await parseGLB(await blob.arrayBuffer());
  expect(size(scene)).toEqual([0.254, 0.762, 0.508]);
});

it("leaves out keep-outs", async () => {
  const part = await box();
  const keepOut = await box();
  const tag = await colored(keepOut, "Keep Out");
  const assembly = await add("Assembly");
  await connect(part, assembly, "Shape1");
  await connect(tag, assembly, "Shape2");
  await setParam(assembly, "makeDisjoint", false);
  await settle();
  const atom = resolveAtom(assembly);
  const blob = await exportGeometryAsGLB(
    atom.value,
    "MM",
    atom.getContext(),
    0.05,
  );
  const { meshes } = await parseGLB(await blob.arrayBuffer());
  expect(meshes).toHaveLength(1);
});
