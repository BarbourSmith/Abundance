/**
 * Reference files: images (PNG, JPG), PDF documents and 3D models (GLB, glTF)
 * that Import atoms bring into a project to model against, such as a floor
 * plan, a datasheet or a 3D scan. They become geometry leaves of type "Image",
 * "PDF" or "Model" (see src/worker/references.ts): shown in the 3D view and
 * placed with Move and Rotate like any geometry, but never cut or cutting.
 *
 * The CAD worker stores each file in the project's geometry cache. The main
 * thread keeps the files it has read in a store keyed by their SHA-256, to
 * decode them for display, read PDF text and so on; files it hasn't read
 * (a value shown from the cache) come from the mesh worker with the value.
 *
 * Placement when imported:
 * - Images and PDF pages lie flat on the XY plane, centered on the origin and
 *   read from above, at the width chosen on the Import atom (a PDF defaults
 *   to its printed page size).
 * - Models keep the position they have in the file, converted from the
 *   file's units (meters, the glTF standard, unless chosen otherwise) to the
 *   project's, and from glTF's Y-up to Abundance's Z-up.
 */
import * as THREE from "three";
import { LoadingManager } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import dracoWrapperUrl from "three/examples/jsm/libs/draco/draco_wasm_wrapper.js?url";
import dracoWasmUrl from "three/examples/jsm/libs/draco/draco_decoder.wasm?url";
import { millimetersPerUnit } from "./units.js";

/** Import atom file types that are references rather than geometry. */
export const REFERENCE_TYPES = Object.freeze({
  PNG: { kind: "image", extensions: ["png"], mimeType: "image/png" },
  JPG: { kind: "image", extensions: ["jpg", "jpeg"], mimeType: "image/jpeg" },
  PDF: { kind: "pdf", extensions: ["pdf"], mimeType: "application/pdf" },
  GLB: { kind: "model", extensions: ["glb"], mimeType: "model/gltf-binary" },
  GLTF: { kind: "model", extensions: ["gltf"], mimeType: "model/gltf+json" },
});

/** The geometryType of each kind of reference. */
export const GEOMETRY_TYPE_OF_KIND = Object.freeze({
  image: "Image",
  pdf: "PDF",
  model: "Model",
});

/** Units a model file can be in, with millimeters per unit. */
export const MODEL_UNITS = Object.freeze({
  Meters: 1000,
  Centimeters: 10,
  Millimeters: 1,
  Inches: 25.4,
  Feet: 304.8,
});

/** glTF files are in meters unless their author chose otherwise. */
export const DEFAULT_MODEL_UNITS = "Meters";

/** Whether an Import atom file type is a reference type. */
export function isReferenceType(type) {
  return Object.hasOwn(REFERENCE_TYPES, type);
}

/** The reference file type for a file extension (no dot), or undefined. */
export function referenceTypeForExtension(extension) {
  const wanted = String(extension).toLowerCase();
  return Object.keys(REFERENCE_TYPES).find((type) =>
    REFERENCE_TYPES[type].extensions.includes(wanted),
  );
}

// ---------------------------------------------------------------------------
// The asset store
// ---------------------------------------------------------------------------

/** id -> { blob, name, mimeType } */
const assets = new Map();

