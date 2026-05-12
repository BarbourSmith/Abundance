import React, { useEffect, useState, useRef } from "react";
import GlobalVariables from "../../js/globalvariables.js";
import Molecule from "../../molecules/molecule.js";
import ToggleRunCreate from "../secondary/ToggleRunCreate.jsx";
import FlowCanvas from "./flowCanvas.jsx";
import LowerHalf from "./lowerHalf.jsx";
import CodeWindow from "../secondary/codeWindow.jsx";
import { useParams, useNavigate } from "react-router-dom";
import GoUpLevelButton from "../secondary/GoUpLevelButton.jsx";

import ParamsMenu from "../secondary/ParamsMenu.jsx";
import RenderMenu from "../secondary/RenderMenu.jsx";
import BomMenu from "../secondary/BomMenu.jsx";
import GitSearchMenu from "../secondary/GitSearchMenu.jsx";
import RenderProgressBar from "../secondary/RenderProgressBar.jsx";
import { useProgressBar } from "../secondary/ProgressBarManager.jsx";

// Import contexts
import {
  useAuth,
  useAppState,
  useRendering,
  useProject,
  useFileImport,
} from "../../contexts/index.js";

/**
 * Preview Create Mode component - displays the flow canvas and nodes for a project
 * that the current user does not own. The TopMenu and save functionality are hidden
 * so the user can explore the project structure without modifying it.
 */
