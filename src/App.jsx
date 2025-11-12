import React, { useState, useEffect } from "react";
import { Octokit } from "octokit";
import {
  HashRouter as Router,
  // BrowserRouter as Router,
  Routes,
  Route,
  useNavigate,
} from "react-router-dom";

import { wrap } from "comlink";
import GlobalVariables from "./js/globalvariables.js";
import LoginMode from "./components/main-routes/LoginMode.jsx";
import RunMode from "./components/main-routes/RunMode.jsx";
import CreateMode from "./components/main-routes/CreateMode.jsx";
import UserGuidePage from "./components/main-routes/UserGuidePage.jsx";
import cadWorker from "./worker/worker.ts?worker";

import { QueryClient, QueryClientProvider } from "react-query";
import Callback from "./components/main-routes/CallBack.jsx";

// Import contexts
import {
  RenderingProvider,
  AuthProvider,
  AppStateProvider,
  ProjectProvider,
  useRendering,
  useAuth,
  useAppState,
} from "./contexts/index.js";

import { TutorialOverlay } from "./tutorial/TutorialOverlay";
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
    setTopLevelWireMesh,
    setPlane,
    setGeometryType,
  } = useRendering();

  const {
    setIsLoggedIn,
    isAuthorized,
    setIsAuthorized,
    setAuthorizedUserOcto,
    authRedirectHandler,
  } = useAuth();

  const {
    activeAtom,
    setActiveAtom,
    shortCutsOn,
    setRedirectType,
    errorNotification,
    setErrorNotification,
    setGcodeProgress,
    setGcodeBarVisible,
    setGcodeLabel,
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

  useEffect(() => {
    setRenderProgress(0);
    setRenderBarVisible(true);
    let interval = setInterval(() => {
      const molecule = GlobalVariables.topLevelMolecule;
      if (molecule) {
        console.log("Molecule state:", molecule.getState().status);
        const [ready, total] = molecule.getCompletionTuple();
        // Update your UI with progress here
        //console.log(`Molecule progress: ${ready} / ${total}`);
        const progress = Math.floor((ready / total) * 100);
        setRenderProgress(progress);
        if (molecule.getState().status === "ready") {
          clearInterval(interval);
        }
      }
    }, 500); // Poll every 500ms

    return () => clearInterval(interval);
  }, [
    GlobalVariables.topLevelMolecule,
    setRenderProgress,
    setRenderBarVisible,
  ]);

  useEffect(() => {
    if (renderProgress >= 100) {
      const timeout = setTimeout(() => {
        setRenderBarVisible(false);
      }, 1000);
      return () => clearTimeout(timeout);
    }
  }, [renderProgress, setRenderBarVisible]);

  // Set up GCode progress callbacks
  useEffect(() => {
    GlobalVariables.setGcodeProgressCallback = (progress, label) => {
      setGcodeProgress(Math.floor(progress * 100));
      if (label) {
        setGcodeLabel(label);
      }
    };
    GlobalVariables.setGcodeBarVisibleCallback = (visible) => {
      setGcodeBarVisible(visible);
    };
    
    return () => {
      GlobalVariables.setGcodeProgressCallback = null;
      GlobalVariables.setGcodeBarVisibleCallback = null;
    };
  }, [setGcodeProgress, setGcodeBarVisible, setGcodeLabel]);

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
    }
  };

  useEffect(() => {
    localStorage.setItem("shortcuts", shortCutsOn);
  }, [shortCutsOn]);

  useEffect(() => {
    GlobalVariables.writeToDisplay = (moleculeValue, resetView = false, wireOnly = false) => {
      setOutdatedMesh(true);
      if (resetView) {
        console.log("Resetting view for value:", moleculeValue);
        cad
          .resetView()
          .then((m) => {
            setMesh(m);
            setWireMesh(m);
            setOutdatedMesh(false);
          })
          .catch((e) => {
            console.error("reset view not working" + e);
          });
      } else {
        console.log("Generating mesh for value:", moleculeValue);
        cad
          .generateDisplayMesh(
            moleculeValue,
            GlobalVariables.topLevelMolecule.getContext()
          )
          .then((m) => {
            if (wireOnly) {
              setWireMesh(m);
            } else {
              setMesh(m);
            }
            setOutdatedMesh(false);
            /*Set plane and geometry type for ThreeContext*/
            setPlane(moleculeValue?.plane);
            setGeometryType(moleculeValue?.dimension);
          })
          .catch((e) => {
            console.error("Can't display Mesh " + e);
            activeAtom.setError("Can't display Mesh " + e);
          })
          .finally(() => {
            createPuppeteerDiv();
          });
      }
    }

    GlobalVariables.cad = cad;
  }, [
    activeAtom,
    setMesh,
    setWireMesh,
    setOutdatedMesh,
    setRenderProgress,
    setTopLevelWireMesh,
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
            atob(response.data.content)
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
      .catch((e) => {
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
        setErrorNotification("Can't load/find project: " + (e.message || e));
        setTimeout(() => setErrorNotification(null), 5000);
        // Navigate back to projects page after error
        navigate("/");
        throw new Error("Can't load/find project " + e);
      });
  };

  return (
    <main>
      {/* Error notification */}
      {errorNotification && (
        <div className="error-notification">{errorNotification}</div>
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
              setIsLoggedIn={setIsLoggedIn}
              setAuthorizedUserOcto={setAuthorizedUserOcto}
              setRedirectType={setRedirectType}
            />
          }
        />
        <Route
          path="/user-guide"
          element={<UserGuidePage />}
        />
        <Route
          path="/run/:owner/:repoName"
          element={
            <ProjectProvider cad={cad} loadProject={loadProject}>
              <RunMode />
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
          <TutorialProvider>
            <RenderingProvider>
              <ProgressBarProvider>
                <AppContent />
              </ProgressBarProvider>
            </RenderingProvider>
          </TutorialProvider>
        </AppStateProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
