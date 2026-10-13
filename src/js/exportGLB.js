import { BufferGeometry, Group, Mesh, MeshStandardMaterial } from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { syncFaces } from "replicad-threejs-helper";

/** Keep-out regions are clearance volumes, not parts, so they're left out. */
const KEEP_OUT_COLOR = "#D9544D";

/**
 * Build a binary glTF (GLB) from the meshes the 3D view is displaying: one
 * colored mesh per part, leaving out keep-outs. Used to make the curated
 * models shown on the landing page.
 *
 * To keep files small, normals and edge lines aren't stored: they're about
 * half the size of the mesh, and the viewer rebuilds both when it loads the
 * model (see FeaturedModelViewer.jsx).
 *
 * The CAD data is Z-up and glTF is Y-up, so the model is rotated to stand
 * upright in glTF viewers.
 *
 * @param {Array} displayMeshes - The rendering context's mesh array
 * @returns {Promise<ArrayBuffer>} The GLB file contents
 */
export async function displayMeshesToGLB(displayMeshes) {
  const root = new Group();
  root.name = "model";
  root.rotation.x = -Math.PI / 2;

  (displayMeshes || []).forEach((part, index) => {
    if (part.color === KEEP_OUT_COLOR) return;
    if (part.faces) {
      const body = new BufferGeometry();
      syncFaces(body, part.faces);
      // Face groups only drive selection in the editor; drop them so the
      // exporter writes one primitive per part.
      body.clearGroups();
      body.deleteAttribute("normal");
      const mesh = new Mesh(
        body,
        new MeshStandardMaterial({
          color: part.color,
          roughness: 0.8,
          metalness: 0,
        }),
      );
      mesh.name = `part-${index}`;
      root.add(mesh);
    }
  });

  if (root.children.length === 0) {
    throw new Error("Nothing is displayed to export.");
  }

  return new GLTFExporter().parseAsync(root, { binary: true });
}

/**
 * Export the displayed meshes as a GLB. On the dev server it's saved straight
 * to public/featured/ (see vite-plugins/saveFeaturedModel.js); elsewhere it's
 * downloaded.
 * @param {Array} displayMeshes - The rendering context's mesh array
 * @param {string} fileName - File name, without extension
 * @returns {Promise<{bytes: number, savedTo: string|null}>} The file size and,
 *   when saved on the dev server, its path in the repo
 */
export async function exportDisplayMeshesAsGLB(displayMeshes, fileName) {
  const glb = await displayMeshesToGLB(displayMeshes);

  if (import.meta.env.DEV) {
    const response = await fetch(
      `/__dev/featured-model?name=${encodeURIComponent(fileName)}`,
      { method: "POST", body: glb },
    );
    const result = await response.json();
    if (!response.ok) throw new Error(result.error);
    return { bytes: glb.byteLength, savedTo: result.path };
  }

  const url = URL.createObjectURL(
    new Blob([glb], { type: "model/gltf-binary" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = `${fileName}.glb`;
  link.click();
  URL.revokeObjectURL(url);
  return { bytes: glb.byteLength, savedTo: null };
}
