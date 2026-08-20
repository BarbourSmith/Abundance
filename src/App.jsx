import React, { useState, useEffect, useRef } from "react";
import { Octokit } from "octokit";
import {
  HashRouter as Router,
  // BrowserRouter as Router,
  Routes,
  Route,
  useNavigate,
  useLocation,
} from "react-router-dom";

import GlobalVariables from "./js/globalvariables.js";
import { fetchGitHubFileContent } from "./js/githubFileUtils.js";
import { filterGeometryByTags } from "./utils/geometryFilterByTags.js";
import { CadWorkerManager } from "./worker/cadWorkerManager.js";
import LoginMode from "./components/main-routes/LoginMode.jsx";
import RunMode from "./components/main-routes/RunMode.jsx";
import PullMode from "./components/main-routes/PullMode.jsx";
import CreateMode from "./components/main-routes/CreateMode.jsx";
import PreviewCreateMode from "./components/main-routes/PreviewCreateMode.jsx";
import UserGuidePage from "./components/main-routes/UserGuidePage.jsx";
import cadWorker from "./worker/worker.ts?worker";
import RenderURL from "./worker/meshWorker.ts?url&worker";
import * as workerpool from "workerpool";

import { QueryClient, QueryClientProvider } from "react-query";
import Callback from "./components/main-routes/CallBack.jsx";

// Import contexts
import {
  RenderingProvider,
  AuthProvider,
  AppStateProvider,
  ProjectProvider,
  BrowseSettingsProvider,
  FileImportProvider,
  ThumbnailDialogProvider,
  useRendering,
  useAuth,
  useAppState,
} from "./contexts/index.js";

import { TutorialProvider } from "./tutorial/TutorialManager";
import { ProgressBarProvider } from "./components/secondary/ProgressBarManager.jsx";
import { DevSettingsProvider } from "./contexts/DevSettingsContext.jsx";
import DevSettingsModal from "./components/secondary/DevSettingsModal.jsx";

/*Import style scripts*/
import "./styles/maslowCreate.css";
import "./styles/menuIcons.css";
import "./styles/login.css";
import "./styles/readme.css";

const queryClient = new QueryClient();
/**
 * The octokit instance which allows authenticated interaction with GitHub.
 * @type {object}
 */

const pool = workerpool.pool(RenderURL, {
  maxWorkers: 1,
  workerOpts: {
    // By default, Vite uses a module worker in dev mode, which can cause your application to fail. Therefore, we need to use a module worker in dev mode and a classic worker in prod mode.
    type: import.meta.env.PROD ? undefined : "module",
  },
});

// CadWorkerManager wraps the comlink worker with a 90-second inactivity timeout.
// The watchdog is reset whenever the worker reports mid-computation progress, so
// a long-running operation only times out if it goes truly silent (stalled). If
// the worker hangs it is automatically terminated and restarted, so the UI never
// gets permanently stuck waiting for a computation that will never return.
const cad = new CadWorkerManager(cadWorker, 90_000);
window._debugWorkerHandle = cad;
// Statuses that mean the initial project load has SETTLED. A project whose
// top-level molecule contains user-authored code that legitimately errors will
// settle to "error"/"upstream_error" rather than "ready"; those are terminal
// too, so the loading overlay must clear for them. Requiring "ready" here made
// any project with a broken atom spin the loading bar forever even after the
// graph fully converged (worker idle, everything settled).
const SETTLED_LOAD_STATUSES = new Set(["ready", "error", "upstream_error"]);
function isProjectLoadSettled(topLevelMolecule) {
  return SETTLED_LOAD_STATUSES.has(topLevelMolecule?.getState?.().status);
}

function getLatestActiveWorkerTask(taskMap) {
  let latestTask = null;
  taskMap.forEach((task) => {
    const taskTime = task?.startedAt || task?.queuedAt || 0;
    const latestTime = latestTask?.startedAt || latestTask?.queuedAt || 0;
    if (!latestTask || taskTime >= latestTime) {
      latestTask = task;
    }
  });
  return latestTask;
}

