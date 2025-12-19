import React, { useEffect, useState, useRef, use } from "react";
import GlobalVariables from "../../js/globalvariables.js";
import ToggleRunCreate from "../secondary/ToggleRunCreate.jsx";
import TopMenu from "../secondary/TopMenu.jsx";
import FlowCanvas from "./flowCanvas.jsx";
import LowerHalf from "./lowerHalf.jsx";
import CodeWindow from "../secondary/codeWindow.jsx";
import {
  BrowserRouter as Router,
  useParams,
  useNavigate,
} from "react-router-dom";
import NewProjectPopUp from "../secondary/NewProjectPopUp.jsx";
import { Link } from "react-router-dom";

import ParamsMenu from "../secondary/ParamsMenu.jsx";
import RenderMenu from "../secondary/RenderMenu.jsx";
import BomMenu from "../secondary/BomMenu.jsx";
import GitSearchMenu from "../secondary/GitSearchMenu.jsx";
import RenderProgressBar from "../secondary/RenderProgressBar.jsx";
import { useTutorial } from "../../tutorial/TutorialManager";
import { TutorialOverlay } from "../../tutorial/TutorialOverlay";
import { useProgressBar } from "../secondary/ProgressBarManager.jsx";

// Import contexts
import {
  useAuth,
  useAppState,
  useRendering,
  useProject,
} from "../../contexts/index.js";
/**
 * Create mode component appears displays flow canvas, renderer and sidebar when
 * a user has been authorized access to a project.
 * @prop {object} authorizedUserOcto - authorized octokit instance
 * @prop {setstate} setRunMode - setState function for runMode
 * @prop {boolean} RunMode - Determines if Run mode is on or off
 */
