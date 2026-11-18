import { BufferGeometry, Group, Mesh, MeshStandardMaterial } from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { syncFaces } from "replicad-threejs-helper";
import GlobalVariables from "./globalvariables.js";

/** Keep-out regions are clearance volumes, not parts, so they're left out. */
const KEEP_OUT_COLOR = "#D9544D";

/**
 * Build a binary glTF (GLB) with one colored mesh per part. The CAD data is
 * Z-up and glTF is Y-up, so the model is rotated to stand upright in glTF
 * viewers.
 *
 * @param {Array<{faces: object, color: string}>} parts - replicad face meshes
 * @param {object} [options]
 * @param {boolean} [options.keepNormals=true] - Store vertex normals. Viewers
 *   other than ours need them to shade the model smoothly.
 * @param {number} [options.scale=1] - Multiplies every coordinate, e.g. to
 *   convert project units to the meters glTF is defined in
 * @returns {Promise<ArrayBuffer>} The GLB file contents
 */
export async function partMeshesToGLB(
  parts,
  { keepNormals = true, scale = 1 } = {},
) {
  const root = new Group();
  root.name = "model";
  root.rotation.x = -Math.PI / 2;
  if (scale !== 1) root.scale.setScalar(scale);

  parts.forEach((part, index) => {
    const body = new BufferGeometry();
    syncFaces(body, part.faces);
    // Face groups only drive selection in the editor; drop them so the
    // exporter writes one primitive per part.
    body.clearGroups();
    if (!keepNormals) body.deleteAttribute("normal");
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
  });

  if (root.children.length === 0) {
    throw new Error("Nothing to export.");
  }

  // Bake the rotation and scale into the vertices so viewers see the model
  // at its real size without a transform on the root node.
  root.updateMatrixWorld(true);
  root.children.forEach((mesh) => mesh.geometry.applyMatrix4(mesh.matrixWorld));
  root.rotation.set(0, 0, 0);
  root.scale.setScalar(1);

  return new GLTFExporter().parseAsync(root, { binary: true });
}

/**
 * Build a GLB from the meshes the 3D view is displaying, leaving out
 * keep-outs. Used to make the curated models shown on the landing page.
 *
 * To keep files small, normals and edge lines aren't stored: they're about
 * half the size of the mesh, and the viewer rebuilds both when it loads the
 * model (see FeaturedModelViewer.jsx).
 *
 * @param {Array} displayMeshes - The rendering context's mesh array
 * @returns {Promise<ArrayBuffer>} The GLB file contents
 */
export async function displayMeshesToGLB(displayMeshes) {
  const parts = (displayMeshes || []).filter(
    (part) => part.color !== KEEP_OUT_COLOR && part.faces,
  );
  if (parts.length === 0) {
    throw new Error("Nothing is displayed to export.");
  }
  return partMeshesToGLB(parts, { keepNormals: false });
}

/**
 * Export geometry as a GLB for use outside Abundance: one colored mesh per
 * part, without keep-outs, scaled to meters as glTF defines its units.
 *
 * @param {object} geometry - The geometry to export (an AbundanceObject)
 * @param {string} units - The project's units key ("MM" or "Inches")
 * @param {object} context - The request context for the CAD worker
 * @param {number} [tolerance] - Max chordal deviation, in project units
 * @returns {Promise<Blob>} The GLB file
 */
export async function exportGeometryAsGLB(geometry, units, context, tolerance) {
  const parts = await GlobalVariables.cad.exportMeshes(
    geometry,
    context,
    tolerance,
  );
  const glb = await partMeshesToGLB(parts, {
    scale: units === "Inches" ? 0.0254 : 0.001,
  });
  return new Blob([glb], { type: "model/gltf-binary" });
}

/**
 * Export the displayed meshes as a GLB. On the dev server it's saved straight
 * to public/featured/models/ (see vite-plugins/saveFeaturedModel.js); elsewhere it's
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