function PreviewCreateMode() {
  // Get context values
  const { authorizedUserOcto, authRedirectHandler, userScopes } = useAuth();
  const {
    activeAtom,
    setActiveAtom,
    exportPopUp,
    redirectType,
    setNotification,
  } = useAppState();
  const {
    setMesh,
    setWireMesh,
    renderProgress,
    renderBarVisible,
    renderStage,
    solidParam,
    setSolid,
    showTopLevelWireframe,
    setShowTopLevelWireframe,
  } = useRendering();

  const { cad, loadProject } = useProject();
  const { fetchFileContent, fetchRawFileContent } = useFileImport();
  const meshRef = useRef();

  // Make meshRef and read-only file functions available globally
  useEffect(() => {
    GlobalVariables.meshRef = meshRef;
    GlobalVariables.fetchFileContent = fetchFileContent;
    GlobalVariables.fetchRawFileContent = fetchRawFileContent;

    return () => {
      GlobalVariables.meshRef = null;
      GlobalVariables.fetchFileContent = null;
      GlobalVariables.fetchRawFileContent = null;
    };
  }, [fetchFileContent, fetchRawFileContent]);

  const navigate = useNavigate();
  const { owner, repoName } = useParams();

  // Register render progress bar
  useProgressBar(
    "render",
    renderBarVisible,
    renderProgress,
    renderStage || "Rendering",
    false,
  );

  const [recomputeProgress, setRecomputeProgress] = useState(0);
  const [recomputeVisible, setRecomputeVisible] = useState(false);

  useProgressBar(
    "recompute",
    recomputeVisible,
    recomputeProgress,
    "Recomputing",
    false,
  );

  /** State for top level molecule */
  const [currentMoleculeTop, setTop] = useState(false);

  /** Load project when URL params change */
  useEffect(() => {
    // Check if project is already loaded
    if (
      GlobalVariables.currentAWSnode &&
      GlobalVariables.currentAWSnode.repoName === repoName &&
      GlobalVariables.loadedRepo?.name === repoName
    ) {
      // Project already loaded, just set up the view
      GlobalVariables.currentMolecule = GlobalVariables.topLevelMolecule;
      GlobalVariables.currentMolecule.selected = true;
      setActiveAtom(GlobalVariables.currentMolecule);
    } else {
      // Project not loaded - fetch from AWS and load it
      GlobalVariables.resetView();
      fetch(
        `https://hg5gsgv9te.execute-api.us-east-2.amazonaws.com/abundance-stage/fetchSingleRepo?owner=${owner}&repoName=${repoName}`,
      )
        .then((res) => res.json())
        .then((data) => {
          if (data && data.item) {
            GlobalVariables.currentAWSnode = data.item;

            // Load a blank project
            GlobalVariables.topLevelMolecule = new Molecule({
              x: 0,
              y: 0,
              topLevel: true,
              atomType: "Molecule",
            });
            GlobalVariables.currentMolecule = GlobalVariables.topLevelMolecule;
            GlobalVariables.currentMolecule.selected = true;
            loadProject(GlobalVariables.currentAWSnode);
            setActiveAtom(GlobalVariables.currentMolecule);
          }
        })
        .catch((e) => {
          console.error("Error loading preview project:", e);
          setNotification("Can't load project: " + (e.message || e), "error");
          setTimeout(() => setNotification(null), 5000);
          navigate("/");
        });
    }
  }, [owner, repoName]);

  const solidParamRef = useRef(solidParam);
  useEffect(() => {
    solidParamRef.current = solidParam;
  }, [solidParam]);

  const showTopLevelWireframeRef = useRef(showTopLevelWireframe);
  useEffect(() => {
    showTopLevelWireframeRef.current = showTopLevelWireframe;
  }, [showTopLevelWireframe]);

  /** State for menu content collapsing */
  const [expandedMenu, setExpandedMenu] = useState(
    GlobalVariables.isMobile() ? "none" : "params",
  );

  // Initialize state with undefined width/height so server and client renders match
  const [windowSize, setWindowSize] = useState({
    width: 0,
    height: 0,
  });
  useEffect(() => {
    function handleResize() {
      setWindowSize({
        width: window.innerWidth,
        height: window.innerHeight,
      });
    }
    window.addEventListener("resize", handleResize);
    handleResize();
    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  /** Checks if activeAtom is topLevel to render goUp button */
  useEffect(() => {
    if (activeAtom && activeAtom.atomType === "Molecule") {
      setTop(!activeAtom.topLevel);
    }
  }, [activeAtom]);

  const panelRef = useRef();
  const gitRef = useRef();

  const forwardKeyToPanel = (event) => {
    if (panelRef.current && panelRef.current.triggerPanelKeyDown) {
      panelRef.current.triggerPanelKeyDown(event);
    }
  };
  const forwardKeyToGitPanel = (event) => {
    if (gitRef.current && gitRef.current.triggerPanelKeyDown) {
      gitRef.current.triggerPanelKeyDown(event);
    }
  };

  const expandedMenuRef = useRef(expandedMenu);
  useEffect(() => {
    expandedMenuRef.current = expandedMenu;
  }, [expandedMenu]);

  /**
   * Handles keydown events (no save shortcut in preview mode).
   */
  const handleKeyDown = (e) => {
    if (!document.getElementById("code-window").classList.contains("code-off"))
      return;

    if (e.key === "Control" || e.key === "Meta") {
      GlobalVariables.ctrlDown = true;
    }

    const shortcutCombos = [
      {
        key: "U",
        action: () => {
          GlobalVariables.currentMolecule.goToParentMolecule();
          setActiveAtom(GlobalVariables.currentMolecule);
        },
      },
      {
        key: "W",
        action: () => {
          setSolid(!solidParamRef.current);
        },
      },
      {
        key: "A",
        action: () => {
          setShowTopLevelWireframe(!showTopLevelWireframeRef.current);
        },
      },
    ];
    if ((e.ctrlKey || e.metaKey) && e.shiftKey) {
      for (const combo of shortcutCombos) {
        if (e.key === combo.key) {
          e.preventDefault();
          combo.action();
          return;
        }
      }
    }

    if (
      (e.key === "Alt" || e.key === "AltGraph") &&
      !GlobalVariables.ctrlDown
    ) {
      setExpandedMenu(
        expandedMenuRef.current === "git-search" ? "params" : "git-search",
      );
    } else {
      if (
        expandedMenuRef.current === "git-search" &&
        !GlobalVariables.ctrlDown
      ) {
        forwardKeyToGitPanel(e);
      }
      if (
        expandedMenuRef.current !== "git-search" &&
        !GlobalVariables.ctrlDown
      ) {
        forwardKeyToPanel(e);
      }
    }
  };

  const handleKeyUp = (e) => {
    if (e.key === "Control" || e.key === "Meta") {
      GlobalVariables.ctrlDown = false;
    }
  };

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  useEffect(() => {
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, []);

  const screenHeight = window.innerHeight;

  return (
    <>
      <ParamsMenu
        position={{ top: screenHeight / 2 - 10, left: 10 }}
        id={"atom-create-params-panel"}
        contentCollapsed={expandedMenu !== "params"}
        setContentCollapsed={() => setExpandedMenu("params")}
        panelRef={panelRef}
        closeMenu={() => setExpandedMenu("none")}
        initialCollapsed={true}
        collapsedOffset={[45, 0]}
      />
      <div id="headerBar">
        <img
          className={
            "thumnail-logo" +
            (userScopes && userScopes.includes("repo")
              ? " logo-private-scope"
              : "")
          }
          src={
            import.meta.env.VITE_APP_PATH_FOR_PICS + "/imgs/abundance_logo.png"
          }
          alt="logo"
          onClick={() => navigate("/")}
          style={{ cursor: "pointer" }}
        />
      </div>
      <ToggleRunCreate
        run={false}
        isPreview={true}
        setActiveAtom={setActiveAtom}
      />
      <CodeWindow {...{ activeAtom }} />
      {!GlobalVariables.currentMolecule.topLevel ? <GoUpLevelButton /> : null}
      <FlowCanvas
        {...{
          activeAtom,
          authorizedUserOcto,
          loadProject,
          setActiveAtom,
          setSavePopUp: () => {},
          setSaveState: () => {},
          setTop,
          shortCuts: {},
          setMesh,
          cad,
          setWireMesh,
          userNotification: null,
          notificationType: "error",
          setUserNotification: (msg, type) => setNotification(msg, type),
          setExpandedMenu,
          windowSize,
          redirectType,
          saveProject: null,
          isPreview: true,
        }}
      />
      <div className="parent flex-parent" id="lowerHalf">
        <LowerHalf windowSize={windowSize} ref={meshRef} />
      </div>
    </>
  );
}

export default PreviewCreateMode;
