import React, { memo, useEffect, useState, useRef } from "react";
import GlobalVariables from "../../js/globalvariables.js";
import ShareDialog from "./ShareDialog.jsx";
import DuplicateProjectDialog from "./DuplicateProjectDialog.jsx";
import DuplicateCompleteDialog from "./DuplicateCompleteDialog.jsx";
import RenameProjectDialog from "./RenameProjectDialog.jsx";
import { useNavigate } from "react-router-dom";
import SettingsPopUp from "./SettingsPopUp.jsx";
import { useAuth, useAppState, useRendering, useProject } from "../../contexts/index.js";

function TopMenu({
  savePopUp,
  setSavePopUp,
  saveProject,
  saveState,
  setSaveState,
  currentMoleculeTop,
  settingsPopUp,
  setSettingsPopUp,
}) {
  const { authorizedUserOcto, authRedirectHandler } = useAuth();
  const {
    activeAtom,
    setActiveAtom,
    shortCutsOn,
    setShortCuts,
    setExportPopUp,
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
  let [duplicateDialog, setDuplicateDialog] = useState(false);
  let [duplicateCompleteDialog, setDuplicateCompleteDialog] = useState(false);
  let [duplicatedProjectInfo, setDuplicatedProjectInfo] = useState(null);
  let [renameDialog, setRenameDialog] = useState(false);
  let [renamingProject, setRenamingProject] = useState(false);
  let [renameProgress, setRenameProgress] = useState(0);

  const navigate = useNavigate();

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
      customName
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
      setRenameProgress
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

  // objects for navigation items in the top menu
  const navItems = [
    {
      id: "Open",
      buttonFunc: () => {
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
        setSavePopUp(true);
        saveProject(setSaveState, "User Save");
      },
    },
    {
      id: "Duplicate Project",
      buttonFunc: handleDuplicateProject,
    },
    {
      id: "Re-authenticate",
      buttonFunc: () => {
        // Re-authentication logic - redirect to GitHub OAuth
        authRedirectHandler({
          authType: "reauth",
          currentRepo: GlobalVariables.currentRepo,
          returnTo: `/${GlobalVariables.currentAWSnode.owner}/${GlobalVariables.currentAWSnode.repoName}`,
        });
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
       * Open pull request if it's a forked project.
       */
      id: "Pull Request",
      buttonFunc: () => {
        // If the project has a parent, open PR against the parent repo's default branch
        const repo = GlobalVariables.currentRepo;
        const parent = repo.parent;
        let baseRepo, baseBranch, headUser, headBranch;
        if (parent) {
          baseRepo = parent.full_name;
          baseBranch = parent.default_branch;
          headUser = repo.owner.login;
          headBranch = repo.default_branch;
        } else {
          baseRepo = repo.full_name;
          baseBranch = repo.default_branch;
          headUser = repo.owner.login;
          headBranch = repo.default_branch;
        }
        const prUrl = `https://github.com/${baseRepo}/compare/${baseBranch}...${headUser}:${headBranch}`;
        window.open(prUrl);
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
        GlobalVariables.topLevelMolecule.recomputeAll();
      }
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
  ];

  //{checks for top level variable and show go-up button if this is not top molecule
  //i'm not so sure this useeffect is right. put on list to review
  const TopLevel = () => {
    return (
      <>
        <button
          id="go-up-button"
          className="nav-bar go-up-button menu-nav-button"
          onClick={() => {
            GlobalVariables.currentMolecule.goToParentMolecule();
            setActiveAtom(GlobalVariables.currentMolecule);
          }}
        >
          <img
            className="nav-img thumnail-logo"
            src={import.meta.env.VITE_APP_PATH_FOR_PICS + "/imgs/Go Up.svg"}
            key=""
            title=""
          />
        </button>
      </>
    );
  };

  const SaveBar = ({ saveState, savePopUp, setSavePopUp }) => {
    if (saveState === 100) {
      // delay and then set savepopupstate to false
      var delayInMilliseconds = 2000; //1 second
      setTimeout(function () {
        setSavePopUp(false);
      }, delayInMilliseconds);
    }
    return (
      <>
        <div className="save-bar">
          <div className="progress">
            <div
              className="progress-done"
              data-done="70"
              style={{ width: saveState + "%", opacity: "1" }}
            >
              {saveState !== 100 ? saveState + "%" : "Project Saved!"}
            </div>
          </div>
        </div>
      </>
    );
  };

  const DuplicateBar = ({ duplicateProgress, duplicatingProject }) => {
    return (
      <>
        <div className="save-bar">
          <div className="progress">
            <div
              className="progress-done"
              data-done="70"
              style={{ width: duplicateProgress + "%", opacity: "1" }}
            >
              {duplicateProgress !== 100 ? duplicateProgress + "%" : "Project Duplicated!"}
            </div>
          </div>
        </div>
      </>
    );
  };

  const RenameBar = ({ renameProgress, renamingProject }) => {
    return (
      <>
        <div className="save-bar">
          <div className="progress">
            <div
              className="progress-done"
              data-done="70"
              style={{ width: renameProgress + "%", opacity: "1" }}
            >
              {renameProgress !== 100 ? renameProgress + "%" : "Project Renamed!"}
            </div>
          </div>
        </div>
      </>
    );
  };

  /*{nav bar toggle component}*/
  const Navbar = ({ currentMoleculeTop }) => {
    const [navbarOpen, setNavbarOpen] = useState(false);
    const ref = useRef();
    useEffect(() => {
      const handler = (event) => {
        if (navbarOpen && ref.current && !ref.current.contains(event.target)) {
          setNavbarOpen(false);
        }
      };
      document.addEventListener("mousedown", handler);
      return () => {
        // Cleanup the event listener
        document.removeEventListener("mousedown", handler);
      };
    }, [navbarOpen]);
    return (
      <>
        <nav ref={ref} className="navbar">
          <button
            className="toggle menu-nav-button"
            onClick={() => setNavbarOpen((prev) => !prev)}
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
                onClick={item.buttonFunc}
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
  };

  return (
    <>
      {savePopUp ? (
        <SaveBar {...{ saveState, savePopUp, setSavePopUp }} />
      ) : null}
      {duplicatingProject ? (
        <DuplicateBar {...{ duplicateProgress, duplicatingProject }} />
      ) : null}
      {renamingProject ? (
        <RenameBar {...{ renameProgress, renamingProject }} />
      ) : null}
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
      {currentMoleculeTop ? <TopLevel /> : null}
      <Navbar {...{ currentMoleculeTop }} />
    </>
  );
}

export default TopMenu;
