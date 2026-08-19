import React, { useEffect, useState, useRef } from "react";
import ThreeContext from "../render/ThreeContext.jsx";
import ReplicadMesh from "../render/ReplicadMesh.jsx";
import NonReplicadMesh from "../render/NonReplicadMesh.jsx";
import WireframeMesh from "../render/WireframeMesh.jsx";
import GlobalVariables from "../../js/globalvariables.js";

import ChangeMode from "../secondary/ChangeMode.jsx";
import Molecule from "../../molecules/molecule.js";
import PullModeMenu from "../secondary/PullModeMenu.jsx";
import { useNavigate, useParams, useLocation } from "react-router-dom";

// Import contexts
import {
  useAuth,
  useAppState,
  useRendering,
  useFileImport,
} from "../../contexts/index.js";
import { useProgressBar } from "../secondary/ProgressBarManager.jsx";

function useWindowSize() {
  const [windowSize, setWindowSize] = useState({
    width: undefined,
    height: undefined,
  });

  useEffect(() => {
    function handleResize() {
      setWindowSize({
        width: window.innerWidth,
        height: window.innerHeight,
      });
    }
    window.addEventListener("resize", handleResize);
    handleResize();
    return () => window.removeEventListener("resize", handleResize);
  }, []);
  return windowSize;
}

/**
 * Fetches a project's serialized data from GitHub
 * Tries master branch first, falls back to main
 */
function fetchGithubProjectSerialzed(owner, repo) {
  const fetchUrl = (branch) =>
    `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/project.abundance`;

  return fetch(fetchUrl("master"))
    .then((res) => {
      if (!res.ok) throw new Error("Master branch not found");
      return res.json();
    })
    .catch(() =>
      fetch(fetchUrl("main")).then((res) => {
        if (!res.ok) throw new Error("Main branch not found");
        return res.json();
      }),
    )
    .then((project) => {
      return project;
    });
}

/**
 * Creates a serialized template for pull request comparison
 * Merges baseProject and headProject into a single 3-shape assembly
 * - Shape 1: Removing (red)
 * - Shape 2: Adding (green)
 * - Shape 3: Intersection (neutral gray)
 */
