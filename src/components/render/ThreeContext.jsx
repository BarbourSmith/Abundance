import React, { Suspense, useEffect } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { Stage } from "@react-three/drei";
import * as THREE from "three";
import InfiniteGrid from "./InfiniteGrid.jsx";
import Controls from "./ThreeControls.jsx";

THREE.Object3D.DEFAULT_UP.set(0, 0, 1);

export default function Ext({ children, ...props }) {
  const dpr = Math.min(window.devicePixelRatio, 2);

  let backColor = props.outdatedMesh ? "#ababab" : "#f5f5f5";

  const AdjustCamera = () => {
    const { camera, scene } = useThree();

    useEffect(() => {
      camera.updateProjectionMatrix();
      camera.lookAt(scene.position);
      // Optionally, you can use a bounding box to fit the camera to the content
      const box = new THREE.Box3().setFromObject(scene);
      const size = box.getSize(new THREE.Vector3()).length();
      const center = box.getCenter(new THREE.Vector3());

      camera.near = size / 100;
      camera.far = size * 100;
      camera.position.copy(center);
      camera.position.x += size / 2.0;
      camera.position.y += size / 2.0;
      camera.position.z += size / 2.0;
      camera.lookAt(center);
    }, [children, scene, camera]);

    return null;
  };

  return (
    <Suspense fallback={null}>
      <Canvas
        id="threeCanvas"
        style={{
          backgroundColor: backColor,
        }}
        dpr={dpr}
        frameloop="demand"
        orthographic={true}
        shadows={true}
      >
        <Stage adjustCamera={true}>
          {props.gridParam ? <InfiniteGrid /> : null}
          <Controls axesParam={props.axesParam} enableDamping={false}></Controls>

          {!props.outdatedMesh ? (
            <ambientLight intensity={0.9} />
          ) : (
            <ambientLight intensity={0.4} />
          )}
          {children}
          <AdjustCamera />
        </Stage>
      </Canvas>
    </Suspense>
  );
}