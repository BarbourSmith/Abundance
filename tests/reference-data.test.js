/**
 * Reference files (images, PDFs, 3D models) imported with Import atoms ride
 * along with geometry as side data: placed by Move and Rotate, shown with the
 * parts they're assembled with, never cut, and never sent to the CAD worker.
 * The CAD worker's functions run in-thread here, so geometry is real.
 *
 * Run: npx vitest run --config=vitest.headless.config.ts tests/reference-data.test.js
 */
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

vi.mock("comlink", async (importOriginal) => ({
  ...(await importOriginal()),
  wrap: (rawWorker) => rawWorker.__proxy,
}));

import * as THREE from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import "../src/prototypes/attachmentpoint.js";
import Molecule from "../src/molecules/molecule.js";
import GlobalVariables from "../src/js/globalvariables.js";
import { Status } from "../src/prototypes/observableEntity.js";
import { CadWorkerManager } from "../src/worker/cadWorkerManager.js";
import * as interaction from "../src/worker/interaction.ts";
import * as worker from "../src/worker/worker.ts";
import { flattenAssembly } from "../src/worker/util.ts";
import {
  SIDE_DATA_KEY,
  hasGeometry,
  isLabel,
  referenceBounds,
  referencesOf,
  sideDataOf,
} from "../src/js/sideData.js";
import { __test__, resolveAtom, runTool } from "../src/agent/runtime.js";
import { agentBridge } from "../src/agent/bridgeClient.js";

const EDIT = { mode: "edit" };
const READ = { mode: "read" };

// ---------------------------------------------------------------------------
// Test files
// ---------------------------------------------------------------------------

async function pngBytes(width, height) {
  const canvas = new OffscreenCanvas(width, height);
  const context = canvas.getContext("2d");
  context.fillStyle = "#ff0000";
  context.fillRect(0, 0, width, height);
  const blob = await canvas.convertToBlob({ type: "image/png" });
  return new Uint8Array(await blob.arrayBuffer());
}

/** A PDF with one A4 page per text. */
function pdfBytes(texts) {
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Kids [${texts.map((_, i) => `${4 + i * 2} 0 R`).join(" ")}] /Count ${texts.length} >>`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  texts.forEach((text, i) => {
    const stream = `BT /F1 24 Tf 72 720 Td (${text}) Tj ET`;
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.2756 841.8898] /Contents ${5 + i * 2} 0 R /Resources << /Font << /F1 3 0 R >> >> >>`,
      `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    );
  });
  let pdf = "%PDF-1.4\n";
  const offsets = objects.map((body, i) => {
    const offset = pdf.length;
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
    return offset;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.forEach((o) => (pdf += `${String(o).padStart(10, "0")} 00000 n \n`));
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(pdf);
}

/** A GLB holding a 1 x 2 x 3 m box whose bottom sits at y = 0 (glTF is Y-up). */
async function glbBytes() {
  const scene = new THREE.Scene();
  const box = new THREE.Mesh(
    new THREE.BoxGeometry(1, 2, 3),
    new THREE.MeshStandardMaterial({ color: "#888888" }),
  );
  box.position.set(0, 1, 0);
  scene.add(box);
  const buffer = await new GLTFExporter().parseAsync(scene, { binary: true });
  return new Uint8Array(buffer);
}

const toBase64 = (bytes) => btoa(String.fromCharCode(...bytes));

// ---------------------------------------------------------------------------
// Project setup
// ---------------------------------------------------------------------------

/** Every value the CAD worker was sent, to check no side data reaches it. */
let workerArgs;
let files;
let realCad;
let realFetch;

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
              workerArgs.push(...args);
              return api[method](...structuredClone(args));
            },
        },
      ),
    };
  }, 60_000);
}

beforeAll(async () => {
  await worker.started;
});

beforeEach(() => {
  workerArgs = [];
  files = {};
  realCad = GlobalVariables.cad;
  realFetch = __test__.fetchers.publicFile;
  const canvas = document.createElement("canvas");
  GlobalVariables.canvas = { current: canvas };
  GlobalVariables.c = canvas.getContext("2d");
  GlobalVariables.writeToDisplay = () => {};
  GlobalVariables.undoCommandStack = [];
  GlobalVariables.undoCaptureStack = null;
  GlobalVariables.currentAWSnode = { owner: "tester", repoName: "Proj" };
  GlobalVariables.cad = inThreadCad();
  // Import atoms fetch their files through this, as the editor does
  GlobalVariables.fetchFileContent = async (owner, repo, path) => {
    if (!files[path]) {
      throw Object.assign(new Error("Not Found"), { status: 404 });
    }
    return { data: { content: toBase64(files[path]), sha: `sha-${path}` } };
  };
  __test__.fetchers.publicFile = async () => {};
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
  GlobalVariables.fetchFileContent = undefined;
  GlobalVariables.uploadFile = undefined;
  agentBridge.saveHandler = null;
  GlobalVariables.undoCaptureStack = null;
  __test__.fetchers.publicFile = realFetch;
});

const settle = () => runTool("wait_for_settle", { timeout_ms: 30000 }, READ);
const add = async (type) => (await runTool("add_atom", { type }, EDIT)).id;
const connect = (from, to, input) =>
  runTool("connect", { from, to, input }, EDIT);
const setParam = (atom, param, value) =>
  runTool("set_param", { atom, param, value }, EDIT);
const valueOf = (id) => resolveAtom(id).value;

/** An Import atom loading `bytes` as `name` from the project's repository. */
async function importFile(name, bytes) {
  files[name] = bytes;
  const { id } = await runTool(
    "import_file",
    { url: `https://github.com/tester/Proj/blob/main/${name}` },
    EDIT,
  );
  await settle();
  const atom = resolveAtom(id);
  expect(atom.status, atom.alert?.message).toBe(Status.READY);
  return id;
}