async function sha256Hex(buffer) {
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Keep a file's bytes and return their id, the hex SHA-256 of the bytes, so
 * the same file loaded twice is stored once.
 * @param {Blob|ArrayBuffer|Uint8Array} data
 * @param {{name?: string, mimeType?: string}} [info]
 * @returns {Promise<string>}
 */
export async function addAsset(data, { name, mimeType } = {}) {
  const blob =
    data instanceof Blob
      ? data
      : new Blob([data], { type: mimeType || "application/octet-stream" });
  const id = await sha256Hex(await blob.arrayBuffer());
  if (!assets.has(id)) {
    assets.set(id, {
      blob,
      name: name || "file",
      mimeType: mimeType || blob.type || "application/octet-stream",
    });
  }
  return id;
}

/**
 * Keep a file whose id is already known, such as one the mesh worker sent
 * from the geometry cache, without hashing it again.
 */
export function registerAsset(id, blob, { name, mimeType } = {}) {
  if (!id || !blob || assets.has(id)) return;
  assets.set(id, {
    blob,
    name: name || "file",
    mimeType: mimeType || blob.type || "application/octet-stream",
  });
}

/** A stored file, { blob, name, mimeType }, or undefined if not loaded. */
export function getAsset(id) {
  return assets.get(id);
}

function requireAsset(id) {
  const asset = assets.get(id);
  if (!asset) {
    throw new Error(
      "This reference file isn't loaded. Its Import atom loads it when it computes.",
    );
  }
  return asset;
}

// ---------------------------------------------------------------------------
// Images
// ---------------------------------------------------------------------------

/** An image's size in pixels, [width, height], as it is displayed. */
export async function imagePixels(blob) {
  const bitmap = await createImageBitmap(blob);
  try {
    return [bitmap.width, bitmap.height];
  } finally {
    bitmap.close();
  }
}

// ---------------------------------------------------------------------------
// PDF documents (pdf.js, loaded the first time a PDF is used)
// ---------------------------------------------------------------------------

let pdfjsPromise = null;

// The legacy build polyfills the newest JavaScript features pdf.js uses (such
// as Map.getOrInsertComputed), which many browsers don't have yet.
function pdfjs() {
  pdfjsPromise ??= Promise.all([
    import("pdfjs-dist/legacy/build/pdf.mjs"),
    import("pdfjs-dist/legacy/build/pdf.worker.min.mjs?url"),
  ]).then(([lib, worker]) => {
    lib.GlobalWorkerOptions.workerSrc = worker.default;
    return lib;
  });
  return pdfjsPromise;
}

/** asset id -> Promise of its pdf.js document */
const pdfDocuments = new Map();

/** The pdf.js document for a stored PDF. */
export function pdfDocument(id) {
  if (!pdfDocuments.has(id)) {
    const { blob } = requireAsset(id);
    const loading = pdfjs()
      .then(async (lib) => {
        const data = new Uint8Array(await blob.arrayBuffer());
        return lib.getDocument({ data }).promise;
      })
      .catch((err) => {
        pdfDocuments.delete(id);
        throw err;
      });
    pdfDocuments.set(id, loading);
  }
  return pdfDocuments.get(id);
}

/** Points (1/72 inch) to millimeters. */
const MM_PER_POINT = 25.4 / 72;

/**
 * A PDF page, checked to exist.
 * @param {number} page - 1-based page number
 */
async function pdfPage(id, page) {
  const doc = await pdfDocument(id);
  if (!Number.isInteger(page) || page < 1 || page > doc.numPages) {
    throw new Error(
      `This PDF has ${doc.numPages} page${doc.numPages === 1 ? "" : "s"}; there is no page ${page}.`,
    );
  }
  return { doc, page: await doc.getPage(page) };
}

/**
 * Draw a PDF page to a canvas whose longest side is about maxPixels.
 * @returns {Promise<HTMLCanvasElement>}
 */
export async function renderPdfPage(id, page, maxPixels = 3072) {
  const { page: pdfPageProxy } = await pdfPage(id, page);
  const unscaled = pdfPageProxy.getViewport({ scale: 1 });
  const scale = maxPixels / Math.max(unscaled.width, unscaled.height);
  const viewport = pdfPageProxy.getViewport({ scale });
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  // pdf.js paints the page white first, as it prints
  await pdfPageProxy.render({ canvas, viewport }).promise;
  return canvas;
}

/**
 * The text of a PDF's pages, for reading a datasheet. Pages are 1-based.
 * @param {string} id - Asset id
 * @param {number[]} [pages] - Pages to read; all when omitted
 * @returns {Promise<{page_count: number, pages: {page: number, text: string}[]}>}
 */
export async function pdfText(id, pages) {
  const doc = await pdfDocument(id);
  const wanted = pages?.length
    ? pages
    : Array.from({ length: doc.numPages }, (_, i) => i + 1);
  const result = [];
  for (const number of wanted) {
    const { page } = await pdfPage(id, number);
    const content = await page.getTextContent();
    const text = content.items
      .map((item) => (item.str ?? "") + (item.hasEOL ? "\n" : ""))
      .join("")
      .replace(/[ \t]+\n/g, "\n")
      .trim();
    result.push({ page: number, text });
  }
  return { page_count: doc.numPages, pages: result };
}

// ---------------------------------------------------------------------------
// 3D models (glTF)
// ---------------------------------------------------------------------------

// Draco-compressed meshes need the decoder three.js ships; the bundler gives
// its files hashed names, so map the names DRACOLoader asks for.
const dracoManager = new LoadingManager();
dracoManager.setURLModifier(
  (url) =>
    ({
      "draco_wasm_wrapper.js": dracoWrapperUrl,
      "draco_decoder.wasm": dracoWasmUrl,
    })[url] ?? url,
);
let dracoLoader = null;

/**
 * Parse a stored glTF or GLB file. A .gltf's other files (buffers, textures)
 * are given as `resources`, relative path -> asset id.
 * @returns {Promise<THREE.Group>} The file's scene, in its own units and axes
 */
export async function parseModel(id, resources = {}) {
  const { blob } = requireAsset(id);
  const manager = new LoadingManager();
  const urls = Object.entries(resources).map(([path, assetId]) => [
    path,
    URL.createObjectURL(requireAsset(assetId).blob),
  ]);
  const byPath = Object.fromEntries(urls);
  manager.setURLModifier((url) => byPath[decodeURI(url)] ?? byPath[url] ?? url);
  const loader = new GLTFLoader(manager);
  dracoLoader ??= new DRACOLoader(dracoManager);
  loader.setDRACOLoader(dracoLoader);
  loader.setMeshoptDecoder(MeshoptDecoder);
  try {
    const gltf = await loader.parseAsync(await blob.arrayBuffer(), "");
    const scene = gltf.scene || gltf.scenes?.[0];
    if (!scene) throw new Error("The file has no scene to show.");
    scene.updateMatrixWorld(true);
    return scene;
  } finally {
    urls.forEach(([, url]) => URL.revokeObjectURL(url));
  }
}

/**
 * The relative paths of the other files a .gltf loads (buffers and images),
 * leaving out data embedded in the file.
 * @param {string} text - The .gltf JSON
 */
export function gltfExternalFiles(text) {
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error("This .gltf file isn't valid JSON.");
  }
  const uris = [...(json.buffers || []), ...(json.images || [])]
    .map((entry) => entry.uri)
    .filter((uri) => uri && !uri.startsWith("data:"));
  return [...new Set(uris.map((uri) => decodeURI(uri)))];
}

