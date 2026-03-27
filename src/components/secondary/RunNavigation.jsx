import React, { useEffect, useState } from "react";
import ShareDialog from "./ShareDialog.jsx";
import ForkConfirmDialog from "./ForkConfirmDialog.jsx";
import { useNavigate } from "react-router-dom";
import GlobalVariables from "../../js/globalvariables.js";
import { re } from "mathjs";
import { useProgressBar } from "./ProgressBarManager.jsx";
import { useProject } from "../../contexts/ProjectContext.jsx";

//navigation svg icons - turn into key pairs later
let shareSvg = (
  <svg
    fill="#c4a3d5"
    height="20px"
    width="20px"
    version="1.1"
    id="Capa_1"
    xmlns="http://www.w3.org/2000/svg"
    xmlnsXlink="http://www.w3.org/1999/xlink"
    viewBox="0 0 227.216 227.216"
    xmlSpace="preserve"
  >
    <path
      d="M175.897,141.476c-13.249,0-25.11,6.044-32.98,15.518l-51.194-29.066c1.592-4.48,2.467-9.297,2.467-14.317
c0-5.019-0.875-9.836-2.467-14.316l51.19-29.073c7.869,9.477,19.732,15.523,32.982,15.523c23.634,0,42.862-19.235,42.862-42.879
C218.759,19.229,199.531,0,175.897,0C152.26,0,133.03,19.229,133.03,42.865c0,5.02,0.874,9.838,2.467,14.319L84.304,86.258
c-7.869-9.472-19.729-15.514-32.975-15.514c-23.64,0-42.873,19.229-42.873,42.866c0,23.636,19.233,42.865,42.873,42.865
c13.246,0,25.105-6.042,32.974-15.513l51.194,29.067c-1.593,4.481-2.468,9.3-2.468,14.321c0,23.636,19.23,42.865,42.867,42.865
c23.634,0,42.862-19.23,42.862-42.865C218.759,160.71,199.531,141.476,175.897,141.476z M175.897,15
c15.363,0,27.862,12.5,27.862,27.865c0,15.373-12.499,27.879-27.862,27.879c-15.366,0-27.867-12.506-27.867-27.879
C148.03,27.5,160.531,15,175.897,15z M51.33,141.476c-15.369,0-27.873-12.501-27.873-27.865c0-15.366,12.504-27.866,27.873-27.866
c15.363,0,27.861,12.5,27.861,27.866C79.191,128.975,66.692,141.476,51.33,141.476z M175.897,212.216
c-15.366,0-27.867-12.501-27.867-27.865c0-15.37,12.501-27.875,27.867-27.875c15.363,0,27.862,12.505,27.862,27.875
C203.759,199.715,191.26,212.216,175.897,212.216z"
    />
  </svg>
);
let starSvg = (
  <svg
    width="20px"
    height="20px"
    viewBox="0 0 23 23"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      d="M11.245 4.174C11.4765 3.50808 11.5922 3.17513 11.7634 3.08285C11.9115 3.00298 12.0898 3.00298 12.238 3.08285C12.4091 3.17513 12.5248 3.50808 12.7563 4.174L14.2866 8.57639C14.3525 8.76592 14.3854 8.86068 14.4448 8.93125C14.4972 8.99359 14.5641 9.04218 14.6396 9.07278C14.725 9.10743 14.8253 9.10947 15.0259 9.11356L19.6857 9.20852C20.3906 9.22288 20.743 9.23007 20.8837 9.36432C21.0054 9.48051 21.0605 9.65014 21.0303 9.81569C20.9955 10.007 20.7146 10.2199 20.1528 10.6459L16.4387 13.4616C16.2788 13.5829 16.1989 13.6435 16.1501 13.7217C16.107 13.7909 16.0815 13.8695 16.0757 13.9507C16.0692 14.0427 16.0982 14.1387 16.1563 14.3308L17.506 18.7919C17.7101 19.4667 17.8122 19.8041 17.728 19.9793C17.6551 20.131 17.5108 20.2358 17.344 20.2583C17.1513 20.2842 16.862 20.0829 16.2833 19.6802L12.4576 17.0181C12.2929 16.9035 12.2106 16.8462 12.1211 16.8239C12.042 16.8043 11.9593 16.8043 11.8803 16.8239C11.7908 16.8462 11.7084 16.9035 11.5437 17.0181L7.71805 19.6802C7.13937 20.0829 6.85003 20.2842 6.65733 20.2583C6.49056 20.2358 6.34626 20.131 6.27337 19.9793C6.18915 19.8041 6.29123 19.4667 6.49538 18.7919L7.84503 14.3308C7.90313 14.1387 7.93218 14.0427 7.92564 13.9507C7.91986 13.8695 7.89432 13.7909 7.85123 13.7217C7.80246 13.6435 7.72251 13.5829 7.56262 13.4616L3.84858 10.6459C3.28678 10.2199 3.00588 10.007 2.97101 9.81569C2.94082 9.65014 2.99594 9.48051 3.11767 9.36432C3.25831 9.23007 3.61074 9.22289 4.31559 9.20852L8.9754 9.11356C9.176 9.10947 9.27631 9.10743 9.36177 9.07278C9.43726 9.04218 9.50414 8.99359 9.55657 8.93125C9.61593 8.86068 9.64887 8.76592 9.71475 8.57639L11.245 4.174Z"
      stroke="#c4a3d5"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);