function createPullModeTemplate(baseProject, headProject) {
  // Generate unique IDs for scaffolding atoms
  const outputId = GlobalVariables.generateUniqueID();
  const assemblyId = GlobalVariables.generateUniqueID();
  const colorHeadId = GlobalVariables.generateUniqueID();
  const colorBaseId = GlobalVariables.generateUniqueID();
  const tagHeadId = GlobalVariables.generateUniqueID();
  const tagBaseId = GlobalVariables.generateUniqueID();
  const intersectId = GlobalVariables.generateUniqueID();
  const colorIntersectId = GlobalVariables.generateUniqueID();
  const tagIntersectId = GlobalVariables.generateUniqueID();

  // Extract GitHub molecules from their projects
  // The fetched project IS the serialized molecule (not nested under topLevelMolecule)
  const baseGithubMolecule = { ...baseProject } || {};
  const headGithubMolecule = { ...headProject } || {};

  // Generate NEW unique IDs for the GitHub molecules to avoid conflicts
  const baseGithubId = GlobalVariables.generateUniqueID();
  const headGithubId = GlobalVariables.generateUniqueID();

  // Assign new IDs to the molecules
  baseGithubMolecule.uniqueID = baseGithubId;
  headGithubMolecule.uniqueID = headGithubId;

  // SAFETY CHECK: Make sure both GitHub molecules exist
  if (!baseGithubId || !headGithubId) {
    throw new Error(
      `Failed to extract GitHub molecules. Base ID: ${baseGithubId}, Head ID: ${headGithubId}`,
    );
  }

  // Build scaffolding atoms
  const scaffoldingAtoms = [
    {
      atomType: "Output",
      uniqueID: outputId,
      name: "Output",
      x: 0.98,
      y: 0.5,
      ioValues: [
        {
          name: "number or geometry",
          ioValue: "__GEOMETRY_INPUT__",
        },
      ],
    },
    {
      atomType: "Assembly",
      uniqueID: assemblyId,
      name: "Assembly",
      x: 0.85,
      y: 0.5,
      selectedColorIndex: 0,
      // Pre-populate inputs so connectors can reference them during deserialization
      ioValues: [
        {
          name: "Shape 1",
          ioValue: "__GEOMETRY_INPUT__",
        },
        {
          name: "Shape 2",
          ioValue: "__GEOMETRY_INPUT__",
        },
        {
          name: "Shape 3",
          ioValue: "__GEOMETRY_INPUT__",
        },
      ],
    },
    {
      atomType: "Color",
      uniqueID: colorHeadId,
      name: "Color Adding",
      x: 0.7,
      y: 0.6,
      selectedColorIndex: 7, // Grey
    },
    {
      atomType: "Color",
      uniqueID: colorBaseId,
      name: "Color Removing",
      x: 0.7,
      y: 0.4,
      selectedColorIndex: 22, // Transparent (can't use keepout color, creates tag conflict)
    },
    {
      atomType: "Tag",
      uniqueID: tagHeadId,
      name: "Adding",
      x: 0.55,
      y: 0.6,
      tags: ["Adding"],
    },
    {
      atomType: "Tag",
      uniqueID: tagBaseId,
      name: "Removing",
      x: 0.55,
      y: 0.4,
      tags: ["Removing"],
    },
    {
      atomType: "Intersection",
      uniqueID: intersectId,
      name: "Intersection",
      x: 0.4,
      y: 0.5,
    },
    {
      atomType: "Color",
      uniqueID: colorIntersectId,
      name: "Color Intersect",
      x: 0.25,
      y: 0.5,
      selectedColorIndex: 19, // Grey
    },
    {
      atomType: "Tag",
      uniqueID: tagIntersectId,
      name: "Unchanged",
      x: 0.1,
      y: 0.5,
      tags: ["Unchanged"],
    },
  ];

  // Build connectors with explicit IDs (no dynamic finding)
  const connectors = [
    // Adding: GitHub → Color Adding
    {
      ap1ID: headGithubId,
      ap2ID: colorHeadId,
      ap2Name: "geometry",
    },
    // Adding: Color Adding → Tag Adding
    {
      ap1ID: colorHeadId,
      ap2ID: tagHeadId,
      ap2Name: "geometry",
    },
    // Adding: Tag Adding → Assembly (Shape 2)
    {
      ap1ID: tagHeadId,
      ap2ID: assemblyId,
      ap2Name: "Shape 2",
    },
    // Adding: Color Adding (untagged) → Intersect (geometry1)
    {
      ap1ID: colorHeadId,
      ap2ID: intersectId,
      ap2Name: "geometry1",
    },

    // Removing: GitHub → Color Removing
    {
      ap1ID: baseGithubId,
      ap2ID: colorBaseId,
      ap2Name: "geometry",
    },
    // Removing: Color Removing → Tag Removing
    {
      ap1ID: colorBaseId,
      ap2ID: tagBaseId,
      ap2Name: "geometry",
    },
    // Removing: Tag Removing → Assembly (Shape 1)
    {
      ap1ID: tagBaseId,
      ap2ID: assemblyId,
      ap2Name: "Shape 1",
    },
    // Removing: Color Removing (untagged) → Intersect (geometry2)
    {
      ap1ID: colorBaseId,
      ap2ID: intersectId,
      ap2Name: "geometry2",
    },

    // Intersect: Intersection → Color Intersect
    {
      ap1ID: intersectId,
      ap2ID: colorIntersectId,
      ap2Name: "geometry",
    },
    // Intersect: Color Intersect → Tag Unchanged
    {
      ap1ID: colorIntersectId,
      ap2ID: tagIntersectId,
      ap2Name: "geometry",
    },
    // Intersect: Tag Unchanged → Assembly (Shape 3)
    {
      ap1ID: tagIntersectId,
      ap2ID: assemblyId,
      ap2Name: "Shape 3",
    },

    // Output: Assembly → Output
    {
      ap1ID: assemblyId,
      ap2ID: outputId,
      ap2Name: "number or geometry",
    },
  ];

  // Build complete molecule structure
  const templateProject = {
    fileTypeVersion: 1,
    topLevelMolecule: {
      atomType: "Molecule",
      uniqueID: GlobalVariables.generateUniqueID(),
      name: "Pull Request Comparison",
      x: 0,
      y: 0,
      topLevel: true,
      allAtoms: [...scaffoldingAtoms, baseGithubMolecule, headGithubMolecule],
      allConnectors: connectors,
    },
  };

  return templateProject;
}

