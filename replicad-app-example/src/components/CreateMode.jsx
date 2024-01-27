import React, { useEffect, useState, useRef } from "react";
import GlobalVariables from "./js/globalvariables.js";
import { Octokit } from "https://esm.sh/octokit@2.0.19";
import ToggleRunCreate from "./ToggleRunCreate.jsx";
import TopMenu from "./TopMenu.jsx";
import FlowCanvas from "./flowCanvas.jsx";
import LowerHalf from "./lowerHalf.jsx";
import ParamsEditor from "./ParameterEditor.jsx";
import { BOMEntry } from "./js/BOM.js";

import {
  BrowserRouter as Router,
  useParams,
  useNavigate,
} from "react-router-dom";
import { compile } from "mathjs";

/**
 * Create mode component appears displays flow canvas, renderer and sidebar when
 * a user has been authorized access to a project.
 * @prop {object} authorizedUserOcto - authorized octokit instance
 * @prop {setstate} setRunMode - setState function for runMode
 * @prop {boolean} RunMode - Determines if Run mode is on or off
 */
function CreateMode(props) {
  const navigate = useNavigate();

  let authorizedUserOcto = props.props.authorizedUserOcto;
  let activeAtom = props.props.activeAtom;
  let setActiveAtom = props.props.setActiveAtom;

  /** State for grid and axes parameters */
  const [gridParam, setGrid] = useState(true);
  const [axesParam, setAxes] = useState(true);
  /** State for save progress bar */
  const [saveState, setSaveState] = useState(0);
  const [savePopUp, setSavePopUp] = useState(false);

  /** State for top level molecule */
  const [currentMoleculeTop, setTop] = useState(false);

  /** Checks if activeAtom is topLevel to render goUp button */
  useEffect(() => {
    if (activeAtom && activeAtom.atomType == "Molecule") {
      setTop(!activeAtom.topLevel);
    }
  }, [activeAtom]);

  useEffect(() => {
    window.addEventListener("keydown", handleBodyClick);

    return () => {
      window.removeEventListener("keydown", handleBodyClick);
    };
  });

  const handleBodyClick = (e) => {
    e.preventDefault();
    if (e.key == "s") {
      setSavePopUp(true);
      saveProject(setSaveState);
    }
  };

  let bomContent = "";

  /** Display props for replicad renderer  */
  let cad = props.displayProps.cad;
  let size = props.displayProps.size;
  let setMesh = props.displayProps.setMesh;
  let mesh = props.displayProps.mesh;

  /**
   * Create a commit as part of the saving process.
   */
  const createCommit = async function (
    octokit,
    { owner, repo, base, changes },
    setState
  ) {
    setState(20);
    if (!base) {
      octokit
        .request("GET /repos/{owner}/{repo}", {
          owner: owner,
          repo: repo,
        })
        .then((response) => {
          setState(30);
          base = response.data.default_branch;
          octokit.rest.repos
            .listCommits({
              owner,
              repo,
              sha: base,
              per_page: 1,
            })
            .then((response) => {
              setState(40);
              let latestCommitSha = response.data[0].sha;
              const treeSha = response.data[0].commit.tree.sha;
              octokit.rest.git
                .createTree({
                  owner,
                  repo,
                  base_tree: treeSha,
                  tree: Object.keys(changes.files).map((path) => {
                    if (changes.files[path] != null) {
                      return {
                        path,
                        mode: "100644",
                        content: changes.files[path],
                      };
                    } else {
                      return {
                        path,
                        mode: "100644",
                        sha: null,
                      };
                    }
                  }),
                })
                .then((response) => {
                  setState(60);
                  const newTreeSha = response.data.sha;

                  octokit.rest.git
                    .createCommit({
                      owner,
                      repo,
                      message: changes.commit,
                      tree: newTreeSha,
                      parents: [latestCommitSha],
                    })
                    .then((response) => {
                      setState(80);
                      latestCommitSha = response.data.sha;
                      octokit.rest.git
                        .updateRef({
                          owner,
                          repo,
                          sha: latestCommitSha,
                          ref: "heads/" + base,
                          force: true,
                        })
                        .then((response) => {
                          setState(90);
                          console.warn("Project saved");
                          setState(100);
                        });
                    });
                });
            });
        });
    }
  };

  const compileBom = async () => {
    let compiled = activeAtom
      .extractBomTags(activeAtom.output.value)
      .then((result) => {
        let bomList = [];
        let compileBomItems = [];
        result.forEach(function (bomElement) {
          if (!bomList[bomElement.BOMitemName]) {
            //If the list of items doesn't already have one of these
            bomList[bomElement.BOMitemName] = new BOMEntry(); //Create one
            bomList[bomElement.BOMitemName].numberNeeded = 0; //Set the number needed to zerio initially
            bomList[bomElement.BOMitemName].BOMitemName =
              bomElement.BOMitemName; //With the information from the item
            bomList[bomElement.BOMitemName].source = bomElement.source;
            compileBomItems.push(bomList[bomElement.BOMitemName]);
          }
          bomList[bomElement.BOMitemName].numberNeeded +=
            bomElement.numberNeeded;
          bomList[bomElement.BOMitemName].costUSD += bomElement.costUSD;
        });

        // Alphabetize by source
        compileBomItems = compileBomItems.sort((a, b) =>
          a.source > b.source ? 1 : b.source > a.source ? -1 : 0
        );
        return compileBomItems;
      });
    return compiled;
  };
  /**
   * Saves project by making a commit to the Github repository.
   */
  const saveProject = async (setState) => {
    setState(5);

    var jsonRepOfProject = GlobalVariables.topLevelMolecule.serialize();
    jsonRepOfProject.filetypeVersion = 1;
    jsonRepOfProject.circleSegmentSize = GlobalVariables.circleSegmentSize;
    const projectContent = JSON.stringify(jsonRepOfProject, null, 4);

    compileBom().then((result) => {
      console.log(result);
      var bomHeader =
        "###### Note: Do not edit this file directly, it is automatically generated from the CAD model \n# Bill Of Materials \n |Part|Number Needed|Price|Source| \n |----|----------|-----|-----|";

      var bomContent = bomHeader;
      var bomItems = result;
      var totalParts = 0;
      var totalCost = 0;
      if (bomItems != undefined) {
        bomItems.forEach((item) => {
          totalParts += item.numberNeeded;
          totalCost += item.costUSD;
          bomContent =
            bomContent +
            "\n|" +
            item.BOMitemName +
            "|" +
            item.numberNeeded +
            "|$" +
            item.costUSD.toFixed(2) +
            "|" +
            // convertLinks(item.source) +
            "|";
        });
      }
      bomContent =
        bomContent +
        "\n|" +
        "Total: " +
        "|" +
        totalParts +
        "|$" +
        totalCost.toFixed(2) +
        "|" +
        " " +
        "|";
      bomContent =
        bomContent + "\n\n 3xCOG MSRP: $" + (3 * totalCost).toFixed(2);

      setState(10);

      createCommit(
        authorizedUserOcto,
        {
          owner: GlobalVariables.currentUser,
          repo: GlobalVariables.currentRepo.name,
          changes: {
            files: {
              "BillOfMaterials.md": bomContent,
              "README.md": "readme",
              "project.svg": "finalSVG",
              "project.maslowcreate": projectContent,
            },
            commit: "Autosave",
          },
        },
        setState
      );
    });
  };

  if (authorizedUserOcto) {
    if (
      GlobalVariables.currentRepo.owner.login ==
      GlobalVariables.currentRepo.owner.login
    ) {
      return (
        <>
          <div id="headerBar">
            <img
              className="thumnail-logo"
              src="/imgs/maslow-logo.png"
              alt="logo"
            />
          </div>
          <ToggleRunCreate run={false} />
          <TopMenu
            authorizedUserOcto={authorizedUserOcto}
            savePopUp={savePopUp}
            setSavePopUp={setSavePopUp}
            saveProject={saveProject}
            saveState={saveState}
            setSaveState={setSaveState}
            currentMoleculeTop={currentMoleculeTop}
            setActiveAtom={setActiveAtom}
          />
          <FlowCanvas
            props={{
              loadProject: props.props.loadProject,
              setActiveAtom: setActiveAtom,
              setSavePopUp: setSavePopUp,
              saveProject: saveProject,
              setSaveState: setSaveState,
              setTop: setTop,
            }}
            displayProps={{
              mesh: mesh,
              setMesh: setMesh,
              size: size,
              cad: cad,
            }}
          />
          <div className="parent flex-parent" id="lowerHalf">
            {activeAtom ? (
              <ParamsEditor
                activeAtom={activeAtom}
                setActiveAtom={setActiveAtom}
                setGrid={setGrid}
                setAxes={setAxes}
              />
            ) : null}

            <LowerHalf
              props={{
                gridParam: gridParam,
                axesParam: axesParam,
                saveProject: saveProject,
                setSaveState: setSaveState,
                setSaveState: setSaveState,
              }}
              displayProps={{
                mesh: mesh,
                setMesh: setMesh,
                size: size,
                cad: cad,
              }}
            />
          </div>
        </>
      );
    } else {
      navigate(`/run/${GlobalVariables.currentRepo.id}`);
    }
  } else {
    /** get repository from github by the id in the url */

    console.warn("You are not logged in");
    const { id } = useParams();
    var octokit = new Octokit();
    octokit.request("GET /repositories/:id", { id }).then((result) => {
      GlobalVariables.currentRepoName = result.data.name;
      GlobalVariables.currentRepo = result.data;
      props.props
        .tryLogin()
        .then((result) => {
          navigate(`/${GlobalVariables.currentRepo.id}`);
        })
        .catch((error) => {
          navigate(`/run/${GlobalVariables.currentRepo.id}`);
        });
    });

    //tryLogin();
  }
}

export default CreateMode;