let forkSvg = (
  <svg
    width="22px"
    height="22px"
    viewBox="0 0 20 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      d="M7 5C7 3.89543 7.89543 3 9 3C10.1046 3 11 3.89543 11 5C11 5.74028 10.5978 6.38663 10 6.73244V14.0396H11.7915C12.8961 14.0396 13.7915 13.1441 13.7915 12.0396V10.7838C13.1823 10.4411 12.7708 9.78837 12.7708 9.03955C12.7708 7.93498 13.6662 7.03955 14.7708 7.03955C15.8753 7.03955 16.7708 7.93498 16.7708 9.03955C16.7708 9.77123 16.3778 10.4111 15.7915 10.7598V12.0396C15.7915 14.2487 14.0006 16.0396 11.7915 16.0396H10V17.2676C10.5978 17.6134 11 18.2597 11 19C11 20.1046 10.1046 21 9 21C7.89543 21 7 20.1046 7 19C7 18.2597 7.4022 17.6134 8 17.2676V6.73244C7.4022 6.38663 7 5.74028 7 5Z"
      fill="#c4a3d5"
    />
  </svg>
);

function RunNavigation({
  authorizedUserOcto,
  activeAtom,
  redirectType,
  setRedirectType,
  authRedirectHandler,
}) {
  let [shareDialog, setShareDialog] = useState(false);
  let [showForkDialog, setShowForkDialog] = useState(false);

  let [starredState, setStarred] = useState(false);
  let [dialogContent, setDialog] = useState("");

  const { forkProject } = useProject();

  // Fork progress tracking
  const [forkProgress, setForkProgress] = useState(0);
  const [forkBarVisible, setForkBarVisible] = useState(false);

  // Register fork progress bar with the stacking system
  useProgressBar("fork-run", forkBarVisible, forkProgress, "Forking", true);

  // Tooltip state for each button
  const [showTooltip, setShowTooltip] = useState({});

  // Tooltip messages for each button
  const tooltipMessages = {
    Share: "Share this project",
    Fork: "Fork this project",
    Star: starredState ? "Unlike this project" : "Like this project",
  };

  // Helper to show/hide tooltip for a button
  const handleTooltip = (btn, show) => {
    setShowTooltip((prev) => ({ ...prev, [btn]: show }));
  };
  var navigate = useNavigate();

  useEffect(() => {
    // check if the current user has starred the project
    if (authorizedUserOcto) {
      var owner = GlobalVariables.currentAWSnode.owner;
      var repoName = GlobalVariables.currentAWSnode.repoName;

      fetchUserData().then((awsUserJson) => {
        const isLiked = awsUserJson.repos.some(
          (project) => project.owner === owner && project.repoName === repoName,
        );
        // Sync starred state with server state
        setStarred(isLiked);
        // now handle the redirect action that was requested
        if (redirectType === "fork") {
          // Show confirmation dialog after authentication
          setShowForkDialog(true);
        }
        if (redirectType === "like") {
          // Use fresh isLiked value instead of potentially stale starredState
          !isLiked
            ? likeProject(authorizedUserOcto)
            : unlikeProject(authorizedUserOcto);
        }
      });
      if (
        GlobalVariables.currentAWSnode.owner === GlobalVariables.currentUser
      ) {
        document.getElementById("Fork-button").style.display = "none";
      }
    }
  }, [authorizedUserOcto]);

  /* Helper function to fetch user data including liked projects from AWS API */
  const fetchUserData = async () => {
    /*get liked repos from user table*/
    const queryUserApiUrl =
      "https://hg5gsgv9te.execute-api.us-east-2.amazonaws.com/abundance-stage/USER-TABLE?user=" +
      GlobalVariables.currentUser +
      "&liked=true";

    let awsUser = await fetch(queryUserApiUrl);
    let awsUserJson = await awsUser.json();

    return awsUserJson;
  };

  /**
   * Like a project on github by unique ID.
   */
  const likeProject = function () {
    //disable button before api call so user can't click multiple times
    setStarred(true);
    document.getElementById("Star-button").disabled = true;
    /*add item to your usertable liked-projects on aws*/
    const apiUpdateUserUrl =
      "https://hg5gsgv9te.execute-api.us-east-2.amazonaws.com/abundance-stage/USER-TABLE";

    fetch(apiUpdateUserUrl, {
      method: "POST",
      body: JSON.stringify({
        user: GlobalVariables.currentUser,
        attributeUpdates: { likedProjects: [GlobalVariables.currentAWSnode] },
        updateType: "SET",
      }),
      headers: {
        "Content-type": "application/json; charset=UTF-8",
      },
    }).then((response) => {
      //reenable button after api call so user can unlike
      console.log("added to liked projects");
      document.getElementById("Star-button").disabled = false;
      setRedirectType(null);
    });
  };
  const unlikeProject = function () {
    var owner = GlobalVariables.currentAWSnode.owner;
    var repoName = GlobalVariables.currentAWSnode.repoName;
    //disable button before api call so user can't click multiple times
    setStarred(false);
    document.getElementById("Star-button").disabled = true;

    /*remove item from your liked projects on aws*/
    const apiUpdateUserUrl =
      "https://hg5gsgv9te.execute-api.us-east-2.amazonaws.com/abundance-stage/USER-TABLE";
    fetch(apiUpdateUserUrl, {
      method: "POST",
      body: JSON.stringify({
        user: GlobalVariables.currentUser,
        attributeUpdates: {
          likedProjects: [{ owner: owner, repoName: repoName }],
        },
        updateType: "REMOVE",
      }),
      headers: {
        "Content-type": "application/json; charset=UTF-8",
      },
    }).then((response) => {
      console.log("unliked");
      document.getElementById("Star-button").disabled = false;
    });
  };

  // Handler for fork button click - show confirmation dialog
  const handleForkClick = () => {
    setShowForkDialog(true);
  };

  // Handler when user confirms fork
  const handleForkConfirm = () => {
    setShowForkDialog(false);
    if (authorizedUserOcto) {
      // User is logged in, proceed with fork
      forkProject(
        authorizedUserOcto,
        setForkBarVisible,
        setForkProgress,
        setRedirectType,
      );
    } else {
      // User needs to log in first, clear redirectType temporarily
      // It will be set again after auth when the dialog shows
      setRedirectType(null);
      authRedirectHandler({ authType: "fork" });
    }
  };

  // Handler when user cancels fork
  const handleForkCancel = () => {
    setShowForkDialog(false);
    // Clear redirect type if it was set
    if (redirectType === "fork") {
      setRedirectType(null);
    }
  };

  return (
    <>
      {shareDialog ? (
        <ShareDialog
          {...{ shareDialog, setShareDialog, dialogContent, activeAtom }}
        />
      ) : null}
      <ForkConfirmDialog
        isOpen={showForkDialog}
        onClose={handleForkCancel}
        onConfirm={handleForkConfirm}
        projectName={GlobalVariables.currentAWSnode?.repoName || ""}
        projectOwner={GlobalVariables.currentAWSnode?.owner || ""}
      />
      <div className="run-navigation" style={{ display: "flex", gap: 10 }}>
        {/* Share Button */}
        <button
          onClick={() => {
            setDialog("share");
            setShareDialog(true);
          }}
          id="Share-button"
          style={{
            position: "fixed",
            right: 10,
            top: 210,
            background: "var(--abundance-color-background)",
            border: "1px solid var(--panel-border)",
            boxShadow: "0 4px 16px rgba(20,24,31,0.16)",
            borderRadius: 4,
            width: 40,
            height: 40,
            minWidth: 0,
            minHeight: 0,
            padding: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            transition: "box-shadow 0.2s",
            fontFamily: "JetBrains Mono, monospace",
            outline: "none",
          }}
          title={tooltipMessages.Share}
        >
          {shareSvg}
        </button>
        {/* Fork Button */}
        <button
          id="Fork-button"
          style={{
            position: "fixed",
            right: 10,
            top: 300,
            background: "var(--abundance-color-background)",
            border: "1px solid var(--panel-border)",
            boxShadow: "0 4px 16px rgba(20,24,31,0.16)",
            borderRadius: 4,
            width: 40,
            height: 40,
            minWidth: 0,
            minHeight: 0,
            padding: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            transition: "box-shadow 0.2s",
            fontFamily: "JetBrains Mono, monospace",
            outline: "none",
          }}
          onClick={handleForkClick}
          title={tooltipMessages.Fork}
        >
          {forkSvg}
        </button>
        {/* Star Button */}
        <button
          id="Star-button"
          style={{
            position: "fixed",
            right: 10,
            top: 255,
            border: "1px solid var(--panel-border)",
            boxShadow: "0 4px 16px rgba(20,24,31,0.16)",
            borderRadius: 4,
            width: 40,
            height: 40,
            minWidth: 0,
            minHeight: 0,
            padding: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            transition: "box-shadow 0.2s",
            fontFamily: "JetBrains Mono, monospace",
            outline: "none",
            ...(starredState
              ? {
                  background: "var(--abundance-color-fontLightGrey)",
                }
              : { background: "var(--abundance-color-background)" }),
          }}
          onClick={() => {
            authorizedUserOcto && !starredState
              ? likeProject(authorizedUserOcto)
              : authorizedUserOcto && starredState
                ? unlikeProject(authorizedUserOcto)
                : authRedirectHandler({ authType: "like" });
          }}
          title={tooltipMessages.Star}
        >
          {starSvg}
        </button>
        {/* Tooltips (optional, can be removed if using title) */}
        {showTooltip["Share"] && (
          <div className="run-navigation-tooltip">{tooltipMessages.Share}</div>
        )}
        {showTooltip["Fork"] && (
          <div className="run-navigation-tooltip">{tooltipMessages.Fork}</div>
        )}
        {showTooltip["Star"] && (
          <div className="run-navigation-tooltip">{tooltipMessages.Star}</div>
        )}
      </div>
    </>
  );
}

export default RunNavigation;
