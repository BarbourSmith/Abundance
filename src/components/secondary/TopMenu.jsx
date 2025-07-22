import React, { memo, useEffect, useState, useRef } from "react";
import GlobalVariables from "../../js/globalvariables.js";
import ShareDialog from "./ShareDialog.jsx";
import { useNavigate } from "react-router-dom";
import SettingsPopUp from "./SettingsPopUp.jsx";
import MobileSettingsPopUp from "./MobileSettingsPopUp.jsx";

function TopMenu({
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
}) {
  let [shareDialog, setShareDialog] = useState(false);
  let [dialogContent, setDialog] = useState("");
  let [settingsPopUp, setSettingsPopUp] = useState(false);

  const navigate = useNavigate();

  console.log(GlobalVariables.isMobile());

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
        window.open(
          "https://github.com/" +
            GlobalVariables.currentRepo.full_name +
            "/compare/" +
            GlobalVariables.currentRepo.default_branch +
            "..." +
            GlobalVariables.currentRepo.owner.login +
            ":" +
            GlobalVariables.currentRepo.default_branch
        );
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
      {settingsPopUp ? (
        GlobalVariables.isMobile() == true ? (
          <MobileSettingsPopUp
            {...{ setSettingsPopUp, shortCutsOn, setShortCuts }}
          />
        ) : (
          <SettingsPopUp {...{ setSettingsPopUp, shortCutsOn, setShortCuts }} />
        )
      ) : null}
      {shareDialog ? (
        <ShareDialog
          {...{ shareDialog, setShareDialog, dialogContent, activeAtom }}
        />
      ) : null}
      {currentMoleculeTop ? <TopLevel /> : null}
      <Navbar {...{ currentMoleculeTop }} />
    </>
  );
}

export default memo(TopMenu);
