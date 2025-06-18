import React, { useEffect, useState, useRef } from "react";
import GlobalVariables from "../../js/globalvariables.js";
import { Octokit } from "https://esm.sh/octokit@2.0.19";
import ToggleRunCreate from "../secondary/ToggleRunCreate.jsx";
import TopMenu from "../secondary/TopMenu.jsx";
import FlowCanvas from "./flowCanvas.jsx";
import LowerHalf from "./lowerHalf.jsx";
import ParamsEditor from "../secondary/ParameterEditor.jsx";
import CodeWindow from "../secondary/codeWindow.jsx";
import { useAuth0 } from "@auth0/auth0-react";
import {
  BrowserRouter as Router,
  useParams,
  useNavigate,
} from "react-router-dom";
import NewProjectPopUp from "../secondary/NewProjectPopUp.jsx";
import { exp, re } from "mathjs";
import { Link } from "react-router-dom";

/**
 * Create mode component appears displays flow canvas, renderer and sidebar when
 * a user has been authorized access to a project.
 * @prop {object} authorizedUserOcto - authorized octokit instance
 * @prop {setstate} setRunMode - setState function for runMode
 * @prop {boolean} RunMode - Determines if Run mode is on or off
 */
function CreateMode({
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
}) {
  const navigate = useNavigate();

  /** State for grid and axes parameters */
  const [gridParam, setGrid] = useState(true);
  const [axesParam, setAxes] = useState(true);
  const [wireParam, setWire] = useState(true);
  const [solidParam, setSolid] = useState(true);

  /** State for save progress bar */
  const [saveState, setSaveState] = useState(0);
  const [savePopUp, setSavePopUp] = useState(false);
  const [commitState, setCommitState] = useState(0);

  /** State for top level molecule */
  const [currentMoleculeTop, setTop] = useState(false);

  const { loginWithRedirect } = useAuth0();

  const lastSaveData = useRef({}); // The object saved last time the project was saved...used for comparison

  /**
   * Object containing letters and values used for keyboard shortcuts
   * @type {object?}
   */
  var shortCuts = {
    a: "Assembly",
    b: "Loft", //>
    c: "Copy",
    d: "Difference",
    e: "Extrude",
    g: "GitHub", // Not working yet
    i: "Input",
    j: "Move",
    r: "Rotate",
    u: "Rectangle",
    l: "Circle",
    m: "Molecule",
    s: "Save",
    v: "Paste",
    x: "Equation",
    y: "Code", //is there a more natural code letter? can't seem to prevent command t new tab behavior
    z: "Undo", //saving this letter
  };

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

  useEffect(() => {
    //Set autosave interval
    const myInterval = setInterval(() => {
      setSavePopUp(true);
      saveProject(setSaveState, "Auto Save");
    }, 300000);

    //Clearing the interval
    return () => clearInterval(myInterval);
  }, []);

  const handleBodyClick = (e) => {
    if (e.metaKey && e.key == "s") {
      e.preventDefault();
      setSavePopUp(true);
      saveProject(setSaveState, "User Save");
    }
  };

  function searchGithubMolecules(molecule) {
    return new Promise((resolve, reject) => {
      try {
        const githubMoleculeUsedList = [];

        function recursiveSearch(molecule) {
          // Check if the molecule has nodes
          if (
            !molecule.nodesOnTheScreen ||
            !Array.isArray(molecule.nodesOnTheScreen)
          ) {
            return;
          }
          // Iterate through each node in the molecule
          molecule.nodesOnTheScreen.forEach((node) => {
            if (node.atomType === "GitHubMolecule") {
              // Add to the githubMoleculeUsedList if atomType is "Github molecule"
              githubMoleculeUsedList.push({
                owner: node.parentRepo.owner,
                repoName: node.parentRepo.repoName,
              });
            } else if (node.atomType === "Molecule") {
              // Recursively search inside the nodes of this molecule
              recursiveSearch(node);
            }
          });
        }

        // Start the recursive search
        recursiveSearch(molecule);

        // Resolve the promise with the list of Github molecules
        resolve(githubMoleculeUsedList);
      } catch (error) {
        // Reject the promise if an error occurs
        reject(error);
      }
    });
  }
  /**
   * Create a commit as part of the saving process.
   */
  const createCommit = async function (
    octokit,
    { owner, repo, base, changes },
    setState
  ) {
    setState(35);
    if (!base) {
      octokit
        .request("GET /repos/{owner}/{repo}", {
          owner: owner,
          repo: repo,
        })
        .then((response) => {
          let htmlURL = response.data.html_url;
          const privateRepo = response.data.private;
          setState(40);

          base = response.data.default_branch;
          octokit.rest.repos
            .listCommits({
              owner,
              repo,
              sha: base,
              per_page: 1,
            })
            .then((response) => {
              setState(50);
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
                      setState(70);
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
                          setState(80);
                          searchGithubMolecules(
                            GlobalVariables.topLevelMolecule
                          ).then((githubMoleculeUsedList) => {
                            /*aws dynamo update-item lambda, also updates dateModified on aws side*/
                            const apiUpdateUrl =
                              "https://hg5gsgv9te.execute-api.us-east-2.amazonaws.com/abundance-stage/update-item";
                            let topicString =
                              GlobalVariables.currentRepo.topics.join(" ");
                            let searchField = (
                              repo +
                              " " +
                              owner +
                              " " +
                              GlobalVariables.currentRepo.description +
                              " " +
                              topicString
                            ).toLowerCase();

                            fetch(apiUpdateUrl, {
                              method: "POST",
                              body: JSON.stringify({
                                owner: owner,
                                repoName: repo,
                                attributeUpdates: {
                                  ranking: 0,
                                  privateRepo: privateRepo,
                                  html_url: htmlURL,
                                  searchField: searchField,
                                  githubMoleculesUsed: githubMoleculeUsedList,
                                  description:
                                    GlobalVariables.currentRepo.description,
                                  topics: GlobalVariables.currentRepo.topics,
                                },
                              }),
                              headers: {
                                "Content-type":
                                  "application/json; charset=UTF-8",
                              },
                            }).then((response) => {
                              console.warn(
                                "Project saved on git and aws updated"
                              );
                              setState(100);
                            });
                          });
                        });
                    });
                });
            });
        });
    }
  };

  const uploadAFile = async function (file) {
    var reader = new FileReader();

    reader.onload = function (e) {
      let base64result = e.target.result.split(",")[1];
      authorizedUserOcto.rest.repos
        .createOrUpdateFileContents({
          owner: GlobalVariables.currentUser,
          repo: GlobalVariables.currentRepoName,
          path: file.name,
          message: "Import File",
          content: base64result,
        })
        .then((result) => {
          activeAtom.updateFile(file, result.data.content.sha);
          saveProject(setSaveState, "Upload Save");
        });
    };
    reader.readAsDataURL(file);
  };

  const deleteAFile = async function (fileName, fileSha) {
    console.log("deleting file");
    authorizedUserOcto.rest.repos.deleteFile({
      owner: GlobalVariables.currentUser,
      repo: GlobalVariables.currentRepoName,
      path: fileName,
      message: "Deleted node",
      sha: fileSha,
    });
  };

  /**
   * Saves project by making a commit to the Github repository.
   */
  const saveProject = async (setState, typeSave) => {
    //We only want to save if something has actually changed since the last save
    var jsonRepOfProject = GlobalVariables.topLevelMolecule.serialize();

    //Don't save again if nothing has changed
    if (
      JSON.stringify(jsonRepOfProject) == JSON.stringify(lastSaveData.current)
    ) {
      return;
    }

    lastSaveData.current = jsonRepOfProject; //Save the data so we can compare it next time

    setState(5); //Set the state to 5% to show the progress bar

    let finalSVG;
    finalSVG = await GlobalVariables.topLevelMolecule
      .generateProjectThumbnail()
      .catch((error) => {
        console.error("Error generating final project thumbnail: ", error);
      });

    setState(10);
    var jsonRepOfProject = GlobalVariables.topLevelMolecule.serialize();
    jsonRepOfProject.filetypeVersion = 1;
    const projectContent = JSON.stringify(jsonRepOfProject, null, 4);
    // format and compile the BOM
    let bomContent = GlobalVariables.topLevelMolecule.formatBom();
    var readmeHeader =
      "###### Note: Do not edit this file directly, it is automatically generated from the CAD model";

    var readmeContent =
      readmeHeader +
      "\n\n" +
      "# " +
      GlobalVariables.currentRepoName +
      "\n\n![](/project.svg)\n\n";

    setState(20);

    let readMeRequestResult =
      await GlobalVariables.topLevelMolecule.requestReadme();

    let readMeTextArray = " ";

    readMeRequestResult.forEach((item) => {
      readMeTextArray = readMeTextArray.concat(item["readMeText"]) + "\n\n";
    });
    readmeContent = readmeContent + "\n\n" + readMeTextArray + "\n\n";

    /** File object to commit */
    let filesObject = {
      "BillOfMaterials.md": bomContent,
      "README.md": readmeContent,
      "project.abundance": projectContent,
    };

    /* add any new SVGs to the project change files*/
    const readmeSVGs = readMeRequestResult;
    let backupProjectSVG;
    if (readmeSVGs) {
      readmeSVGs.forEach((item) => {
        if (item.svg != null) {
          filesObject["readme" + item.uniqueID + ".svg"] = item.svg;
          backupProjectSVG = item.svg;
        }
      });
    }
    
    // Only update project thumbnail if a new one has been generated successfully
    const thumbnailToUse = finalSVG || backupProjectSVG;
    if (thumbnailToUse) {
      filesObject["project.svg"] = thumbnailToUse;
    }
    // If no thumbnail was generated, don't include project.svg in the commit
    // This preserves the existing thumbnail in the repository

    setState(30);

    createCommit(
      authorizedUserOcto,
      {
        owner: GlobalVariables.currentUser,
        repo: GlobalVariables.currentRepo.repoName,
        changes: {
          files: filesObject,
          commit: typeSave ? typeSave : "Auto Save",
        },
      },
      setState
    );
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
              src={
                import.meta.env.VITE_APP_PATH_FOR_PICS +
                "/imgs/abundance_logo.png"
              }
              alt="logo"
            />
          </div>

          {exportPopUp ? (
            <div
              className="login-popup"
              id="exporting-popup-back"
              style={{
                padding: "0",
                border: "10px solid #3e3d3d",
              }}
            >
              <div>
                {" "}
                {GlobalVariables.currentRepo ? (
                  <Link
                    to={`/${GlobalVariables.currentRepo.owner}/${GlobalVariables.currentRepo.repoName}`}
                  >
                    <button className="closeButton">
                      <img></img>
                    </button>
                  </Link>
                ) : null}
              </div>

              <NewProjectPopUp
                {...{ setExportPopUp, exporting: true, authorizedUserOcto }}
              />
            </div>
          ) : null}
          <ToggleRunCreate run={false} />
          {shortCutsOn ? (
            <div id="shortcutDiv" className="noselect">
              <li style={{ fontSize: "14px" }}>(CTRL +)</li>
              {Object.entries(shortCuts).map(([key, value]) => {
                return (
                  <li key={key} className="shortcut">
                    {key} : {value}
                  </li>
                );
              })}
            </div>
          ) : null}
          <TopMenu
            {...{
              authorizedUserOcto,
              savePopUp,
              setSavePopUp,
              saveProject,
              setExportPopUp,
              saveState,
              setSaveState,
              currentMoleculeTop,
              activeAtom,
              setActiveAtom,
              shortCutsOn,
              setShortCuts,
            }}
          />

          <CodeWindow {...{ activeAtom }} />
          <input
            type="file"
            id="fileLoaderInput"
            style={{ display: "none" }}
            onChange={(value) => {
              let file = value.target.files[0];
              uploadAFile(file);
            }}
          />
          <input
            type="button"
            id="fileDeleteInput"
            style={{ display: "none" }}
            onClick={() => {
              deleteAFile(activeAtom.fileName, activeAtom.sha);
            }}
          />
          <FlowCanvas
            {...{
              activeAtom,
              authorizedUserOcto,
              loadProject,
              setActiveAtom,
              setSavePopUp,
              setSaveState,
              setTop,
              shortCuts,
              setMesh,
              cad,
              setWireMesh,
            }}
          />
          <div className="parent flex-parent" id="lowerHalf">
            {activeAtom ? (
              <ParamsEditor
                {...{
                  activeAtom,
                  setActiveAtom,
                  setGrid,
                  setAxes,
                  setWire,
                  setSolid,
                }}
              />
            ) : null}

            <LowerHalf
              {...{
                gridParam,
                axesParam,
                wireParam,
                solidParam,
                setSaveState,
                mesh,
                wireMesh,
                outdatedMesh,
                setOutdatedMesh,
              }}
            />
          </div>
        </>
      );
    } else {
      navigate(
        `/run/${GlobalVariables.currentRepo.owner}/${GlobalVariables.currentRepo.repoName}`
      );
    }
  } else {
    /** get repository from github by the id in the url */
    console.warn("You are not logged in");
    const { owner, repoName } = useParams();
    var octokit = new Octokit();
    octokit
      .request("GET /repos/{owner}/{repo}", {
        owner: owner,
        repo: repoName,
      })
      .then((result) => {
        GlobalVariables.currentRepoName = result.data.name;
        GlobalVariables.currentRepo = result.data;
        navigate(
          `/run/${GlobalVariables.currentRepo.owner.login}/${GlobalVariables.currentRepoName}`
        );
        const loginConfirm = confirm(
          "You are not logged in. Would you like to log in?"
        );

        if (loginConfirm) {
          loginWithRedirect();
        } else {
          // user clicked cancel and is redirected to the run mode
        }
      });
  }
}

export default CreateMode;
