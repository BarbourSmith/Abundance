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

import { wrap } from "comlink";
import GlobalVariables from "./js/globalvariables.js";
import LoginMode from "./components/main-routes/LoginMode.jsx";
import RunMode from "./components/main-routes/RunMode.jsx";
import CreateMode from "./components/main-routes/CreateMode.jsx";
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
  useRendering,
  useAuth,
  useAppState,
} from "./contexts/index.js";

import { TutorialProvider } from "./tutorial/TutorialManager";
import { ProgressBarProvider } from "./components/secondary/ProgressBarManager.jsx";

/*Import style scripts*/
import "./styles/maslowCreate.css";
import "./styles/menuIcons.css";
import "./styles/login.css";
import "./styles/codemirror.css";
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

const cad = wrap(new cadWorker());

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
  } = useRendering();

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
    cad.createMesh(size).then((m) => {
      setMesh(m);
      setWireMesh(m);
    });
  }, [size, setMesh, setWireMesh]);

  useEffect(() => {
    const element = document.querySelector("html");
    const storedClass = localStorage.getItem("displayTheme");

    if (element && storedClass) {
      element.className = storedClass;
    }
  }, []);

  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    console.log("Processing state changed:", processing);
    setRenderProgress(0);
    setRenderBarVisible(true);
    setRenderStage("Waiting for input"); // Start with Building stage by default

    let interval = setInterval(() => {
      const molecule = GlobalVariables.topLevelMolecule;
      if (molecule) {
        // Check if molecule is fully ready first
        if (molecule.getState().status === "ready") {
          setRenderProgress(100);
          setRenderStage("Rendering");
          clearInterval(interval);
          return;
        }

        // Determine which stage we're in based on the 3-stage system
        const moleculeStatus = molecule.getState().status;

        // Stage 1: Check if any top-level Input atoms are in WAITING state
        const hasWaitingInputs = molecule.nodesOnTheScreen.some((atom) => {
          if (atom.atomType === "Input") {
            return (
              atom.getState().status === "waiting" ||
              atom.value === "__GEOMETRY_INPUT__"
            );
          }
          return false;
        });

        if (hasWaitingInputs) {
          setRenderStage("Waiting for input");
          setRenderProgress(0); // First third
          return;
        }

        // Stage 2: Check if top-level molecule is in WAITING or PROCESSING state
        if (moleculeStatus === "waiting" || moleculeStatus === "processing") {
          setRenderStage("Building");
          // Calculate actual progress based on completion of atoms
          const [ready, total] = molecule.getCompletionTuple();
          // Guard against division by zero (though getCompletionTuple handles this)
          const progress = total > 0 ? ready / total : 1;
          // Map progress from 0-100% of atoms completed to 30-80% of overall progress
          const buildingProgress = 30 + progress * 50;
          setRenderProgress(Math.round(buildingProgress));
          return;
        }

        // Stage 3: Rendering - mesh is being made and sent to render
        setRenderStage("Rendering");
        setRenderProgress(80); // Almost complete, will go to 100 when ready
      }
    }, 500); // Poll every 500ms

    return () => clearInterval(interval);
  }, [GlobalVariables.topLevelMolecule, processing]);

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

  function makeMesh() {
    setOutdatedMesh(true);
    pool.proxy().then((worker) => {
      // No-op condition
      if (
        !targetMesh.current ||
        JSON.stringify(targetMesh.current) ===
          JSON.stringify(inFlightMeshRender.current?.value)
      ) {
        console.log("no-op because target is already in-flight or undefined");
        return;
      }
      console.debug("starting mesh generation for: ", targetMesh.current);
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
          activeAtom.setError("Can't display Mesh " + e);
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
    };
    GlobalVariables.writeToDisplay = (
      moleculeValue,
      context,
      backgroundMolecule = false,
      nonReplicadGeometryFromAtom = null,
    ) => {
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
  }, [
    activeAtom,
    setMesh,
    setWireMesh,
    setOutdatedMesh,
    setRenderProgress,
    setTopLevelWireMesh,
    setIsViewingOutputMesh,
  ]);

  /**
   * Load a project from the repository
   * @param {*} project   The project to load as an AWS node
   * @param {*} authorizedUser The authorized user for the request
   * @returns
   */
  const loadProject = function (project, authorizedUser) {
    GlobalVariables.recentMoleculeRepresentation = [];
    GlobalVariables.undoOperationHistory = [];
    GlobalVariables.totalAtomCount = 0;
    GlobalVariables.numberOfAtomsToLoad = 0;
    GlobalVariables.startTime = new Date().getTime();

    if (authorizedUser) {
      var octokit = authorizedUser;
    } else {
      var octokit = new Octokit();
    }
    // Sets the current repo information from node data
    octokit
      .request("GET /repos/{owner}/{repo}", {
        owner: project.owner,
        repo: project.repoName,
      })
      .then(async (response) => {
        GlobalVariables.loadedRepo = response.data;
        GlobalVariables.currentRepo = response.data;
        GlobalVariables.currentRepoName = project.repoName;
      });

    return octokit
      .request("GET /repos/{owner}/{repo}/contents/project.abundance", {
        owner: project.owner,
        repo: project.repoName,
      })
      .then(async (response) => {
        let rawFileContent;
        // Handle large files (>1MB) using download_url
        if (!response.data.content || response.data.content.length === 0) {
          const fileResponse = await fetch(response.data.download_url);
          rawFileContent = await fileResponse.text();
        } else {
          // Handle small files using base64 content with UTF-8 encoding
          rawFileContent = GlobalVariables.fromBinaryStr(
            atob(response.data.content),
          );
        }

        let rawFile = JSON.parse(rawFileContent);

        // Reset ID counter to avoid collisions with existing IDs
        GlobalVariables.resetIdCounter(rawFile);

        if (rawFile.filetypeVersion == 1) {
          GlobalVariables.topLevelMolecule.deserialize(rawFile);
        } else {
          // For older file versions, try to deserialize directly for now
          GlobalVariables.topLevelMolecule.deserialize(rawFile);
        }
        GlobalVariables.currentMolecule = GlobalVariables.topLevelMolecule;
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
      )}
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
          path="/run/:owner/:repoName"
          element={
            <ProjectProvider cad={cad} loadProject={loadProject}>
              <RunMode processing={processing} setProcessing={setProcessing} />
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
      <AuthProvider>
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
      </AuthProvider>
    </QueryClientProvider>
  );
}
