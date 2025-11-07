import React, { memo, useEffect, useRef, useState, forwardRef } from "react";
import ThreeContext from "../render/ThreeContext.jsx";
import ReplicadMesh from "../render/ReplicadMesh.jsx";
import WireframeMesh from "../render/WireframeMesh.jsx";
import TopLevelWireframeMesh from "../render/TopLevelWireframeMesh.jsx";
import globalvariables from "../../js/globalvariables.js";
import { useRendering } from "../../contexts/index.js";

const LowerHalf = forwardRef(function LowerHalf({ windowSize }, ref) {
  const { mesh, wireMesh, wireParam, solidParam } = useRendering();

  const [cameraZoom, setCameraZoom] = useState(1);

  useEffect(() => {
    /*Reset the camera zoom to 1 when a new molecule is loaded*/
    setCameraZoom(1);
  }, [globalvariables.currentAWSnode]);

  useEffect(() => {
    if (cameraZoom == 1 && mesh[0]) {
      console.log("mesh[0].cameraZoom", mesh[0].cameraZoom);
      setCameraZoom(mesh[0].cameraZoom);
    }
  }, [mesh]);

  return (
    <>
      <div
        className="jscad-container"
        style={{
          width: windowSize.width * 1,
          height: windowSize.height * 0.6,
        }}
      >
        <section
          id="threeDView"
          style={{
            width: windowSize.width * 1,
            height: windowSize.height * 0.6,
          }}
        >
          {wireMesh ? (
            <ThreeContext
              {...{
                cameraZoom,
              }}
            >
              {wireParam ? <WireframeMesh /> : null}
              <TopLevelWireframeMesh />
              <ReplicadMesh
                isSolid={solidParam}
                ref={ref}
                cameraZoom={cameraZoom}
              />
            </ThreeContext>
          ) : (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                fontSize: "2em",
              }}
            >
              Loading...
            </div>
          )}
        </section>
      </div>
      <div id="bottom_bar"></div>
    </>
  );
});
export default memo(LowerHalf);
