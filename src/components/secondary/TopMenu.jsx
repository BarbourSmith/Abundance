import React, { memo, useEffect, useState, useRef, useMemo } from "react";
import GlobalVariables from "../../js/globalvariables.js";
import ShareDialog from "./ShareDialog.jsx";
import DuplicateProjectDialog from "./DuplicateProjectDialog.jsx";
import DuplicateCompleteDialog from "./DuplicateCompleteDialog.jsx";
import RenameProjectDialog from "./RenameProjectDialog.jsx";
import { useNavigate } from "react-router-dom";
import SettingsPopUp from "./SettingsPopUp.jsx";
import GoUpLevelButton from "./GoUpLevelButton.jsx";
import {
  useAuth,
  useAppState,
  useRendering,
  useProject,
} from "../../contexts/index.js";
import { useProgressBar } from "./ProgressBarManager.jsx";

function TopMenu({
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
  recomputeVisible,
  setRecomputeVisible,
  recomputeProgress,
  setRecomputeProgress,
}) {
  const { authorizedUserOcto, authRedirectHandler } = useAuth();
  const {
    activeAtom,
    setActiveAtom,
    shortCutsOn,
    setShortCuts,
    setExportPopUp,
    setNotification,
  } = useAppState();
  const {
    gridParam,
    axesParam,
    wireParam,
    solidParam,
    setGrid,
    setAxes,
    setWire,
    setSolid,
    backgroundUsdzFile,
    setBackgroundUsdzFile,
    backgroundUsdzSha,
    setBackgroundUsdzSha,
    showBackgroundModel,
    setShowBackgroundModel,
  } = useRendering();
  const { duplicateProject, renameProject, loadProject } = useProject();

  let [shareDialog, setShareDialog] = useState(false);
  let [dialogContent, setDialog] = useState("");
  let [duplicateProgress, setDuplicateProgress] = useState(0);
  let [duplicatingProject, setDuplicatingProject] = useState(false);
  let [duplicateCompleteDialog, setDuplicateCompleteDialog] = useState(false);
  let [duplicatedProjectInfo, setDuplicatedProjectInfo] = useState(null);
  let [renameDialog, setRenameDialog] = useState(false);
  let [renamingProject, setRenamingProject] = useState(false);
  let [renameProgress, setRenameProgress] = useState(0);

  const navigate = useNavigate();

  // Register progress bars with the manager
  useProgressBar("save", savePopUp, saveState, "Saving", false);
  useProgressBar(
    "duplicate",
    duplicatingProject,
    duplicateProgress,
    "Duplicating",
    false,
  );
  useProgressBar("rename", renamingProject, renameProgress, "Renaming", false);

  // Auto-hide save bar when complete
  useEffect(() => {
    if (saveState === 100 && savePopUp) {
      const timer = setTimeout(() => {
        setSavePopUp(false);
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [saveState, savePopUp]);

  /**
   * Handle the duplicate project action - show dialog first
   */
  const handleDuplicateProject = () => {
    if (!authorizedUserOcto) {
      window.alert("You must be authenticated to duplicate a project.");
      return;
    }

    // Generate default name
    const currentRepo = GlobalVariables.currentRepo;
    if (!currentRepo) {
      window.alert("No active project to duplicate.");
      return;
    }

    // Show the dialog to get the name
    setDuplicateDialog(true);
  };

  /**
   * Execute the actual duplication with the user-provided name
   */
  const executeDuplication = async (customName) => {
    setDuplicateDialog(false);
    setDuplicatingProject(true);
    setDuplicateProgress(0);

    const newProject = await duplicateProject(
      authorizedUserOcto,
      setDuplicateProgress,
      customName,
    );

    if (newProject) {
      // Show completion dialog
      setTimeout(() => {
        setDuplicatingProject(false);
        setDuplicatedProjectInfo(newProject);
        setDuplicateCompleteDialog(true);
      }, 500);
    } else {
      setDuplicatingProject(false);
    }
  };

  /**
   * Handle the rename project action - show dialog first
   */
  const handleRenameProject = () => {
    if (!authorizedUserOcto) {
      window.alert("You must be authenticated to rename a project.");
      return;
    }

    const currentRepo = GlobalVariables.currentRepo;
    if (!currentRepo) {
      window.alert("No active project to rename.");
      return;
    }

    // Check if user owns the project
    if (currentRepo.owner.login !== GlobalVariables.currentUser) {
      window.alert("You can only rename projects that you own.");
      return;
    }

    // Show the dialog to get the new name
    setRenameDialog(true);
  };

  /**
   * Execute the actual rename with the user-provided name
   */
  const executeRename = async (newName) => {
    setRenameDialog(false);
    setRenamingProject(true);
    setRenameProgress(0);

    const updatedProject = await renameProject(
      authorizedUserOcto,
      newName,
      setRenameProgress,
    );

    setRenamingProject(false);

    if (updatedProject) {
      // Navigate to the new URL
      window.alert(`Project successfully renamed to "${newName}"`);
      navigate(`/${updatedProject.owner}/${newName}`);
      // Reload the project with the new name
      setTimeout(() => {
        window.location.reload();
      }, 100);
    }
  };

  const closeNavbar = () => {
    if (navbarOpenRef.current) {
      navbarOpenRef.current = false;
      setNavbarRenderTrigger((prev) => prev + 1);
    }
  };

  // objects for navigation items in the top menu
  const navItems = useMemo(
    () => [
      {
        id: "Open",
        buttonFunc: () => {
          // Save current project state to localStorage before navigating
          // Note: owner and repoName come from GitHub's API and are validated by GitHub
          if (
            GlobalVariables.topLevelMolecule &&
            GlobalVariables.currentAWSnode?.owner &&
            GlobalVariables.currentAWSnode?.repoName
          ) {
            const projectState = GlobalVariables.topLevelMolecule.serialize();
            projectState.filetypeVersion = 1;
            const projectKey = `unsavedProject_${GlobalVariables.currentAWSnode.owner}_${GlobalVariables.currentAWSnode.repoName}`;
            localStorage.setItem(projectKey, JSON.stringify(projectState));
          }
          navigate("/");
        },
      },
      {
        id: "GitHub",
        buttonFunc: () => {
          window.open(GlobalVariables.currentRepo.html_url);
        },
      },
      {
        /**
         * Open a new tab with the README page for the project.
         */
        id: "Read Me",
        buttonFunc: () => {
          var url =
            GlobalVariables.currentRepo.html_url + "/blob/master/README.md";
          window.open(url);
        },
      },
      {
        /**
         * Open a new tab with the Bill Of Materials page for the project.
         */
        id: "Bill of Materials",
        buttonFunc: () => {
          var url =
            GlobalVariables.currentRepo.html_url +
            "/blob/master/BillOfMaterials.md";
          window.open(url);
        },
      },
      {
        /**
         * Open a new tab with a sharable copy of the project.
         */
        id: "Share",
        buttonFunc: () => {
          setDialog("share");
          setShareDialog(true);
        },
      },
      {
        id: "Save Project",
        buttonFunc: () => {
          saveProject(setSaveState, "User Save", false, () =>
            setSavePopUp(true),
          );
        },
      },
      {
        id: "Duplicate Project",
        buttonFunc: handleDuplicateProject,
      },
      {
        id: "Re-authenticate",
        buttonFunc: () => {
          var jsonRepOfProject = GlobalVariables.topLevelMolecule.serialize();
          const currentProjectRep = JSON.stringify(jsonRepOfProject);
          // Re-authentication logic - redirect to GitHub OAuth
          setNotification(
            "Re-authentication is unavailable at this time. Please try refreshing the page.",
            "error",
          );
          setTimeout(() => setNotification(null, "error"), 5000);

          /*
          authRedirectHandler({
            authType: "reauth",
            currentProjectRep,
            returnTo: `/${GlobalVariables.currentAWSnode.owner}/${GlobalVariables.currentAWSnode.repoName}`,
          });*/
        },
      },
      {
        id: "Settings",
        buttonFunc: () => {
          //placeholder for settings menu in progress
          setSettingsPopUp(true);
        },
      },
      {
        /**
         * Navigate to pull request comparison mode.
         */
        id: "Pull Request",
        buttonFunc: () => {
          // Get repo information
          const repo = GlobalVariables.currentRepo;
          const parent = repo.parent;

          // Determine base (parent if fork, otherwise current)
          let baseOwner, baseRepo;
          if (parent) {
            // Parse parent.full_name (format: "owner/repo")
            const [parentOwner, parentName] = parent.full_name.split("/");
            baseOwner = parentOwner;
            baseRepo = parentName;
          } else {
            baseOwner = repo.owner.login;
            baseRepo = repo.name;
          }

          // Head is always current repo
          const headOwner = repo.owner.login;
          const headRepo = repo.name;

          // Navigate to pullMode with URL parameters
          navigate(`/pull/${baseOwner}/${baseRepo}/${headOwner}/${headRepo}`);
        },
      },
      {
        /**
         * Open pull request if it's a forked project.
         */
        id: "ExportGit",
        buttonFunc: () => {
          setExportPopUp(true);
        },
      },
      {
        id: "Recompute Project",
        buttonFunc: () => {
          GlobalVariables.currentMolecule = GlobalVariables.topLevelMolecule;
          GlobalVariables.topLevelMolecule.recomputeAll(
            setRecomputeVisible,
            setRecomputeProgress,
          );
          setRecomputeVisible(true);
          setRecomputeProgress(0);
        },
      },
      {
        /**
         * Send user to GitHub settings page to delete project.
         */
        id: "Delete Project",
        buttonFunc: () => {
          var url = GlobalVariables.currentRepo.html_url + "/settings";
          window.open(url);
          //tryDelete();
        },
      },
      {
        /**
         * Navigate to the Abundance User Guide page.
         */
        id: "User Guide",
        buttonFunc: () => {
          navigate("/user-guide");
        },
      },
    ],
    [
      navigate,
      setDialog,
      setShareDialog,
      setSavePopUp,
      saveProject,
      setSaveState,
      handleDuplicateProject,
      authRedirectHandler,
      setSettingsPopUp,
      setExportPopUp,
    ],
  );

  /*{nav bar toggle component}*/
  // Use a ref to persist navbar state across re-renders without triggering them
  const navbarOpenRef = useRef(false);
  const [navbarRenderTrigger, setNavbarRenderTrigger] = useState(0);

  const Navbar = memo(({ currentMoleculeTop, renderTrigger }) => {
    const ref = useRef();
    const navbarOpen = navbarOpenRef.current;

    useEffect(() => {
      const handler = (event) => {
        if (
          navbarOpenRef.current &&
          ref.current &&
          !ref.current.contains(event.target)
        ) {
          navbarOpenRef.current = false;
          setNavbarRenderTrigger((prev) => prev + 1);
        }
      };
      document.addEventListener("mousedown", handler);
      return () => {
        // Cleanup the event listener
        document.removeEventListener("mousedown", handler);
      };
    }, []);

    const toggleNavbar = () => {
      navbarOpenRef.current = !navbarOpenRef.current;
      setNavbarRenderTrigger((prev) => prev + 1);
    };

    return (
      <>
        <nav ref={ref} className="navbar">
          <button
            id="top-menu-button"
            className="toggle menu-nav-button"
            onClick={toggleNavbar}
          >
            {navbarOpen ? (
              <img
                className={`thumnail-logo nav-img ${
                  !currentMoleculeTop ? " rotati-right" : ""
                }`}
                src={
                  import.meta.env.VITE_APP_PATH_FOR_PICS +
                  "/imgs/three-menu.svg"
                }
              />
            ) : (
              <img
                className={`thumnail-logo nav-img  ${
                  !currentMoleculeTop ? " rotati-plus " : "rotati"
                }`}
                src={
                  import.meta.env.VITE_APP_PATH_FOR_PICS +
                  "/imgs/three-menu.svg"
                }
              />
            )}
          </button>

          <div className={`menu-nav${navbarOpen ? " show-menu" : ""}`}>
            {navItems.map((item, index) => (
              <button
                key={item.id}
                className="menu-nav-button"
                onClick={() => {
                  item.buttonFunc();
                  closeNavbar();
                }}
              >
                <img
                  className=" thumnail-logo"
                  alt={item}
                  src={
                    import.meta.env.VITE_APP_PATH_FOR_PICS +
                    "/imgs/" +
                    item.id +
                    ".svg"
                  }
                  key={item.id}
                  title={item.id + "-button"}
                />
                <span className="nav-text">{item.id}</span>
              </button>
            ))}
          </div>
        </nav>
      </>
    );
  });

  return (
    <>
      {settingsPopUp ? (
        <SettingsPopUp
          {...{
            setSettingsPopUp,
            shortCutsOn,
            setShortCuts,
            gridParam,
            axesParam,
            wireParam,
            solidParam,
            setGrid,
            setAxes,
            setWire,
            setSolid,
            backgroundUsdzFile,
            setBackgroundUsdzFile,
            backgroundUsdzSha,
            setBackgroundUsdzSha,
            showBackgroundModel,
            setShowBackgroundModel,
            authorizedUserOcto,
            saveProject,
            setSaveState,
            setSavePopUp,
            handleRenameProject,
          }}
        />
      ) : null}
      {shareDialog ? (
        <ShareDialog
          {...{ shareDialog, setShareDialog, dialogContent, activeAtom }}
        />
      ) : null}
      {duplicateDialog ? (
        <DuplicateProjectDialog
          isOpen={duplicateDialog}
          onClose={() => setDuplicateDialog(false)}
          onConfirm={executeDuplication}
          defaultName={GlobalVariables.currentRepo?.name + "-copy"}
        />
      ) : null}
      {renameDialog ? (
        <RenameProjectDialog
          isOpen={renameDialog}
          onClose={() => setRenameDialog(false)}
          onConfirm={executeRename}
          currentName={GlobalVariables.currentRepo?.name}
        />
      ) : null}
      {duplicateCompleteDialog && duplicatedProjectInfo ? (
        <DuplicateCompleteDialog
          isOpen={duplicateCompleteDialog}
          onClose={() => setDuplicateCompleteDialog(false)}
          newProjectName={duplicatedProjectInfo.repoName}
          newProjectOwner={duplicatedProjectInfo.owner}
          newProjectRepoName={duplicatedProjectInfo.repoName}
        />
      ) : null}
      {currentMoleculeTop ? <GoUpLevelButton /> : null}
      <Navbar {...{ currentMoleculeTop, renderTrigger: navbarRenderTrigger }} />
    </>
  );
}

// Memoize TopMenu with custom comparison to ignore progress-related props
export default memo(TopMenu, (prevProps, nextProps) => {
  // Return true if props are equal (should NOT re-render)
  // Return false if props are different (should re-render)

  // Ignore changes to progress-related props
  const propsToIgnore = [
    "saveState",
    "savePopUp",
    "setSavePopUp",
    "setSaveState",
  ];

  // Check all other props for changes
  for (const key in nextProps) {
    if (!propsToIgnore.includes(key) && prevProps[key] !== nextProps[key]) {
      return false; // Props changed, should re-render
    }
  }

  return true; // Props are equal (ignoring progress props), should NOT re-render
});