function applyWorkerTaskUi(
  taskMap,
  molecule,
  processing,
  shouldShowLoadingBar,
  setRenderProgress,
  setRenderStage,
  setRenderBarVisible,
  setComputingLabel,
) {
  if (!taskMap || taskMap.size === 0) {
    return false;
  }

  const activeTask = getLatestActiveWorkerTask(taskMap);
  const baseLabel =
    activeTask?.displayLabel || activeTask?.method || "computing";
  setComputingLabel(
    activeTask?.subLabel ? `${baseLabel} · ${activeTask.subLabel}` : baseLabel,
  );

  if (!shouldShowLoadingBar) {
    setRenderBarVisible(false);
    return true;
  }

  setRenderBarVisible(true);

  if (processing) {
    setRenderStage("Rendering");
    setRenderProgress(80);
  } else if (molecule) {
    const [ready, total] = molecule.getCompletionTuple();
    const progress = total > 0 ? ready / total : 1;
    const buildingProgress = 30 + progress * 50;
    setRenderProgress(Math.round(buildingProgress));
    setRenderStage(`Building ${ready}/${total}`);
  } else {
    setRenderStage("Building");
    setRenderProgress(50);
  }

  return true;
}

function updateRenderUiFromMolecule(
  molecule,
  setRenderProgress,
  setRenderStage,
  setRenderBarVisible,
  setComputingLabel,
  shouldShowLoadingBar,
  processing,
) {
  if (!molecule) {
    setRenderBarVisible(false);
    setComputingLabel(null);
    return;
  }

  const moleculeStatus = molecule.getState().status;

  // Stage 1: waiting on top-level Input atoms.
  const hasWaitingInputs = molecule.nodesOnTheScreen.some((atom) => {
    if (atom.atomType === "Input") {
      return (
        atom.getState().status === "waiting" ||
        atom.value === "__GEOMETRY_INPUT__"
      );
    }
    return false;
  });

  // Stage 3 complete: molecule is fully ready.
  if (moleculeStatus === "ready") {
    setRenderProgress(100);
    setRenderStage("Rendering");
    setComputingLabel(null);
    return;
  }

  if (hasWaitingInputs) {
    setRenderBarVisible(shouldShowLoadingBar);
    setRenderStage("Waiting for input");
    setRenderProgress(0);
    setComputingLabel(null);
    return;
  }

  // Stage 2: build in progress.
  if (moleculeStatus === "waiting" || moleculeStatus === "processing") {
    setRenderBarVisible(shouldShowLoadingBar);
    const [ready, total] = molecule.getCompletionTuple();
    const progress = total > 0 ? ready / total : 1;
    const buildingProgress = 30 + progress * 50;
    setRenderProgress(Math.round(buildingProgress));
    setRenderStage(`Building ${ready}/${total}`);
    setComputingLabel(null);
    return;
  }

  // Stage 3: mesh/render handoff only while foreground mesh render is active.
  if (processing) {
    setRenderBarVisible(shouldShowLoadingBar);
    setRenderStage("Rendering");
    setRenderProgress(80);
    setComputingLabel(null);
    return;
  }

  setRenderBarVisible(false);
  setRenderProgress(0);
  setRenderStage("");
  setComputingLabel(null);
}

/**
 * Inner app component that has access to all contexts
 */
