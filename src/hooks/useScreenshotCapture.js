import { useThree } from "@react-three/fiber";
import * as THREE from "three";

/**
 * Custom hook to capture high-resolution screenshots of only the mesh geometry.
 * Excludes grid, axes, background models, and other helper objects.
 * Must be used inside a Canvas component from @react-three/fiber.
 *
 * @param {function} onCaptureCallback - Callback function called when screenshot is captured. Receives { dataUrl, projectName }
 * @returns {object} Object containing captureHighResScreenshot function
 *
 * Usage:
 *   const { captureHighResScreenshot } = useScreenshotCapture(onScreenshotCallback);
 *   captureHighResScreenshot(1000, 1000); // captures at default resolution
 */
/**
 * The x/y extent of every visible mesh and line, in the camera's view space.
 * Returns null when nothing with geometry is visible.
 */
function visibleBoundsInView(scene, camera) {
  camera.updateMatrixWorld();
  const bounds = new THREE.Box2();
  const box = new THREE.Box3();
  const corner = new THREE.Vector3();
  const toView = new THREE.Matrix4();
  scene.traverseVisible((obj) => {
    if (!(obj.isMesh || obj.isLine) || !obj.geometry) return;
    if (!obj.geometry.boundingBox) obj.geometry.computeBoundingBox();
    box.copy(obj.geometry.boundingBox);
    if (box.isEmpty()) return;
    toView.multiplyMatrices(camera.matrixWorldInverse, obj.matrixWorld);
    for (let i = 0; i < 8; i++) {
      corner
        .set(
          i & 1 ? box.max.x : box.min.x,
          i & 2 ? box.max.y : box.min.y,
          i & 4 ? box.max.z : box.min.z,
        )
        .applyMatrix4(toView);
      bounds.expandByPoint(corner);
    }
  });
  return bounds.isEmpty() ? null : bounds;
}

export function useScreenshotCapture(onCaptureCallback) {
  const { scene, camera } = useThree();

  const captureHighResScreenshot = (width = 1000, height = 1000) => {
    try {
      // Step 1: Save visibility state and hide UI helper objects by name
      const visibilityState = new Map();
      const objectsToHide = ["grid", "origin"]; // Named objects to exclude from screenshot
      const typesToHide = ["AxesHelper", "GizmoHelper", "BackgroundModel"]; // Types of objects to exclude
      scene.background = null; // Set background to transparent for screenshot
      scene.traverse((obj) => {
        visibilityState.set(obj, obj.visible);
        // Hide objects by name
        if (objectsToHide.includes(obj.name)) {
          obj.visible = false;
        }

        // Hide objects by type
        if (typesToHide.includes(obj.type)) {
          obj.visible = false;
        }
      });

      // Step 2: Create a temporary renderer with high resolution
      const tempRenderer = new THREE.WebGLRenderer({
        preserveDrawingBuffer: true,
        antialias: true,
        alpha: true,
      });
      tempRenderer.setSize(width, height);
      tempRenderer.setPixelRatio(1); // Disable automatic scaling for consistent resolution
      //tempRenderer.setClearColor(0xf5f5f5); // Match ThreeContext background

      // Step 3: Copy the viewport camera so the thumbnail has the same angle
      // and projection as the screen, then crop the frame to the model.
      const shotCamera = camera.clone();
      const aspect = width / height;
      const bounds = visibleBoundsInView(scene, camera);
      if (camera.isOrthographicCamera && bounds) {
        const margin = 1.1;
        const centerX = (bounds.min.x + bounds.max.x) / 2;
        const centerY = (bounds.min.y + bounds.max.y) / 2;
        const boundsWidth = bounds.max.x - bounds.min.x;
        const boundsHeight = bounds.max.y - bounds.min.y;
        const halfWidth =
          (Math.max(boundsWidth, boundsHeight * aspect) * margin) / 2;
        const halfHeight = halfWidth / aspect;
        // View-space units; zoom 1 so the frame is exactly these bounds.
        shotCamera.zoom = 1;
        shotCamera.left = centerX - halfWidth;
        shotCamera.right = centerX + halfWidth;
        shotCamera.top = centerY + halfHeight;
        shotCamera.bottom = centerY - halfHeight;
      } else if (!camera.isOrthographicCamera) {
        shotCamera.aspect = aspect;
      }
      shotCamera.updateProjectionMatrix();

      // Step 4: Render the scene with the temporary renderer
      tempRenderer.render(scene, shotCamera);

      // Step 5: Restore visibility state of all objects
      visibilityState.forEach((visible, obj) => {
        obj.visible = visible;
      });

      // Step 6: Capture the temporary canvas
      const canvas = tempRenderer.domElement;
      const dataURL = canvas.toDataURL("image/png", 0.7); // Use 0.5 quality for PNG to reduce file size

      //download the image automatically
      // const link = document.createElement("a");
      // link.href = dataURL;
      // link.download = "screenshot.png";
      // document.body.appendChild(link);
      // link.click();
      // document.body.removeChild(link);

      // Step 7: Cleanup and trigger dialog via callback
      tempRenderer.dispose();

      // Call the callback with the screenshot data
      if (onCaptureCallback) {
        onCaptureCallback(dataURL);
      }
    } catch (error) {
      console.error("Error in captureHighResScreenshot:", error);
      return null;
    }
  };

  return { captureHighResScreenshot };
}
