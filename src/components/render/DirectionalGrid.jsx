import React, { useMemo } from 'react';
import * as THREE from 'three';

/**
 * DirectionalGrid component that renders grid lines with darker colors in +X and +Y directions
 * to make the origin and axis directions more clear.
 */
export default function DirectionalGrid({
  position = [0, 0, 0],
  rotation = [0, 0, 0],
  cellSize = 100,
  args = [10000, 10000],
  cellColor = "#726482",
  sectionColor = "#BFA301",
  sectionSize = 1000,
  fadeDistance = 9000,
  fadeFrom = 0,
}) {
  const [width, height] = args;
  
  const gridGeometries = useMemo(() => {
    const geometries = {
      // Regular grid lines (in negative X and Y directions)
      regularLines: new THREE.BufferGeometry(),
      // Darker lines in positive X direction
      posXLines: new THREE.BufferGeometry(),
      // Darker lines in positive Y direction
      posYLines: new THREE.BufferGeometry(),
      // Section lines (major grid lines)
      sectionLines: new THREE.BufferGeometry(),
    };

    const regularVertices = [];
    const posXVertices = [];
    const posYVertices = [];
    const sectionVertices = [];

    const halfWidth = width / 2;
    const halfHeight = height / 2;

    // Generate horizontal lines (parallel to X-axis)
    for (let y = -halfHeight; y <= halfHeight; y += cellSize) {
      // Skip section lines, they'll be handled separately
      if (Math.abs(y % sectionSize) < 0.01) continue;
      
      // Determine if this line is in positive Y direction
      const isPosY = y > 0.01; // Small epsilon to avoid floating point issues
      const vertices = isPosY ? posYVertices : regularVertices;
      
      // Line from -halfWidth to halfWidth
      vertices.push(-halfWidth, y, 0);
      vertices.push(halfWidth, y, 0);
    }

    // Generate vertical lines (parallel to Y-axis)
    for (let x = -halfWidth; x <= halfWidth; x += cellSize) {
      // Skip section lines, they'll be handled separately
      if (Math.abs(x % sectionSize) < 0.01) continue;
      
      // Determine if this line is in positive X direction
      const isPosX = x > 0.01; // Small epsilon to avoid floating point issues
      const vertices = isPosX ? posXVertices : regularVertices;
      
      // Line from -halfHeight to halfHeight
      vertices.push(x, -halfHeight, 0);
      vertices.push(x, halfHeight, 0);
    }

    // Generate section lines (major grid lines)
    for (let y = -halfHeight; y <= halfHeight; y += sectionSize) {
      sectionVertices.push(-halfWidth, y, 0);
      sectionVertices.push(halfWidth, y, 0);
    }
    for (let x = -halfWidth; x <= halfWidth; x += sectionSize) {
      sectionVertices.push(x, -halfHeight, 0);
      sectionVertices.push(x, halfHeight, 0);
    }

    geometries.regularLines.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(regularVertices, 3)
    );
    geometries.posXLines.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(posXVertices, 3)
    );
    geometries.posYLines.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(posYVertices, 3)
    );
    geometries.sectionLines.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(sectionVertices, 3)
    );

    return geometries;
  }, [width, height, cellSize, sectionSize]);

  // Calculate darker colors for positive directions
  const darkerCellColor = useMemo(() => {
    const color = new THREE.Color(cellColor);
    // Make it darker (multiply by 0.5 to make it significantly darker)
    return '#' + color.multiplyScalar(0.5).getHexString();
  }, [cellColor]);

  return (
    <group position={position} rotation={rotation}>
      {/* Regular grid lines (negative directions) */}
      <lineSegments geometry={gridGeometries.regularLines}>
        <lineBasicMaterial color={cellColor} transparent opacity={0.5} />
      </lineSegments>
      
      {/* Darker lines in positive X direction */}
      <lineSegments geometry={gridGeometries.posXLines}>
        <lineBasicMaterial color={darkerCellColor} transparent opacity={0.8} />
      </lineSegments>
      
      {/* Darker lines in positive Y direction */}
      <lineSegments geometry={gridGeometries.posYLines}>
        <lineBasicMaterial color={darkerCellColor} transparent opacity={0.8} />
      </lineSegments>
      
      {/* Section lines (major grid lines) */}
      <lineSegments geometry={gridGeometries.sectionLines}>
        <lineBasicMaterial color={sectionColor} transparent opacity={0.8} />
      </lineSegments>
    </group>
  );
}
