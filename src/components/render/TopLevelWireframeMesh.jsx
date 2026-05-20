import React, { useRef, useLayoutEffect, useEffect, useState } from "react";
import { useThree } from "@react-three/fiber";
import { BufferGeometry } from "three";
import {
  syncLines,
  syncFaces,
  syncLinesFromFaces,
} from "replicad-threejs-helper";
import { Wireframe } from "@react-three/drei";
import { useRendering } from "../../contexts/index.js";

export default React.memo(function TopLevelWireframeMesh() {
  const { topLevelWireMesh: mesh, showTopLevelWireframe } = useRendering();
  const { invalidate } = useThree();

  const [fullMesh, setFullMesh] = useState([]);

  useLayoutEffect(() => {
    if (!mesh || mesh.length === 0 || !showTopLevelWireframe) {
      setFullMesh([]);
      invalidate();
      return;
    }

    let meshArray = [];
    mesh.forEach((m) => {
      const body = new BufferGeometry();
      const lines = new BufferGeometry();
      // We use the three helpers to synchronise the buffer geometry with the
      // new data from the parameters
      if (m.faces) syncFaces(body, m.faces);

      if (m.edges) syncLines(lines, m.edges);
      else if (m.faces) syncLinesFromFaces(lines, body);

      const thisBody = body;
      const thisLines = lines;
      const thisColor = m.color;
      meshArray.push({ body: thisBody, lines: thisLines, color: thisColor });
    });
    setFullMesh(meshArray);
    // We have configured the canvas to only refresh when there is a change,
    // the invalidate function is here to tell it to recompute
    invalidate();
  }, [mesh, showTopLevelWireframe, invalidate]);

  useEffect(
    () => () => {
      invalidate();
    },
    [invalidate]
  );

  if (!showTopLevelWireframe) {
    return null;
  }

  return (
    <>
      {fullMesh.map((m, index) => {
        return (
          <group key={"grouptoplevelwire" + m.color + index}>
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
          </group>
        );
      })}
    </>
  );
});