/** A 10 x 10 x 10 box, centered on the Z axis, standing on the XY plane. */
async function box() {
  const rectangle = await add("Rectangle");
  await setParam(rectangle, "x length", 10);
  await setParam(rectangle, "y length", 10);
  const extrude = await add("Extrude");
  await connect(rectangle, extrude, "geometry");
  await setParam(extrude, "height", 10);
  return extrude;
}

// To 0.01, without -0
const round = (bounds) => ({
  min: bounds.min.map((v) => Math.round(v * 100) / 100 + 0),
  max: bounds.max.map((v) => Math.round(v * 100) / 100 + 0),
});

/** No value sent to the CAD worker carried side data, at any depth. */
function expectWorkerSawNoSideData() {
  const seen = JSON.stringify(workerArgs);
  expect(seen).not.toContain(SIDE_DATA_KEY);
}

// ---------------------------------------------------------------------------

describe("importing reference files", () => {
  it("loads an image flat on the XY plane, centered, about 100 mm wide", async () => {
    const id = await importFile("plan.png", await pngBytes(40, 20));
    const value = valueOf(id);
    expect(hasGeometry(value)).toBe(false);
    const [image] = referencesOf(value);
    expect(image).toMatchObject({
      kind: "image",
      name: "plan.png",
      pixels: [40, 20],
    });
    expect(round(referenceBounds(image))).toEqual({
      min: [-50, -25, 0],
      max: [50, 25, 0],
    });

    await setParam(id, "Width (mm)", 300);
    await settle();
    expect(round(referenceBounds(referencesOf(valueOf(id))[0]))).toEqual({
      min: [-150, -75, 0],
      max: [150, 75, 0],
    });
  });

  it("loads a PDF page at its printed size and switches pages", async () => {
    const id = await importFile(
      "datasheet.pdf",
      pdfBytes(["Bore diameter 12.5 mm", "Mounting holes M4"]),
    );
    const [page] = referencesOf(valueOf(id));
    expect(page).toMatchObject({ kind: "pdf", page: 1, pageCount: 2 });
    expect(round(referenceBounds(page))).toEqual({
      min: [-105, -148.5, 0],
      max: [105, 148.5, 0],
    });

    await setParam(id, "Page (of 2)", 2);
    await settle();
    expect(referencesOf(valueOf(id))[0].page).toBe(2);
  });

  it("loads a glTF model in meters, Y-up, into a millimeter Z-up project", async () => {
    const id = await importFile("scan.glb", await glbBytes());
    const [model] = referencesOf(valueOf(id));
    expect(model).toMatchObject({ kind: "model", stats: { meshes: 1 } });
    expect(round(referenceBounds(model))).toEqual({
      min: [-500, -1500, 0],
      max: [500, 1500, 2000],
    });

    await setParam(id, "File Units", "Millimeters");
    await settle();
    expect(round(referenceBounds(referencesOf(valueOf(id))[0]))).toEqual({
      min: [-0.5, -1.5, 0],
      max: [0.5, 1.5, 2],
    });
  });
});