function CreateMode() {
  // Get context values
  const { authorizedUserOcto, authRedirectHandler } = useAuth();
  const {
    activeAtom,
    setActiveAtom,
    shortCutsOn,
    exportPopUp,
    setExportPopUp,
    redirectType,
  } = useAppState();
  const {
    setMesh,
    setWireMesh,
    renderProgress,
    renderBarVisible,
    backgroundUsdzFile,
    setBackgroundUsdzFile,
    backgroundUsdzSha,
    setBackgroundUsdzSha,
    showBackgroundModel,
    setShowBackgroundModel,
    userUploadedFile,
    setUserUploadedFile,
    solidParam,
    setSolid,
    showTopLevelWireframe,
    setShowTopLevelWireframe,
  } = useRendering();

  const { cad, loadProject } = useProject();
  const meshRef = useRef();

  // Make meshRef available globally for thumbnail generation
  useEffect(() => {
    GlobalVariables.meshRef = meshRef;
    return () => {
      GlobalVariables.meshRef = null;
    };
  }, []);

  const navigate = useNavigate();

  // Register render progress bar
  useProgressBar(
    "render",
    renderBarVisible,
    renderProgress,
    "Rendering",
    false
  );

  /** State for import notifications */
  const [importNotification, setImportNotification] = useState(null);

  /** State for error notification */
  const [errorNotification, setErrorNotification] = useState(null);

  /** State for save progress bar */
  const [saveState, setSaveState] = useState(0);
  const [savePopUp, setSavePopUp] = useState(false);

  const [settingsPopUp, setSettingsPopUp] = useState(false);
  // Ref to always have latest settingsPopUp value in event handlers
  const settingsPopUpRef = useRef(settingsPopUp);

  useEffect(() => {
    settingsPopUpRef.current = settingsPopUp;
  }, [settingsPopUp]);

  // Ref to always have latest exportPopUp value in event handlers
  const exportPopUpRef = useRef(exportPopUp);
  useEffect(() => {
    exportPopUpRef.current = exportPopUp;
  }, [exportPopUp]);

  const [duplicateDialog, setDuplicateDialog] = useState(false);
  // Ref to always have latest duplicateDialog value in event handlers
  const duplicateDialogRef = useRef(duplicateDialog);
  useEffect(() => {
    duplicateDialogRef.current = duplicateDialog;
  }, [duplicateDialog]);

  /** State for top level molecule */
  const [currentMoleculeTop, setTop] = useState(false);

  // Refs for rendering state to avoid stale closures in keyboard shortcuts
  const solidParamRef = useRef(solidParam);
  useEffect(() => {
    solidParamRef.current = solidParam;
  }, [solidParam]);

  const showTopLevelWireframeRef = useRef(showTopLevelWireframe);
  useEffect(() => {
    showTopLevelWireframeRef.current = showTopLevelWireframe;
  }, [showTopLevelWireframe]);

  const lastSaveData = useRef({}); // The object saved last time the project was saved...used for comparison

  /** State for menu content collapsing */
  // Which menu is expanded: "params", "render", "bom", or "none"
  const [expandedMenu, setExpandedMenu] = useState(
    GlobalVariables.isMobile() ? "none" : "params"
  );

  /**
   * Object containing letters and values used for keyboard shortcuts
   * @type {object?}
   */
  var shortCuts = {
    a: "Assembly",
    b: "Molecule",
    c: "Copy",
    e: "Extrude",
    g: "GitHubMolecule",
    i: "Input",
    j: "Move",
    r: "Rotate",
    m: "Move-to-Molecule",
    s: "Save",
    v: "Paste",
    x: "Equation",
    z: "Undo",
    "(ALT)": "GitSearch",
    "(CTRL+SHIFT)+U": "Go-Up",
    "(CTRL+SHIFT)+W": "Wireframe",
    "(CTRL+SHIFT)+A": "Show-Top-Level-Mesh",
  };

  // Initialize state with undefined width/height so server and client renders match
  // Learn more here: https://joshwcomeau.com/react/the-perils-of-rehydration/
  const [windowSize, setWindowSize] = useState({
    width: 0,
    height: 0,
  });
  useEffect(() => {
    // Handler to call on window resize
    function handleResize() {
      let height;
      if (window.visualViewport) {
        height = window.visualViewport.height;
      } else if (GlobalVariables.isMobile()) {
        height = window.screen.height;
      } else {
        height = window.innerHeight;
      }
      setWindowSize({
        width: window.innerWidth,
        height,
      });
    }
    window.addEventListener("resize", handleResize);
    if (window.visualViewport) {
      window.visualViewport.addEventListener("resize", handleResize);
    }
    handleResize();
    return () => {
      window.removeEventListener("resize", handleResize);
      if (window.visualViewport) {
        window.visualViewport.removeEventListener("resize", handleResize);
      }
    };
  }, []); // Empty array ensures that effect is only run on mount

  /** Checks if activeAtom is topLevel to render goUp button */
  useEffect(() => {
    if (activeAtom && activeAtom.atomType == "Molecule") {
      setTop(!activeAtom.topLevel);
    }
  }, [activeAtom]);

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);
  // Attach keyup event listener
  useEffect(() => {
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, []);

  const expandedMenuRef = useRef(expandedMenu);
  useEffect(() => {
    expandedMenuRef.current = expandedMenu;
  }, [expandedMenu]);

  /**
   * Handles keydown events for keyboard shortcuts.
   * @param {KeyboardEvent} e
   */
  const handleKeyDown = (e) => {
    //Save project with Ctrl+S or Cmd+S (should work even when code is active)
    if ((e.ctrlKey || e.metaKey) && e.key === "s") {
      e.preventDefault();
      setSavePopUp(true);
      saveProject(setSaveState, "User Save");
    }

    //Copy /paste listeners
    if (e.key == "Control" || e.key == "Meta") {
      GlobalVariables.ctrlDown = true;
    }
    // Prevent forwarding if code atom is active, we don't want to interfere with code editing
    if (!document.getElementById("code-window").classList.contains("code-off"))
      return;
    // Use ref to always get latest value
    if (settingsPopUpRef.current) return; // Do not trigger shortcuts if settings popup is open
    if (exportPopUpRef.current) return; // Do not trigger shortcuts if export popup is open
    if (duplicateDialogRef.current) return; // Do not trigger shortcuts if duplicate dialog is open

    // CTRL+SHIFT+I: Go up a level
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === "U") {
      e.preventDefault();
      GlobalVariables.currentMolecule.goToParentMolecule();
      setActiveAtom(GlobalVariables.currentMolecule);

      return;
    }

    // CTRL+SHIFT+W: Toggle wireframe on/off
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === "W") {
      e.preventDefault();
      setSolid(!solidParamRef.current);
      return;
    }

    // CTRL+SHIFT+A: Toggle top level wireframe on/off
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === "A") {
      e.preventDefault();
      setShowTopLevelWireframe(!showTopLevelWireframeRef.current);
      return;
    }

    if (
      (e.key === "Alt" || e.key === "AltGraph") &&
      !GlobalVariables.ctrlDown
    ) {
      // Trigger GitSearch Panel when Option/Alt is pressed
      setExpandedMenu(
        expandedMenuRef.current === "git-search" ? "params" : "git-search"
      );
    } else {
      if (expandedMenuRef.current === "git-search") {
        forwardKeyToGitPanel(e);
      }
      if (expandedMenuRef.current !== "git-search") {
        forwardKeyToPanel(e);
      }
    }
    /*
    // Example: Toggle shortcut display with Ctrl+/
    if ((e.ctrlKey || e.metaKey) && e.key === "/") {
      e.preventDefault();
      setShortCuts((prev) => !prev);
    }
    // Add more shortcuts as needed
    // Example: Focus code window with Ctrl+Y
    if ((e.ctrlKey || e.metaKey) && e.key === "y") {
      e.preventDefault();
      const codeWindow = document.getElementById("codeWindowInput");
      if (codeWindow) codeWindow.focus();
    }*/
    // Forward key to panel if needed
  };
  /**
   * Handles keyup events for keyboard shortcuts.
   * @param {KeyboardEvent} e
   */
  const handleKeyUp = (e) => {
    // Reset ctrlDown flag when Control or Meta key is released
    if (e.key === "Control" || e.key === "Meta") {
      GlobalVariables.ctrlDown = false;
    }
  };

  const panelRef = useRef();
  const gitRef = useRef();

  // When you want to trigger the panel keydown:
  const forwardKeyToPanel = (event) => {
    if (panelRef.current && panelRef.current.triggerPanelKeyDown) {
      panelRef.current.triggerPanelKeyDown(event);
    }
  };
  const forwardKeyToGitPanel = (event) => {
    if (gitRef.current && gitRef.current.triggerPanelKeyDown) {
      gitRef.current.triggerPanelKeyDown(event);
    }
  };

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  useEffect(() => {
    //Set autosave interval
    const myInterval = setInterval(() => {
      setSavePopUp(true);
      saveProject(setSaveState, "Auto Save");
    }, 300000);

    //Clearing the interval
    return () => clearInterval(myInterval);
  }, []);

  /**
   * Validates if the current GitHub token is still valid
   */
  const validateGitHubToken = async (octokit) => {
    try {
      await octokit.request("GET /user");
      return true;
    } catch (error) {
      console.warn("GitHub token validation failed:", error.message);
      return false;
    }
  };

  /**
   * Handles authentication errors by redirecting to re-authentication
   */
  const handleAuthenticationError = (error, saveType, currentProjectRep) => {
    console.error("Authentication error during save:", error);

    // Show user-friendly error message
    setErrorNotification(
      `Save failed due to expired login. You will be redirected to re-authenticate.`
    );
    setTimeout(() => {
      setErrorNotification(null);
      authRedirectHandler({
        authType: "save",
        currentProjectRep,
        returnTo: `/${GlobalVariables.currentAWSnode.owner}/${GlobalVariables.currentAWSnode.repoName}`,
      });
    }, 2000);
  };

  /**
   * Scan repository for background 3D model files when project loads
   */
  const scanForBackgroundModels = async () => {
    if (!authorizedUserOcto) {
      return;
    }

    if (
      !GlobalVariables.currentAWSnode.owner ||
      !GlobalVariables.currentAWSnode.repoName
    ) {
      return;
    }

    try {
      const files = await authorizedUserOcto.rest.repos.getContent({
        owner: GlobalVariables.currentAWSnode.owner,
        repo: GlobalVariables.currentAWSnode.repoName,
        path: "",
      });

      // Look for GLB or GLTF files
      const backgroundFiles = files.data.filter(
        (file) =>
          file.type === "file" &&
          (file.name.toLowerCase().endsWith(".glb") ||
            file.name.toLowerCase().endsWith(".gltf"))
      );

      if (backgroundFiles.length > 0) {
        // Use the first background model file found
        const firstFile = backgroundFiles[0];

        // Only set if we don't already have a background file set OR if user hasn't uploaded a file
        // This prevents overriding user uploads
        if (!backgroundUsdzFile && !userUploadedFile) {
          setBackgroundUsdzFile(firstFile.name);
          setBackgroundUsdzSha(firstFile.sha);
          // Don't auto-enable the display, let user choose
          setShowBackgroundModel(false);
        } else {
          // If user uploaded a file, ensure it stays enabled
          if (userUploadedFile && backgroundUsdzFile) {
            setShowBackgroundModel(true);
          }
        }
      }
    } catch (error) {
      console.error("Error scanning for background models:", error);
    }
  };

  // Scan for background models when component mounts or project changes
  useEffect(() => {
    if (
      authorizedUserOcto &&
      GlobalVariables.currentAWSnode?.owner &&
      GlobalVariables.currentAWSnode?.repoName
    ) {
      scanForBackgroundModels();
    }
  }, [authorizedUserOcto, GlobalVariables.currentAWSnode]);

  // Reset background model state when project changes to ensure clean state
  useEffect(() => {
    setBackgroundUsdzFile(null);
    setBackgroundUsdzSha(null);
    setShowBackgroundModel(false);
    setUserUploadedFile(false);
  }, [GlobalVariables.currentAWSnode]);

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
              if (node.parentRepo == null) return; // Safety check if parentRepo is null
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
    setSaveProgress,
    saveType = "Auto Save"
  ) {
    try {
      setSaveProgress(35);
      if (!base) {
        const repoResponse = await octokit.request(
          "GET /repos/{owner}/{repo}",
          {
            owner: owner,
            repo: repo,
          }
        );

        let htmlURL = repoResponse.data.html_url;
        const privateRepo = repoResponse.data.private;
        setSaveProgress(40);

        base = repoResponse.data.default_branch;

        const commitsResponse = await octokit.rest.repos.listCommits({
          owner,
          repo,
          sha: base,
          per_page: 1,
        });

        setSaveProgress(50);
        let latestCommitSha = commitsResponse.data[0].sha;
        const treeSha = commitsResponse.data[0].commit.tree.sha;

        const treeResponse = await octokit.rest.git.createTree({
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
        });

        setSaveProgress(60);
        const newTreeSha = treeResponse.data.sha;

        const commitResponse = await octokit.rest.git.createCommit({
          owner,
          repo,
          message: changes.commit,
          tree: newTreeSha,
          parents: [latestCommitSha],
        });

        setSaveProgress(70);
        latestCommitSha = commitResponse.data.sha;

        await octokit.rest.git.updateRef({
          owner,
          repo,
          sha: latestCommitSha,
          ref: "heads/" + base,
          force: true,
        });

        setSaveProgress(80);

        const githubMoleculeUsedList = await searchGithubMolecules(
          GlobalVariables.topLevelMolecule
        );

        /*aws dynamo update-item lambda, also updates dateModified on aws side*/
        const apiUpdateUrl =
          "https://hg5gsgv9te.execute-api.us-east-2.amazonaws.com/abundance-stage/update-item";
        let topicString = GlobalVariables.currentAWSnode.topics.join(" ");
        let searchField = (
          repo +
          " " +
          owner +
          " " +
          GlobalVariables.currentAWSnode.description +
          " " +
          topicString
        ).toLowerCase();

        await fetch(apiUpdateUrl, {
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
              description: GlobalVariables.currentAWSnode.description,
              topics: GlobalVariables.currentAWSnode.topics,
            },
          }),
          headers: {
            "Content-type": "application/json; charset=UTF-8",
          },
        });

        console.warn("Project saved on git and aws updated");
      }
    } catch (error) {
      console.error("Error during commit creation:", error);

      // Check if this is an authentication error
      if (error.status === 401 || error.message.includes("Bad credentials")) {
        handleAuthenticationError(error, saveType);
      } else {
        // Handle other errors
        setErrorNotification(
          `Save failed: ${error.message || "Unknown error occurred"}`
        );
        setTimeout(() => setErrorNotification(null), 5000);
        setSaveProgress(0); // Reset save progress
      }

      throw error; // Re-throw to let calling function handle it
    }
  };

  const uploadAFile = async function (file) {
    var reader = new FileReader();

    reader.onload = function (e) {
      const base64result = e.target.result.split(",")[1];

      (async () => {
        try {
          const existingFiles = await authorizedUserOcto.rest.repos.getContent({
            owner: GlobalVariables.currentAWSnode.owner,
            repo: GlobalVariables.currentAWSnode.repoName,
            path: "",
          });

          let fileName = file.name;
          const fileExtension = fileName.substring(fileName.lastIndexOf("."));
          const baseName = fileName.substring(0, fileName.lastIndexOf("."));
          let uniqueFileName = fileName;
          let counter = 1;

          // Incrementally rename the file until a unique name is found
          while (
            existingFiles.data.some(
              (existingFile) => existingFile.name === uniqueFileName
            )
          ) {
            uniqueFileName = `${baseName}_copy${counter}${fileExtension}`;
            counter++;
          }

          if (uniqueFileName !== fileName) {
            console.warn(`File already exists. Renaming to: ${uniqueFileName}`);
          }
          const result = await Promise.race([
            authorizedUserOcto.rest.repos.createOrUpdateFileContents({
              owner: GlobalVariables.currentAWSnode.owner,
              repo: GlobalVariables.currentAWSnode.repoName,
              path: uniqueFileName,
              message: "Import File",
              content: base64result,
            }),
            new Promise((_, reject) =>
              setTimeout(
                () => reject(new Error("File upload timed out")),
                60000
              )
            ),
          ]);
          console.log("File uploaded successfully:", result);

          activeAtom.updateFile(
            { name: uniqueFileName },
            result.data.content.sha
          );
          saveProject(setSaveState, "Upload Save");

          // Show upload notification
          setImportNotification(`File uploaded: ${uniqueFileName}`);
          setTimeout(() => setImportNotification(null), 3000);
        } catch (error) {
          setImportNotification(
            `Failed to Upload File: Corrupt or exceeded size limit`
          );
          setTimeout(() => setImportNotification(null), 3000);
          console.error("Error during file upload:", error);
        }
      })();
    };

    reader.onerror = function (error) {
      console.error("Error reading file:", error);
      alert("Failed to read the file. Please try again.");
    };
    reader.readAsDataURL(file);
  };

  const deleteAFile = async function (fileName, fileSha) {
    // If fileName is null or undefined, there's no file to delete
    if (fileName == null) {
      return;
    }

    try {
      await authorizedUserOcto.rest.repos.deleteFile({
        owner: GlobalVariables.currentAWSnode.owner,
        repo: GlobalVariables.currentAWSnode.repoName,
        path: fileName,
        message: "Deleted node",
        sha: fileSha,
      });
      console.log("File deleted successfully:", fileName);

      // Show delete notification
      setImportNotification(`File deleted: ${fileName}`);
      setTimeout(() => setImportNotification(null), 3000);
    } catch (error) {
      console.error("Error deleting file:", error);
      alert(
        `Failed to delete file: ${fileName}. The file will remain in your repository.`
      );
    }
  };

  /**
   * Upload a 3D background file (GLB/GLTF) to GitHub
   */
  const uploadBackground3D = async function (file) {
    // Set userUploadedFile flag immediately to prevent auto-detection from interfering
    setUserUploadedFile(true);

    try {
      // Read file as base64
      const base64result = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = function (e) {
          resolve(e.target.result.split(",")[1]);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      // Use "background" as filename with original extension
      const fileExtension = file.name.substring(file.name.lastIndexOf("."));
      const backgroundFileName = `background${fileExtension}`;

      const result =
        await authorizedUserOcto.rest.repos.createOrUpdateFileContents({
          owner: GlobalVariables.currentAWSnode.owner,
          repo: GlobalVariables.currentAWSnode.repoName,
          path: backgroundFileName,
          message: "Upload background 3D model",
          content: base64result,
          ...(backgroundUsdzSha ? { sha: backgroundUsdzSha } : {}),
        });

      setBackgroundUsdzFile(backgroundFileName);
      setBackgroundUsdzSha(result.data.content.sha);
      setShowBackgroundModel(true);

      saveProject(setSaveState, "Background 3D Model Upload Save");
      setImportNotification(
        `Background 3D model uploaded: ${backgroundFileName}`
      );
      setTimeout(() => setImportNotification(null), 3000);
    } catch (error) {
      console.error("Error uploading 3D model:", error);
      // Reset userUploadedFile flag on error
      setUserUploadedFile(false);
      setImportNotification("Failed to Upload 3D Model");
      setTimeout(() => setImportNotification(null), 3000);
    }
  };

  /**
   * Delete background 3D model file from GitHub
   */
  const deleteBackground3D = async function () {
    if (!backgroundUsdzFile || !backgroundUsdzSha) {
      return;
    }

    try {
      await authorizedUserOcto.rest.repos.deleteFile({
        owner: GlobalVariables.currentAWSnode.owner,
        repo: GlobalVariables.currentAWSnode.repoName,
        path: backgroundUsdzFile,
        message: "Deleted background 3D model",
        sha: backgroundUsdzSha,
      });

      setBackgroundUsdzFile(null);
      setBackgroundUsdzSha(null);
      setShowBackgroundModel(false);
      setUserUploadedFile(false); // Reset user upload flag

      setImportNotification(`Background 3D model deleted`);
      setTimeout(() => setImportNotification(null), 3000);
    } catch (error) {
      console.error("Error deleting background 3D model file:", error);
      alert(
        `Failed to delete 3D model file. The file will remain in your repository.`
      );
    }
  };

  const generateProjectThumbnail = async () => {
    //Generate a thumbnail for the project
    if (GlobalVariables.topLevelMolecule.value == null) {
      console.warn(
        "No top level molecule value found for thumbnail generation."
      );
      return null;
    }

    return GlobalVariables.pool
      .proxy()
      .then((worker) => {
        return worker.generateDisplayMesh(
          GlobalVariables.topLevelMolecule.value,
          GlobalVariables.topLevelMolecule.getContext()
        );
      })
      .then(async (m) => {
        const svg = await meshRef.current.buildThumbnail(m.mesh);
        console.log("Project thumbnail generated.");
        return svg;
      });
  };

  /**
   * Saves project by making a commit to the Github repository.
   * @param {Function} setSaveProgress - Function to update save progress
   * @param {string} typeSave - Type of save operation
   * @param {boolean} forceSave - If true, bypasses the "no changes" check
   */
  const saveProject = async (setSaveProgress, typeSave, forceSave = false) => {
    try {
      //We only want to save if something has actually changed since the last save
      var jsonRepOfProject = GlobalVariables.topLevelMolecule.serialize();

      //Don't save again if nothing has changed (unless forceSave is true)
      if (
        !forceSave &&
        JSON.stringify(jsonRepOfProject) == JSON.stringify(lastSaveData.current)
      ) {
        return;
      }

      // First validate the GitHub token
      if (authorizedUserOcto) {
        const isTokenValid = await validateGitHubToken(authorizedUserOcto);
        if (!isTokenValid) {
          handleAuthenticationError(
            new Error("GitHub token has expired"),
            typeSave,
            JSON.stringify(jsonRepOfProject)
          );
          return;
        }
      }

      lastSaveData.current = jsonRepOfProject; //Save the data so we can compare it next time

      setSaveProgress(5); //Set the state to 5% to show the progress bar

      let finalSVG;
      // Only generate thumbnail for user-triggered saves, not auto saves
      if (typeSave !== "Auto Save") {
        finalSVG = await generateProjectThumbnail().catch((error) => {
          console.error("Error generating final project thumbnail: ", error);
        });
      }

      setSaveProgress(10);
      // Reuse the already serialized project data instead of serializing again
      jsonRepOfProject.filetypeVersion = 1;
      const projectContent = JSON.stringify(jsonRepOfProject, null, 2);
      // format and compile the BOM
      let bomContent = GlobalVariables.topLevelMolecule.formatBom();
      var readmeHeader =
        "###### Note: Do not edit this file directly, it is automatically generated from the CAD model";

      var readmeContent =
        readmeHeader +
        "\n\n" +
        "# " +
        GlobalVariables.currentAWSnode.repoName +
        "\n\n![](/project.svg)\n\n";

      setSaveProgress(20);

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

      // Helper function to check if an SVG is valid and has content
      const isValidSVG = (svg) => {
        if (!svg) return false;
        // Check if SVG is empty (has no paths or other content between svg tags)
        // An empty SVG looks like: <svg viewBox="..." xmlns="..."></svg>
        const hasContent =
          svg.includes("<path") ||
          svg.includes("<circle") ||
          svg.includes("<rect") ||
          svg.includes("<line") ||
          svg.includes("<polygon") ||
          svg.includes("<polyline");
        return hasContent;
      };

      // Only update project thumbnail if a valid one has been generated
      // Prioritize finalSVG from main output, but fall back to readme SVG if main output is empty
      const thumbnailToUse =
        finalSVG && isValidSVG(finalSVG)
          ? finalSVG
          : backupProjectSVG && isValidSVG(backupProjectSVG)
          ? backupProjectSVG
          : null;
      if (thumbnailToUse) {
        filesObject["project.svg"] = thumbnailToUse;
      }
      // If no valid thumbnail was generated, don't include project.svg in the commit
      // This preserves the existing thumbnail in the repository

      setSaveProgress(30);

      await createCommit(
        authorizedUserOcto,
        {
          owner: GlobalVariables.currentUser,
          repo: GlobalVariables.currentAWSnode.repoName,
          changes: {
            files: filesObject,
            commit: typeSave ? typeSave : "Auto Save",
          },
        },
        setSaveProgress,
        typeSave
      );

      if (typeSave !== "Auto Save") {
        const geomIds = GlobalVariables.topLevelMolecule.deepGeomList();
        // Sweep is best-effort and can take a long time (up to a minute). Don't await, just let it run
        // in the background and mark save as completed.
        GlobalVariables.cad
          .sweepCache(geomIds, GlobalVariables.topLevelMolecule.getContext())
          .then((count) => {
            console.log("cache sweep complete, removed: " + count + " items");
          })
          .catch((error) => {
            console.error("Error during cache sweep:", error);
          });
      }

      setSaveProgress(100);
    } catch (error) {
      console.error("Error during project save:", error);

      // The createCommit function already handles authentication errors,
      // so we only need to handle other types of errors here
      if (!error.message.includes("Bad credentials") && error.status !== 401) {
        setErrorNotification(
          `Save failed: ${error.message || "Unknown error occurred"}`
        );
        setTimeout(() => setErrorNotification(null), 5000);
      }

      setSaveProgress(0); // Reset save progress
    }
  };

  const { start, isActive } = useTutorial();
  const screenHeight = window.innerHeight;
  if (authorizedUserOcto) {
    if (
      GlobalVariables.currentAWSnode &&
      GlobalVariables.currentAWSnode.owner === GlobalVariables.currentUser
    ) {
      return (
        <>
          {isActive ? <TutorialOverlay /> : null}
          <ParamsMenu
            position={{ top: screenHeight / 2 - 10, left: 10 }}
            id={"atom-create-params-panel"}
            contentCollapsed={expandedMenu !== "params"}
            setContentCollapsed={() => setExpandedMenu("params")}
            panelRef={panelRef}
            closeMenu={() => setExpandedMenu("none")}
            initialCollapsed={true}
            collapsedOffset={[45, 0]}
          />
          <RenderMenu
            {...{
              contentCollapsed: expandedMenu !== "render",
              setContentCollapsed: () => setExpandedMenu("render"),
              position: { top: screenHeight / 2 + 35, left: 10 },
              collapsedOffset: [45, -45],
              closeMenu: () => setExpandedMenu("none"),
            }}
            id={"atom-create-render-panel"}
          />
          <BomMenu
            {...{
              id: "atom-bom-panel",
              contentCollapsed: expandedMenu !== "bom",
              setContentCollapsed: () => setExpandedMenu("bom"),
              closeMenu: () => setExpandedMenu("none"),
              position: { top: screenHeight / 2 + 80, left: 10 },
              collapsedOffset: [45, -90],
            }}
          />
          <GitSearchMenu
            {...{
              activeAtom,
              id: "atom-git-search-panel",
              contentCollapsed: expandedMenu !== "git-search",
              setContentCollapsed: () => setExpandedMenu("git-search"),
              closeMenu: () => setExpandedMenu("none"),
              setParamsMenuExpanded: () => setExpandedMenu("params"),
              position: { top: screenHeight / 2 + 125, left: 10 },
              collapsedOffset: [45, -135],
              gitRef: gitRef,
              setErrorNotification: setErrorNotification,
            }}
          />
          <div id="headerBar">
            <img
              className="thumnail-logo"
              src={
                import.meta.env.VITE_APP_PATH_FOR_PICS +
                "/imgs/abundance_logo.png"
              }
              alt="logo"
              onClick={() => navigate("/")}
              style={{ cursor: "pointer" }}
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
                    to={`/${GlobalVariables.currentAWSnode.owner}/${GlobalVariables.currentAWSnode.repoName}`}
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
          <ToggleRunCreate run={false} setActiveAtom={setActiveAtom} />
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
              savePopUp,
              setSavePopUp,
              saveProject,
              saveState,
              setSaveState,
              currentMoleculeTop,
              settingsPopUp,
              setSettingsPopUp,
              duplicateDialog,
              setDuplicateDialog,
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
          <input
            type="file"
            id="backgroundUsdzInput"
            style={{ display: "none" }}
            accept=".glb,.gltf"
            onChange={(event) => {
              let file = event.target.files[0];
              if (file) {
                uploadBackground3D(file);
              }
            }}
          />
          <input
            type="button"
            id="backgroundUsdzDeleteInput"
            style={{ display: "none" }}
            onClick={() => {
              deleteBackground3D();
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
              importNotification,
              errorNotification,
              setErrorNotification,
              setExpandedMenu,
              windowSize,
              redirectType,
              saveProject,
            }}
          />
          <div className="parent flex-parent" id="lowerHalf">
            <LowerHalf windowSize={windowSize} ref={meshRef} />
          </div>
        </>
      );
    } else {
      // Fallback: navigate to run mode if repo is still missing
      const { owner, repoName } = useParams();
      console.log("No repository found, redirecting to run mode");
      navigate(`/run/${owner}/${repoName}`);
    }
  } else {
    /** get repository from github by the id in the url */
    console.warn("You are not logged in");
    const { owner, repoName } = useParams();
    //try reauthenticating
    authRedirectHandler({
      redirectType: "reauth",
      returnTo: `/${owner && repoName ? `${owner}/${repoName}` : ""}`,
    });
  }
}

export default CreateMode;
