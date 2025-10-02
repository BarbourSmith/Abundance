import React, { useMemo } from 'react';
import * as THREE from 'three';

/**
 * GridDirectionalOverlay component that adds darker grid lines in +X and +Y directions
 * on top of the existing grid to make the origin and axis directions more clear.
 * 
 * This component is meant to be used alongside the standard Grid component,
 * not as a replacement. It only renders the directional highlighting lines.
 */
export default function GridDirectionalOverlay({
  position = [0, 0, 0],
  rotation = [0, 0, 0],
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
      // Darker lines in positive Y direction
      posYLines: new THREE.BufferGeometry(),
    };

    const posXVertices = [];
    const posYVertices = [];

    const halfWidth = width / 2;
    const halfHeight = height / 2;

    // Generate horizontal lines (parallel to X-axis) in POSITIVE Y direction only
    for (let y = cellSize; y <= halfHeight; y += cellSize) {
      // Skip section lines
      if (Math.abs(y % sectionSize) < 0.01) continue;
      
      // Line from -halfWidth to halfWidth in positive Y
      posYVertices.push(-halfWidth, y, 0);
      posYVertices.push(halfWidth, y, 0);
    }

    // Generate vertical lines (parallel to Y-axis) in POSITIVE X direction only
    for (let x = cellSize; x <= halfWidth; x += cellSize) {
      // Skip section lines
      if (Math.abs(x % sectionSize) < 0.01) continue;
      
      // Line from -halfHeight to halfHeight in positive X
      posXVertices.push(x, -halfHeight, 0);
      posXVertices.push(x, halfHeight, 0);
    }

    geometries.posXLines.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(posXVertices, 3)
    );
    geometries.posYLines.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(posYVertices, 3)
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
    <group position={position} rotation={rotation}>
      {/* Darker lines in positive X direction */}
      <lineSegments geometry={gridGeometries.posXLines}>
        <lineBasicMaterial color={darkerCellColor} transparent opacity={0.6} />
      </lineSegments>
      
      {/* Darker lines in positive Y direction */}
      <lineSegments geometry={gridGeometries.posYLines}>
        <lineBasicMaterial color={darkerCellColor} transparent opacity={0.6} />
      </lineSegments>
    </group>
  );
}
