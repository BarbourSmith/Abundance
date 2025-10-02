import React from "react";

/**
 * GridOriginMarker component
 * Adds visual indicators to show the origin (0,0,0) and positive axis directions on the XY plane
 * - Red arrow for X+ direction
 * - Green arrow for Y+ direction  
 * - Golden sphere at the origin
 * 
 * The grid is in the XY plane with Z up (THREE.Object3D.DEFAULT_UP is set to [0,0,1])
 * The grid itself is rotated Math.PI/2 around X-axis for display.
 */
const GridOriginMarker = ({ cellSection }) => {
  // Calculate arrow dimensions based on grid scale
  const arrowLength = cellSection * 15; // 15 grid cells long
  const arrowHeadLength = cellSection * 3; // 3 grid cells
  const arrowHeadWidth = cellSection * 1.5; // 1.5 grid cells
  const shaftRadius = cellSection * 0.4; // Shaft thickness
  
  // Origin marker sphere size
  const originSphereRadius = cellSection * 2;

  return (
    <group>
      {/* X-axis arrow (Red) - pointing in positive X direction */}
      <group>
        {/* Arrow shaft - cylinder along X axis */}
        <mesh position={[arrowLength / 2, 0, 0]} rotation={[0, 0, -Math.PI / 2]}>
          <cylinderGeometry args={[shaftRadius, shaftRadius, arrowLength, 8]} />
          <meshBasicMaterial color="#ff0000" />
        </mesh>
        {/* Arrow head - cone at end */}
        <mesh position={[arrowLength, 0, 0]} rotation={[0, 0, -Math.PI / 2]}>
          <coneGeometry args={[arrowHeadWidth, arrowHeadLength, 8]} />
          <meshBasicMaterial color="#ff0000" />
        </mesh>
      </group>
      
      {/* Y-axis arrow (Green) - pointing in positive Y direction */}
      <group>
        {/* Arrow shaft - cylinder along Y axis */}
        <mesh position={[0, arrowLength / 2, 0]} rotation={[0, 0, 0]}>
          <cylinderGeometry args={[shaftRadius, shaftRadius, arrowLength, 8]} />
          <meshBasicMaterial color="#00ff00" />
        </mesh>
        {/* Arrow head - cone at end */}
        <mesh position={[0, arrowLength, 0]} rotation={[0, 0, 0]}>
          <coneGeometry args={[arrowHeadWidth, arrowHeadLength, 8]} />
          <meshBasicMaterial color="#00ff00" />
        </mesh>
      </group>
      
      {/* Origin marker - golden sphere at (0,0,0) */}
      <mesh position={[0, 0, 0]}>
        <sphereGeometry args={[originSphereRadius, 16, 16]} />
        <meshBasicMaterial color="#FFD700" opacity={0.9} transparent depthTest={false} />
      </mesh>
    </group>
  );
};

export default GridOriginMarker;
