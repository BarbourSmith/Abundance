import React, { useEffect, useLayoutEffect, useState, useRef } from "react";
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
import { syncHeadWithBase, NO_CACHE } from "../../js/pullRequestSync.js";
import { describeConflictValue, mergeProjects } from "../../js/projectMerge.js";

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
  // Add cache-busting query parameter to force fresh data on every fetch
  const cacheBust = `?bust=${Date.now()}`;
  const fetchUrl = (branch) =>
    `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/project.abundance${cacheBust}`;

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
 * Fetches both sides of a pull request comparison, showing what the base
 * would look like after merging:
 * - base: the base branch's latest commit
 * - head: the head's changes merged onto it (see projectMerge.js). Showing the
 *   head as-is would show every change made on the base since the fork last
 *   merged it as if the pull request were undoing it.
 * Projects are loaded by commit SHA: raw.githubusercontent.com caches branch
 * names for up to five minutes, which would show a stale project right after
 * a save or update. Falls back to both branch tips if the GitHub API fails,
 * returning the error as fallbackError. conflicts lists values changed on both
 * sides; the preview shows the head's value for those.
 */
async function fetchComparisonProjects(
  baseOwner,
  baseRepo,
  headOwner,
  headRepo,
  octo,
) {
  // Pass values as params, not in the route: Octokit treats ":name" in a route
  // as a placeholder, which breaks "owner:sha" in compare URLs. The browser
  // may reuse GitHub API responses for 60 seconds; NO_CACHE makes it ask again.
  const githubGet = async (route, params) => {
    if (octo) {
      return (
        await octo.request(`GET ${route}`, { ...params, headers: NO_CACHE })
      ).data;
    }
    const path = route.replace(/{(\w+)}/g, (_, key) =>
      encodeURIComponent(params[key]),
    );
    const res = await fetch(`https://api.github.com${path}`, {
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`GitHub API ${res.status} for ${path}`);
    return res.json();
  };
  const getBranchSha = async (owner, repo, branch) =>
    (
      await githubGet("/repos/{owner}/{repo}/git/ref/{ref}", {
        owner,
        repo,
        ref: `heads/${branch}`,
      })
    ).object.sha;
  const fetchProjectAt = async (owner, repo, sha) => {
    const res = await fetch(
      `https://raw.githubusercontent.com/${owner}/${repo}/${sha}/project.abundance`,
    );
    if (!res.ok) throw new Error(`No project.abundance in ${owner}/${repo}`);
    return res.json();
  };

  let firstError;
  for (const branch of ["main", "master"]) {
    try {
      const [baseSha, headSha] = await Promise.all([
        getBranchSha(baseOwner, baseRepo, branch),
        getBranchSha(headOwner, headRepo, branch),
      ]);
      const compare = await githubGet(
        "/repos/{owner}/{repo}/compare/{basehead}",
        {
          owner: baseOwner,
          repo: baseRepo,
          basehead: `${baseSha}...${headOwner}:${headSha}`,
        },
      );
      const mergeBaseSha = compare.merge_base_commit.sha;
      const [baseProject, headProject, mergeBaseProject] = await Promise.all([
        fetchProjectAt(baseOwner, baseRepo, baseSha),
        fetchProjectAt(headOwner, headRepo, headSha),
        mergeBaseSha === baseSha
          ? null
          : fetchProjectAt(baseOwner, baseRepo, mergeBaseSha),
      ]);
      if (!mergeBaseProject) return { baseProject, headProject, conflicts: [] };
      const { merged, conflicts } = mergeProjects(
        mergeBaseProject,
        baseProject,
        headProject,
      );
      return { baseProject, headProject: merged, conflicts };
    } catch (err) {
      // Try the next branch name, then fall back to the tips below.
      // Report the first error: "main" is the usual branch.
      firstError = firstError ?? err;
    }
  }
  console.warn("Could not compare against the merge base:", firstError);
  const [baseProject, headProject] = await Promise.all([
    fetchGithubProjectSerialzed(baseOwner, baseRepo),
    fetchGithubProjectSerialzed(headOwner, headRepo),
  ]);
  return { baseProject, headProject, fallbackError: firstError };
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
    computingLabel,
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
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
  const [showExistingPRDialog, setShowExistingPRDialog] = useState(false);
  // Whether the PR dialog is confirming a PR just created, or one found already open
  const [prJustCreated, setPrJustCreated] = useState(false);
  const [showMergeErrorDialog, setShowMergeErrorDialog] = useState(false);
  const [mergeErrorMessage, setMergeErrorMessage] = useState("");
  const [prDescription, setPrDescription] = useState("");
  const [closeComment, setCloseComment] = useState("");
  const [existingPRData, setExistingPRData] = useState(null);
  const [existingPRHasConflicts, setExistingPRHasConflicts] = useState(false);
  const [isMergeSuccessful, setIsMergeSuccessful] = useState(false);
  const [isMerging, setIsMerging] = useState(false);
  const [isCreatingPR, setIsCreatingPR] = useState(false);
  const [isClosingPR, setIsClosingPR] = useState(false);
  const [isCheckingPR, setIsCheckingPR] = useState(false);
  const [mergeHasConflicts, setMergeHasConflicts] = useState(false);
  const [isSyncingPR, setIsSyncingPR] = useState(false);
  // Values changed on both sides: { conflicts, choices, resolve }
  const [conflictPrompt, setConflictPrompt] = useState(null);

  // Handle keyboard events for merge confirmation dialog
  useEffect(() => {
    if (!showMergeConfirm || conflictPrompt) return;

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
  }, [showMergeConfirm, conflictPrompt]);

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

  useLayoutEffect(() => {
    GlobalVariables.resetView();
    setActiveAtom(null);
    setCameraZoom(1);
  }, [baseOwner, baseRepo, headOwner, headRepo, authorizedUserOcto, userScopes]);

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
    let cancelled = false;
    fetchComparisonProjects(
      baseOwner,
      baseRepo,
      headOwner,
      headRepo,
      authorizedUserOcto,
    )
      .then(({ baseProject, headProject, fallbackError, conflicts }) => {
        // A newer run of this effect (e.g. after login finished) replaced this one
        if (cancelled) return;
        if (fallbackError) {
          setNotification(
            `Couldn't find where ${headOwner}/${headRepo} branched from ${baseOwner}/${baseRepo} (${fallbackError.message}), so this preview compares their latest versions and may include changes made in ${baseOwner}/${baseRepo}.`,
            "error",
            10000,
          );
        } else if (conflicts?.length > 0) {
          setNotification(
            `${conflicts.length} value(s) were changed in both ${baseOwner}/${baseRepo} and ${headOwner}/${headRepo}; this preview shows ${headOwner}'s version. You'll be asked which to keep when the pull request is updated.`,
            "notice",
            10000,
          );
        }

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
        if (cancelled) return;
        // Enable all molecules
        GlobalVariables.currentMolecule.enable();
        GlobalVariables.currentMolecule.enableAllChildren();
        setActiveAtom(GlobalVariables.currentMolecule);
      })
      .catch((err) => {
        if (cancelled) return;
        setNotification(`Failed to set up pull mode: ${err.message}`, "error");
      });

    // Cleanup function: reset global state when leaving PullMode
    // This prevents PullMode's template from being mistaken for a loaded project in CreateMode
    return () => {
      cancelled = true;
      GlobalVariables.topLevelMolecule = null;
      GlobalVariables.currentMolecule = null;
      GlobalVariables.currentAWSnode = null;
      GlobalVariables.currentRepo = null;
      GlobalVariables.loadedRepo = null;

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

  /**
   * Fetches a pull request, waiting while GitHub computes whether it can merge.
   * Pass the head commit after a push: until GitHub has caught up, it reports
   * the mergeability of the previous commit.
   */
  const fetchPRStatus = async (number, expectedHeadSha) => {
    let pr;
    for (let attempt = 0; attempt < 10; attempt++) {
      if (attempt > 0)
        await new Promise((resolve) => setTimeout(resolve, 2000));
      pr = (
        await authorizedUserOcto.request(
          "GET /repos/{owner}/{repo}/pulls/{pull_number}",
          {
            owner: baseOwner,
            repo: baseRepo,
            pull_number: number,
            headers: NO_CACHE,
          },
        )
      ).data;
      const headCaughtUp = !expectedHeadSha || pr.head.sha === expectedHeadSha;
      if (headCaughtUp && pr.mergeable !== null && pr.mergeable !== undefined)
        break;
    }
    const hasConflicts =
      pr.mergeable === false || pr.mergeable_state === "dirty";
    return { pr, hasConflicts };
  };

  /** Shows the conflict dialog; resolves with the user's choices, or null if cancelled */
  const askForResolutions = (conflicts) =>
    new Promise((resolve) =>
      setConflictPrompt({ conflicts, choices: {}, resolve }),
    );

  /**
   * Merges the base's latest changes into the head fork so the pull request
   * has no conflicts. Returns the head's commit afterwards, or null if the
   * user cancelled.
   */
  const syncWithBase = async () => {
    const options = { baseOwner, baseRepo, headOwner, headRepo };
    let result = await syncHeadWithBase(authorizedUserOcto, options);
    if (result.status === "conflicts") {
      const resolutions = await askForResolutions(result.conflicts);
      if (!resolutions) return null;
      result = await syncHeadWithBase(authorizedUserOcto, {
        ...options,
        resolutions,
      });
      if (result.status === "conflicts") {
        throw new Error(
          `${baseOwner}/${baseRepo} changed while resolving conflicts. Please try again.`,
        );
      }
    }
    return result.headSha;
  };

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
      // Bring in the base's latest changes first so the PR opens without conflicts
      if (!(await syncWithBase())) return;

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

      const { pr, hasConflicts } = await fetchPRStatus(response.data.number);
      setExistingPRHasConflicts(hasConflicts);
      setExistingPRData(pr);
      setNotification(
        `Pull request created: ${response.data.html_url}`,
        "notice",
      );
      setShowPRConfirm(false);
      setPrJustCreated(true);
      setShowExistingPRDialog(true);
    } catch (error) {
      setNotification(`Error creating pull request: ${error.message}`, "error");
      setShowPRConfirm(false);
    } finally {
      setIsCreatingPR(false);
    }
  };

  const createPullRequest = async () => {
    if (!authorizedUserOcto) {
      setNotification(
        "You must be logged in to create a pull request.",
        "error",
      );
      return;
    }

    setIsCheckingPR(true);

    try {
      // Check for existing PR from head to base
      const prsResponse = await authorizedUserOcto.request(
        "GET /repos/{owner}/{repo}/pulls",
        {
          owner: baseOwner,
          repo: baseRepo,
          state: "open",
          head: `${headOwner}:main`,
          base: "main",
        },
      );

      if (prsResponse.data.length > 0) {
        // PR already exists
        const { pr, hasConflicts } = await fetchPRStatus(
          prsResponse.data[0].number,
        );
        setExistingPRData(pr);
        setExistingPRHasConflicts(hasConflicts);
        setPrJustCreated(false);
        setShowExistingPRDialog(true);
      } else {
        // No existing PR, show description dialog
        setPrDescription("");
        setShowPRConfirm(true);
      }
    } catch (error) {
      console.error("Error checking for existing PR:", error);
      setNotification(
        "Error checking for pull requests. Please try again.",
        "error",
      );
    } finally {
      setIsCheckingPR(false);
    }
  };

  /** Updates an existing pull request with the base's latest changes */
  const handleUpdatePullRequest = async () => {
    setIsSyncingPR(true);
    try {
      const headSha = await syncWithBase();
      if (!headSha) return;
      const { pr, hasConflicts } = await fetchPRStatus(
        existingPRData.number,
        headSha,
      );
      setExistingPRData(pr);
      setExistingPRHasConflicts(hasConflicts);
    } catch (error) {
      console.error("Error updating pull request:", error);
      setNotification(`Error updating pull request: ${error.message}`, "error");
    } finally {
      setIsSyncingPR(false);
    }
  };

  const closePullRequest = () => {
    setCloseComment("");
    setShowCloseConfirm(true);
  };

  const handleConfirmClosePR = async () => {
    if (!authorizedUserOcto) {
      setNotification(
        "You must be logged in to close a pull request.",
        "error",
      );
      setShowCloseConfirm(false);
      return;
    }

    setIsClosingPR(true);

    try {
      // Close the pull request
      await authorizedUserOcto.request(
        "PATCH /repos/{owner}/{repo}/pulls/{pull_number}",
        {
          owner: baseOwner,
          repo: baseRepo,
          pull_number: pullNumber,
          state: "closed",
        },
      );

      // Add comment if provided
      if (closeComment.trim()) {
        await authorizedUserOcto.request(
          "POST /repos/{owner}/{repo}/issues/{issue_number}/comments",
          {
            owner: baseOwner,
            repo: baseRepo,
            issue_number: pullNumber,
            body: closeComment,
          },
        );
      }

      setNotification("Pull request closed successfully", "notice");
      setShowCloseConfirm(false);
      setCloseComment("");

      // Redirect to LoginMode after a short delay
      setTimeout(() => {
        navigate("/");
      }, 1000);
    } catch (error) {
      console.error("Error closing pull request:", error);
      setNotification(`Error closing pull request: ${error.message}`, "error");
    } finally {
      setIsClosingPR(false);
    }
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
    try {
      const { hasConflicts } = await fetchPRStatus(pullNumber);
      setMergeHasConflicts(hasConflicts);
      setShowMergeConfirm(true);
    } catch (error) {
      console.error("Error fetching PR data:", error);
      setNotification(
        "Error checking for merge conflicts. Please try again.",
        "error",
      );
    }
  };

  const handleConfirmMerge = async () => {
    if (!authorizedUserOcto) {
      setNotification(
        "You must be logged in to merge a pull request.",
        "error",
      );
      setShowMergeConfirm(false);
      return;
    }

    setIsMerging(true);

    console.log(
      `Merging pull request from ${headOwner}/${headRepo} into ${baseOwner}/${baseRepo}`,
    );
    try {
      // Bring the base's latest changes into the PR so GitHub can merge it
      if (mergeHasConflicts) {
        const headSha = await syncWithBase();
        if (!headSha) return;
        const { hasConflicts } = await fetchPRStatus(pullNumber, headSha);
        if (hasConflicts) {
          throw new Error(
            "The pull request still has conflicts after updating it. Please resolve them on GitHub.",
          );
        }
      }

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
      setShowMergeConfirm(false);
      setMergeHasConflicts(false);
      setIsMergeSuccessful(true);
    } catch (error) {
      console.error("Error merging pull request:", error);
      setMergeErrorMessage(error.message);
      setShowMergeErrorDialog(true);
      setMergeHasConflicts(false);
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
        closePullRequest={closePullRequest}
        isMergeSuccessful={isMergeSuccessful}
        isCreatingPR={isCreatingPR}
      />

      {/* Merge Confirmation Dialog (hidden while choosing conflicting values) */}
      {showMergeConfirm && !conflictPrompt && (
        <dialog
          open={showMergeConfirm}
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "stretch",
            padding: "20px",
            minWidth: "400px",
            maxHeight: "80vh",
            overflowY: "auto",
          }}
          className="share-dialog"
        >
          <h3 style={{ margin: "0 0 15px 0" }}>Confirm Merge</h3>

          {mergeHasConflicts ? (
            <p style={{ margin: "0 0 20px 0" }}>
              <strong>
                {headOwner}/{headRepo}
              </strong>{" "}
              is out of date with{" "}
              <strong>
                {baseOwner}/{baseRepo}
              </strong>
              . Merging will first bring in the latest changes from {baseOwner}/
              {baseRepo}. If the same value was changed on both sides, you'll be
              asked which one to keep.
            </p>
          ) : (
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
          )}

          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              gap: "10px",
              marginTop: "10px",
            }}
          >
            <button
              onClick={() => {
                setShowMergeConfirm(false);
                setMergeHasConflicts(false);
              }}
              autoFocus={!mergeHasConflicts}
              style={{
                padding: "8px 16px",
                cursor: "pointer",
              }}
            >
              {mergeHasConflicts ? "Cancel" : "Close"}
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
            onClick={() => {
              setShowMergeConfirm(false);
              setMergeHasConflicts(false);
            }}
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

      {/* Close Pull Request Dialog */}
      {showCloseConfirm && (
        <dialog
          open={showCloseConfirm}
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "stretch",
            padding: "20px",
            minWidth: "450px",
          }}
          className="share-dialog"
        >
          <h3 style={{ margin: "0 0 15px 0" }}>Close Pull Request</h3>

          <p style={{ margin: "0 0 15px 0" }}>
            Add an optional comment before closing:
          </p>

          <textarea
            value={closeComment}
            onChange={(e) => setCloseComment(e.target.value)}
            placeholder="Leave a comment (optional)..."
            style={{
              width: "100%",
              minHeight: "100px",
              padding: "10px",
              borderRadius: "4px",
              border: "1px solid #ccc",
              fontFamily: "inherit",
              fontSize: "0.95em",
              marginBottom: "15px",
              boxSizing: "border-box",
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
                setShowCloseConfirm(false);
                setCloseComment("");
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
              onClick={handleConfirmClosePR}
              disabled={isClosingPR}
              style={{
                padding: "8px 16px",
                cursor: isClosingPR ? "not-allowed" : "pointer",
                backgroundColor: "#d32f2f",
                color: "white",
                border: "none",
                borderRadius: "4px",
                opacity: isClosingPR ? 0.6 : 1,
              }}
            >
              {isClosingPR ? "Closing..." : "Close Pull Request"}
            </button>
          </div>

          <a
            className="closeButton"
            onClick={() => {
              setShowCloseConfirm(false);
              setCloseComment("");
            }}
            style={{ cursor: "pointer" }}
          >
            {"\u00D7"}
          </a>
        </dialog>
      )}

      {/* Existing Pull Request Dialog */}
      {showExistingPRDialog && existingPRData && !conflictPrompt && (
        <dialog
          open={showExistingPRDialog}
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "stretch",
            padding: "20px",
            minWidth: "450px",
            maxHeight: "80vh",
            overflowY: "auto",
          }}
          className="share-dialog"
        >
          <h3 style={{ margin: "0 0 15px 0" }}>
            {prJustCreated
              ? "Pull Request Created"
              : "Pull Request Already Exists"}
          </h3>

          <p style={{ margin: "0 0 15px 0" }}>
            A pull request from{" "}
            <strong>
              {headOwner}/{headRepo}
            </strong>{" "}
            to{" "}
            <strong>
              {baseOwner}/{baseRepo}
            </strong>{" "}
            {prJustCreated ? "was created." : "already exists."}
          </p>

          {existingPRHasConflicts ? (
            <div
              style={{
                padding: "12px",
                backgroundColor: "#fff3cd",
                borderLeft: "4px solid #ffc107",
                borderRadius: "4px",
                marginBottom: "15px",
                color: "#333",
              }}
            >
              <p style={{ margin: "0 0 10px 0", fontWeight: "bold" }}>
                ⚠️ Out of date with {baseOwner}/{baseRepo}
              </p>
              <p style={{ margin: "0" }}>
                {baseOwner}/{baseRepo} has changed since this pull request was
                made. Update it to bring in those changes and clear the
                conflicts.
              </p>
            </div>
          ) : (
            <div
              style={{
                padding: "12px",
                backgroundColor: "#d4edda",
                borderLeft: "4px solid #28a745",
                borderRadius: "4px",
                marginBottom: "15px",
              }}
            >
              <p style={{ margin: "0" }}>✓ No merge conflicts detected</p>
            </div>
          )}

          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              gap: "10px",
              marginTop: "15px",
            }}
          >
            <button
              onClick={() => {
                setShowExistingPRDialog(false);
                setExistingPRData(null);
                setExistingPRHasConflicts(false);
              }}
              style={{
                padding: "8px 16px",
                cursor: "pointer",
              }}
            >
              Close
            </button>
            <button
              onClick={() => {
                window.open(
                  `https://github.com/${baseOwner}/${baseRepo}/pull/${existingPRData.number}`,
                  "_blank",
                );
              }}
              style={{
                padding: "8px 16px",
                cursor: "pointer",
              }}
            >
              View on GitHub
            </button>
            {existingPRHasConflicts && (
              <button
                onClick={handleUpdatePullRequest}
                disabled={isSyncingPR}
                style={{
                  padding: "8px 16px",
                  cursor: isSyncingPR ? "not-allowed" : "pointer",
                  backgroundColor: "var(--abundance-color-brightPurple)",
                  color: "white",
                  border: "none",
                  borderRadius: "4px",
                  opacity: isSyncingPR ? 0.6 : 1,
                }}
              >
                {isSyncingPR ? "Updating..." : "Update Pull Request"}
              </button>
            )}
            {!prJustCreated && (
              <button
                onClick={async () => {
                  setIsClosingPR(true);
                  try {
                    await authorizedUserOcto.request(
                      "PATCH /repos/{owner}/{repo}/pulls/{pull_number}",
                      {
                        owner: baseOwner,
                        repo: baseRepo,
                        pull_number: existingPRData.number,
                        state: "closed",
                      },
                    );
                    setNotification("Pull request closed.", "notice");
                    setShowExistingPRDialog(false);
                    setExistingPRData(null);
                    setExistingPRHasConflicts(false);
                  } catch (error) {
                    setNotification(
                      `Error closing pull request: ${error.message}`,
                      "error",
                    );
                  } finally {
                    setIsClosingPR(false);
                  }
                }}
                disabled={isClosingPR}
                style={{
                  padding: "8px 16px",
                  cursor: isClosingPR ? "not-allowed" : "pointer",
                  backgroundColor: "#dc3545",
                  color: "white",
                  border: "none",
                  borderRadius: "4px",
                  opacity: isClosingPR ? 0.6 : 1,
                }}
              >
                {isClosingPR ? "Closing..." : "Close Pull Request"}
              </button>
            )}
          </div>

          <a
            className="closeButton"
            onClick={() => {
              setShowExistingPRDialog(false);
              setExistingPRData(null);
              setExistingPRHasConflicts(false);
            }}
            style={{ cursor: "pointer" }}
          >
            {"\u00D7"}
          </a>
        </dialog>
      )}

      {/* Pull Request Confirmation Dialog */}
      {showPRConfirm && !conflictPrompt && (
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

      {/* Conflicting Changes Dialog */}
      {conflictPrompt && (
        <dialog
          open
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "stretch",
            padding: "20px",
            minWidth: "450px",
            maxHeight: "80vh",
            overflowY: "auto",
            zIndex: 11,
          }}
          className="share-dialog"
        >
          <h3 style={{ margin: "0 0 15px 0" }}>Conflicting Changes</h3>

          <p style={{ margin: "0 0 15px 0" }}>
            These values were changed in both{" "}
            <strong>
              {baseOwner}/{baseRepo}
            </strong>{" "}
            and{" "}
            <strong>
              {headOwner}/{headRepo}
            </strong>
            . Choose which version to keep. Everything else is merged
            automatically.
          </p>

          {conflictPrompt.conflicts.map((conflict) => (
            <fieldset
              key={conflict.id}
              style={{
                margin: "0 0 12px 0",
                padding: "8px 12px",
                border: "1px solid #ccc",
                borderRadius: "4px",
              }}
            >
              <legend style={{ fontWeight: "bold" }}>{conflict.label}</legend>
              {[
                ["main", `${baseOwner}/${baseRepo}`],
                ["head", `${headOwner}/${headRepo}`],
              ].map(([side, repoName]) => (
                <label
                  key={side}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    marginBottom: "4px",
                  }}
                >
                  <input
                    type="radio"
                    name={conflict.id}
                    checked={conflictPrompt.choices[conflict.id] === side}
                    onChange={() =>
                      setConflictPrompt({
                        ...conflictPrompt,
                        choices: {
                          ...conflictPrompt.choices,
                          [conflict.id]: side,
                        },
                      })
                    }
                  />
                  {repoName}: {describeConflictValue(conflict[side])}
                </label>
              ))}
            </fieldset>
          ))}

          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              gap: "10px",
              marginTop: "10px",
            }}
          >
            <button
              onClick={() => {
                conflictPrompt.resolve(null);
                setConflictPrompt(null);
              }}
              style={{ padding: "8px 16px", cursor: "pointer" }}
            >
              Cancel
            </button>
            <button
              onClick={() => {
                conflictPrompt.resolve(conflictPrompt.choices);
                setConflictPrompt(null);
              }}
              disabled={conflictPrompt.conflicts.some(
                (conflict) => !conflictPrompt.choices[conflict.id],
              )}
              style={{
                padding: "8px 16px",
                cursor: "pointer",
                backgroundColor: "var(--abundance-color-brightPurple)",
                color: "white",
                border: "none",
                borderRadius: "4px",
                opacity: conflictPrompt.conflicts.some(
                  (conflict) => !conflictPrompt.choices[conflict.id],
                )
                  ? 0.6
                  : 1,
              }}
            >
              Continue
            </button>
          </div>

          <a
            className="closeButton"
            onClick={() => {
              conflictPrompt.resolve(null);
              setConflictPrompt(null);
            }}
            style={{ cursor: "pointer" }}
          >
            {"×"}
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
              action: "create-from-pull",
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
              position: "relative",
            }}
          >
            {computingLabel && (
              <div
                style={{
                  position: "absolute",
                  bottom: "8px",
                  right: "10px",
                  zIndex: 10,
                  fontSize: "11px",
                  color: "#666",
                  fontFamily: "monospace",
                  pointerEvents: "none",
                  userSelect: "none",
                }}
              >
                {computingLabel}
              </div>
            )}
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
