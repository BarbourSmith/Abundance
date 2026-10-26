import React, { useRef, useLayoutEffect, useEffect, useState } from "react";
import { useThree } from "@react-three/fiber";
import {
  buildDisplayGeometries,
  transformProps,
} from "../../js/displayMeshGeometry.js";
import { Wireframe } from "@react-three/drei";
import { useRendering } from "../../contexts/index.js";

export default React.memo(function ShapeMeshes() {
  const { wireMesh: mesh } = useRendering();
  const { invalidate } = useThree();

  const [fullMesh, setFullMesh] = useState([]);

  useLayoutEffect(() => {
    // Moved copies of a shape share one geometry; see displayMeshGeometry.js
    const { parts, dispose } = buildDisplayGeometries(mesh);
    setFullMesh(
      parts.map((m) => ({ ...m, pointPosition: m.point })),
    );
    // We have configured the canvas to only refresh when there is a change,
    // the invalidate function is here to tell it to recompute
    invalidate();
    // Release the GPU buffers of this mesh once it is replaced or unmounted.
    return dispose;
  }, [mesh, invalidate]);

  useEffect(
    () => () => {
      // wire.current.dispose();
      invalidate();
    },
    [invalidate]
  );

  return (
    <>
      {fullMesh.map((m, index) => {
        return (
          <group key={"groupwire" + m.color + index} {...transformProps(m.transform)}>
            {m.pointPosition ? (
              // Translucent background point
              <points>
                <bufferGeometry>
                  <bufferAttribute
                    attach="attributes-position"
                    count={1}
                    array={new Float32Array(m.pointPosition)}
                    itemSize={3}
                  />
                </bufferGeometry>
                <pointsMaterial
                  color={"#bebbbf"}
                  size={5}
                  sizeAttenuation={false}
                  transparent={true}
                  opacity={0.6}
                />
              </points>
            ) : m.isWire ? (
              // Translucent background wire — lines only
              <lineSegments geometry={m.lines}>
                <lineBasicMaterial
                  color={"#bebbbf"}
                  transparent={true}
                  opacity={0.6}
                />
              </lineSegments>
            ) : (
              <Wireframe
                geometry={m.body}
                stroke={"#bebbbf"}
                squeeze={true}
                dash={false}
                simplify={true}
                fill={"#bebbbf"}
                fillOpacity={0.1}
                strokeOpacity={0.2}
              />
            )}
          </group>
        );
      })}
    </>
  );
});
