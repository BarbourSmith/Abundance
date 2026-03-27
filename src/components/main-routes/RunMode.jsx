import React, { useEffect, useState, useRef } from "react";
import ThreeContext from "../render/ThreeContext.jsx";
import ReplicadMesh from "../render/ReplicadMesh.jsx";
import NonReplicadMesh from "../render/NonReplicadMesh.jsx";

import WireframeMesh from "../render/WireframeMesh.jsx";
import GlobalVariables from "../../js/globalvariables.js";

import ToggleRunCreate from "../secondary/ToggleRunCreate.jsx";
import RunNavigation from "../secondary/RunNavigation.jsx";
import Molecule from "../../molecules/molecule.js";
import RunParams from "../secondary/RunParams.jsx";
import RenderMenu from "../secondary/RenderMenu.jsx";
import BomMenu from "../secondary/BomMenu.jsx";
import ReadmePanel from "../secondary/ReadmePanel.jsx";
import {
  BrowserRouter as Router,
  useParams,
  useNavigate,
} from "react-router-dom";

// Import contexts
import {
  useAuth,
  useAppState,
  useRendering,
  useProject,
  useFileImport,
} from "../../contexts/index.js";
import { useTutorial } from "../../tutorial/TutorialManager";
import { TutorialOverlay } from "../../tutorial/TutorialOverlay";
import { useProgressBar } from "../secondary/ProgressBarManager.jsx";

