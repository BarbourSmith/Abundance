import React, { memo, useEffect, useRef, useState } from "react";
import ThreeContext from "../render/ThreeContext.jsx";
import ReplicadMesh from "../render/ReplicadMesh.jsx";
import WireframeMesh from "../render/WireframeMesh.jsx";
import globalvariables from "../../js/globalvariables.js";

function useWindowSize() {
  // Initialize state with undefined width/height so server and client renders match
  // Learn more here: https://joshwcomeau.com/react/the-perils-of-rehydration/
  const [windowSize, setWindowSize] = useState({
    width: 0,
    height: 0,
  });
  useEffect(() => {
    // Handler to call on window resize
    function handleResize() {
      // Set window width/height to state
      if (globalvariables.isMobile()) {
        setWindowSize({
          width: window.screen.width,
          height: window.screen.height,
        });
      } else {
        setWindowSize({
          width: window.innerWidth,
          height: window.innerHeight,
        });
      }
    }
    // Add event listener
    window.addEventListener("resize", handleResize);

    // Call handler right away so state gets updated with initial window size
    handleResize();
    // Remove event listener on cleanup
    return () => window.removeEventListener("resize", handleResize);
  }, []); // Empty array ensures that effect is only run on mount
  return windowSize;
}

export default memo(function LowerHalf({
  gridParam,
  axesParam,
  wireParam,
  solidParam,
  mesh,
  wireMesh,
  outdatedMesh,
  setOutdatedMesh,
  labels,
}) {
  const windowSize = useWindowSize();
  const [cameraZoom, setCameraZoom] = useState(1);

  useEffect(() => {
    /*Reset the camera zoom to 1 when a new molecule is loaded*/
    setCameraZoom(1);
  }, [globalvariables.topLevelMolecule]);

  useEffect(() => {
    if (cameraZoom == 1 && mesh[0]) {
      setCameraZoom(mesh[0].cameraZoom);
      console.log("cameraZoom", cameraZoom);
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
              {...{ cameraZoom, gridParam, axesParam, outdatedMesh, labels }}
            >
              {wireParam ? <WireframeMesh mesh={wireMesh} /> : null}
              <ReplicadMesh
                {...{ mesh, isSolid: solidParam, setOutdatedMesh }}
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
        <div className="container arrow-up">
          <input type="checkbox" className="custom" />
          <div className="dots"></div>
        </div>
        <div id="viewer_bar"></div>
        <div className={`centered-text hidden`}>
          <div className="loading">
            <div className="dot"></div>
            <div className="dot"></div>
            <div className="dot"></div>
            <div className="dot"></div>
            <div className="dot"></div>
          </div>
        </div>
      </div>
      <div id="bottom_bar"></div>
    </>
  );
});