describe("references in the graph", () => {
  it("are placed by Move and Rotate and never sent to the CAD worker", async () => {
    const image = await importFile("plan.png", await pngBytes(40, 20));
    const move = await add("Move");
    await connect(image, move, "geometry");
    await setParam(move, "xDist", 100);
    const rotate = await add("Rotate");
    await connect(move, rotate, "geometry");
    await setParam(rotate, "z-axis degrees", 90);
    await settle();

    // Moved to x = 100, then turned a quarter about the origin
    expect(round(referenceBounds(referencesOf(valueOf(rotate))[0]))).toEqual({
      min: [-25, 50, 0],
      max: [25, 150, 0],
    });
    expectWorkerSawNoSideData();
  });

  it("are shown with the parts they're assembled with, uncut", async () => {
    const image = await importFile("plan.png", await pngBytes(40, 20));
    const part = await box();
    const assembly = await add("Assembly");
    // A part in an earlier input is cut by later ones; the image cuts nothing
    await connect(part, assembly, "Shape1");
    await connect(image, assembly, "Shape2");
    await settle();

    const value = valueOf(assembly);
    expect(resolveAtom(assembly).status).toBe(Status.READY);
    expect(flattenAssembly(value)).toHaveLength(1);
    expect(referencesOf(value)).toHaveLength(1);
    const bounds = await GlobalVariables.cad.getBoundingBox(value, {
      project: GlobalVariables.topLevelMolecule.uniqueID,
    });
    expect(round(bounds)).toEqual({ min: [-5, -5, 0], max: [5, 5, 10] });
    expectWorkerSawNoSideData();

    const info = await runTool("get_atom", { atom: assembly }, READ);
    expect(info.output.part_count).toBe(1);
    expect(info.output.references).toEqual([
      expect.objectContaining({ index: 0, kind: "image", name: "plan.png" }),
    ]);
  });

  it("assemble on their own, without geometry", async () => {
    const plan = await importFile("plan.png", await pngBytes(40, 20));
    const sheet = await importFile("sheet.pdf", pdfBytes(["A"]));
    const assembly = await add("Assembly");
    await connect(plan, assembly, "Shape1");
    await connect(sheet, assembly, "Shape2");
    await settle();
    expect(resolveAtom(assembly).status).toBe(Status.READY);
    expect(referencesOf(valueOf(assembly)).map((r) => r.kind)).toEqual([
      "image",
      "pdf",
    ]);
  });

  it("don't take part in a Difference", async () => {
    const image = await importFile("plan.png", await pngBytes(40, 20));
    const part = await box();
    const cutByImage = await add("Difference");
    await connect(part, cutByImage, "retain");
    await connect(image, cutByImage, "remove");
    await settle();
    expect(flattenAssembly(valueOf(cutByImage))).toEqual(
      flattenAssembly(valueOf(part)),
    );
    // What was cut away isn't kept, references included
    expect(referencesOf(valueOf(cutByImage))).toEqual([]);
  });

  it("are picked out by tag", async () => {
    const image = await importFile("plan.png", await pngBytes(40, 20));
    const tagImage = await add("Tag");
    await connect(image, tagImage, "geometry");
    await setParam(tagImage, "Add Tag", "plan");
    const part = await box();
    const tagPart = await add("Tag");
    await connect(part, tagPart, "geometry");
    await setParam(tagPart, "Add Tag", "wood");
    const assembly = await add("Assembly");
    await connect(tagImage, assembly, "Shape1");
    await connect(tagPart, assembly, "Shape2");
    const extract = await add("ExtractTag");
    await connect(assembly, extract, "geometry");
    await settle();

    const atom = resolveAtom(extract);
    expect(atom.getTagList(valueOf(assembly))).toEqual(
      expect.arrayContaining(["plan", "wood"]),
    );
    atom.selectedTags = ["plan"];
    atom.onUpstreamChange();
    await settle();
    expect(hasGeometry(atom.value)).toBe(false);
    expect(referencesOf(atom.value)).toHaveLength(1);

    atom.selectedTags = ["wood"];
    atom.onUpstreamChange();
    await settle();
    expect(flattenAssembly(atom.value)).toHaveLength(1);
    expect(referencesOf(atom.value)).toEqual([]);
  });

  it("travel with labels, which still move with their geometry", async () => {
    const image = await importFile("plan.png", await pngBytes(40, 20));
    const part = await box();
    const label = await add("Label");
    await connect(part, label, "geometry");
    const assembly = await add("Assembly");
    await connect(label, assembly, "Shape1");
    await connect(image, assembly, "Shape2");
    const move = await add("Move");
    await connect(assembly, move, "geometry");
    await setParam(move, "zDist", 5);
    await settle();

    const items = sideDataOf(valueOf(move));
    expect(items.map((i) => i.type).sort()).toEqual(["Label", "Reference"]);
    const lab = items.find(isLabel);
    expect(lab.line.start[2]).toBe(5);
    expect(lab.line.end[2]).toBe(5);
    // Only labels become three.js objects on the atom
    expect(resolveAtom(move).nonReplicadGeom.geometry.length).toBeGreaterThan(
      0,
    );
    expectWorkerSawNoSideData();
  });
});

