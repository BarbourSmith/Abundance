import React, { useEffect, useState, useRef } from "react";
import ThreeContext from "../render/ThreeContext.jsx";
import ReplicadMesh from "../render/ReplicadMesh.jsx";

import WireframeMesh from "../render/WireframeMesh.jsx";
import GlobalVariables from "../../js/globalvariables.js";

import ToggleRunCreate from "../secondary/ToggleRunCreate.jsx";
import RunNavigation from "../secondary/RunNavigation.jsx";
import Molecule from "../../molecules/molecule.js";
import ParamsMenu from "../secondary/ParamsMenu.jsx";
import ExportMenu from "../secondary/ExportMenu.jsx";
import RenderMenu from "../secondary/RenderMenu.jsx";
import BomMenu from "../secondary/BomMenu.jsx";
import RenderProgressBar from "../secondary/RenderProgressBar.jsx";
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

function runMode() {
  // Get context values
  const { isloggedIn, authorizedUserOcto, authRedirectHandler } = useAuth();
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

  const navigate = useNavigate();

  // Register render progress bar
  useProgressBar('render-run', renderBarVisible, renderProgress, 'Rendering', true);

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
      "molecule-fully-render-puppeteer"
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
      console.log("Setting camera zoom", mesh[0].cameraZoom);
      setCameraZoom(mesh[0].cameraZoom);
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

  /** State for menu content collapsing */
  // Which menu is expanded: "params", "render", "bom", or "none"
  const [expandedMenu, setExpandedMenu] = useState(
    GlobalVariables.isMobile() ? "none" : "params"
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
      GlobalVariables.writeToDisplay(
        GlobalVariables.currentAWSnode?.topMoleculeID || null, // should not be an id unless reseting view
        true
      );
      fetch(
        `https://hg5gsgv9te.execute-api.us-east-2.amazonaws.com/abundance-stage/fetchSingleRepo?owner=${owner}&repoName=${repoName}`
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
          setErrorNotification("Can't load/find project: " + (e.message || e));
          setTimeout(() => setErrorNotification(null), 5000);
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

  return (
    <>
      <ParamsMenu
        activeAtom={activeAtom}
        position={{ top: 30, left: screenWidth - 320 }}
        id={"atom-run-params-panel"}
        contentCollapsed={expandedMenu !== "params"}
        setContentCollapsed={() => setExpandedMenu("params")}
        closeMenu={() => setExpandedMenu("none")}
        initialCollapsed={GlobalVariables.isMobile() ? true : false}
      />
      <ExportMenu
        activeAtom={activeAtom}
        position={{ top: 75, left: screenWidth - 365 }}
        id={"atom-run-export-panel"}
        contentCollapsed={expandedMenu !== "export"}
        setContentCollapsed={() => setExpandedMenu("export")}
        closeMenu={() => setExpandedMenu("none")}
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
          position: { top: 30, left: screenWidth - 365 },
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
          position: { top: 120, left: screenWidth - 365 },
        }}
        collapsedOffset={[45, -90]}
      />
      <div id="headerBarRun">
        <img
          className="thumnail-logo"
          src={
            import.meta.env.VITE_APP_PATH_FOR_PICS + "/imgs/abundance_logo.png"
          }
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
          <p>{"Project Name: " + GlobalVariables.currentAWSnode.repoName}</p>
          <p>{"Repo Owner: " + GlobalVariables.currentAWSnode.owner}</p>
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

                <ReplicadMesh
                  {...{ mesh, isSolid: solidParam, setOutdatedMesh }}
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