function PullMode({ setProcessing }) {
  // Get URL parameters
  const {
    baseOwner = "",
    baseRepo = "",
    headOwner = "",
    headRepo = "",
  } = useParams();

  // Get query parameters
  const location = useLocation();
  const queryParams = new URLSearchParams(location.search);
  const prOwner = queryParams.get("owner"); // Optional owner parameter for merge permissions
  const pullNumber = queryParams.get("pull_number"); // Optional pull request number for merging

  // Get context values
  const { authorizedUserOcto, userScopes } = useAuth();
  const { activeAtom, setActiveAtom, setNotification } = useAppState();
  const {
    mesh,
    wireMesh,
    outdatedMesh,
    setOutdatedMesh,
    renderProgress,
    renderBarVisible,
    renderStage,
    gridParam,
    setGrid,
    axesParam,
    setAxes,
    wireParam,
    setWire,
    solidParam,
    setSolid,
  } = useRendering();
  const { uploadFile, deleteFile } = useFileImport();

  const navigate = useNavigate();

  // Disable output wire and top level wireframe for pull mode
  useEffect(() => {
    setWire(false);
  }, [setWire]);

  const [expandedMenu, setExpandedMenu] = useState(
    GlobalVariables.isMobile() ? "none" : "pullmode",
  );

  const [showMergeConfirm, setShowMergeConfirm] = useState(false);
  const [showPRConfirm, setShowPRConfirm] = useState(false);
  const [showMergeErrorDialog, setShowMergeErrorDialog] = useState(false);
  const [mergeErrorMessage, setMergeErrorMessage] = useState("");
  const [prDescription, setPrDescription] = useState("");
  const [isMergeSuccessful, setIsMergeSuccessful] = useState(false);
  const [isMerging, setIsMerging] = useState(false);
  const [isCreatingPR, setIsCreatingPR] = useState(false);

  // Handle keyboard events for merge confirmation dialog
  useEffect(() => {
    if (!showMergeConfirm) return;

    const handleKeyDown = (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        e.stopPropagation();
        handleConfirmMerge();
      } else if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        setShowMergeConfirm(false);
      }
    };

    document.addEventListener("keydown", handleKeyDown, true);
    return () => {
      document.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [showMergeConfirm]);

  // Handle keyboard events for PR confirmation dialog
  useEffect(() => {
    if (!showPRConfirm) return;

    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        setPrDescription("");
        setShowPRConfirm(false);
      }
    };

    document.addEventListener("keydown", handleKeyDown, true);
    return () => {
      document.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [showPRConfirm]);

  // Make file import functions available globally for atoms
  useEffect(() => {
    GlobalVariables.uploadFile = uploadFile;
    GlobalVariables.deleteFile = deleteFile;
    return () => {
      GlobalVariables.uploadFile = null;
      GlobalVariables.deleteFile = null;
    };
  }, [uploadFile, deleteFile]);

  // Register render progress bar
  useProgressBar(
    "render-empty",
    renderBarVisible,
    renderProgress,
    renderStage || "Rendering",
    true,
  );

  const canvasRef = useRef(1000);
  const windowSize = useWindowSize();
  const [cameraZoom, setCameraZoom] = useState(1);

  useEffect(() => {
    setCameraZoom(1);
  }, [GlobalVariables.currentAWSnode]);

  useEffect(() => {
    if (cameraZoom == 1 && mesh[0]) {
      const runModeZoom = mesh[0].cameraZoom * 2;
      setCameraZoom(runModeZoom);
    }
  }, [mesh]);

  useEffect(() => {
    GlobalVariables.canvas = canvasRef;
    GlobalVariables.c = canvasRef.current.getContext("2d");

    // Create blank molecule
    GlobalVariables.topLevelMolecule = new Molecule({
      x: 0,
      y: 0,
      topLevel: true,
      atomType: "Molecule",
      name: "Pull Request Comparison",
      uniqueID: GlobalVariables.generateUniqueID(),
    });
    GlobalVariables.currentMolecule = GlobalVariables.topLevelMolecule;
    GlobalVariables.currentMolecule.selected = true;
    GlobalVariables.currentAWSnode = null;
    GlobalVariables.currentRepo = null;

    // Fetch both GitHub projects and create template
    Promise.all([
      fetchGithubProjectSerialzed(baseOwner, baseRepo),
      fetchGithubProjectSerialzed(headOwner, headRepo),
    ])
      .then(([baseProject, headProject]) => {
        // Create template with GitHub molecules embedded
        const templateProject = createPullModeTemplate(
          baseProject,
          headProject,
        );

        // Deserialize entire template into the workspace
        const deserializeResult = GlobalVariables.topLevelMolecule.deserialize(
          templateProject.topLevelMolecule,
        );
        return Promise.resolve(deserializeResult);
      })
      .then(() => {
        // Enable all molecules
        GlobalVariables.currentMolecule.enable();
        GlobalVariables.currentMolecule.enableAllChildren();
        setActiveAtom(GlobalVariables.currentMolecule);
      })
      .catch((err) => {
        setNotification(`Failed to set up pull mode: ${err.message}`, "error");
      });

    // Cleanup function: reset global state when leaving PullMode
    // This prevents PullMode's template from being mistaken for a loaded project in CreateMode
    return () => {
      GlobalVariables.topLevelMolecule = null;
      GlobalVariables.currentMolecule = null;
      GlobalVariables.currentAWSnode = null;
      GlobalVariables.currentRepo = null;
      GlobalVariables.loadedRepo = null;
      // Don't leave the drawing globals pointing at this canvas once it is
      // detached, unless another view has already claimed them.
      if (GlobalVariables.canvas === canvasRef) {
        GlobalVariables.canvas = null;
        GlobalVariables.c = null;
      }

      // Clear all unsaved project states from localStorage to prevent stale data
      // when user navigates back to a project
      const keys = Object.keys(localStorage);
      keys.forEach((key) => {
        if (key.startsWith("unsavedProject_")) {
          localStorage.removeItem(key);
        }
      });
    };
  }, [
    baseOwner,
    baseRepo,
    headOwner,
    headRepo,
    authorizedUserOcto,
    userScopes,
  ]);

  const handleConfirmPullRequest = async (description) => {
    if (!authorizedUserOcto) {
      setNotification(
        "You must be logged in to create a pull request.",
        "error",
      );
      setShowPRConfirm(false);
      return;
    }

    setIsCreatingPR(true);

    const baseSvgPath =
      "https://raw.githubusercontent.com/" +
      baseOwner +
      "/" +
      baseRepo +
      "/master/project.svg?sanitize=true";
    const headSvgPath =
      "https://raw.githubusercontent.com/" +
      headOwner +
      "/" +
      headRepo +
      "/master/project.svg?sanitize=true";
    try {
      const response = await authorizedUserOcto.request(
        "POST /repos/{owner}/{repo}/pulls",
        {
          owner: baseOwner,
          repo: baseRepo,
          title: `Compare ${headRepo} changes`,
          body: `This pull request compares changes from ${headOwner}/${headRepo} to ${baseOwner}/${baseRepo}.${description ? `\n\nDescription:\n${description}` : ""}

## Comparison

| Adding | Removing |
|--------|----------|
| ![Adding](${headSvgPath}) | ![Removing](${baseSvgPath}) |
`,
          head: `${headOwner}:main`,
          base: "main",
        },
      );

      setNotification(
        `Pull request created: ${response.data.html_url}`,
        "notice",
      );
      setTimeout(() => setNotification(null), 5000);
      setShowPRConfirm(false);
    } catch (error) {
      setTimeout(() => setNotification(null), 5000);
      setNotification(`Error creating pull request: ${error.message}`, "error");
      setShowPRConfirm(false);
    } finally {
      setIsCreatingPR(false);
    }
  };

  const createPullRequest = () => {
    setPrDescription("");
    setShowPRConfirm(true);
  };

  if (activeAtom) {
    activeAtom.onStatusChange = (status) => {
      if (status === "waiting") {
        setOutdatedMesh(true);
        setProcessing(true);
      }
    };
  }

  const mergePullRequest = async () => {
    setShowMergeConfirm(true);
  };

  const handleConfirmMerge = async () => {
    if (!authorizedUserOcto) {
      setNotification(
        "You must be logged in to merge a pull request.",
        "error",
      );
      setTimeout(() => setNotification(null), 5000);
      setShowMergeConfirm(false);
      return;
    }

    setIsMerging(true);

    console.log(
      `Merging pull request from ${headOwner}/${headRepo} into ${baseOwner}/${baseRepo}`,
    );
    try {
      const response = await authorizedUserOcto.request(
        "PUT /repos/{owner}/{repo}/pulls/{pull_number}/merge",
        {
          owner: baseOwner,
          repo: baseRepo,
          pull_number: pullNumber,
          commit_title: "Merge pull request from " + headOwner + "/" + headRepo,
          commit_message: "Add a new value to the merge_method enum",
          headers: {
            "X-GitHub-Api-Version": "2026-03-10",
          },
        },
      );

      // Update AWS project item to remove the merged PR from open PRs list
      try {
        const apiUpdateUrl =
          "https://hg5gsgv9te.execute-api.us-east-2.amazonaws.com/abundance-stage/update-item";
        // In PullMode.jsx after successful merge:
        const updatedPRs = await authorizedUserOcto.request(
          "GET /repos/{owner}/{repo}/pulls",
          {
            owner: baseOwner,
            repo: baseRepo,
            state: "open",
            per_page: 100,
          },
        );

        // Filter and map to match your storage format
        const pullRequests = updatedPRs.data
          .map((pr) => ({
            owner: pr.head.repo?.owner?.login,
            repo: pr.head.repo?.name,
            branch: pr.head.ref,
            pullRequestNumber: pr.number,
            url: pr.html_url,
          }))
          .filter((pr) => pr.pullRequestNumber !== parseInt(pullNumber));

        // Then update with the fresh list
        await fetch(apiUpdateUrl, {
          method: "POST",
          body: JSON.stringify({
            owner: baseOwner,
            repoName: baseRepo,
            attributeUpdates: {
              pullRequests: pullRequests,
            },
          }),
        });
      } catch (updateError) {
        console.error("Error updating project PR list:", updateError);
        // Don't fail the entire operation if updating fails
      }

      setNotification(`Pull request merged: ${response.data.sha}`, "notice");
      setTimeout(() => setNotification(null), 5000);
      setShowMergeConfirm(false);
      setIsMergeSuccessful(true);
    } catch (error) {
      console.error("Error merging pull request:", error);
      setMergeErrorMessage(error.message);
      setShowMergeErrorDialog(true);
    } finally {
      setIsMerging(false);
    }
  };

  //  Define screen width to position menu
  const screenWidth = window.innerWidth;

  return (
    <>
      <PullModeMenu
        activeAtom={activeAtom}
        position={{ top: 30, left: screenWidth - 50 }}
        id={"pullmode-menu-panel"}
        contentCollapsed={expandedMenu !== "pullmode"}
        setContentCollapsed={() => setExpandedMenu("pullmode")}
        closeMenu={() => setExpandedMenu("none")}
        collapsedOffset={[-280, 0]}
        baseRepo={`${baseOwner}/${baseRepo}`}
        headRepo={`${headOwner}/${headRepo}`}
        prOwner={prOwner}
        createPullRequest={createPullRequest}
        mergePullRequest={mergePullRequest}
        isMergeSuccessful={isMergeSuccessful}
        isCreatingPR={isCreatingPR}
      />

      {/* Merge Confirmation Dialog */}
      {showMergeConfirm && (
        <dialog
          open={showMergeConfirm}
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "stretch",
            padding: "20px",
            minWidth: "400px",
          }}
          className="share-dialog"
        >
          <h3 style={{ margin: "0 0 15px 0" }}>Confirm Merge</h3>

          <p style={{ margin: "0 0 20px 0" }}>
            Are you sure you want to merge the changes from{" "}
            <strong>
              {headOwner}/{headRepo}
            </strong>{" "}
            into{" "}
            <strong>
              {baseOwner}/{baseRepo}
            </strong>
            ?
          </p>

          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              gap: "10px",
              marginTop: "10px",
            }}
          >
            <button
              onClick={() => setShowMergeConfirm(false)}
              autoFocus
              style={{
                padding: "8px 16px",
                cursor: "pointer",
              }}
            >
              Cancel
            </button>
            <button
              onClick={handleConfirmMerge}
              disabled={isMerging}
              style={{
                padding: "8px 16px",
                cursor: isMerging ? "not-allowed" : "pointer",
                backgroundColor: "var(--abundance-color-brightPurple)",
                color: "white",
                border: "none",
                borderRadius: "4px",
                opacity: isMerging ? 0.6 : 1,
              }}
            >
              {isMerging ? "Merging..." : "Merge"}
            </button>
          </div>

          <a
            className="closeButton"
            onClick={() => setShowMergeConfirm(false)}
            style={{ cursor: "pointer" }}
          >
            {"\u00D7"}
          </a>
        </dialog>
      )}

      {/* Merge Error Dialog */}
      {showMergeErrorDialog && (
        <dialog
          open={showMergeErrorDialog}
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "stretch",
            padding: "20px",
            minWidth: "400px",
          }}
          className="share-dialog"
        >
          <h3 style={{ margin: "0 0 15px 0", color: "#d32f2f" }}>
            Merge Error
          </h3>

          <p style={{ margin: "0 0 15px 0" }}>
            There was an error merging the pull request:
          </p>

          <div
            style={{
              padding: "12px",
              backgroundColor: "#f5f5f5",
              borderRadius: "4px",
              marginBottom: "15px",
              fontFamily: "monospace",
              fontSize: "0.85em",
              color: "#333",
              wordBreak: "break-word",
            }}
          >
            {mergeErrorMessage}
          </div>

          <p style={{ margin: "0 0 15px 0", fontSize: "0.9em" }}>
            This usually happens when there are merge conflicts. Visit the
            GitHub pull request page to resolve them.
          </p>

          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              gap: "10px",
            }}
          >
            <button
              onClick={() => setShowMergeErrorDialog(false)}
              autoFocus
              style={{
                padding: "8px 16px",
                cursor: "pointer",
              }}
            >
              Cancel
            </button>
            <button
              onClick={() => {
                window.open(
                  `https://github.com/${baseOwner}/${baseRepo}/pull/${pullNumber}`,
                  "_blank",
                );
                setShowMergeErrorDialog(false);
              }}
              style={{
                padding: "8px 16px",
                cursor: "pointer",
                backgroundColor: "var(--abundance-color-brightPurple)",
                color: "white",
                border: "none",
                borderRadius: "4px",
              }}
            >
              Go to GitHub PR
            </button>
          </div>

          <a
            className="closeButton"
            onClick={() => setShowMergeErrorDialog(false)}
            style={{ cursor: "pointer" }}
          >
            {"\u00D7"}
          </a>
        </dialog>
      )}

      {/* Pull Request Confirmation Dialog */}
      {showPRConfirm && (
        <dialog
          open={showPRConfirm}
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "stretch",
            padding: "20px",
            minWidth: "400px",
          }}
          className="share-dialog"
        >
          <h3 style={{ margin: "0 0 15px 0" }}>Confirm Pull Request</h3>

          <p style={{ margin: "0 0 15px 0" }}>
            Create a new pull request to merge changes from{" "}
            <strong>
              {headOwner}/{headRepo}
            </strong>{" "}
            into{" "}
            <strong>
              {baseOwner}/{baseRepo}
            </strong>
            ?
          </p>

          <label style={{ marginBottom: "10px", fontSize: "0.9em" }}>
            Description (optional):
          </label>
          <textarea
            value={prDescription}
            onChange={(e) => setPrDescription(e.target.value)}
            placeholder="Add a description for this pull request..."
            style={{
              padding: "10px",
              borderRadius: "4px",
              border: "1px solid #ccc",
              fontFamily: "monospace",
              fontSize: "0.85em",
              minHeight: "100px",
              marginBottom: "15px",
              resize: "vertical",
            }}
          />

          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              gap: "10px",
            }}
          >
            <button
              onClick={() => {
                setPrDescription("");
                setShowPRConfirm(false);
              }}
              autoFocus
              style={{
                padding: "8px 16px",
                cursor: "pointer",
              }}
            >
              Cancel
            </button>
            <button
              onClick={() => handleConfirmPullRequest(prDescription)}
              disabled={isCreatingPR}
              style={{
                padding: "8px 16px",
                cursor: isCreatingPR ? "not-allowed" : "pointer",
                backgroundColor: "var(--abundance-color-brightPurple)",
                color: "white",
                border: "none",
                borderRadius: "4px",
                opacity: isCreatingPR ? 0.6 : 1,
              }}
            >
              {isCreatingPR ? "Creating..." : "Create Pull Request"}
            </button>
          </div>

          <a
            className="closeButton"
            onClick={() => {
              setPrDescription("");
              setShowPRConfirm(false);
            }}
            style={{ cursor: "pointer" }}
          >
            {"\u00D7"}
          </a>
        </dialog>
      )}

      <div id="headerBarRun">
        <img
          className="thumnail-logo"
          src={
            import.meta.env.VITE_APP_PATH_FOR_PICS + "/imgs/abundance_logo.png"
          }
          onClick={() => navigate("/")}
          alt="logo"
        />
      </div>
      <canvas
        style={{ display: "none" }}
        ref={canvasRef}
        id="flow-canvas"
        tabIndex={0}
      ></canvas>
      {prOwner ? (
        <ChangeMode
          setActiveAtom={setActiveAtom}
          buttons={[
            {
              key: "run-to-browse",
              action: "browse",
              id: "browse-projects-btn",
              title: "Browse Projects",
              label: "Browse Projects",
              iconRotation: 90,
            },
          ]}
        />
      ) : (
        <ChangeMode
          setActiveAtom={setActiveAtom}
          targetRepo={{
            owner: GlobalVariables.currentUser,
            repoName: headRepo,
          }}
          buttons={[
            {
              key: "pull-to-create",
              action: "create",
              id: "create-mode-btn",
              title: "Create/Run Mode",
              label: "Create Mode",
              iconRotation: 90,
            },
          ]}
        />
      )}
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
              height: windowSize.height,
            }}
          >
            <ThreeContext
              {...{ cameraZoom, gridParam, axesParam, outdatedMesh }}
            >
              {wireParam && wireMesh ? <WireframeMesh mesh={wireMesh} /> : null}
              <NonReplicadMesh />
              <ReplicadMesh
                {...{
                  mesh,
                  isSolid: solidParam,
                  setOutdatedMesh,
                  setProcessing,
                }}
              />
            </ThreeContext>
          </section>
        </div>
      </div>
    </>
  );
}

export default PullMode;