describe("agent tools", () => {
  it("get_reference returns the file, a PDF's text, and a picture", async () => {
    const bytes = pdfBytes(["Bore diameter 12.5 mm", "Mounting holes M4"]);
    const id = await importFile("datasheet.pdf", bytes);
    const result = await runTool("get_reference", { atom: id }, READ);
    expect(atob(result.base64)).toBe(new TextDecoder().decode(bytes));
    expect(result).toMatchObject({
      filename: "datasheet.pdf",
      page_count: 2,
      reference: { kind: "pdf", page: 1, page_count: 2 },
      source: "https://github.com/tester/Proj/blob/main/datasheet.pdf",
    });
    expect(result.page_text.map((p) => p.text)).toEqual([
      "Bore diameter 12.5 mm",
      "Mounting holes M4",
    ]);
    expect(result.preview.mimeType).toBe("image/png");

    const second = await runTool(
      "get_reference",
      { atom: id, pages: "2" },
      READ,
    );
    expect(second.page_text).toEqual([{ page: 2, text: "Mounting holes M4" }]);
  });

  it("render_image draws references, with or without geometry", async () => {
    const image = await importFile("plan.png", await pngBytes(40, 20));
    const alone = await runTool(
      "render_image",
      { atom: image, size: 128 },
      READ,
    );
    expect(alone).toMatchObject({ mimeType: "image/png", references_shown: 1 });
    expect(alone.base64.length).toBeGreaterThan(100);
  });

  it("import_file uploads a file from disk into the project", async () => {
    const uploads = [];
    // As in the editor, for a project the user can write to
    agentBridge.saveHandler = async () => ({ saved: true });
    GlobalVariables.uploadFile = async (file, atom) => {
      uploads.push(file.name);
      atom.updateFile(file, "sha-new");
      return { fileName: file.name, sha: "sha-new" };
    };
    const bytes = await pngBytes(40, 20);
    const result = await runTool(
      "import_file",
      { file_base64: toBase64(bytes), file_name: "photo.png" },
      EDIT,
    );
    await settle();
    expect(uploads).toEqual(["photo.png"]);
    expect(result).toMatchObject({
      file: "tester/Proj/photo.png",
      file_type: "PNG",
      uploaded: true,
    });
    const [image] = referencesOf(valueOf(result.id));
    expect(image).toMatchObject({ kind: "image", pixels: [40, 20] });
  });

  it("import_file without the editor's upload explains why", async () => {
    // Run mode can upload Input files, but has nowhere to save the project
    GlobalVariables.uploadFile = async () => ({});
    await expect(
      runTool(
        "import_file",
        { file_base64: "AAAA", file_name: "photo.png" },
        EDIT,
      ),
    ).rejects.toThrow(/needs the project open in the editor/);
  });
});
