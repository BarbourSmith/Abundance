import React, { useMemo } from 'react';
import * as THREE from 'three';

/**
 * GridDirectionalOverlay component that adds darker grid lines in +X and +Y directions
 * on top of the existing grid to make the origin and axis directions more clear.
 * 
 * This component renders directly in the world coordinate system to ensure
 * perfect alignment with the main grid (which is in the XZ plane at Y=0).
 */
export default function GridDirectionalOverlay({
  cellSize = 100,
  args = [10000, 10000],
  cellColor = "#726482",
  sectionSize = 1000,
}) {
  const [width, height] = args;
  
  const gridGeometries = useMemo(() => {
    const geometries = {
      // Darker lines in positive X direction
      posXLines: new THREE.BufferGeometry(),
      // Darker lines in positive Z direction (which is +Y in the grid's local space)
      posZLines: new THREE.BufferGeometry(),
    };

    const posXVertices = [];
    const posZVertices = [];

    const halfWidth = width / 2;
    const halfHeight = height / 2;

    // Render directly in world space (XZ plane at Y=0)
    // Since the grid is rotated to be in the XZ plane, we create lines there directly
    
    // Generate lines parallel to Z-axis in POSITIVE X direction
    for (let x = cellSize; x <= halfWidth; x += cellSize) {
      // Skip section lines
      if (Math.abs(x % sectionSize) < 0.01) continue;
      
      // Line in world XZ plane at Y=0
      posXVertices.push(x, 0, -halfHeight);
      posXVertices.push(x, 0, halfHeight);
    }

    // Generate lines parallel to X-axis in POSITIVE Z direction
    for (let z = cellSize; z <= halfHeight; z += cellSize) {
      // Skip section lines
      if (Math.abs(z % sectionSize) < 0.01) continue;
      
      // Line in world XZ plane at Y=0
      posZVertices.push(-halfWidth, 0, z);
      posZVertices.push(halfWidth, 0, z);
    }

    geometries.posXLines.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(posXVertices, 3)
    );
    geometries.posZLines.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(posZVertices, 3)
    );

    return geometries;
  }, [width, height, cellSize, sectionSize]);

  // Calculate darker color for positive directions
  const darkerCellColor = useMemo(() => {
    const color = new THREE.Color(cellColor);
    // Make it darker (multiply by 0.4 to make it noticeably darker)
    return '#' + color.clone().multiplyScalar(0.4).getHexString();
  }, [cellColor]);

  return (
    <group position={[0, 0, 0]}>
      {/* Darker lines in positive X direction */}
      <lineSegments geometry={gridGeometries.posXLines}>
        <lineBasicMaterial color={darkerCellColor} transparent opacity={0.6} />
      </lineSegments>
      
      {/* Darker lines in positive Z direction */}
      <lineSegments geometry={gridGeometries.posZLines}>
        <lineBasicMaterial color={darkerCellColor} transparent opacity={0.6} />
      </lineSegments>
    </group>
  );
}
