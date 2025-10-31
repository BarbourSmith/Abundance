import React, { useState, useEffect } from "react";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader";
import * as THREE from "three";
import { Octokit } from "octokit";
import GlobalVariables from "../../js/globalvariables.js";

/**
 * BackgroundModel component renders a 3D model (GLB/GLTF format) as background context
 * for CAD modeling. The model is loaded from GitHub repository.
 */
export default function BackgroundModel({
  fileName,
  showModel,
  authorizedUserOcto,
}) {
  const [model, setModel] = useState(null);

  useEffect(() => {
    if (!fileName || !showModel) {
      setModel(null);
      return;
    }

    const loadModel = async () => {
      try {
        const octokit = authorizedUserOcto || new Octokit();

        const result = await octokit.rest.repos.getContent({
          owner: GlobalVariables.currentAWSnode.owner,
          repo: GlobalVariables.currentAWSnode.repoName,
          path: fileName,
        });

        let url;

        // For large files (>1MB), use download_url
        if (!result.data.content || result.data.content.length === 0) {
          const response = await fetch(result.data.download_url);
          const arrayBuffer = await response.arrayBuffer();
          const blob = new Blob([arrayBuffer], { type: "model/gltf-binary" });
          url = URL.createObjectURL(blob);
        } else {
          // For small files, use base64 content
          const base64String = result.data.content.replace(/\s/g, "");
          const binary = atob(base64String);
          const array = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++) {
            array[i] = binary.charCodeAt(i);
          }
          const blob = new Blob([array], { type: "model/gltf-binary" });
          url = URL.createObjectURL(blob);
        }

        // Load the GLTF model
        const loader = new GLTFLoader();
        loader.load(url, (gltf) => {
          if (gltf.scene) {
            const clonedScene = gltf.scene.clone();

            // Scale based on project units (assume model is in meters)
            let scaleFactor = 1;
            if (GlobalVariables.topLevelMolecule?.unitsKey === "MM") {
              scaleFactor = 1000; // meters to millimeters
            } else if (
              GlobalVariables.topLevelMolecule?.unitsKey === "Inches"
            ) {
              scaleFactor = 39.3701; // meters to inches
            }
            clonedScene.scale.set(scaleFactor, scaleFactor, scaleFactor);

            // Center and position the model
            const box = new THREE.Box3().setFromObject(clonedScene);
            const center = box.getCenter(new THREE.Vector3());
            clonedScene.position.set(-center.x, -center.y, -center.z);

            // Rotate 90 degrees around X-axis
            clonedScene.rotation.x = Math.PI / 2;

            // Position entirely in positive Z-axis, centered in Y
            const rotatedBox = new THREE.Box3().setFromObject(clonedScene);
            const minZ = rotatedBox.min.z;
            const centerY = rotatedBox.getCenter(new THREE.Vector3()).y;
            clonedScene.position.z -= minZ;
            clonedScene.position.y -= centerY;

            // Ensure materials are visible
            clonedScene.traverse((child) => {
              if (child.material) {
                child.material.transparent = false;
                child.material.opacity = 1.0;
              }
            });

            setModel(clonedScene);
          }
          URL.revokeObjectURL(url);
        });
      } catch (error) {
        console.warn("Failed to load background model:", error);
      }
    };

    loadModel();
  }, [fileName, showModel, authorizedUserOcto]);

  if (!showModel || !model) {
    return null;
  }

  return <primitive object={model} renderOrder={-1} />;
}