/** Triangles and meshes in a model, to describe it. */
function modelStats(scene) {
  let meshes = 0;
  let triangles = 0;
  scene.traverse((child) => {
    if (!child.isMesh) return;
    meshes++;
    const geometry = child.geometry;
    const count = geometry.index
      ? geometry.index.count
      : geometry.attributes.position?.count || 0;
    triangles += Math.floor(count / 3);
  });
  return { meshes, triangles };
}

// ---------------------------------------------------------------------------
// Describing a file as a reference item
// ---------------------------------------------------------------------------

/** The default width of an image in a project's units: about 100 mm. */
export function defaultImageWidth(unitsKey) {
  return unitsKey === "Inches" ? 4 : 100;
}

/** A flat rectangle w by h, centered on the origin. */
function rectangleBounds(width, height) {
  return {
    min: [-width / 2, -height / 2, 0],
    max: [width / 2, height / 2, 0],
  };
}

/**
 * Describe a stored file as a reference: what the CAD worker's
 * importReference needs to make its leaf.
 *
 * The file's content is described in its own units (an image in pixels, a
 * PDF page in points, a model in its file units), and `placement` scales it
 * to the project's units, and turns a glTF's Y-up to Z-up, so that Move,
 * Rotate and unit conversion compose with it in the leaf's geometry id.
 *
 * @param {string} assetId - From addAsset
 * @param {object} options
 * @param {string} options.type - A key of REFERENCE_TYPES
 * @param {string} options.name - The file's name
 * @param {string} [options.unitsKey] - The project's units, "MM" or "Inches"
 * @param {number} [options.width] - Width of an image or PDF page, in project
 *   units. Defaults to about 100 mm for images and the printed size for PDFs.
 * @param {number} [options.page] - PDF page, from 1
 * @param {string} [options.modelUnits] - A key of MODEL_UNITS
 * @param {number} [options.opacity] - 0 to 1
 * @param {object} [options.resources] - A .gltf's other files, path -> asset id
 * @param {object} [options.source] - Where the file lives: { owner, repo, path, ref }
 * @returns {Promise<{geometryType: string, info: object, placement: {scale: number, rotation?: number[]}}>}
 */
