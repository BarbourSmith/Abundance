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
  onTestFinished,
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
import { projectPoint } from "../src/agent/photoCamera.js";

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

/**
 * A GLB of a room as a scanner might leave it: a 4 x 3 m floor, 2.5 m walls
 * 10 cm thick around it, and a 1 x 0.5 m bench 0.45 m tall against one long
 * wall, all centered on the origin, then tilted 2°, turned 25° about the
 * vertical, and lifted 0.3 m. Built in glTF's axes: Y up, so the room's
 * length runs along X and its depth along glTF Z.
 */
async function roomGlbBytes() {
  const scene = new THREE.Scene();
  const room = new THREE.Group();
  const material = new THREE.MeshStandardMaterial({ color: "#888888" });
  const slab = (w, h, d, x, y, z) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(x, y, z);
    room.add(mesh);
  };
  slab(4, 0.02, 3, 0, -0.01, 0); // floor, top at y = 0
  slab(0.1, 2.5, 3.2, 2.05, 1.25, 0); // end walls, inner faces at x = ±2
  slab(0.1, 2.5, 3.2, -2.05, 1.25, 0);
  slab(4, 2.5, 0.1, 0, 1.25, 1.55); // long walls, inner faces at z = ±1.5
  slab(4, 2.5, 0.1, 0, 1.25, -1.55);
  slab(1, 0.45, 0.5, 0, 0.225, -1.25); // bench against the far long wall
  room.rotation.set((2 * Math.PI) / 180, (25 * Math.PI) / 180, 0, "YXZ");
  room.position.set(0, 0.3, 0);
  scene.add(room);
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

  it("have no geometry to intersect with", async () => {
    const image = await importFile("plan.png", await pngBytes(40, 20));
    const part = await box();
    const intersection = await add("Intersection");
    await connect(part, intersection, "geometry1");
    await connect(image, intersection, "geometry2");
    await settle();
    expect(resolveAtom(intersection).status).toBe(Status.READY);
    // The part meets nothing; the result carries the first input's side data
    expect(flattenAssembly(valueOf(intersection))).toEqual([]);
    expect(referencesOf(valueOf(intersection))).toEqual([]);
    expectWorkerSawNoSideData();
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

  /**
   * A 200 x 100 px picture: a red circle (radius 30 px, centered at pixel
   * 60, 50) and a smaller blue square (40 px, centered at 150, 50) on white.
   * Imported 100 mm wide, so 0.5 mm per pixel, then moved 100 mm along X and
   * turned a quarter about Z: the circle is centered at (0, 80) with radius
   * 15 mm, and the square at (0, 125), 20 mm on a side.
   */
  async function placedShapes() {
    const canvas = new OffscreenCanvas(200, 100);
    const context = canvas.getContext("2d");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, 200, 100);
    context.fillStyle = "#ff0000";
    context.beginPath();
    context.arc(60, 50, 30, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = "#0000ff";
    context.fillRect(130, 30, 40, 40);
    const blob = await canvas.convertToBlob({ type: "image/png" });
    const image = await importFile(
      "shapes.png",
      new Uint8Array(await blob.arrayBuffer()),
    );
    const move = await add("Move");
    await connect(image, move, "geometry");
    await setParam(move, "xDist", 100);
    const rotate = await add("Rotate");
    await connect(move, rotate, "geometry");
    await setParam(rotate, "z-axis degrees", 90);
    await settle();
    return rotate;
  }

  const expectNear = (actual, expected, within) =>
    actual.forEach((v, i) =>
      expect(Math.abs(v - expected[i])).toBeLessThan(within),
    );

  it("trace_reference traces a shape into points in project units", async () => {
    const atom = await placedShapes();

    // Without a point: the largest shape, the circle
    const circle = await runTool("trace_reference", { atom }, READ);
    expect(circle.mimeType).toBe("image/png");
    expect(circle.base64.length).toBeGreaterThan(100);
    expect(circle.flat).toBe(true);
    expect(Math.abs(circle.area / (Math.PI * 15 * 15) - 1)).toBeLessThan(0.03);
    expectNear(circle.bounding_box.min, [-15, 65], 1);
    expectNear(circle.bounding_box.max, [15, 95], 1);
    expect(circle.point_count).toBe(circle.points.length);
    // Counterclockwise, as Replicad expects a profile
    let twice = 0;
    circle.points.forEach(([x0, y0], i) => {
      const [x1, y1] = circle.points[(i + 1) % circle.points.length];
      twice += x0 * y1 - x1 * y0;
    });
    expect(twice).toBeGreaterThan(0);
    for (const [x, y] of circle.points) {
      expect(Math.abs(Math.hypot(x, y - 80) - 15)).toBeLessThan(1);
    }

    // A point picks the shape under it
    const square = await runTool(
      "trace_reference",
      { atom, point: [0, 125], spacing: 2 },
      READ,
    );
    expect(Math.abs(square.area / 400 - 1)).toBeLessThan(0.05);
    expectNear(square.bounding_box.min, [-10, 115], 1);
    expectNear(square.bounding_box.max, [10, 135], 1);
    expect(square.point_count).toBeGreaterThan(35);
    expect(square.point_count).toBeLessThan(45);

    // A color picks the shapes that match it
    const blue = await runTool(
      "trace_reference",
      { atom, color: "#0000ff" },
      READ,
    );
    expectNear(blue.bounding_box.min, [-10, 115], 1);

    await expect(
      runTool("trace_reference", { atom, point: [500, 500] }, READ),
    ).rejects.toThrow(/isn't on the reference/);
    await expect(
      runTool("trace_reference", { atom, color: "green" }, READ),
    ).rejects.toThrow(/hex color/);
  });

  it("view_reference zooms into a region with a grid in project units", async () => {
    const atom = await placedShapes();
    const whole = await runTool("view_reference", { atom, size: 512 }, READ);
    expect(whole).toMatchObject({ mimeType: "image/png", pixels: [256, 512] });

    const view = await runTool(
      "view_reference",
      { atom, region: { min: [-20, 60], max: [20, 100] } },
      READ,
    );
    expect(view).toMatchObject({
      mimeType: "image/png",
      pixels: [1024, 1024],
      grid: 5,
      pixels_per_unit: 25.6,
      region: { min: [-20, 60], max: [20, 100] },
    });
    const bitmap = await createImageBitmap(
      new Blob([Uint8Array.from(atob(view.base64), (c) => c.charCodeAt(0))]),
    );
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    canvas.getContext("2d").drawImage(bitmap, 0, 0);
    const pixel = (x, y) =>
      Array.from(canvas.getContext("2d").getImageData(x, y, 1, 1).data);
    // (1, 81) is inside the circle, next to the darker X = 0 line through
    // the middle of the view; (18, 98) is outside the circle
    expectNear(pixel(538, 486).slice(0, 3), [255, 0, 0], 30);
    expectNear(pixel(973, 51).slice(0, 3), [255, 255, 255], 30);
  });

  /** roomGlbBytes imported, then turned and moved as measure_scan says. */
  async function alignedRoom() {
    const scan = await importFile("room.glb", await roomGlbBytes());
    const measured = await runTool("measure_scan", { atom: scan }, READ);
    const rotate = await add("Rotate");
    await connect(scan, rotate, "geometry");
    for (const [param, value] of Object.entries(measured.to_align.rotate)) {
      await setParam(rotate, param, value);
    }
    const move = await add("Move");
    await connect(rotate, move, "geometry");
    for (const [param, value] of Object.entries(measured.to_align.move)) {
      await setParam(move, param, value);
    }
    await settle();
    return { scan, measured, aligned: move };
  }

  it("measure_scan levels and squares a scan and lists its surfaces", async () => {
    const { measured, aligned } = await alignedRoom();
    expect(measured.already_aligned).toBe(false);
    expect(Math.abs(measured.as_placed.floor_tilt_degrees - 2)).toBeLessThan(
      0.1,
    );
    expect(
      Math.abs(Math.abs(measured.as_placed.wall_angle_degrees) - 25),
    ).toBeLessThan(0.1);

    const after = await runTool("measure_scan", { atom: aligned }, READ);
    expect(after.already_aligned, JSON.stringify(after.as_placed)).toBe(true);
    expect(after.to_align).toBeNull();
    const { planes } = after.after_aligning;
    const near = (list, at, within = 3) =>
      list.find((p) => Math.abs(p.at - at) <= within);
    // The floor at 0 and the bench top at 450, the bench 1000 long
    expect(near(planes.facing_up, 0).area_m2).toBeGreaterThan(11);
    const bench = near(planes.facing_up, 450);
    expect(Math.abs(bench.area_m2 - 0.5)).toBeLessThan(0.02);
    expect(Math.abs(bench.x[1] - bench.x[0] - 1000)).toBeLessThan(40);
    // The inner faces of the walls face into the room, 4000 apart along X
    // and 3000 along Y. (Leveling turns about the origin, 300 below the
    // floor, so the room also shifts about 10 along Y.)
    const apart = (far, nearer, distance) =>
      far.some((p) =>
        nearer.some((q) => Math.abs(p.at - q.at - distance) <= 3),
      );
    expect(apart(planes.facing_minus_x, planes.facing_plus_x, 4000)).toBe(true);
    expect(apart(planes.facing_minus_y, planes.facing_plus_y, 3000)).toBe(true);
    // Under a floor slab isn't a ceiling
    expect(after.after_aligning.ceiling_height).toBeNull();
  });

  it("measure_scan refuses pictures", async () => {
    const image = await importFile("plan.png", await pngBytes(40, 20));
    await expect(
      runTool("measure_scan", { atom: image }, READ),
    ).rejects.toThrow(/this measures 3D models/);
  });

  it("section_view cuts through geometry and scans together", async () => {
    // Display meshes come from the mesh worker, which these tests don't run:
    // stand in a mesh of the 10 x 10 x 10 box box() builds
    const cube = new THREE.BoxGeometry(10, 10, 10).translate(0, 0, 5);
    const boxMesh = {
      faces: {
        vertices: Array.from(cube.attributes.position.array),
        triangles: Array.from(cube.index.array),
      },
      color: "#888888",
    };
    const realPool = GlobalVariables.pool;
    GlobalVariables.pool = {
      proxy: async () => ({
        generateDisplayMesh: async () => ({ mesh: [boxMesh] }),
        findInvalidParts: async (ids) => ({ checked: ids, invalid: [] }),
      }),
    };
    onTestFinished(() => {
      GlobalVariables.pool = realPool;
    });
    const { aligned } = await alignedRoom();
    const part = await box();
    const assembly = await add("Assembly");
    await connect(part, assembly, "Shape 1");
    await connect(aligned, assembly, "Shape2");
    await settle();

    const plan = await runTool(
      "section_view",
      { atom: assembly, axis: "z", at: 5, size: 512 },
      READ,
    );
    expect(plan).toMatchObject({
      mimeType: "image/png",
      cut: "z = 5",
      picture_axes: { right: "x", up: "y" },
    });
    expect(plan.geometry_segments).toBeGreaterThan(0);
    expect(plan.reference_segments).toBeGreaterThan(0);
    // The plan spans the room's walls, 4.2 x 3.2 m outside
    expectNear(plan.region.min, [-2100, -1600], 150);
    expectNear(plan.region.max, [2100, 1600], 150);

    // A section across x through the bench: its top at z = 450
    const section = await runTool(
      "section_view",
      {
        atom: aligned,
        axis: "x",
        at: 0,
        region: { min: [900, 0], max: [1600, 700] },
      },
      READ,
    );
    expect(section.picture_axes).toEqual({ right: "y", up: "z" });
    expect(section.geometry_segments).toBeUndefined();
    const bitmap = await createImageBitmap(
      new Blob([Uint8Array.from(atob(section.base64), (c) => c.charCodeAt(0))]),
    );
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    canvas.getContext("2d").drawImage(bitmap, 0, 0);
    const darkAt = (u, v) => {
      // Darkest pixel within 2 px of (u, v) in project units
      const x = Math.round((u - 900) * section.pixels_per_unit);
      const y = Math.round((700 - v) * section.pixels_per_unit);
      const data = canvas
        .getContext("2d")
        .getImageData(x - 2, y - 2, 5, 5).data;
      let darkest = 255;
      for (let i = 0; i < data.length; i += 4) {
        darkest = Math.min(darkest, data[i], data[i + 1], data[i + 2]);
      }
      return darkest < 100;
    };
    expect(darkAt(1200, 450)).toBe(true); // the bench top
    expect(darkAt(1200, 300)).toBe(false); // inside the bench

    await expect(
      runTool("section_view", { atom: aligned, axis: "z", at: 5000 }, READ),
    ).rejects.toThrow(/Nothing in .* crosses z = 5000/);
  });

  /**
   * A 1200 x 900 px photo taken from (500, -3000, 1500), looking at
   * (0, 0, 1200), with a 1000 px focal length, and the pixels where it sees
   * the corners of a 4 x 3 m room 2.5 m tall whose far wall is at y = 0.
   */
  async function roomPhoto() {
    const camera = {
      position: [500, -3000, 1500],
      focal: 1000,
      width: 1200,
      height: 900,
    };
    const forward = new THREE.Vector3(-500, 3000, -300).normalize();
    const right = new THREE.Vector3()
      .crossVectors(forward, new THREE.Vector3(0, 0, 1))
      .normalize();
    const down = new THREE.Vector3().crossVectors(forward, right);
    camera.rotation = [right.toArray(), down.toArray(), forward.toArray()];
    const corners = [];
    for (const x of [-2000, 2000]) {
      for (const z of [0, 2500]) {
        corners.push([x, 0, z], [x, -1500, z]);
      }
    }
    corners.push([0, 0, 450], [-1000, -800, 0]);
    const points = corners.map((at) => ({
      pixel: projectPoint(camera, at).slice(0, 2),
      at,
    }));
    const photo = await importFile("room.png", await pngBytes(1200, 900));
    return { camera, points, photo };
  }

  it("locate_photo finds the camera and stands the photo in front of it", async () => {
    const { points, photo } = await roomPhoto();
    const located = await runTool(
      "locate_photo",
      { atom: photo, points },
      READ,
    );
    expect(located.mimeType).toBe("image/jpeg");
    expectNear(located.camera.position, [500, -3000, 1500], 2);
    expect(Math.abs(located.camera.focal_px - 1000)).toBeLessThanOrEqual(1);
    expect(located.rms_px).toBeLessThan(0.2);
    expect(located.to_place.import).toEqual({ "Width (mm)": 1200 });

    // Placed as it says, the photo stands 1000 in front of the camera
    await setParam(photo, "Width (mm)", located.to_place.import["Width (mm)"]);
    const rotate = await add("Rotate");
    await connect(photo, rotate, "geometry");
    for (const [param, value] of Object.entries(located.to_place.rotate)) {
      await setParam(rotate, param, value);
    }
    const move = await add("Move");
    await connect(rotate, move, "geometry");
    for (const [param, value] of Object.entries(located.to_place.move)) {
      await setParam(move, param, value);
    }
    await settle();
    const [placed] = referencesOf(valueOf(move));
    const forward = [-500, 3000, -300].map(
      (v) => v / Math.hypot(500, 3000, 300),
    );
    const center = [500, -3000, 1500].map((v, i) => v + 1000 * forward[i]);
    expectNear(
      referenceBounds(placed).min.map(
        (v, i) => (v + referenceBounds(placed).max[i]) / 2,
      ),
      center,
      2,
    );

    // Measuring through it finds the far wall's points again
    const measured = await runTool(
      "photo_point",
      {
        atom: move,
        pixels: [points[0].pixel, points[8].pixel],
        axis: "y",
        at: 0,
      },
      READ,
    );
    expectNear(measured.camera_position, [500, -3000, 1500], 2);
    expectNear(measured.points[0].at, [-2000, 0, 0], 3);
    expectNear(measured.points[1].at, [0, 0, 450], 3);

    // An upright photo can still be viewed in its own pixels
    const view = await runTool(
      "view_reference",
      { atom: move, pixels: true, region: { min: [0, 0], max: [600, 450] } },
      READ,
    );
    expect(view).toMatchObject({ units: "pixels", pixels: [1024, 768] });
    await expect(
      runTool("view_reference", { atom: move }, READ),
    ).rejects.toThrow(/pixels: true/);
  });

  it("locate_photo uses a known focal length, and photo_point needs a placed photo", async () => {
    const { points, photo } = await roomPhoto();
    const located = await runTool(
      "locate_photo",
      { atom: photo, points: points.slice(0, 4), focal_px: 1000 },
      READ,
    );
    expectNear(located.camera.position, [500, -3000, 1500], 2);
    await expect(
      runTool(
        "locate_photo",
        { atom: photo, points: points.slice(0, 4) },
        READ,
      ),
    ).rejects.toThrow(/at least 5 points/);
    await expect(
      runTool(
        "photo_point",
        { atom: photo, pixels: [[600, 450]], axis: "y", at: 0 },
        READ,
      ),
    ).rejects.toThrow(/locate_photo first/);
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
