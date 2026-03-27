import React, { useState, useEffect, use } from "react";
import { useRendering } from "../../contexts/RenderingContext.jsx";
import * as THREE from "three";
import { useLayoutEffect } from "react";
import { invalidate } from "react-three-fiber";

export default function NonReplicadMesh({}) {
  const { nonReplicadGeometry } = useRendering();
  const [object, setObject] = useState([]);
  const defaultMaterial = new THREE.MeshBasicMaterial({
    color: "lightgray",
    side: THREE.DoubleSide,
  });

  useLayoutEffect(() => {
    if (nonReplicadGeometry && nonReplicadGeometry.geometry?.length > 0) {
      setObject(nonReplicadGeometry.geometry);
    } else {
      setObject([]);
    }
    // We have configured the canvas to only refresh when there is a change,
    // the invalidate function is here to tell it to recompute
    invalidate();
  }, [nonReplicadGeometry, invalidate]);

  return (
    <group>
      {object?.map((geom, index) =>
        geom.isObject3D ? (
          // Complete Three.js objects (Line, Sprite, Group, etc.) are rendered directly
          <primitive key={index} object={geom} />
        ) : (
          // Raw BufferGeometry objects are wrapped in a mesh
          <mesh
            key={index}
            material={nonReplicadGeometry?.material || defaultMaterial}
          >
            <primitive object={geom} />
          </mesh>
        )
      )}
    </group>
  );
}
