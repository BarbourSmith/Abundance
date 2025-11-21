import React, { Suspense, useRef, useEffect, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { Wireframe, Grid, OrthographicCamera } from "@react-three/drei";
import * as THREE from "three";
import Controls from "./ThreeControls.jsx";
import BackgroundModel from "./BackgroundModel.jsx";
import globalvariables from "../../js/globalvariables.js";
import { useRendering, useAuth } from "../../contexts/index.js";

// We change the default orientation - threejs tends to use Y are the height,
// while replicad uses Z. This is mostly a representation default.

THREE.Object3D.DEFAULT_UP.set(0, 0, 1);

export default function ext({ children, cameraZoom, ...otherProps }) {
  const {
    outdatedMesh,
    gridParam,
    axesParam,
    backgroundUsdzFile,
    showBackgroundModel,
  } = useRendering();
  const { authorizedUserOcto } = useAuth();

  const dpr = Math.min(window.devicePixelRatio, 2);
  let backColor = outdatedMesh ? "#ababab" : "#f5f5f5";

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
  window.addEventListener("wheel", (e) => {
    if (cameraRef.current) {
      // Check if the zoom level change is greater than 5 points
      if (Math.abs(cameraRef.current.zoom - previousZoomLevel) > 3) {
        previousZoomLevel = cameraRef.current.zoom; // Update the previous zoom level
        setGridScale(50 / cameraRef.current.zoom);
      }
    }
  });

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
        onCreated={({ scene, camera, gl }) => {
          // Canvas initialization complete
        }}
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
        {gridParam ? (
          <Grid
            position={[0, 0, 0]}
            cellSize={cellSection}
            args={[10000, 10000]}
            cellColor={"#726482"}
            fadeFrom={0}
            lineColor={"#3b3a39"}
            sectionColor={"#3b3a39"}
            sectionThickness={0.5}
            fadeDistance={9000}
            rotation={[Math.PI / 2, 0, 0]}
            sectionSize={cellSection * 10}
          />
        ) : null}
        <Controls axesParam={axesParam} enableDamping={false}></Controls>

        {!outdatedMesh ? (
          <>
            <ambientLight intensity={0.5} />
            <directionalLight position={[5, 5, 5]} intensity={0.8} castShadow />
            <directionalLight position={[-5, -5, 5]} intensity={0.3} />
            <directionalLight position={[5, -5, -5]} intensity={0.2} />
          </>
        ) : (
          <ambientLight intensity={0.4} />
        )}

        {/* Background USDZ model - rendered behind CAD models */}
        {backgroundUsdzFile && showBackgroundModel ? (
          <BackgroundModel
            fileName={backgroundUsdzFile}
            showModel={showBackgroundModel}
            authorizedUserOcto={authorizedUserOcto}
          />
        ) : null}

        {children}
      </Canvas>
    </Suspense>
  );
}
