import React, { useEffect, useState, useRef } from "react";
import ThreeContext from "../render/ThreeContext.jsx";
import ReplicadMesh from "../render/ReplicadMesh.jsx";

import WireframeMesh from "../render/WireframeMesh.jsx";
import GlobalVariables from "../../js/globalvariables.js";
import { Octokit } from "https://esm.sh/octokit@2.0.19";

import ToggleRunCreate from "../secondary/ToggleRunCreate.jsx";
import ParamsEditor from "../secondary/ParameterEditor.jsx";
import RunNavigation from "../secondary/RunNavigation.jsx";
import Molecule from "../../molecules/molecule.js";
import {
  BrowserRouter as Router,
  useParams,
  useNavigate,
} from "react-router-dom";

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

function runMode({
  setActiveAtom,
  activeAtom,
  authorizedUserOcto,
  loadProject,
  mesh,
  wireMesh,
  outdatedMesh,
  setOutdatedMesh,
  redirectType,
  setRedirectType,
}) {
  // canvas to hide
  const canvasRef = useRef(500);

  const [gridParam, setGrid] = useState(true);
  const [axesParam, setAxes] = useState(true);
  const [isItOwned, setOwned] = useState(false);
  const [wireParam, setWire] = useState(true);
  const [solidParam, setSolid] = useState(true);

  const windowSize = useWindowSize();

  const navigate = useNavigate();
  const { owner, repoName } = useParams();

  const [cameraZoom, setCameraZoom] = useState(1);

  useEffect(() => {
    setCameraZoom(mesh[0] ? mesh[0].cameraZoom : 1);
  }, [mesh]);

  useEffect(() => {
    GlobalVariables.canvas = canvasRef;
    GlobalVariables.c = canvasRef.current.getContext("2d");
    GlobalVariables.runMode = true;

    /** Only run loadproject() if the project is different from what is already loaded and clear screen */
    if (GlobalVariables.currentRepo) {
      if (
        !GlobalVariables.loadedRepo ||
        GlobalVariables.currentRepo.repoName !==
          GlobalVariables.loadedRepo.repoName
      ) {
        GlobalVariables.writeToDisplay(
          GlobalVariables.currentRepo.topMoleculeID,
          true
        );
      }
    }

    var octokit = new Octokit();
    octokit
      .request("GET /repos/{owner}/{repo}", {
        owner: owner,
        repo: repoName,
      })
      .then((result) => {
        GlobalVariables.currentRepo = result.data;
        console.log("GlobalVariables.currentRepo", GlobalVariables.currentRepo);
        /*temp variables while we change to aws*/
        GlobalVariables.currentRepo.repoName = GlobalVariables.currentRepo.name;
        GlobalVariables.currentRepo.owner =
          GlobalVariables.currentRepo.owner.login;
        //make an aws call to get the project data before loading the project?
        /** Only run loadproject() if the project is different from what is already loaded  */
        if (
          !GlobalVariables.loadedRepo ||
          GlobalVariables.currentRepo.repoName !==
            GlobalVariables.loadedRepo.repoName
        ) {
          //Load a blank project
          GlobalVariables.topLevelMolecule = new Molecule({
            x: 0,
            y: 0,
            topLevel: true,
            atomType: "Molecule",
          });
          GlobalVariables.currentMolecule = GlobalVariables.topLevelMolecule;
          loadProject(GlobalVariables.currentRepo);
        }
      });

    if (
      GlobalVariables.currentRepo &&
      GlobalVariables.currentRepo.owner == GlobalVariables.currentUser
    ) {
      setOwned(true);
    }
  }, []);

  return (
    <>
      <div id="headerBarRun">
        <img
          className="thumnail-logo"
          src={
            import.meta.env.VITE_APP_PATH_FOR_PICS + "/imgs/abundance_logo.png"
          }
          alt="logo"
        />
      </div>
      <div className={`centered-text hidden`}>
        <div className="loading">
          <div className="dot"></div>
          <div className="dot"></div>
          <div className="dot"></div>
          <div className="dot"></div>
          <div className="dot"></div>
        </div>
      </div>
      <canvas
        style={{ display: "none" }}
        ref={canvasRef}
        id="flow-canvas"
        tabIndex={0}
      ></canvas>
      <ToggleRunCreate {...{ run: true, isItOwned }} />

      {activeAtom ? (
        <ParamsEditor
          {...{
            run: true,
            activeAtom,
            setActiveAtom,
            setGrid,
            setAxes,
            setWire,
            setSolid,
          }}
        />
      ) : null}
      {GlobalVariables.currentRepo ? (
        <RunNavigation
          {...{ authorizedUserOcto, activeAtom, redirectType, setRedirectType }}
        />
      ) : null}
      {GlobalVariables.currentRepo ? (
        <div className="info_run_div">
          <p>{"Project Name: " + GlobalVariables.currentRepo.repoName}</p>
          <p>{"Repo Owner: " + GlobalVariables.currentRepo.owner}</p>
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
