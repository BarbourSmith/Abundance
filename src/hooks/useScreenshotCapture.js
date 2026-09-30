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
export function useScreenshotCapture(onCaptureCallback) {
  const { scene, camera } = useThree();

  const captureHighResScreenshot = (width = 1000, height = 1000) => {
    try {
      // Step 1: Save visibility state and hide UI helper objects by name
      const visibilityState = new Map();
      const objectsToHide = ["grid"]; // Named objects to exclude from screenshot
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
        logarithmicDepthBuffer: true, // Enables accurate depth precision for perspective camera
      });
      tempRenderer.setSize(width, height);
      tempRenderer.setPixelRatio(1); // Disable automatic scaling for consistent resolution
      //tempRenderer.setClearColor(0xf5f5f5); // Match ThreeContext background

      // Step 3: Create a perspective camera matching the normal view
      const perspectiveCamera = new THREE.PerspectiveCamera(
        camera.fov || 75,
        width / height,
        // The viewport's orthographic camera may use a negative near plane,
        // which a perspective camera can't.
        Math.max(camera.near, 0.1),
        camera.far,
      );
      perspectiveCamera.position.copy(camera.position);
      perspectiveCamera.rotation.copy(camera.rotation);
      perspectiveCamera.quaternion.copy(camera.quaternion);
      perspectiveCamera.zoom = camera.zoom * 10;
      perspectiveCamera.updateProjectionMatrix();

      // Step 4: Render the scene with the temporary renderer and perspective camera
      tempRenderer.render(scene, perspectiveCamera);

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
