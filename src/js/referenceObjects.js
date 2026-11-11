/**
 * three.js objects that show references (images, PDF pages, 3D models; see
 * referenceFiles.js) in the 3D view and in rendered images.
 *
 * Decoded files (an image or PDF page texture, a model's scene) are shared by
 * every object that shows them, and kept for a while after the last one is
 * released, so clicking between atoms that carry the same scan doesn't decode
 * it again.
 */
import * as THREE from "three";
import { IDENTITY } from "./referenceItems.js";
import {
  disposeObject,
  getAsset,
  parseModel,
  pdfLayout,
  pdfPageOf,
  pixelsPerPage,
  registerAsset,
  renderPdfPage,
} from "./referenceFiles.js";

/** Decoded files no object uses that are kept for reuse. */
const MAX_IDLE_RESOURCES = 6;

/** key -> { promise, users } */
const resources = new Map();
/** Keys of resources no object uses, oldest first. */
const idle = [];

function resourceKey(item) {
  if (item.kind === "pdf") return `${item.asset}#${pdfPageOf(item) || "all"}`;
  if (item.kind === "model") {
    return `${item.asset}|${JSON.stringify(item.resources || {})}`;
  }
  return item.asset;
}

async function textureFrom(source) {
  const texture =
    source instanceof HTMLCanvasElement
      ? new THREE.CanvasTexture(source)
      : await new THREE.TextureLoader().loadAsync(source);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

/**
 * Keep the files the mesh worker sent with an item (from the geometry cache)
 * when this page hasn't read them itself, as when a project opens from its
 * cache.
 */
function registerItemFiles(item) {
  registerAsset(item.asset, item.file, {
    name: item.name,
    mimeType: item.mimeType,
  });
  for (const [path, assetId] of Object.entries(item.resources || {})) {
    registerAsset(assetId, item.resourceFiles?.[path], { name: path });
  }
}

async function loadResource(item) {
  registerItemFiles(item);
  if (item.kind === "model") {
    return { scene: await parseModel(item.asset, item.resources) };
  }
  if (item.kind === "pdf") {
    const page = pdfPageOf(item);
    if (page === 0) {
      // A texture per page, so a long document stays sharp
      const { pages } = await pdfLayout(item.asset, 0);
      const maxPixels = pixelsPerPage(pages.length);
      const textures = [];
      try {
        for (const { page: number, center, size } of pages) {
          const canvas = await renderPdfPage(item.asset, number, maxPixels);
          textures.push({ texture: await textureFrom(canvas), center, size });
        }
      } catch (err) {
        textures.forEach(({ texture }) => texture.dispose());
        throw err;
      }
      return { pages: textures };
    }
    return {
      texture: await textureFrom(await renderPdfPage(item.asset, page)),
    };
  }
  const asset = getAsset(item.asset);
  if (!asset) {
    throw new Error(`${item.name} isn't loaded yet.`);
  }
  const url = URL.createObjectURL(asset.blob);
  try {
    return { texture: await textureFrom(url) };
  } finally {
    URL.revokeObjectURL(url);
  }
}

function disposeResource(resource) {
  resource.texture?.dispose();
  resource.pages?.forEach(({ texture }) => texture.dispose());
  if (resource.scene) disposeObject(resource.scene);
}

function acquire(item) {
  const key = resourceKey(item);
  let entry = resources.get(key);
  if (!entry) {
    entry = { users: 0, promise: loadResource(item) };
    entry.promise.catch(() => {
      if (resources.get(key) === entry) resources.delete(key);
    });
    resources.set(key, entry);
  }
  entry.users++;
  const idleAt = idle.indexOf(key);
  if (idleAt >= 0) idle.splice(idleAt, 1);
  return { key, entry };
}

function release(key) {
  const entry = resources.get(key);
  if (!entry || --entry.users > 0) return;
  idle.push(key);
  while (idle.length > MAX_IDLE_RESOURCES) {
    const oldest = idle.shift();
    const evicted = resources.get(oldest);
    resources.delete(oldest);
    evicted?.promise.then(disposeResource, () => {});
  }
}

/**
 * Build the object showing a reference, placed by its matrix. Call release()
 * on the result when it's no longer shown.
 * @param {object} item - A reference item
 * @param {{opacity?: number}} [options] - Opacity multiplied into the item's
 * @returns {Promise<{object: THREE.Object3D, release: () => void}>}
 */
export async function createReferenceObject(item, { opacity = 1 } = {}) {
  const { key, entry } = acquire(item);
  let resource;
  try {
    resource = await entry.promise;
  } catch (err) {
    release(key);
    throw err;
  }

  const alpha = (item.opacity ?? 1) * opacity;
  const ownGeometries = [];
  const ownMaterials = [];
  const holder = new THREE.Group();
  holder.name = `reference ${item.name}`;
  holder.matrixAutoUpdate = false;
  holder.matrix.fromArray(item.matrix || IDENTITY);
  holder.matrixWorldNeedsUpdate = true;

  if (resource.texture || resource.pages) {
    const { min, max } = item.contentBounds;
    const z = (min[2] + max[2]) / 2;
    const planes = resource.pages || [
      {
        texture: resource.texture,
        center: [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2],
        size: [max[0] - min[0], max[1] - min[1]],
      },
    ];
    for (const { texture, center, size } of planes) {
      const geometry = new THREE.PlaneGeometry(size[0], size[1]);
      const material = new THREE.MeshBasicMaterial({
        map: texture,
        side: THREE.DoubleSide,
        transparent: alpha < 1,
        opacity: alpha,
        depthWrite: alpha >= 1,
        toneMapped: false,
        // Pushed back further than model faces (which use 2), so a face
        // lying on a plan shows on top of it
        polygonOffset: true,
        polygonOffsetFactor: 4,
        polygonOffsetUnits: 4,
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(center[0], center[1], z);
      holder.add(mesh);
      ownGeometries.push(geometry);
      ownMaterials.push(material);
    }
  } else {
    // Shares the decoded geometry and materials
    const scene = resource.scene.clone(true);
    if (alpha < 1) {
      const faded = (material) => {
        const copy = material.clone();
        copy.transparent = true;
        copy.opacity = (material.opacity ?? 1) * alpha;
        copy.depthWrite = false;
        ownMaterials.push(copy);
        return copy;
      };
      scene.traverse((child) => {
        if (!child.isMesh) return;
        child.material = Array.isArray(child.material)
          ? child.material.map(faded)
          : faded(child.material);
      });
    }
    holder.add(scene);
  }

  let released = false;
  return {
    object: holder,
    release() {
      if (released) return;
      released = true;
      ownGeometries.forEach((geometry) => geometry.dispose());
      ownMaterials.forEach((material) => material.dispose());
      release(key);
    },
  };
}

/**
 * Build objects for several references, skipping (and logging) any that
 * fail to load, such as a file whose Import atom hasn't loaded it.
 * @returns {Promise<{objects: THREE.Object3D[], release: () => void}>}
 */
export async function createReferenceObjects(items, options) {
  const settled = await Promise.allSettled(
    items.map((item) => createReferenceObject(item, options)),
  );
  const built = [];
  settled.forEach((result, i) => {
    if (result.status === "fulfilled") built.push(result.value);
    else console.warn(`Couldn't show ${items[i].name}:`, result.reason);
  });
  return {
    objects: built.map((b) => b.object),
    release: () => built.forEach((b) => b.release()),
  };
}
