import React, { Suspense, useRef, useEffect, useState, useCallback } from "react";
import { Canvas } from "@react-three/fiber";
import {
  Wireframe,
  Grid,
  OrthographicCamera,
} from "@react-three/drei";
import * as THREE from "three";
import Controls from "./ThreeControls.jsx";
import globalvariables from "../../js/globalvariables.js";

// We change the default orientation - threejs tends to use Y are the height,
// while replicad uses Z. This is mostly a representation default.

THREE.Object3D.DEFAULT_UP.set(0, 0, 1);

export default React.memo(function ThreeContext({ children, ...props }) {
  const dpr = Math.min(window.devicePixelRatio, 2);

  let cameraZoom = props.cameraZoom;
  let backColor = props.outdatedMesh ? "#ababab" : "#f5f5f5";

  const cameraRef = useRef();
  const [gridScale, setGridScale] = useState(10 / cameraZoom);

  const [cellSection, setCellSection] = useState(100);
  const [axesScale, setAxesScale] = useState(0.3);

  useEffect(() => {
    if (gridScale < 10) {
      setCellSection(1);
    } else if (gridScale < 100) {
      setCellSection(10);
    } else if (gridScale < 1000) {
      setCellSection(100);
    }
    setAxesScale(gridScale / 2);
  }, [gridScale, cameraZoom]);

  let previousZoomLevel = cameraZoom;
  
  // Memoize the wheel handler to prevent recreation on every render
  const handleWheel = useCallback((e) => {
    if (cameraRef.current) {
      // Check if the zoom level change is greater than 5 points
      if (Math.abs(cameraRef.current.zoom - previousZoomLevel) > 3) {
        previousZoomLevel = cameraRef.current.zoom; // Update the previous zoom level
        setGridScale(50 / cameraRef.current.zoom);
      }
    }
  }, []);

  useEffect(() => {
    window.addEventListener("wheel", handleWheel);
    return () => window.removeEventListener("wheel", handleWheel);
  }, [handleWheel]);

  return (
    <Suspense fallback={null}>
      <Canvas
        id="threeCanvas"
        style={{
          backgroundColor: backColor,
        }}
        dpr={dpr}
        frameloop="always"
        shadows={true}
      >
        <OrthographicCamera
          ref={cameraRef}
          makeDefault={true}
          near={0.1}
          pov={1000}
          far={90000}
          zoom={cameraZoom}
          position={[3000, 3000, 5000]}
        />
        {props.gridParam ? (
          <Grid
            position={[0, 0, 0]}
            cellSize={cellSection}
            args={[10000, 10000]}
            cellColor={"#726482"}
            fadeFrom={0}
            lineColor={"#BFA301"}
            sectionColor={"#BFA301"}
            fadeDistance={9000}
            rotation={[Math.PI / 2, 0, 0]}
            sectionSize={cellSection * 10}
          />
        ) : null}
        <Controls axesParam={props.axesParam} enableDamping={false}></Controls>

        {!props.outdatedMesh ? (
          <ambientLight intensity={0.9} />
        ) : (
          <ambientLight intensity={0.4} />
        )}
        {children}
      </Canvas>
    </Suspense>
  );
});
