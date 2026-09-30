import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

const box = new THREE.Box3();
const sphere = new THREE.Sphere();
const viewDir = new THREE.Vector3();
const toCenter = new THREE.Vector3();

/**
 * Fits the camera's near and far planes around everything in the scene each
 * frame. Fixed planes clip large models (parts meters long in a millimeter
 * project) once they reach past the camera, which sits a fixed distance from
 * the orbit target. The orthographic camera allows a negative near plane, so
 * geometry behind the camera position still renders.
 */
export default function CameraClipping() {
  useFrame(({ scene, camera }) => {
    box.setFromObject(scene);
    if (box.isEmpty()) return;
    box.getBoundingSphere(sphere);

    camera.getWorldDirection(viewDir);
    const depth = toCenter
      .subVectors(sphere.center, camera.position)
      .dot(viewDir);
    const margin = Math.max(sphere.radius * 0.1, 1);
    let near = depth - sphere.radius - margin;
    const far = depth + sphere.radius + margin;
    if (!camera.isOrthographicCamera) near = Math.max(near, 0.1);

    if (camera.near !== near || camera.far !== far) {
      camera.near = near;
      camera.far = far;
      camera.updateProjectionMatrix();
    }
  }, -1);
  return null;
}
