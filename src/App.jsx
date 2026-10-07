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
import {
  loadSavedBom,
  serializeProjectForChangeDetection,
} from "./js/projectSaveBaseline.js";
import { filterGeometryByTags } from "./utils/geometryFilterByTags.js";
import { CadWorkerManager } from "./worker/cadWorkerManager.js";
import { DisplayScheduler, meshKey } from "./js/displayScheduler.js";
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
import { AgentBridgeHost } from "./components/secondary/AgentBridge.jsx";

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

// Every mesh-worker request goes through this scheduler. It keeps one pending
// request per display slot, runs one task at a time in priority order, and
// caches finished meshes, so bursts of clicks collapse to the latest request
// and stale results can never overwrite newer ones.
const displayScheduler = new DisplayScheduler((method, args) =>
  pool.exec(method, args),
);
GlobalVariables.displayScheduler = displayScheduler;

// Stable placeholder shown when an atom has no value yet. A shared object keeps
// its display key (and therefore the cached "No output" mesh) stable.
const EMPTY_DISPLAY_VALUE = Object.freeze({ geometry: [] });
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

// The worker runs calls concurrently, so the task that most recently
// reported progress is the one actually computing; prefer it over the one
// that merely started last.
function getLatestActiveWorkerTask(taskMap) {
  const activityTime = (task) =>
    task?.lastProgressAt || task?.startedAt || task?.queuedAt || 0;
  let latestTask = null;
  taskMap.forEach((task) => {
    if (!latestTask || activityTime(task) >= activityTime(latestTask)) {
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
    const refreshUiNow = () => {
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

    // Every atom status change fires "observable-entity-changed", and a full
    // recompute produces thousands of them. Walking the molecule tree for each
    // one made recomputes O(N^2) on the main thread, so refreshes are
    // coalesced to at most one per animation frame.
    let refreshHandle = null;
    const hasRaf = typeof window.requestAnimationFrame === "function";
    const refreshUi = () => {
      if (refreshHandle !== null) return;
      const run = () => {
        refreshHandle = null;
        refreshUiNow();
      };
      refreshHandle = hasRaf
        ? window.requestAnimationFrame(run)
        : setTimeout(run, 16);
    };

    const handleTopLevelChanged = () => refreshUi();
    const handleObservableChanged = () => refreshUi();
    const handleWorkerTaskStart = (event) => {
      const detail = event?.detail || {};
      if (!detail.taskId) return;
      // A task announced early (it reported progress from behind the queue
      // head) gets a second start event once it reaches the head; keep the
      // progress it has already reported.
      const existing = activeWorkerTasksRef.current.get(detail.taskId);
      activeWorkerTasksRef.current.set(detail.taskId, {
        ...existing,
        ...detail,
      });
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
      task.lastProgressAt = detail.at || Date.now();
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
    refreshUiNow();

    return () => {
      if (refreshHandle !== null) {
        if (hasRaf) {
          window.cancelAnimationFrame(refreshHandle);
        } else {
          clearTimeout(refreshHandle);
        }
        refreshHandle = null;
      }
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

  /* Display bookkeeping. Each ref holds the mesh key currently wanted for a
     view; results whose key no longer matches are discarded. Keys are computed
     once per request (see displayScheduler.js) instead of re-stringifying
     whole assembly trees for every comparison. */
  const targetKeyRef = React.useRef(null); // foreground mesh key
  const backgroundKeyRef = React.useRef(null); // background wireframe key
  const topLevelKeyRef = React.useRef(null); // top-level wireframe key
  const previousTagsRef = React.useRef(new Set()); // Track previous tags to avoid unnecessary recalculation
  const activeAtomRef = React.useRef(activeAtom);
  activeAtomRef.current = activeAtom;

  // Mesh key of the top-level molecule's current value, memoized by value
  // identity so it is only recomputed when the top-level value changes.
  const topLevelKeyMemo = React.useRef({ value: undefined, key: null });
  const currentTopLevelKey = () => {
    const molecule = GlobalVariables.topLevelMolecule;
    if (!molecule || molecule.value == null) return null;
    const memo = topLevelKeyMemo.current;
    if (memo.value !== molecule.value) {
      memo.value = molecule.value;
      memo.key = meshKey(molecule.value, molecule.getContext());
    }
    return memo.key;
  };

  // Generate top-level molecule wireframe mesh when molecule is ready
  useEffect(() => {
    const molecule = GlobalVariables.topLevelMolecule;
    if (renderProgress < 100 || !molecule || molecule.value == null) {
      return;
    }
    const key = currentTopLevelKey();
    if (topLevelKeyRef.current === key) {
      return; // Already requested or displayed for this value.
    }
    topLevelKeyRef.current = key;
    displayScheduler.request("topLevel", {
      args: [molecule.value, molecule.getContext()],
      key,
      onResult: (m) => {
        if (topLevelKeyRef.current === key) {
          setTopLevelWireMesh(m.mesh);
        }
      },
      onError: (e) => {
        console.error("Failed to generate top-level wireframe mesh:", e);
        if (topLevelKeyRef.current === key) {
          topLevelKeyRef.current = null; // allow retry
        }
      },
    });
  }, [renderProgress, setTopLevelWireMesh]);

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

  useEffect(() => {
    GlobalVariables.resetView = () => {
      GlobalVariables.displayedAtom = null;
      setOutdatedMesh(true);
      targetKeyRef.current = null;
      backgroundKeyRef.current = null;
      displayScheduler.cancel("foreground");
      displayScheduler.cancel("background");
      setMesh([]);
      setWireMesh([]);
      setNonReplicadGeometry(null);
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
      console.trace(`writing to display called with : ${JSON.stringify(moleculeValue)}`)
      if (!moleculeValue) {
        // A non-null structure which still generates the default mesh
        moleculeValue = EMPTY_DISPLAY_VALUE;
      }
      if (!context) {
        context = GlobalVariables.topLevelMolecule?.getContext();
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

      const key = meshKey(moleculeValue, context);

      if (backgroundMolecule) {
        backgroundKeyRef.current = key;
        displayScheduler.request("background", {
          args: [moleculeValue, context],
          key,
          onResult: (m) => {
            // A newer background request superseded this one.
            if (backgroundKeyRef.current !== key) return;
            setWireMesh(m.mesh);
            if (key === currentTopLevelKey()) {
              setTopLevelWireMesh(m.mesh);
              topLevelKeyRef.current = key;
            }
            // Only clear the "outdated" tint when no foreground mesh is still
            // on its way; otherwise the old foreground would look current.
            if (!displayScheduler.isPending("foreground")) {
              setOutdatedMesh(false);
            }
          },
          onError: (e) => {
            console.error("Can't display background mesh", e);
          },
        });
        // We're showing wireframe background
        // Check if we're also viewing this as the main mesh
        setIsViewingOutputMesh(targetKeyRef.current === key);
        return;
      }

      setActiveTags(
        new Set(GlobalVariables.topLevelMolecule?.projectAvailableTags || []),
      ); // Trigger re-application of tag filtering to ensure correct tags are applied for new geometry

      if (nonReplicadGeometryFromAtom?.hideMainMesh) {
        // Drop any pending mesh render so it doesn't override the
        // non-replicad geometry (e.g. gcode visualization) after computing
        targetKeyRef.current = null;
        displayScheduler.cancel("foreground");
        setMesh([]);
        setOutdatedMesh(false);
        setIsViewingOutputMesh(false);
        return;
      }

      targetKeyRef.current = key;
      setIsViewingOutputMesh(backgroundKeyRef.current === key);
      setOutdatedMesh(true);
      const displayedValue = moleculeValue;
      // Display geometry unfiltered - tag filtering only applies to top-level background view
      displayScheduler.request("foreground", {
        args: [displayedValue, context],
        key,
        onResult: (m) => {
          // Superseded by a newer foreground request (or a reset).
          if (targetKeyRef.current !== key) return;
          setMesh(m.mesh);
          setOutdatedMesh(false);
          setProcessing(false);
          // Also update top-level wireframe if this is the top-level molecule's mesh
          if (key === currentTopLevelKey()) {
            setTopLevelWireMesh(m.mesh);
            topLevelKeyRef.current = key;
          }
          /*Set plane and geometry type for ThreeContext*/
          setPlane(displayedValue?.plane);
          setGeometryType(displayedValue?.dimension);
          createPuppeteerDiv();
        },
        onError: (e) => {
          console.error("Can't display Mesh " + e);
          if (targetKeyRef.current === key) {
            setOutdatedMesh(false);
            activeAtomRef.current?.setError?.("Can't display Mesh " + e);
          }
          createPuppeteerDiv();
        },
      });
    };

    GlobalVariables.cad = cad;
    GlobalVariables.pool = pool;
    GlobalVariables.displayScheduler = displayScheduler;

    // Wire up worker restart notification so the user sees a warning banner
    // if the CAD worker hangs and has to be automatically restarted.
    cad.onRestartCallback = (message) => {
      setErrorNotification(message, "warning");
      setTimeout(() => setErrorNotification(null), 8000);
    };
  }, [
    setMesh,
    setWireMesh,
    setOutdatedMesh,
    setRenderProgress,
    setTopLevelWireMesh,
    setIsViewingOutputMesh,
    setErrorNotification,
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
      const context = activeAtom.getContext();
      const filteredGeometry = filterGeometryByTags(activeAtom.value, activeTags);
      // The foreground target this filter applies to. If the user displays
      // something else before the filtered mesh is ready, it is discarded.
      const baseKey = targetKeyRef.current;
      displayScheduler.request("foreground", {
        args: [filteredGeometry, context],
        key: meshKey(filteredGeometry, context),
        onResult: (m) => {
          if (targetKeyRef.current !== baseKey) return;
          setMesh(m.mesh);
          setOutdatedMesh(false);
          setProcessing(false);
          setPlane(filteredGeometry?.plane);
          setGeometryType(filteredGeometry?.dimension);
          // This request supersedes the unfiltered one, so it is responsible
          // for signalling that the display settled.
          createPuppeteerDiv();
        },
        onError: (e) => {
          console.error("[activeTags effect] Error regenerating mesh:", e);
          createPuppeteerDiv();
        },
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
    console.log("Loading project:", project);
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
        let rawFileContent = await fetchGitHubFileContent(response.data, {
          octokit,
        });
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
            octokit,
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
        const savedBom = await loadSavedBom(
          octokit,
          project.owner,
          project.repoName,
        );
        // The BOM request may finish after navigation to a different project.
        if (GlobalVariables.topLevelMolecule !== targetMolecule) {
          GlobalVariables.loadingProjects.delete(projectKey);
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
        // Remember the loaded state so saves can skip when nothing changed.
        // Compare authored state; computation can continue after deserialization.
        GlobalVariables.lastSavedProject = {
          projectKey,
          json: serializeProjectForChangeDetection(targetMolecule),
          bom: savedBom,
        };
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
            repo: { owner: project.owner, repo: project.repoName },
            returnTo: `/${project.owner}/${project.repoName}`,
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
      <AgentBridgeHost />
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
