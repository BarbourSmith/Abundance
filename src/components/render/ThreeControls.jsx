import React from "react";
import { OrbitControls, GizmoHelper, GizmoViewport } from "@react-three/drei";
import * as THREE from "three";
import { useRendering } from "../../contexts";
import { useRef, useEffect, useState } from "react";

const Controls = React.memo(
  React.forwardRef(function Controls(
    { axesParam, enableDamping },
    controlsRef
  ) {
    const { plane, geometryType } = useRendering();
    const [extraPlane, setExtraPlane] = useState(false);

    // Example plane definition (replace with your actual plane)
    const examplePlane = {
      origin: [0, 0, 0],
      xDir: [1, 0, 0],
      normal: [0, 0, 1],
    };
    const planeDef = plane || examplePlane;
    console.log(plane);
    // Compare plane and examplePlane, set extraPlane if different
    useEffect(() => {
      function arraysEqual(a, b) {
        if (!a || !b || a.length !== b.length) return false;
        for (let i = 0; i < a.length; i++) {
          if (Math.abs(a[i] - b[i]) > 1e-8) return false;
        }
        return true;
      }
      const isSame =
        arraysEqual(plane?.origin, examplePlane.origin) &&
        arraysEqual(plane?.xDir, examplePlane.xDir) &&
        arraysEqual(plane?.normal, examplePlane.normal);
      setExtraPlane(!isSame);
    }, [plane]);

    const planeRef = useRef();
    const axesRef = useRef();

    useEffect(() => {
      if (planeRef.current && axesRef.current) {
        // Set position
        planeRef.current.position.set(...planeDef.origin);
        axesRef.current.position.set(...planeDef.origin);

        // Compute yDir as normal.cross(xDir)
        const x = new THREE.Vector3(...planeDef.xDir).normalize();
        const n = new THREE.Vector3(...planeDef.normal).normalize();
        const y = new THREE.Vector3().crossVectors(n, x).normalize();

        // Create a basis matrix
        const basis = new THREE.Matrix4();
        basis.makeBasis(x, y, n);

        // Set rotation from basis
        planeRef.current.setRotationFromMatrix(basis);
        axesRef.current.setRotationFromMatrix(basis);
      }
    }, [planeDef, extraPlane]);

    return (
      <>
        <OrbitControls
          ref={controlsRef}
          panSpeed={1.5}
          zoomSpeed={0.5}
          enableDamping={enableDamping}
        />

        {/* Mark the origin with a small sphere */}
        <mesh position={[0, 0, 0]}>
          <sphereGeometry args={[0.1, 32, 32]} />
          <meshBasicMaterial color="gray" />
        </mesh>

        {/* Add a visible ground plane under the origin */}
        {plane && extraPlane && geometryType == "2D" ? (
          <mesh ref={planeRef}>
            <planeGeometry args={[100, 100]} />
            <meshStandardMaterial
              color="#38341b"
              transparent={true}
              opacity={0.07}
              side={THREE.DoubleSide}
            />
          </mesh>
        ) : null}

        {axesParam && (
          <>
            <GizmoHelper alignment="bottom-right" margin={[80, 100]}>
              <GizmoViewport
                axisColors={["#9d4b4b", "#2f7f4f", "#3b5b9d"]}
                labelColor="white"
              />
            </GizmoHelper>

            <primitive ref={axesRef} object={new THREE.AxesHelper(300)} />
          </>
        )}
      </>
    );
  })
);

export default Controls;
