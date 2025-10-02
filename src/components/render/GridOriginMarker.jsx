import React from "react";
import { Text } from "@react-three/drei";

/**
 * GridOriginMarker component
 * Adds visual indicators to show the origin (0,0,0) and positive axis directions on the XY plane
 * - Red arrow for X+ direction with "X+" label
 * - Green arrow for Y+ direction with "Y+" label
 * - Golden sphere at the origin marked as "Origin"
 * 
 * The grid is in the XY plane with Z up (THREE.Object3D.DEFAULT_UP is set to [0,0,1])
 * The grid itself is rotated Math.PI/2 around X-axis for display.
 */
const GridOriginMarker = ({ cellSection }) => {
  // Calculate arrow dimensions based on grid scale - make them more prominent
  const arrowLength = cellSection * 20; // 20 grid cells long (increased from 15)
  const arrowHeadLength = cellSection * 4; // 4 grid cells
  const arrowHeadWidth = cellSection * 2; // 2 grid cells
  const shaftRadius = cellSection * 0.5; // Shaft thickness (increased from 0.4)
  
  // Origin marker sphere size - make it more visible
  const originSphereRadius = cellSection * 2.5;
  
  // Label text size and position
  const labelSize = cellSection * 4;
  const labelOffset = cellSection * 3;

  return (
    <group>
      {/* X-axis arrow (Red) - pointing in positive X direction */}
      <group>
        {/* Arrow shaft - cylinder along X axis */}
        <mesh position={[arrowLength / 2, 0, 0]} rotation={[0, 0, -Math.PI / 2]}>
          <cylinderGeometry args={[shaftRadius, shaftRadius, arrowLength, 8]} />
          <meshStandardMaterial color="#ff0000" emissive="#ff0000" emissiveIntensity={0.3} />
        </mesh>
        {/* Arrow head - cone at end */}
        <mesh position={[arrowLength, 0, 0]} rotation={[0, 0, -Math.PI / 2]}>
          <coneGeometry args={[arrowHeadWidth, arrowHeadLength, 8]} />
          <meshStandardMaterial color="#ff0000" emissive="#ff0000" emissiveIntensity={0.3} />
        </mesh>
        {/* X+ label */}
        <Text
          position={[arrowLength + arrowHeadLength + labelOffset, 0, 0]}
          fontSize={labelSize}
          color="#ff0000"
          anchorX="center"
          anchorY="middle"
          depthTest={false}
          renderOrder={1000}
        >
          X+
        </Text>
      </group>
      
      {/* Y-axis arrow (Green) - pointing in positive Y direction */}
      <group>
        {/* Arrow shaft - cylinder along Y axis */}
        <mesh position={[0, arrowLength / 2, 0]} rotation={[0, 0, 0]}>
          <cylinderGeometry args={[shaftRadius, shaftRadius, arrowLength, 8]} />
          <meshStandardMaterial color="#00ff00" emissive="#00ff00" emissiveIntensity={0.3} />
        </mesh>
        {/* Arrow head - cone at end */}
        <mesh position={[0, arrowLength, 0]} rotation={[0, 0, 0]}>
          <coneGeometry args={[arrowHeadWidth, arrowHeadLength, 8]} />
          <meshStandardMaterial color="#00ff00" emissive="#00ff00" emissiveIntensity={0.3} />
        </mesh>
        {/* Y+ label */}
        <Text
          position={[0, arrowLength + arrowHeadLength + labelOffset, 0]}
          fontSize={labelSize}
          color="#00ff00"
          anchorX="center"
          anchorY="middle"
          depthTest={false}
          renderOrder={1000}
        >
          Y+
        </Text>
      </group>
      
      {/* Origin marker - golden sphere at (0,0,0) */}
      <mesh position={[0, 0, 0]}>
        <sphereGeometry args={[originSphereRadius, 32, 32]} />
        <meshStandardMaterial 
          color="#FFD700" 
          emissive="#FFD700" 
          emissiveIntensity={0.5}
          opacity={0.95} 
          transparent 
          depthTest={false}
          renderOrder={999}
        />
      </mesh>
      
      {/* Origin label */}
      <Text
        position={[0, 0, originSphereRadius + labelOffset]}
        fontSize={labelSize}
        color="#FFD700"
        anchorX="center"
        anchorY="middle"
        depthTest={false}
        renderOrder={1000}
      >
        Origin
      </Text>
    </group>
  );
};

export default GridOriginMarker;
