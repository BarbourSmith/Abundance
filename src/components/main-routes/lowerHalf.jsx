import React, { memo, useEffect, useRef, useState, forwardRef } from "react";
import ThreeContext from "../render/ThreeContext.jsx";
import ReplicadMesh from "../render/ReplicadMesh.jsx";
import WireframeMesh from "../render/WireframeMesh.jsx";
import TopLevelWireframeMesh from "../render/TopLevelWireframeMesh.jsx";
import globalvariables from "../../js/globalvariables.js";
import { useRendering } from "../../contexts/index.js";
import NonReplicadMesh from "../render/NonReplicadMesh.jsx";

const LowerHalf = forwardRef(function LowerHalf({ windowSize }, ref) {
  const { mesh, wireMesh, wireParam, solidParam, isViewingOutputMesh, computingLabel, selectionModeAtom } =
    useRendering();

  const [cameraZoom, setCameraZoom] = useState(1);

  useEffect(() => {
    /*Reset the camera zoom to 1 when a new molecule is loaded*/
    setCameraZoom(1);
  }, [globalvariables.currentAWSnode]);

  useEffect(() => {
    if (cameraZoom == 1 && mesh && mesh[0]) {
      /*console.log("mesh[0].cameraZoom", mesh[0].cameraZoom);*/
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
            position: "relative",
          }}
        >
          {selectionModeAtom && (
            <div
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                zIndex: 1,
                background: "#1a73e8",
                color: "#fff",
                padding: "6px 12px",
                fontSize: "13px",
                textAlign: "center",
                pointerEvents: "none",
                userSelect: "none",
              }}
            >
              Click parts to select them
            </div>
          )}
          {computingLabel && (
            <div
              style={{
                position: "absolute",
                bottom: "8px",
                right: "10px",
                zIndex: 10,
                fontSize: "11px",
                color: "#666",
                fontFamily: "monospace",
                pointerEvents: "none",
                userSelect: "none",
                maxWidth: "calc(100% - 20px)",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {computingLabel}
            </div>
          )}
          {wireMesh ? (
            <ThreeContext
              {...{
                cameraZoom,
              }}
            >
              {wireParam && !isViewingOutputMesh ? <WireframeMesh /> : null}
              <TopLevelWireframeMesh />
              <NonReplicadMesh />
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
