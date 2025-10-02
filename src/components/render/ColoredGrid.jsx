import React, { useMemo } from "react";
import * as THREE from "three";

/**
 * ColoredGrid component
 * A custom grid that uses different colors to indicate axis directions:
 * - Lines parallel to X-axis are tinted red
 * - Lines parallel to Y-axis are tinted green
 * - The origin intersection is highlighted
 * 
 * This provides subtle visual cues about orientation without adding 3D elements.
 */
const ColoredGrid = ({ 
  position = [0, 0, 0], 
  cellSize = 100, 
  gridSize = 10000, 
  rotation = [0, 0, 0],
  cellColor = "#726482",
  sectionColor = "#BFA301",
  sectionSize = 1000,
  fadeDistance = 9000,
  fadeFrom = 0
}) => {
  const { xGeometry, yGeometry, originXGeometry, originYGeometry } = useMemo(() => {
    const halfSize = gridSize / 2;
    const divisions = gridSize / cellSize;
    
    // Create arrays to hold line vertices
    const xAxisLines = []; // Lines parallel to X (running left-right)
    const yAxisLines = []; // Lines parallel to Y (running front-back)
    const originXLine = []; // X-axis line through origin
    const originYLine = []; // Y-axis line through origin
    
    // Generate grid lines
    for (let i = -divisions / 2; i <= divisions / 2; i++) {
      const pos = i * cellSize;
      const isSection = Math.abs(i % (sectionSize / cellSize)) === 0;
      const isOrigin = i === 0;
      
      // Lines parallel to X-axis (running left-right, varying in Y)
      if (isOrigin) {
        originXLine.push(
          new THREE.Vector3(-halfSize, pos, 0),
          new THREE.Vector3(halfSize, pos, 0)
        );
      } else {
        xAxisLines.push(
          new THREE.Vector3(-halfSize, pos, 0),
          new THREE.Vector3(halfSize, pos, 0)
        );
      }
      
      // Lines parallel to Y-axis (running front-back, varying in X)
      if (isOrigin) {
        originYLine.push(
          new THREE.Vector3(pos, -halfSize, 0),
          new THREE.Vector3(pos, halfSize, 0)
        );
      } else {
        yAxisLines.push(
          new THREE.Vector3(pos, -halfSize, 0),
          new THREE.Vector3(pos, halfSize, 0)
        );
      }
    }
    
    // Create geometries from the line arrays
    return {
      xGeometry: new THREE.BufferGeometry().setFromPoints(xAxisLines),
      yGeometry: new THREE.BufferGeometry().setFromPoints(yAxisLines),
      originXGeometry: new THREE.BufferGeometry().setFromPoints(originXLine),
      originYGeometry: new THREE.BufferGeometry().setFromPoints(originYLine)
    };
  }, [cellSize, gridSize, sectionSize]);

  // Color scheme: subtle tints to indicate direction
  // X-axis lines (left-right) get a subtle red tint
  const xColor = "#A37A82"; // Red-tinted purple (blend of cellColor with red)
  // Y-axis lines (front-back) get a subtle green tint  
  const yColor = "#72857A"; // Green-tinted purple (blend of cellColor with green)
  // Origin lines are brighter and more saturated
  const originXColor = "#D96A76"; // Brighter red for X-axis through origin
  const originYColor = "#6FB080"; // Brighter green for Y-axis through origin

  return (
    <group position={position} rotation={rotation}>
      {/* X-axis direction lines (subtle red tint) */}
      <lineSegments geometry={xGeometry}>
        <lineBasicMaterial color={xColor} opacity={0.4} transparent />
      </lineSegments>
      
      {/* Y-axis direction lines (subtle green tint) */}
      <lineSegments geometry={yGeometry}>
        <lineBasicMaterial color={yColor} opacity={0.4} transparent />
      </lineSegments>
      
      {/* Origin X-axis line (brighter red) */}
      <lineSegments geometry={originXGeometry}>
        <lineBasicMaterial color={originXColor} opacity={0.8} transparent linewidth={2} />
      </lineSegments>
      
      {/* Origin Y-axis line (brighter green) */}
      <lineSegments geometry={originYGeometry}>
        <lineBasicMaterial color={originYColor} opacity={0.8} transparent linewidth={2} />
      </lineSegments>
    </group>
  );
};

export default ColoredGrid;
