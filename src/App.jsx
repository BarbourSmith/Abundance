import React, { useState, useEffect } from "react";
import { Octokit } from "https://esm.sh/octokit@2.0.19";
import {
  HashRouter as Router,
  // BrowserRouter as Router,
  Routes,
  Route,
} from "react-router-dom";

import { wrap } from "comlink";
import GlobalVariables from "./js/globalvariables.js";
import LoginMode from "./components/main-routes/LoginMode.jsx";
import RunMode from "./components/main-routes/RunMode.jsx";
import CreateMode from "./components/main-routes/CreateMode.jsx";
import cadWorker from "./worker/worker.js?worker";

import { QueryClient, QueryClientProvider } from "react-query";
import Callback from "./components/main-routes/CallBack.jsx";

/*Import style scripts*/
import "./styles/maslowCreate.css";
import "./styles/menuIcons.css";
import "./styles/login.css";
import "./styles/codemirror.css";

import RenderProgressBar from "./components/secondary/RenderProgressBar.jsx";
import { render } from "@testing-library/react";

const queryClient = new QueryClient();
/**
 * The octokit instance which allows authenticated interaction with GitHub.
 * @type {object}
 */

const cad = wrap(new cadWorker());
export default function ReplicadApp() {
  const [size, setSize] = useState(5);
  const [mesh, setMesh] = useState({});
  const [wireMesh, setWireMesh] = useState(null);
  const [outdatedMesh, setOutdatedMesh] = useState(false);
  const [isAuthorized, setIsAuthorized] = useState(false);

  useEffect(() => {
    cad.createMesh(size).then((m) => {
      setMesh(m);
      setWireMesh(m);
    });
  }, [size]);

  useEffect(() => {
    const element = document.querySelector("html");
    const storedClass = localStorage.getItem("displayTheme");

    if (element && storedClass) {
      element.className = storedClass;
    }
  }, []);

  const [isloggedIn, setIsLoggedIn] = useState(false);
  const [activeAtom, setActiveAtom] = useState(null);
  const [exportPopUp, setExportPopUp] = useState(false);
  const [redirectType, setRedirectType] = useState(null);

  /** State for render progress bar */
  const [renderProgress, setRenderProgress] = useState(0);
  const [renderBarVisible, setRenderBarVisible] = useState(true);

  const [authorizedUserOcto, setAuthorizedUserOcto] = useState(null);
  const [shortCutsOn, setShortCuts] = useState(
    localStorage.getItem("shortcuts") === "true"
  );

  useEffect(() => {
    setRenderProgress(0);
    setRenderBarVisible(true);
    let interval = setInterval(() => {
      const molecule = GlobalVariables.topLevelMolecule;
      if (molecule) {
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
  }, [GlobalVariables.topLevelMolecule]);

  useEffect(() => {
    if (renderProgress >= 100) {
      const timeout = setTimeout(() => {
        setRenderBarVisible(false);
      }, 1000);
      return () => clearTimeout(timeout);
    }
  }, [renderProgress]);

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
    GlobalVariables.writeToDisplay = (id, resetView = false) => {
      setOutdatedMesh(true);
      if (resetView) {
        cad
          .resetView()
          .then((m) => {
            setMesh(m);
            setWireMesh(m);
            setOutdatedMesh(false);
            setRenderProgress(100);
          })
          .catch((e) => {
            console.error("reset view not working" + e);
          });
      } else {
        console.log("Generating mesh for id:", id);
        cad
          .generateDisplayMesh(id)
          .then((m) => {
            setMesh(m);
            setOutdatedMesh(false);
          })
          .catch((e) => {
            console.error("Can't display Mesh " + e);
            activeAtom.setError("Can't display Mesh " + e);
          });
        /*Set wireMesh*/
        //Exception: Don't display the mesh if the thing we are displaying is already the output
        if (GlobalVariables.currentMolecule.uniqueID != id) {
          cad
            .generateDisplayMesh(GlobalVariables.currentMolecule.uniqueID)
            .then((w) => {
              setWireMesh(w);
              // Only create Puppeteer div when displaying the top-level molecule's output
              if (id === GlobalVariables.topLevelMolecule?.uniqueID) {
                createPuppeteerDiv();
              }
            })
            .catch((e) => {
              console.error("Can't compute Wireframe/No output " + e);
              // Create div even on error for top-level molecule to prevent hanging
              if (id === GlobalVariables.topLevelMolecule?.uniqueID) {
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
      }
    };

    GlobalVariables.cad = cad;
  }, [activeAtom]);

  // Loads project
  const loadProject = function (project, authorizedUser) {
    GlobalVariables.recentMoleculeRepresentation = [];
    GlobalVariables.undoOperationHistory = [];
    GlobalVariables.loadedRepo = project;
    GlobalVariables.currentRepoName = project.repoName;
    GlobalVariables.currentRepo = project;
    GlobalVariables.totalAtomCount = 0;
    GlobalVariables.numberOfAtomsToLoad = 0;
    GlobalVariables.startTime = new Date().getTime();

    if (authorizedUser) {
      var octokit = authorizedUser;
    } else {
      var octokit = new Octokit();
    }
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
          GlobalVariables.topLevelMolecule.deserialize(
            convertFromOldFormat(rawFile)
          );
        }
        setActiveAtom(GlobalVariables.currentMolecule);
        GlobalVariables.currentMolecule.selected = true;
      })
      .catch((e) => {
        alert("Can't load/find project " + e);
        throw new Error("Can't load/find project " + e);
      });
  };

  /* Toggle button to switch between run and create modes  */

  return (
    <QueryClientProvider client={queryClient}>
      <main>
        <Routes>
          <Route
            exact
            path=""
            element={
              <LoginMode
                {...{
                  setIsLoggedIn,
                  isloggedIn,
                  authorizedUserOcto,
                  setAuthorizedUserOcto,
                  exportPopUp,
                  setExportPopUp,
                  isAuthorized,
                }}
              />
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
              <CreateMode
                {...{
                  activeAtom,
                  setActiveAtom,
                  authorizedUserOcto,
                  loadProject,
                  exportPopUp,
                  setExportPopUp,
                  shortCutsOn,
                  setShortCuts,
                  mesh,
                  setMesh,
                  size,
                  cad,
                  wireMesh,
                  setWireMesh,
                  outdatedMesh,
                  setOutdatedMesh,
                  renderProgress,
                  setRenderProgress,
                  renderBarVisible,
                  setRenderBarVisible,
                }}
              />
            }
          />
          <Route
            path="/run/:owner/:repoName"
            element={
              <RunMode
                {...{
                  isloggedIn,
                  setActiveAtom,
                  activeAtom: GlobalVariables.currentMolecule,
                  authorizedUserOcto,
                  loadProject,
                  mesh,
                  wireMesh,
                  setWireMesh,
                  outdatedMesh,
                  setOutdatedMesh,
                  redirectType,
                  setRedirectType,
                  renderProgress,
                  setRenderProgress,
                  renderBarVisible,
                  setRenderBarVisible,
                }}
              />
            }
          />
        </Routes>
      </main>
    </QueryClientProvider>
  );
}