export async function describeReferenceFile(assetId, options) {
  const { type, name, unitsKey, opacity = 1, source } = options;
  const fileType = REFERENCE_TYPES[type];
  if (!fileType) throw new Error(`${type} files aren't reference files.`);
  const { blob, mimeType } = requireAsset(assetId);
  const projectMM = millimetersPerUnit(unitsKey) || 1;
  const geometryType = GEOMETRY_TYPE_OF_KIND[fileType.kind];
  const info = {
    kind: fileType.kind,
    asset: assetId,
    name,
    mimeType: mimeType || fileType.mimeType,
    bytes: blob.size,
    opacity: Math.min(1, Math.max(0, Number(opacity) || 0)),
    ...(source ? { source } : {}),
  };

  if (fileType.kind === "image") {
    const pixels = await imagePixels(blob);
    const width =
      options.width > 0 ? options.width : defaultImageWidth(unitsKey);
    return {
      geometryType,
      info: {
        ...info,
        pixels,
        contentBounds: rectangleBounds(pixels[0], pixels[1]),
      },
      placement: { scale: width / pixels[0] },
    };
  }

  if (fileType.kind === "pdf") {
    const page = Number(options.page) || 1;
    const { doc, page: pdfPageProxy } = await pdfPage(assetId, page);
    const viewport = pdfPageProxy.getViewport({ scale: 1 });
    const printedWidth = (viewport.width * MM_PER_POINT) / projectMM;
    const width = options.width > 0 ? options.width : printedWidth;
    return {
      geometryType,
      info: {
        ...info,
        page,
        pageCount: doc.numPages,
        contentBounds: rectangleBounds(viewport.width, viewport.height),
      },
      placement: { scale: width / viewport.width },
    };
  }

  const modelUnits = Object.hasOwn(MODEL_UNITS, options.modelUnits)
    ? options.modelUnits
    : DEFAULT_MODEL_UNITS;
  const resources = options.resources || {};
  const scene = await parseModel(assetId, resources);
  const box = new THREE.Box3().setFromObject(scene);
  const stats = modelStats(scene);
  disposeObject(scene);
  if (box.isEmpty()) throw new Error("The model has nothing in it to show.");
  return {
    geometryType,
    info: {
      ...info,
      modelUnits,
      ...(Object.keys(resources).length ? { resources } : {}),
      stats,
      contentBounds: { min: box.min.toArray(), max: box.max.toArray() },
    },
    // File units to project units, then glTF's Y-up to Z-up
    placement: {
      scale: MODEL_UNITS[modelUnits] / projectMM,
      rotation: [90, 0, 0],
    },
  };
}

/** Free the GPU-side resources of a three.js object and its children. */
export function disposeObject(object) {
  object.traverse((child) => {
    child.geometry?.dispose?.();
    const materials = Array.isArray(child.material)
      ? child.material
      : child.material
        ? [child.material]
        : [];
    materials.forEach((material) => {
      Object.values(material).forEach((value) => {
        if (value?.isTexture) value.dispose();
      });
      material.dispose();
    });
  });
}
