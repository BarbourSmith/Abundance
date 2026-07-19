import * as THREE from 'three';

export function prepareBackgroundModelScene(scene, unitsKey) {
  const clonedScene = scene.clone();

  // Scale based on project units (assume model is authored in meters).
  let scaleFactor = 1;
  if (unitsKey === 'MM') {
    scaleFactor = 1000; // meters to millimeters
  } else if (unitsKey === 'Inches') {
    scaleFactor = 39.3701; // meters to inches
  }
  clonedScene.scale.set(scaleFactor, scaleFactor, scaleFactor);

  // Convert glTF's Y-up orientation into our Z-up scene without overwriting authored rotation.
  clonedScene.rotateOnWorldAxis(new THREE.Vector3(1, 0, 0), Math.PI / 2);

  // Ensure materials are visible.
  clonedScene.traverse((child) => {
    if (child.material) {
      child.material.transparent = false;
      child.material.opacity = 1.0;
    }
  });

  return clonedScene;
}
