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

/*Import style scripts*/
import "./styles/maslowCreate.css";
import "./styles/menuIcons.css";
import "./styles/login.css";
import "./styles/codemirror.css";

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
    GlobalVariables.writeToDisplay = (moleculeValue, resetView = false) => {
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
            setMesh(m);
            setOutdatedMesh(false);
            setPlane(moleculeValue?.plane);
          })
          .catch((e) => {
            console.error("Can't display Mesh " + e);
            activeAtom.setError("Can't display Mesh " + e);
          });
        /*Set wireMesh*/
        //Exception: Don't display the mesh if the thing we are displaying is already the output
        if (GlobalVariables.currentMolecule.value != moleculeValue) {
          cad
            .generateDisplayMesh(
              GlobalVariables.currentMolecule.uniqueID,
              GlobalVariables.topLevelMolecule.getContext()
            )
            .then((w) => {
              setWireMesh(w);
              // Only create Puppeteer div when displaying the top-level molecule's output
              if (moleculeValue === GlobalVariables.topLevelMolecule?.value) {
                createPuppeteerDiv();
              }
            })
            .catch((e) => {
              console.error("Can't compute Wireframe/No output " + e);
              // Create div even on error for top-level molecule to prevent hanging
              if (moleculeValue === GlobalVariables.topLevelMolecule?.value) {
                createPuppeteerDiv();
              }
            });
        } else {
          /* reset mesh view if in output mode*/

          cad
            .resetView()
            .then((m) => {
              setWireMesh(m);
              // Create Puppeteer div when in output mode (displaying top-level molecule)
              createPuppeteerDiv();
            })
            .catch((e) => {
              console.error("reset view not working" + e);
              // Create div even on error to prevent hanging
              createPuppeteerDiv();
            });
        }

        // Generate top-level molecule wireframe if we're inside a nested molecule
        if (
          GlobalVariables.topLevelMolecule &&
          GlobalVariables.currentMolecule !== GlobalVariables.topLevelMolecule
        ) {
          cad
            .generateDisplayMesh(GlobalVariables.topLevelMolecule.value)
            .then((topMesh) => {
              setTopLevelWireMesh(topMesh);
            })
            .catch((e) => {
              console.error("Can't compute top-level wireframe: " + e);
            });
        } else {
          // Clear top-level wireframe when at top level
          setTopLevelWireMesh(null);
        }
      }
    };

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
          path="/:owner/:repoName"
          element={
            <ProjectProvider cad={cad} loadProject={loadProject}>
              <CreateMode />
            </ProjectProvider>
          }
        />
        <Route
          path="/run/:owner/:repoName"
          element={
            <ProjectProvider cad={cad} loadProject={loadProject}>
              <RunMode />
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
              <AppContent />
            </RenderingProvider>
          </TutorialProvider>
        </AppStateProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
