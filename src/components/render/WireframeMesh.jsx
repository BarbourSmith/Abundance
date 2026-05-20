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

export default React.memo(function ShapeMeshes() {
  const { wireMesh: mesh } = useRendering();
  const { invalidate } = useThree();

  const [fullMesh, setFullMesh] = useState([]);

  useLayoutEffect(() => {
    let meshArray = [];
    mesh.map((m) => {
      const body = new BufferGeometry();
      const lines = new BufferGeometry();
      // We use the three helpers to synchronise the buffer geometry with the
      // new data from the parameters
      if (m.faces) syncFaces(body, m.faces);
      //if (faces) syncFaces(wire.current, faces);

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
          <group key={"groupwire" + m.color + index}>
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
          </group>
        );
      })}
    </>
  );
});
