import * as THREE from "three";
import {
  syncFaces,
  syncLines,
  syncLinesFromFaces,
} from "replicad-threejs-helper";

/**
 * Generate a high-resolution PNG from mesh data returned by the worker
 * @param {Array} meshArray - Array of mesh objects from worker with { faces, edges, color, cameraZoom }
 * @param {number} width - Output width in pixels (default: 1000)
 * @param {number} height - Output height in pixels (default: 1000)
 * @param {object} [options]
 * @param {boolean} [options.fit] - Frame the part tightly using its bounding
 *   sphere, so any shape fills the image without clipping. Without it the
 *   original thumbnail framing is used.
 * @param {"iso"|"top"|"front"|"right"} [options.view] - Camera direction when
 *   `fit` is set. "iso" is a three-quarter view from the front right; the
 *   others look straight down an axis with Z up, matching the 3D view.
 * @returns {Promise<string>} Base64-encoded PNG data URL
 */
export async function generateMeshPNG(
  meshArray,
  width = 1000,
  height = 1000,
  options = {},
) {
  const view = options.view || "iso";
  if (!meshArray || !Array.isArray(meshArray) || meshArray.length === 0) {
    console.warn("No mesh data provided for PNG generation");
    return null;
  }

  try {
    // Create a temporary scene
    const scene = new THREE.Scene();
    scene.background = null; // Transparent background

    // Convert mesh data to Three.js objects using replicad-threejs-helper
    let cameraZoom = 1;
    const meshGroup = new THREE.Group();

    for (const m of meshArray) {
      // Store camera zoom from first mesh (they should all be the same)
      if (m.cameraZoom) cameraZoom = m.cameraZoom;

      // Skip point-only geometries for PNG generation
      if (m.point) continue;

      // Create geometry from mesh data
      const geometry = new THREE.BufferGeometry();

      // Use replicad-threejs-helper to populate geometry
      if (m.faces) {
        syncFaces(geometry, m.faces);
      }

      // Create material with proper color
      const material = new THREE.MeshStandardMaterial({
        color: m.color || "#888888",
        side: THREE.DoubleSide,
        metalness: 0.3,
        roughness: 0.7,
      });

      // Create mesh and add to group
      const mesh = new THREE.Mesh(geometry, material);
      meshGroup.add(mesh);

      // Add wireframe edges if they exist
      if (m.edges) {
        const edgeGeometry = new THREE.BufferGeometry();
        syncLines(edgeGeometry, m.edges);
        const edgeMaterial = new THREE.LineBasicMaterial({
          color: "#000000",
          linewidth: 1,
          transparent: true,
          opacity: 0.3,
        });
        const wireframe = new THREE.LineSegments(edgeGeometry, edgeMaterial);
        meshGroup.add(wireframe);
      }
    }

    scene.add(meshGroup);

    // Calculate camera position from bounding box
    const boundingBox = new THREE.Box3().setFromObject(meshGroup);
    const center = boundingBox.getCenter(new THREE.Vector3());
    const camera = options.fit
      ? fitCameraToBounds(boundingBox, center, width, height, view)
      : thumbnailCamera(boundingBox, center, width, height);

    // Add lighting to match ThreeContext
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.9);
    scene.add(ambientLight);

    // Directional light comes from the same direction as the camera
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.5);
    if (options.fit) {
      // Light from above and off to one side, not from the camera, so faces
      // at different angles get different shading and edges read clearly.
      const lightOffset = new THREE.Vector3(0.4, -0.8, 1.2)
        .normalize()
        .multiplyScalar(camera.position.distanceTo(center));
      directionalLight.position.copy(center).add(lightOffset);
    } else {
      directionalLight.position.copy(camera.position);
    }
    directionalLight.target.position.copy(center);
    scene.add(directionalLight);
    scene.add(directionalLight.target);

    // Create renderer with high quality settings
    const renderer = new THREE.WebGLRenderer({
      preserveDrawingBuffer: true,
      antialias: true,
      alpha: true,
      logarithmicDepthBuffer: true, // For proper depth precision
    });

    renderer.setSize(width, height);
    renderer.setPixelRatio(1);
    renderer.render(scene, camera);

    // Capture PNG
    const canvas = renderer.domElement;
    const dataURL = canvas.toDataURL("image/png", 0.7); // Match quality from useScreenshotCapture

    // Cleanup
    renderer.dispose();
    meshGroup.traverse((child) => {
      if (child.geometry) child.geometry.dispose();
      if (child.material) {
        if (Array.isArray(child.material)) {
          child.material.forEach((mat) => mat.dispose());
        } else {
          child.material.dispose();
        }
      }
    });

    return dataURL;
  } catch (error) {
    console.error("Error generating mesh PNG:", error);
    return null;
  }
}

