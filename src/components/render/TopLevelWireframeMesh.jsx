import React, { useRef, useLayoutEffect, useEffect, useState } from "react";
import { useThree } from "@react-three/fiber";
import {
  buildDisplayGeometries,
  transformProps,
} from "../../js/displayMeshGeometry.js";
import { Wireframe } from "@react-three/drei";
import { useRendering } from "../../contexts/index.js";

export default React.memo(function TopLevelWireframeMesh() {
  const { topLevelWireMesh: mesh, showTopLevelWireframe, selectionModeAtom } =
    useRendering();
  const { invalidate } = useThree();

  const [fullMesh, setFullMesh] = useState([]);

  useLayoutEffect(() => {
    if (
      !mesh ||
      mesh.length === 0 ||
      !showTopLevelWireframe ||
      selectionModeAtom
    ) {
      setFullMesh([]);
      invalidate();
      return;
    }

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
  }, [mesh, showTopLevelWireframe, selectionModeAtom, invalidate]);

  useEffect(
    () => () => {
      invalidate();
    },
    [invalidate]
  );

  if (!showTopLevelWireframe || selectionModeAtom) {
    return null;
  }

  return (
    <>
      {fullMesh.map((m, index) => {
        return (
          <group key={"grouptoplevelwire" + m.color + index} {...transformProps(m.transform)}>
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
                  color={"#888888"}
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
                  color={"#888888"}
                  transparent={true}
                  opacity={0.6}
                />
              </lineSegments>
            ) : (
              <Wireframe
                geometry={m.body}
                stroke={"#888888"}
                squeeze={true}
                dash={false}
                simplify={true}
                fill={"#888888"}
                fillOpacity={0.05}
                strokeOpacity={0.3}
              />
            )}
          </group>
        );
      })}
    </>
  );
});