function useWindowSize() {
  // Initialize state with undefined width/height so server and client renders match
  // Learn more here: https://joshwcomeau.com/react/the-perils-of-rehydration/
  const [windowSize, setWindowSize] = useState({
    width: undefined,
    height: undefined,
  });
  useEffect(() => {
    // Handler to call on window resize
    function handleResize() {
      // Set window width/height to state
      setWindowSize({
        width: window.innerWidth,
        height: window.innerHeight,
      });
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

function runMode({ processing, setProcessing }) {
  // Get context values
  const { authorizedUserOcto, authRedirectHandler } = useAuth();
  const {
    activeAtom,
    redirectType,
    setRedirectType,
    setActiveAtom,
    setErrorNotification,
  } = useAppState();
  const {
    mesh,
    wireMesh,
    outdatedMesh,
    setOutdatedMesh,
    renderProgress,
    renderBarVisible,
    renderStage,
    gridParam,
    setGrid,
    axesParam,
    setAxes,
    wireParam,
    setWire,
    solidParam,
    setSolid,
  } = useRendering();
  const { loadProject } = useProject();
  const { uploadFile, deleteFile } = useFileImport();

  const navigate = useNavigate();

  // Make file import functions available globally for atoms
  useEffect(() => {
    GlobalVariables.uploadFile = uploadFile;
    GlobalVariables.deleteFile = deleteFile;
    return () => {
      GlobalVariables.uploadFile = null;
      GlobalVariables.deleteFile = null;
    };
  }, [uploadFile, deleteFile]);

  // Register render progress bar
  useProgressBar(
    "render-run",
    renderBarVisible,
    renderProgress,
    renderStage || "Rendering",
    true,
  );

  const { next, isActive } = useTutorial();

  // canvas to hide
  const canvasRef = useRef(500);
  const [isItOwned, setOwned] = useState(false);

  const windowSize = useWindowSize();

  const { owner, repoName } = useParams();

  const [cameraZoom, setCameraZoom] = useState(1);

  /* Creates an element to check with Puppeteer if the molecule is fully loaded*/
  const createPuppeteerDiv = () => {
    // Check if the div already exists
    const existingDiv = document.getElementById(
      "molecule-fully-render-puppeteer",
    );
    if (!existingDiv) {
      // If it doesn't exist, create it
      const invisibleDiv = document.createElement("div");
      invisibleDiv.id = "molecule-fully-render-puppeteer";
      invisibleDiv.style.display = "none";
      document.body.appendChild(invisibleDiv);
      console.log("Puppeteer element created for run mode");
    }
  };
  useEffect(() => {
    /*Reset the camera zoom to 1 when a new molecule is loaded*/
    setCameraZoom(1);
  }, [GlobalVariables.currentAWSnode]);

  useEffect(() => {
    if (cameraZoom == 1 && mesh[0]) {
      // Double the zoom ratio for run mode to make projects appear larger
      const runModeZoom = mesh[0].cameraZoom * 2;
      console.log("Setting camera zoom for run mode", runModeZoom);
      setCameraZoom(runModeZoom);
    }
  }, [mesh]);

  // Create Puppeteer element when render is complete
  useEffect(() => {
    if (renderProgress >= 100 && !renderBarVisible) {
      // Wait a bit to ensure everything is settled
      const timer = setTimeout(() => {
        createPuppeteerDiv();
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [renderProgress, renderBarVisible]);

  // Fallback: Create Puppeteer element after project loads and mesh is available
  useEffect(() => {
    if (wireMesh && mesh) {
      // Wait for the project to settle, then create the element
      const timer = setTimeout(() => {
        createPuppeteerDiv();
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [wireMesh, mesh]);

  useEffect(() => {
    const handler = (e) => {
      console.log("Received user notification event:", e.detail);
      setErrorNotification(e.detail.message, e.detail.type || "error");
      setTimeout(() => setErrorNotification(null, "error"), 5000);
    };
    window.addEventListener("user-notification", handler);
    return () => window.removeEventListener("user-notification", handler);
  }, []);

  /** State for menu content collapsing */
  // Which menu is expanded: "params", "render", "bom", or "none"
  const [expandedMenu, setExpandedMenu] = useState(
    GlobalVariables.isMobile() ? "none" : "params",
  );

  useEffect(() => {
    GlobalVariables.canvas = canvasRef;
    GlobalVariables.c = canvasRef.current.getContext("2d");

    /** Only run loadproject() if the project is different from what is already loaded and clear screen */
    if (
      GlobalVariables.currentAWSnode &&
      GlobalVariables.currentAWSnode.repoName ==
        GlobalVariables.loadedRepo?.name
    ) {
      console.log("Same project, loading from memory");
      GlobalVariables.currentMolecule = GlobalVariables.topLevelMolecule;
      GlobalVariables.currentMolecule.selected = true;
      setActiveAtom(GlobalVariables.currentMolecule);
    } else {
      /*resetting viewport*/
      GlobalVariables.resetView(); // TODO(tristan): possibly also need to writeToDisplay here.
      fetch(
        `https://hg5gsgv9te.execute-api.us-east-2.amazonaws.com/abundance-stage/fetchSingleRepo?owner=${owner}&repoName=${repoName}`,
      )
        .then((res) => res.json())
        .then((data) => {
          if (data && data.item) {
            GlobalVariables.currentAWSnode = data.item;

            //Load a blank project
            GlobalVariables.topLevelMolecule = new Molecule({
              x: 0,
              y: 0,
              topLevel: true,
              atomType: "Molecule",
            });
            GlobalVariables.currentMolecule = GlobalVariables.topLevelMolecule;
            GlobalVariables.currentMolecule.selected = true;
            loadProject(GlobalVariables.currentAWSnode);
          }
        })
        .catch((e) => {
          console.error("Error fetching AWS project data:", e);
          setErrorNotification(
            "Can't load/find project: " + (e.message || e),
            "error",
          );
          setTimeout(() => setErrorNotification(null, "error"), 5000);
          navigate("/");
        });
    }

    if (
      GlobalVariables.currentAWSnode &&
      GlobalVariables.currentAWSnode.owner == GlobalVariables.currentUser
    ) {
      console.log("You own this project");
      setOwned(true);
    }
  }, []);
  const screenHeight = window.innerHeight;
  const screenWidth = window.innerWidth;

  /* Since we can't see current atoms processing status, set outdated mesh when active atom goes to waiting */
  if (activeAtom) {
    activeAtom.onStatusChange = (status) => {
      console.log("Active atom status changed to:", status);
      if (status === "waiting") {
        setOutdatedMesh(true);
        setProcessing(true);
      }
    };
  }

  return (
    <>
      <RunParams
        activeAtom={activeAtom}
        position={{ top: 30, left: screenWidth - 50 }}
        id={"atom-run-params-panel"}
        contentCollapsed={expandedMenu !== "params"}
        setContentCollapsed={() => setExpandedMenu("params")}
        closeMenu={() => setExpandedMenu("none")}
        initialCollapsed={true}
        collapsedOffset={[-315, 0]}
        setReadMe={() => setExpandedMenu("readme")}
        setBillOfMaterials={() => setExpandedMenu("bom")}
      />
      <RenderMenu
        {...{
          activeAtom,
          gridParam,
          axesParam,
          wireParam,
          solidParam,
          setGrid,
          setAxes,
          setWire,
          setSolid,
          contentCollapsed: expandedMenu !== "render",
          setContentCollapsed: () => setExpandedMenu("render"),
          closeMenu: () => setExpandedMenu("none"),
          position: { top: 75, left: screenWidth - 50 },
          collapsedOffset: [-315, -45],
        }}
        id={"atom-run-render-panel"}
      />

      <BomMenu
        {...{
          activeAtom,
          id: "atom-run-bom-panel",
          contentCollapsed: expandedMenu !== "bom",
          setContentCollapsed: () => setExpandedMenu("bom"),
          closeMenu: () => setExpandedMenu("none"),
          position: { top: 120, left: screenWidth - 50 },
          collapsedOffset: [-315, -90],
        }}
      />

      {/* ReadmePanel below BomMenu, collapsed by default */}
      <ReadmePanel
        readme={GlobalVariables.currentRepo?.readme || ""}
        id="atom-run-readme-panel"
        position={{ top: 165, left: screenWidth - 50 }}
        initialCollapsed={true}
        contentCollapsed={expandedMenu !== "readme"}
        setContentCollapsed={() => setExpandedMenu("readme")}
        closeMenu={() => setExpandedMenu("none")}
        collapsedOffset={[-315, -135]}
        activeAtom={activeAtom}
      />
      <div id="headerBarRun">
        <img
          className="thumnail-logo"
          src={
            import.meta.env.VITE_APP_PATH_FOR_PICS + "/imgs/abundance_logo.png"
          }
          onClick={() => navigate("/")}
          alt="logo"
        />
      </div>
      <canvas
        style={{ display: "none" }}
        ref={canvasRef}
        id="flow-canvas"
        tabIndex={0}
      ></canvas>
      {isActive ? <TutorialOverlay /> : null}
      <ToggleRunCreate {...{ run: true, isItOwned }} />

      {GlobalVariables.currentRepo ? (
        <RunNavigation
          {...{
            authorizedUserOcto,
            activeAtom,
            redirectType,
            setRedirectType,
            authRedirectHandler,
          }}
        />
      ) : null}
      {GlobalVariables.currentAWSnode ? (
        <div className="info_run_div">
          <p>
            {"Project Name: " +
              GlobalVariables.currentAWSnode.repoName +
              "  /  Project Owner: " +
              GlobalVariables.currentAWSnode.owner}{" "}
          </p>
        </div>
      ) : null}
      <div className="runContainer">
        <div
          className="jscad-container"
          style={{
            width: windowSize.width,
            height: windowSize.height,
          }}
        >
          <section
            id="threeDView"
            style={{
              // width: windowSize.width*.6,
              height: windowSize.height,
            }}
          >
            {wireMesh ? (
              <ThreeContext
                {...{ cameraZoom, gridParam, axesParam, outdatedMesh }}
              >
                {wireParam ? <WireframeMesh mesh={wireMesh} /> : null}
                <NonReplicadMesh />
                <ReplicadMesh
                  {...{
                    mesh,
                    isSolid: solidParam,
                    setOutdatedMesh,
                    setProcessing,
                  }}
                />
              </ThreeContext>
            ) : (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  fontSize: "1em",
                }}
              >
                Loading...
              </div>
            )}
          </section>
        </div>
      </div>
    </>
  );
}

export default runMode;
