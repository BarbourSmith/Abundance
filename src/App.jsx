import React, { useState, useEffect } from "react";
import { Octokit } from "https://esm.sh/octokit@2.0.19";
import {
  BrowserRouter,
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
import cadWorker from "./worker.js?worker";
import { button } from "leva";
import { QueryClient, QueryClientProvider } from "react-query";
import Callback from "./components/main-routes/CallBack.jsx";

/*Import style scripts*/
import "./styles/maslowCreate.css";
import "./styles//menuIcons.css";
import "./styles//login.css";
import "./styles//codemirror.css";
import { e } from "mathjs";

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
    cad.createMesh(size).then((m) => setMesh(m));
    cad.createMesh(size).then((m) => setWireMesh(m));
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

  const [authorizedUserOcto, setAuthorizedUserOcto] = useState(null);
  const [shortCutsOn, setShortCuts] = useState(
    localStorage.getItem("shortcuts") === "true" ? true : false
  );

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
  const loadingDotsNone = () => {
    const loadingDots = document.querySelector(".loading");
    if (loadingDots) {
      loadingDots.style.display = "none";
    }
  };

  useEffect(() => {
    localStorage.setItem("shortcuts", shortCutsOn);
  }, [shortCutsOn]);

  useEffect(() => {
    GlobalVariables.writeToDisplay = (id, resetView = false) => {
      console.log("write to display running " + id);
      setOutdatedMesh(true);
      if (resetView) {
        console.log("reset view");
        cad
          .resetView()
          .then((m) => {
            setMesh(m);
            setWireMesh(m);
            setOutdatedMesh(false);
            loadingDotsNone();
          })
          .catch((e) => {
            console.error("reset view not working" + e);
          });
      } else {
        cad
          .generateDisplayMesh(id)
          .then((m) => {
            setMesh(m);
            setOutdatedMesh(false);
            loadingDotsNone();
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
              createPuppeteerDiv();
            })
            .catch((e) => {
              createPuppeteerDiv();
              console.error("Can't comput Wireframe/No output " + e);
            });
        } else {
          /* reset mesh view if in output mode*/

          cad
            .resetView()
            .then((m) => {
              setWireMesh(m);
              createPuppeteerDiv();
            })
            .catch((e) => {
              createPuppeteerDiv();
              console.error("reset view not working" + e);
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
      .then((response) => {
        //content will be base64 encoded
        let rawFile = JSON.parse(atob(response.data.content));

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
                }}
              />
            }
          />
        </Routes>
      </main>
    </QueryClientProvider>
  );
}