function AppContent() {
  const {
    setMesh,
    setWireMesh,
    setOutdatedMesh,
    renderProgress,
    setRenderProgress,
    setRenderBarVisible,
    renderStage,
    setRenderStage,
    setTopLevelWireMesh,
    setPlane,
    setGeometryType,
    setIsViewingOutputMesh,
    setGcodeParts,
    nonReplicadGeometry,
    setNonReplicadGeometry,
    activeTags,
    setActiveTags,
    setComputingLabel,
    selectionModeAtom,
    setSelectionModeAtom,
    setSelectionVersion,
  } = useRendering();

  // selectionModeAtom is consumed by lowerHalf/ReplicadMesh via context

  const {
    isAuthorized,
    setIsAuthorized,
    setAuthorizedUserOcto,
    authRedirectHandler,
    userScopes,
  } = useAuth();

  const {
    activeAtom,
    setActiveAtom,
    shortCutsOn,
    setRedirectType,
    errorNotification,
    setErrorNotification,
    notificationType,
  } = useAppState();

  const navigate = useNavigate();

  const [size, setSize] = useState(5);

  useEffect(() => {
    const element = document.querySelector("html");
    const storedClass = localStorage.getItem("displayTheme");

    if (element && storedClass) {
      element.className = storedClass;
    }
  }, []);

  const [processing, setProcessing] = useState(false);
  const activeWorkerTasksRef = useRef(new Map());
  const initialProjectLoadRef = useRef(
    Boolean(GlobalVariables.topLevelMolecule),
  );
  const currentTopLevelMoleculeIdRef = useRef(
    GlobalVariables.topLevelMolecule?.uniqueID || null,
  );

  useEffect(() => {
    const refreshUi = () => {
      const topLevelMolecule = GlobalVariables.topLevelMolecule;
      const topLevelMoleculeId = topLevelMolecule?.uniqueID || null;
      if (topLevelMoleculeId !== currentTopLevelMoleculeIdRef.current) {
        currentTopLevelMoleculeIdRef.current = topLevelMoleculeId;
        initialProjectLoadRef.current = Boolean(topLevelMoleculeId);
      }

      if (!topLevelMolecule) {
        initialProjectLoadRef.current = false;
      }

      const shouldShowLoadingBar =
        GlobalVariables.projectIsLoading === true ||
        initialProjectLoadRef.current;
      if (
        applyWorkerTaskUi(
          activeWorkerTasksRef.current,
          topLevelMolecule,
          processing,
          shouldShowLoadingBar,
          setRenderProgress,
          setRenderStage,
          setRenderBarVisible,
          setComputingLabel,
        )
      ) {
        if (
          initialProjectLoadRef.current &&
          !GlobalVariables.projectIsLoading &&
          activeWorkerTasksRef.current.size === 0 &&
          isProjectLoadSettled(topLevelMolecule)
        ) {
          initialProjectLoadRef.current = false;
        }
        return;
      }

      updateRenderUiFromMolecule(
        topLevelMolecule,
        setRenderProgress,
        setRenderStage,
        setRenderBarVisible,
        setComputingLabel,
        shouldShowLoadingBar,
        processing,
      );

      if (
        initialProjectLoadRef.current &&
        !GlobalVariables.projectIsLoading &&
        activeWorkerTasksRef.current.size === 0 &&
        isProjectLoadSettled(topLevelMolecule)
      ) {
        initialProjectLoadRef.current = false;
      }
    };

    const handleTopLevelChanged = () => refreshUi();
    const handleObservableChanged = () => refreshUi();
    const handleWorkerTaskStart = (event) => {
      const detail = event?.detail || {};
      if (!detail.taskId) return;
      activeWorkerTasksRef.current.set(detail.taskId, detail);
      refreshUi();
    };
    const handleWorkerTaskFinished = (event) => {
      const detail = event?.detail || {};
      if (!detail.taskId) return;
      activeWorkerTasksRef.current.delete(detail.taskId);
      refreshUi();
    };
    const handleWorkerTaskProgress = (event) => {
      const detail = event?.detail || {};
      if (!detail.taskId) return;
      const task = activeWorkerTasksRef.current.get(detail.taskId);
      if (!task) return;
      task.subLabel = detail.label || null;
      refreshUi();
    };
    const handleWorkerRestarted = () => {
      activeWorkerTasksRef.current.clear();
      refreshUi();
    };

    window.addEventListener(
      "top-level-molecule-changed",
      handleTopLevelChanged,
    );
    window.addEventListener(
      "observable-entity-changed",
      handleObservableChanged,
    );
    window.addEventListener("cad-worker-task-start", handleWorkerTaskStart);
    window.addEventListener("cad-worker-task-finish", handleWorkerTaskFinished);
    window.addEventListener("cad-worker-task-error", handleWorkerTaskFinished);
    window.addEventListener(
      "cad-worker-task-cancelled",
      handleWorkerTaskFinished,
    );
    window.addEventListener(
      "cad-worker-task-progress",
      handleWorkerTaskProgress,
    );
    window.addEventListener("cad-worker-restarted", handleWorkerRestarted);
    refreshUi();

    return () => {
      window.removeEventListener(
        "top-level-molecule-changed",
        handleTopLevelChanged,
      );
      window.removeEventListener(
        "observable-entity-changed",
        handleObservableChanged,
      );
      window.removeEventListener(
        "cad-worker-task-start",
        handleWorkerTaskStart,
      );
      window.removeEventListener(
        "cad-worker-task-finish",
        handleWorkerTaskFinished,
      );
      window.removeEventListener(
        "cad-worker-task-error",
        handleWorkerTaskFinished,
      );
      window.removeEventListener(
        "cad-worker-task-cancelled",
        handleWorkerTaskFinished,
      );
      window.removeEventListener(
        "cad-worker-task-progress",
        handleWorkerTaskProgress,
      );
      window.removeEventListener("cad-worker-restarted", handleWorkerRestarted);
    };
  }, [
    processing,
    setRenderProgress,
    setRenderBarVisible,
    setRenderStage,
    setComputingLabel,
  ]);

  useEffect(() => {
    if (renderProgress >= 100) {
      const timeout = setTimeout(() => {
        setRenderBarVisible(false);
      }, 1000);
      return () => clearTimeout(timeout);
    }
  }, [renderProgress, setRenderBarVisible]);

  // Generate top-level molecule wireframe mesh when molecule is ready
  useEffect(() => {
    if (renderProgress >= 100 && GlobalVariables.topLevelMolecule) {
      const molecule = GlobalVariables.topLevelMolecule;
      const moleculeId = molecule.uniqueID;
      const moleculeValue = molecule.value;
      const context = molecule.getContext();

      // Check if we've already generated the mesh for this molecule
      if (topLevelMesh.current && topLevelMesh.current.id === moleculeId) {
        // Already generated for this molecule, just ensure it's set
        if (topLevelMesh.current.mesh) {
          setTopLevelWireMesh(topLevelMesh.current.mesh);
        }
        return;
      }

      if (moleculeValue && context) {
        // Mark that we're generating for this molecule
        topLevelMesh.current = { id: moleculeId, mesh: undefined };

        pool
          .proxy()
          .then((worker) => {
            return worker.generateDisplayMesh(moleculeValue, context);
          })
          .then((m) => {
            // Check if the molecule ID still matches (avoid race condition)
            if (
              topLevelMesh.current &&
              topLevelMesh.current.id === moleculeId
            ) {
              // Store the generated mesh
              topLevelMesh.current.mesh = m.mesh;
              setTopLevelWireMesh(m.mesh);
            }
          })
          .catch((e) => {
            console.error("Failed to generate top-level wireframe mesh:", e);
            // Reset to allow retry
            topLevelMesh.current = undefined;
          });
      }
    }
  }, [renderProgress, setTopLevelWireMesh, pool]);

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
    }
  };

  useEffect(() => {
    localStorage.setItem("shortcuts", shortCutsOn);
  }, [shortCutsOn]);

  /* Track in-flight rendering tasks, for the foreground and background*/
  const inFlightMeshRender = React.useRef(undefined); // {task: Promise, value: atom.value}
  const targetMesh = React.useRef(undefined); // id of most recently displayed mesh
  const backgroundMesh = React.useRef(undefined); // {id: atom.value, mesh: generated mesh}
  const topLevelMesh = React.useRef(undefined); // {id: molecule.uniqueID, mesh: generated mesh}
  const filteredMeshCache = React.useRef(new Map()); // Cache: "tag1,tag2" -> mesh for filtered combinations
  const previousTagsRef = React.useRef(new Set()); // Track previous tags to avoid unnecessary recalculation

  function makeMesh() {
    setOutdatedMesh(true);
    pool.proxy().then((worker) => {
      // No-op condition
      if (
        !targetMesh.current ||
        JSON.stringify(targetMesh.current) ===
          JSON.stringify(inFlightMeshRender.current?.value)
      ) {
        console.log("[makeMesh] Skipping - no targetMesh or already in flight");
        return;
      }
      console.debug(
        "[makeMesh] Starting mesh generation for: ",
        targetMesh.current,
      );

      // Display geometry unfiltered - tag filtering only applies to top-level background view
      const genTask = worker.generateDisplayMesh(
        targetMesh.current,
        GlobalVariables.topLevelMolecule.getContext(),
      );
      inFlightMeshRender.current = { task: genTask, value: targetMesh.current };
      genTask
        .then((m) => {
          const mesh = m.mesh;
          const id = m.id;
          inFlightMeshRender.current = undefined;
          if (JSON.stringify(id) !== JSON.stringify(targetMesh.current)) {
            console.debug("discarding outdated mesh for: ", id);
            return;
          }
          setMesh(mesh);
          setOutdatedMesh(false);
          setProcessing(false);
          // Also update top-level wireframe if this is the top-level molecule's mesh
          if (
            GlobalVariables.topLevelMolecule &&
            JSON.stringify(targetMesh.current) ===
              JSON.stringify(GlobalVariables.topLevelMolecule.value)
          ) {
            setTopLevelWireMesh(mesh);
          }
          /*Set plane and geometry type for ThreeContext*/
          setPlane(id?.plane);
          setGeometryType(id?.dimension);
        })
        .catch((e) => {
          console.error("Can't display Mesh " + e);
          if (activeAtom) {
            activeAtom.setError("Can't display Mesh " + e);
          }
        })
        .finally(() => {
          createPuppeteerDiv();
        });
    });
  }

  useEffect(() => {
    GlobalVariables.resetView = () => {
      setOutdatedMesh(true);
      targetMesh.current = undefined;
      setMesh([]);
      setWireMesh([]);
      setNonReplicadGeometry(null);
      filteredMeshCache.current.clear(); // Clear mesh cache when resetting view
    };
    GlobalVariables.setSelectionModeAtom = setSelectionModeAtom;
    GlobalVariables.setOutdatedMesh = setOutdatedMesh;
    GlobalVariables._bumpSelectionVersion = setSelectionVersion;
    GlobalVariables.writeToDisplay = (
      moleculeValue,
      context,
      backgroundMolecule = false,
      nonReplicadGeometryFromAtom = null,
    ) => {
      console.log(moleculeValue);
      if (!moleculeValue) {
        console.warn(
          "Received null molecule value for display, using empty geometry",
        );
        moleculeValue = { geometry: [] }; // use a non-null structure which still generates the default mesh
      }

      /* Handle non-Replicad geometry - if otherGeometry is provided*/
      if (
        nonReplicadGeometryFromAtom &&
        nonReplicadGeometryFromAtom.geometry &&
        nonReplicadGeometryFromAtom.geometry.length > 0
      ) {
        setNonReplicadGeometry({ ...nonReplicadGeometryFromAtom });
      } else {
        //We only want to clear non-Replicad if we're not setting the backgroundMolecule
        if (!backgroundMolecule) {
          // If we're trying to set a background molecule but it doesn't have non-Replicad geometry, we should clear the existing non-Replicad geometry to avoid showing stale geometry from a previous background molecule
          setNonReplicadGeometry(null);
        }
      }

      if (backgroundMolecule) {
        if (
          backgroundMesh.current &&
          JSON.stringify(backgroundMesh.current.id) ===
            JSON.stringify(moleculeValue)
        ) {
          setWireMesh(backgroundMesh.current.mesh);
        } else {
          backgroundMesh.current = { id: moleculeValue, mesh: undefined };
          pool.proxy().then((worker) => {
            worker.generateDisplayMesh(moleculeValue, context).then((m) => {
              console.log(m);
              backgroundMesh.current.mesh = m.mesh;
              setWireMesh(m.mesh);
              // Also update top-level wireframe if this is the top-level molecule's mesh
              if (
                GlobalVariables.topLevelMolecule &&
                JSON.stringify(moleculeValue) ===
                  JSON.stringify(GlobalVariables.topLevelMolecule.value)
              ) {
                setTopLevelWireMesh(m.mesh);
              }
              setOutdatedMesh(false);
            });
          });
        }
        // We're showing wireframe background
        // Check if we're also viewing this as the main mesh
        if (
          targetMesh.current &&
          JSON.stringify(targetMesh.current) === JSON.stringify(moleculeValue)
        ) {
          setIsViewingOutputMesh(true);
        } else {
          setIsViewingOutputMesh(false);
        }
      } else {
        targetMesh.current = moleculeValue;
        filteredMeshCache.current.clear(); // Clear cached meshes when switching molecules
        setActiveTags(
          new Set(GlobalVariables.topLevelMolecule?.projectAvailableTags || []),
        ); // Trigger re-application of tag filtering to ensure correct tags are applied for new geometry

        if (
          !nonReplicadGeometryFromAtom?.hideMainMesh &&
          JSON.stringify(targetMesh.current) ===
            JSON.stringify(backgroundMesh.current?.id) &&
          backgroundMesh.current?.mesh
        ) {
          // Special case where we're trying to show the output and have already prepared it as the
          // wireframe background.

          setMesh(backgroundMesh.current.mesh);
          setOutdatedMesh(false);
          setPlane(targetMesh.current?.plane);
          setGeometryType(targetMesh.current?.dimension);
          // We're viewing the output mesh directly, hide the wireframe
          setIsViewingOutputMesh(true);
        } else {
          // General case - generate the mesh for selected atom
          //Check if mesh should be hidden (a.e gcode)
          if (!nonReplicadGeometryFromAtom?.hideMainMesh) {
            makeMesh();
          } else {
            // Invalidate any in-flight mesh render so it doesn't override the
            // non-replicad geometry (e.g. gcode visualization) after computing
            targetMesh.current = null;
            setMesh([]);
            setOutdatedMesh(false);
          }
          // Check if we're viewing the same geometry as the wireframe
          if (
            backgroundMesh.current?.id &&
            JSON.stringify(targetMesh.current) ===
              JSON.stringify(backgroundMesh.current.id)
          ) {
            setIsViewingOutputMesh(true);
          } else {
            setIsViewingOutputMesh(false);
          }
        }
      }
    };

    GlobalVariables.cad = cad;
    GlobalVariables.pool = pool;

    // Wire up worker restart notification so the user sees a warning banner
    // if the CAD worker hangs and has to be automatically restarted.
    cad.onRestartCallback = (message) => {
      setErrorNotification(message, "warning");
      setTimeout(() => setErrorNotification(null), 8000);
    };
  }, [
    activeAtom,
    setMesh,
    setWireMesh,
    setOutdatedMesh,
    setRenderProgress,
    setTopLevelWireMesh,
    setIsViewingOutputMesh,
    setErrorNotification,
    activeTags,
    setSelectionModeAtom,
    setSelectionVersion,
  ]);

  // TAG FILTERING - Apply tag filtering when tags change
  useEffect(() => {
    // Check if tags actually changed
    const tagsChanged =
      activeTags.size !== previousTagsRef.current.size ||
      Array.from(activeTags).some((tag) => !previousTagsRef.current.has(tag));

    // Update previous tags ref
    previousTagsRef.current = new Set(activeTags);

    // Skip if tags didn't actually change
    if (!tagsChanged) {
      return;
    }

    // Only filter if we're viewing the top-level molecule AND not in export/gcode preview mode
    if (activeAtom === GlobalVariables.topLevelMolecule && activeAtom?.value) {
      const moleculeValue = activeAtom.value;
      const context = activeAtom.getContext();

      // Create a cache key from the active tags
      const tagKey = Array.from(activeTags).sort().join(",");

      // Check if we have this mesh combination cached
      if (filteredMeshCache.current.has(tagKey)) {
        setMesh(filteredMeshCache.current.get(tagKey));
        setOutdatedMesh(false);
        return;
      }

      // Generate filtered mesh
      pool
        .proxy()
        .then((worker) => {
          const filteredGeometry = filterGeometryByTags(
            moleculeValue,
            activeTags,
          );
          return worker.generateDisplayMesh(filteredGeometry, context);
        })
        .then((m) => {
          // Cache the generated mesh
          filteredMeshCache.current.set(tagKey, m.mesh);
          setMesh(m.mesh);
          setOutdatedMesh(false);
        })
        .catch((e) => {
          console.error("[activeTags effect] Error regenerating mesh:", e);
        });
    }
  }, [activeTags]);

  /**
   * Load a project from the repository
   * @param {*} project   The project to load as an AWS node
   * @param {*} authorizedUser The authorized user for the request
   * @returns
   */
  const loadProject = function (project, authorizedUser) {
    GlobalVariables.undoCommandStack = [];
    GlobalVariables.totalAtomCount = 0;
    GlobalVariables.numberOfAtomsToLoad = 0;
    GlobalVariables.startTime = new Date().getTime();

    const projectKey = `${project.owner}/${project.repoName}`;

    // Guard against duplicate loading: add flag BEFORE fetching from GitHub
    // so concurrent calls see it in the Set
    if (!GlobalVariables.loadingProjects) {
      GlobalVariables.loadingProjects = new Set();
    }
    if (GlobalVariables.loadingProjects.has(projectKey)) {
      console.log("Project already loading, skipping:", projectKey);
      return Promise.resolve(); // Return resolved promise for consistency
    }
    GlobalVariables.loadingProjects.add(projectKey);

    if (authorizedUser) {
      var octokit = authorizedUser;
    } else {
      var octokit = new Octokit({
        headers: { "X-GitHub-Api-Version": "2022-11-28" },
      });
    }
    // Sets the current repo information from node data
    octokit.rest.repos
      .get({
        owner: project.owner,
        repo: project.repoName,
      })
      .then(async (response) => {
        GlobalVariables.loadedRepo = response.data;
        GlobalVariables.currentRepo = response.data;
        GlobalVariables.currentRepoName = project.repoName;
      });

    return octokit.rest.repos
      .getContent({
        owner: project.owner,
        repo: project.repoName,
        path: "project.abundance",
      })
      .then(async (response) => {
        let rawFileContent = await fetchGitHubFileContent(response.data);
        let rawFile;
        try {
          rawFile = JSON.parse(rawFileContent);
        } catch (parseError) {
          if (import.meta.env.DEV) {
            console.warn(
              "project.abundance JSON.parse failed, retrying with cache bust:",
              parseError?.message,
              "contentLength:",
              rawFileContent?.length ?? 0,
            );
          }
          rawFileContent = await fetchGitHubFileContent(response.data, {
            bustCache: true,
          });
          rawFile = JSON.parse(rawFileContent);
        }

        // Reset ID counter to avoid collisions with existing IDs
        GlobalVariables.resetIdCounter(rawFile);

        const targetMolecule = GlobalVariables.topLevelMolecule;
        const projectKey = `${project.owner}/${project.repoName}`;
        const currentProjectKey =
          GlobalVariables.currentAWSnode?.owner &&
          GlobalVariables.currentAWSnode?.repoName
            ? `${GlobalVariables.currentAWSnode.owner}/${GlobalVariables.currentAWSnode.repoName}`
            : null;

        if (currentProjectKey && currentProjectKey !== projectKey) {
          return;
        }
        // Guard against duplicate deserialization: multiple components (e.g.
        // CreateMode and FlowCanvas) can independently call loadProject for
        // the same project during mount/navigation. Since deserialize() only
        // appends atoms, calling it twice on the same molecule instance would
        // place every atom twice, stacked on top of each other. Tagging the
        // molecule instance with the project it has already loaded (or
        // started loading) makes repeat calls a no-op.
        if (targetMolecule.loadedProjectKey === projectKey) {
          GlobalVariables.currentMolecule = targetMolecule;
          targetMolecule.selected = true;
          setActiveAtom(targetMolecule);
          return;
        }
        targetMolecule.loadedProjectKey = projectKey;

        // Cancel any in-flight CAD calls from the previous project so their
        // progress log intervals don't keep running after the switch.
        cad.cancelAll();

        try {
          if (rawFile.filetypeVersion == 1) {
            await targetMolecule.deserialize(rawFile);
          } else {
            // For older file versions, try to deserialize directly for now
            await targetMolecule.deserialize(rawFile);
          }
        } catch (deserializeError) {
          GlobalVariables.loadingProjects.delete(projectKey);
          throw deserializeError;
        }
        // Clear loading flag after deserialization completes
        GlobalVariables.loadingProjects.delete(projectKey);
        GlobalVariables.currentMolecule = targetMolecule;
        GlobalVariables.currentMolecule.selected = true;
        setActiveAtom(GlobalVariables.currentMolecule);
      })
      .catch(async (e) => {
        // If error is about bad credentials, trigger re-authentication
        if (
          e?.status === 401 ||
          (typeof e?.message === "string" &&
            e.message.toLowerCase().includes("bad credentials"))
        ) {
          // alert("Session expired or bad credentials. Please re-authenticate.");
          //
          // Redirect to /callback or trigger your OAuth flow here
          console.warn("Authentication error, redirecting to re-authenticate.");
          authRedirectHandler({
            authType: "reauth",
            currentProjectRep: undefined,
            returnTo: `/`,
          });
          return;
        }
        /* We are trying to open a private repo without sufficient scopes, trigger re-auth with repo scope*/
        if (project.privateRepo ? !userScopes.includes("repo") : false) {
          setErrorNotification(
            "Insufficient token scopes to load private repository. Please re-authenticate with the 'repo' scope.",
          );
          authRedirectHandler({
            authType: "reauth",
            currentProjectRep: undefined,
            returnTo: `/`,
            privateRepo: true,
          });
          return;
        }

        // If error is 404 (project not found), mark it in AWS
        if (e?.status === 404) {
          console.warn(
            "Project not found on GitHub, marking as not found in AWS:",
            project.repoName,
          );
          const apiUpdateUrl =
            "https://hg5gsgv9te.execute-api.us-east-2.amazonaws.com/abundance-stage/update-item";

          try {
            await fetch(apiUpdateUrl, {
              method: "POST",
              body: JSON.stringify({
                owner: project.owner,
                repoName: project.repoName,
                attributeUpdates: {
                  notFound: true,
                },
              }),
              headers: {
                "Content-type": "application/json; charset=UTF-8",
              },
            });
          } catch (updateError) {
            console.error("Error updating AWS node:", updateError);
          }
        }

        setErrorNotification("Can't load/find project: " + (e.message || e));
        setTimeout(() => setErrorNotification(null), 5000);
        // Clear loading flag on error
        GlobalVariables.loadingProjects.delete(projectKey);
        // Navigate back to projects page after error
        navigate("/");
        throw new Error("Can't load/find project " + e);
      });
  };

  const location = useLocation();
  let errorClass = `${notificationType}-notification`;
  if (location.pathname.includes("/run")) {
    errorClass = `${notificationType}-notification-run`;
  }

  return (
    <main>
      {/* Error notification */}
      {errorNotification && (
        <div className={errorClass}>{errorNotification}</div>
      )}{" "}
      <DevSettingsModal />{" "}
      <Routes>
        <Route
          exact
          path=""
          element={
            <ProjectProvider cad={cad} loadProject={loadProject}>
              <LoginMode />
            </ProjectProvider>
          }
        />
        <Route
          path="/callback"
          element={
            <Callback
              isAuthorized={isAuthorized}
              setIsAuthorized={setIsAuthorized}
              setAuthorizedUserOcto={setAuthorizedUserOcto}
              setRedirectType={setRedirectType}
            />
          }
        />
        <Route path="/user-guide" element={<UserGuidePage />} />
        <Route
          path="/pull/:baseOwner/:baseRepo/:headOwner/:headRepo"
          element={
            <ProjectProvider cad={cad} loadProject={loadProject}>
              <PullMode processing={processing} setProcessing={setProcessing} />
            </ProjectProvider>
          }
        />
        <Route
          path="/pull"
          element={
            <ProjectProvider cad={cad} loadProject={loadProject}>
              <PullMode processing={processing} setProcessing={setProcessing} />
            </ProjectProvider>
          }
        />
        <Route
          path="/run/:owner/:repoName"
          element={
            <ProjectProvider cad={cad} loadProject={loadProject}>
              <RunMode processing={processing} setProcessing={setProcessing} />
            </ProjectProvider>
          }
        />
        <Route
          path="/preview/:owner/:repoName"
          element={
            <ProjectProvider cad={cad} loadProject={loadProject}>
              <PreviewCreateMode />
            </ProjectProvider>
          }
        />
        <Route
          path="/:owner/:repoName"
          element={
            <ProjectProvider cad={cad} loadProject={loadProject}>
              <CreateMode />
            </ProjectProvider>
          }
        />
      </Routes>
    </main>
  );
}

export default function ReplicadApp() {
  return (
    <QueryClientProvider client={queryClient}>
      <DevSettingsProvider>
        <AuthProvider>
          <ThumbnailDialogProvider>
            <AppStateProvider>
              <BrowseSettingsProvider>
                <FileImportProvider>
                  <TutorialProvider>
                    <RenderingProvider>
                      <ProgressBarProvider>
                        <AppContent />
                      </ProgressBarProvider>
                    </RenderingProvider>
                  </TutorialProvider>
                </FileImportProvider>
              </BrowseSettingsProvider>
            </AppStateProvider>
          </ThumbnailDialogProvider>
        </AuthProvider>
      </DevSettingsProvider>
    </QueryClientProvider>
  );
}
