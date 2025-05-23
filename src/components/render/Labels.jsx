import React from 'react';
import { Text, Line } from '@react-three/drei';
import * as THREE from 'three';

/**
 * Component for rendering labels with lines in 3D space
 */
export default function Labels({ labels = [] }) {
  if (!labels || labels.length === 0) return null;

  return (
    <group>
      {labels.map((label, index) => {
        // Default position and rotation if not provided
        const position = label.position || [0, 0, 0];
        const rotation = label.rotation || [0, 0, 0];
        const text = label.text || "Label";
        const length = label.length || 10;
        
        // Calculate end point for the line based on length
        // By default, extend in the X direction
        const endPoint = [position[0] + length, position[1], position[2]];
        
        // Convert rotation from degrees to radians
        const rotationRadians = rotation.map(angle => angle * (Math.PI / 180));
        
        // Create a unique key for each label
        const key = `label-${index}-${text}`;
        
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
      })}
    </group>
  );
}