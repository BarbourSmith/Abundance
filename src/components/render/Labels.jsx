import React from 'react';
import { Text, Line } from '@react-three/drei';
import * as THREE from 'three';

/**
 * Helper function to convert a flattened matrix array to a THREE.Matrix4
 * @param {Array} matrixArray - Flattened matrix array in column-major format
 * @returns {THREE.Matrix4} - THREE.Matrix4 object
 */
function arrayToMatrix4(matrixArray) {
  const matrix = new THREE.Matrix4();
  if (!matrixArray || matrixArray.length !== 16) {
    // Return identity matrix if invalid input
    return matrix;
  }
  
  // THREE.js expects the matrix elements in column-major format
  matrix.fromArray(matrixArray);
  return matrix;
}

/**
 * Component for rendering labels with lines in 3D space
 */
export default function Labels({ labels = [] }) {
  if (!labels || labels.length === 0) return null;

  return (
    <group>
      {labels.map((label, index) => {
        // Get the transformation matrix or create identity if none exists
        const transformMatrix = arrayToMatrix4(label.transformMatrix);
        
        // Default position and rotation if not provided
        // NOTE: We use the position/rotation for backward compatibility,
        // but prefer the transformation matrix if available
        const position = label.position || [0, 0, 0];
        const rotation = label.rotation || [0, 0, 0];
        const text = label.text || "Label";
        const length = label.length || 10;
        
        // Convert rotation from degrees to radians
        const rotationRadians = rotation.map(angle => angle * (Math.PI / 180));
        
        // Create a unique key for each label
        const key = `label-${index}-${text}`;
        
        // Extract position vector and quaternion from matrix if available
        const useMatrix = label.transformMatrix && label.transformMatrix.length === 16;
        
        if (useMatrix) {
          // When using matrix, we apply it directly to the group
          return (
            <group key={key} matrixAutoUpdate={false}>
              <primitive object={transformMatrix} attach="matrix" />
              
              {/* The line */}
              <Line
                points={[[0, 0, 0], [length, 0, 0]]}
                color="black"
                lineWidth={1}
              />
              
              {/* The text */}
              <Text
                position={[length / 2, 2, 0]}
                color="black"
                fontSize={2}
                anchorX="center"
                anchorY="middle"
                outlineWidth={0.1}
                outlineColor="white"
                material-toneMapped={false}
              >
                {text}
              </Text>
            </group>
          );
        } else {
          // Fallback to using position and rotation directly
          return (
            <group key={key} position={position} rotation={rotationRadians}>
              {/* The line */}
              <Line
                points={[[0, 0, 0], [length, 0, 0]]}
                color="black"
                lineWidth={1}
              />
              
              {/* The text */}
              <Text
                position={[length / 2, 2, 0]}
                color="black"
                fontSize={2}
                anchorX="center"
                anchorY="middle"
                outlineWidth={0.1}
                outlineColor="white"
                material-toneMapped={false}
              >
                {text}
              </Text>
            </group>
          );
        }
      })}
    </group>
  );
}