const FOV_DEGREES = 75;
/** Narrower lens for fitted renders: less perspective stretch on compact parts. */
const FIT_FOV_DEGREES = 30;

/** The original project-thumbnail camera: fixed angle, generous padding. */
function thumbnailCamera(boundingBox, center, width, height) {
  const size = boundingBox.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z) * 2.2; // Add padding

  // Use near/far planes calculated from bounding box to prevent clipping
  const distance = maxDim * 1.5;
  const near = Math.max(0.1, distance - maxDim * 2);
  const far = distance + maxDim * 2;
  const camera = new THREE.PerspectiveCamera(
    FOV_DEGREES,
    width / height,
    near,
    far,
  );

  // Position camera to look at the mesh center from a raised angle
  camera.position.set(
    center.x + maxDim * 0.8,
    center.y + maxDim * 0.2,
    center.z + maxDim * 0.26,
  );
  camera.lookAt(center);

  // Calculate appropriate zoom to frame the mesh properly
  // This ensures consistent sizing compared to useScreenshotCapture
  const vFOV = (camera.fov * Math.PI) / 180;
  const requiredDistance = Math.abs(maxDim / 2 / Math.tan(vFOV / 2));
  const actualDistance = camera.position.distanceTo(center);
  camera.zoom = actualDistance / requiredDistance;
  camera.updateProjectionMatrix();
  return camera;
}

const VIEW_DIRECTIONS = {
  // Three-quarter view from the front right, above, so a box shows three faces.
  iso: { dir: [1, -1, 0.8], up: [0, 0, 1] },
  top: { dir: [0, 0, 1], up: [0, 1, 0] },
  front: { dir: [0, -1, 0], up: [0, 0, 1] },
  right: { dir: [1, 0, 0], up: [0, 0, 1] },
};

/**
 * Place the camera so the part's bounding sphere just fits the narrower field
 * of view. Works for any proportions: a cube, a long beam, or a flat panel.
 */
function fitCameraToBounds(boundingBox, center, width, height, view) {
  const { dir, up } = VIEW_DIRECTIONS[view] || VIEW_DIRECTIONS.iso;
  const sphere = boundingBox.getBoundingSphere(new THREE.Sphere());
  const radius = Math.max(sphere.radius, 1e-6);
  const aspect = width / height;
  const vHalf = (FIT_FOV_DEGREES * Math.PI) / 360;
  const hHalf = Math.atan(Math.tan(vHalf) * aspect);
  const distance = (radius / Math.sin(Math.min(vHalf, hHalf))) * 1.05;

  const camera = new THREE.PerspectiveCamera(
    FIT_FOV_DEGREES,
    aspect,
    Math.max(distance - radius * 1.5, distance * 0.001),
    distance + radius * 1.5,
  );
  camera.up.set(...up);
  const offset = new THREE.Vector3(...dir).normalize().multiplyScalar(distance);
  camera.position.copy(center).add(offset);
  camera.lookAt(center);
  camera.updateProjectionMatrix();
  return camera;
}

/**
 * Extract base64 PNG data from a data URL (removes "data:image/png;base64," prefix)
 * @param {string} dataURL - Data URL from canvas.toDataURL()
 * @returns {string} Base64-encoded PNG data
 */
export function extractBase64FromDataURL(dataURL) {
  if (!dataURL || !dataURL.startsWith("data:")) {
    return dataURL;
  }
  return dataURL.split(",")[1];
}
