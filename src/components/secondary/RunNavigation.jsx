import React, { useEffect, useState } from "react";
import ShareDialog from "./ShareDialog.jsx";
import { useNavigate } from "react-router-dom";
import GlobalVariables from "../../js/globalvariables.js";
import { useAuth0 } from "@auth0/auth0-react";
import { use } from "react";

//navigation svg icons - turn into key pairs later
let shareSvg = (
  <svg
    fill="#c4a3d5"
    height="30px"
    width="30px"
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
    width="35px"
    height="35px"
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
    width="45px"
    height="45px"
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
let billSvg = (
  <svg
    width="30px"
    height="30px"
    viewBox="0 0 23 23"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      d="M10.5 11L17 11"
      stroke="#c4a3d5"
      strokeWidth="1.5"
      strokeLinecap="round"
    />
    <path
      d="M7 11H7.5"
      stroke="#c4a3d5"
      strokeWidth="1.5"
      strokeLinecap="round"
    />
    <path
      d="M7 7.5H7.5"
      stroke="#c4a3d5"
      strokeWidth="1.5"
      strokeLinecap="round"
    />
    <path
      d="M7 14.5H7.5"
      stroke="#c4a3d5"
      strokeWidth="1.5"
      strokeLinecap="round"
    />
    <path
      d="M17 14.5H16M10.5 14.5H13.5"
      stroke="#c4a3d5"
      strokeWidth="1.5"
      strokeLinecap="round"
    />
    <path
      d="M17 7.5H14M10.5 7.5H11.5"
      stroke="#c4a3d5"
      strokeWidth="1.5"
      strokeLinecap="round"
    />
    <path
      d="M21 7V6.37006C21 5.17705 21 4.58055 20.842 4.09946C20.5425 3.18719 19.8468 2.47096 18.9606 2.16261C18.4933 2 17.9139 2 16.755 2H7.24502C6.08614 2 5.50671 2 5.03939 2.16261C4.15322 2.47096 3.45748 3.18719 3.15795 4.09946C3 4.58055 3 5.17705 3 6.37006V15M21 11V20.3742C21 21.2324 20.015 21.6878 19.3919 21.1176C19.0258 20.7826 18.4742 20.7826 18.1081 21.1176L17.625 21.5597C16.9834 22.1468 16.0166 22.1468 15.375 21.5597C14.7334 20.9726 13.7666 20.9726 13.125 21.5597C12.4834 22.1468 11.5166 22.1468 10.875 21.5597C10.2334 20.9726 9.26659 20.9726 8.625 21.5597C7.98341 22.1468 7.01659 22.1468 6.375 21.5597L5.8919 21.1176C5.52583 20.7826 4.97417 20.7826 4.6081 21.1176C3.985 21.6878 3 21.2324 3 20.3742V19"
      stroke="#c4a3d5"
      strokeWidth="1.5"
      strokeLinecap="round"
    />
  </svg>
);
let exportSvg = (
  <svg
    width="30px"
    height="30px"
    fill="none"
    viewBox="0 0 23 23"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      fill="#c4a3d5"
      d="M8.71,7.71,11,5.41V15a1,1,0,0,0,2,0V5.41l2.29,2.3a1,1,0,0,0,1.42,0,1,1,0,0,0,0-1.42l-4-4a1,1,0,0,0-.33-.21,1,1,0,0,0-.76,0,1,1,0,0,0-.33.21l-4,4A1,1,0,1,0,8.71,7.71ZM21,14a1,1,0,0,0-1,1v4a1,1,0,0,1-1,1H5a1,1,0,0,1-1-1V15a1,1,0,0,0-2,0v4a3,3,0,0,0,3,3H19a3,3,0,0,0,3-3V15A1,1,0,0,0,21,14Z"
    />
  </svg>
);

function RunNavigation({
  authorizedUserOcto,
  activeAtom,
  redirectType,
  setRedirectType,
}) {
  let [shareDialog, setShareDialog] = useState(false);
  let starred = false;
  let [dialogContent, setDialog] = useState("");

  var navigate = useNavigate();

  useEffect(() => {
    // check if the current user has starred the project
    if (authorizedUserOcto) {
      var owner = GlobalVariables.currentRepo.owner;
      var repoName = GlobalVariables.currentRepo.repoName;

      const fetchUserData = async () => {
        /*get liked repos from user table*/
        const queryUserApiUrl =
          "https://hg5gsgv9te.execute-api.us-east-2.amazonaws.com/abundance-stage/USER-TABLE?user=" +
          GlobalVariables.currentUser +
          "&liked=true";

        let awsUser = await fetch(queryUserApiUrl);
        let awsUserJson = await awsUser.json();

        console.log(awsUserJson);

        return awsUserJson;
      };

      fetchUserData().then((awsUserJson) => {
        console.log(awsUserJson);
        const isLiked = awsUserJson.repos.some(
          (project) => project.owner == owner && project.repoName == repoName
        );
        if (isLiked) {
          starred = true;
          document.getElementById("Star-button").style.backgroundColor = "gray";

          //should disable instead of just graying out
        } else {
          console.log("not starred");
          document.getElementById("Star-button").style.backgroundColor =
            "var(--abundance-color-hightlightOffWhite)";
          starred = false;
        }
      });
      if (GlobalVariables.currentRepo.owner === GlobalVariables.currentUser) {
        document.getElementById("Fork-button").style.display = "none";
      }
    }
  });

  useEffect(() => {
    if (redirectType == "fork") {
      forkProject(authorizedUserOcto);
    }
    if (redirectType == "like") {
      likeProject();
    }
  }, []);

  /**
   * Like a project on github by unique ID.
   */
  const likeProject = function () {
    var owner = GlobalVariables.currentRepo.owner;
    var repoName = GlobalVariables.currentRepo.repoName;
    //disable button before api call so user can't click multiple times
    starred = true;
    document.getElementById("Star-button").disabled = true;
    document.getElementById("Star-button").style.backgroundColor = "gray";
    /*aws dynamo update-item lambda */

    // this adds a ranking point to the project but i think we should implement a timed function to add ranking points once we decide what the system will be
    const apiUpdateUrl =
      "https://hg5gsgv9te.execute-api.us-east-2.amazonaws.com/abundance-stage/update-item";
    fetch(apiUpdateUrl, {
      method: "POST",
      body: JSON.stringify({
        owner: owner,
        repoName: repoName,
        attributeUpdates: { ranking: 1 },
      }),
      headers: {
        "Content-type": "application/json; charset=UTF-8",
      },
    }).then((response) => {
      /*add item to your liked projects on aws*/
      const apiUpdateUserUrl =
        "https://hg5gsgv9te.execute-api.us-east-2.amazonaws.com/abundance-stage/USER-TABLE";
      let searchField = (
        GlobalVariables.currentRepo.name +
        " " +
        GlobalVariables.currentRepo.owner
      ).toLowerCase();
      let likedNodeBody = {
        owner: GlobalVariables.currentRepo.owner,
        ranking: GlobalVariables.currentRepo.stargazers_count,
        description: GlobalVariables.currentRepo.description,
        searchField: searchField,
        repoName: GlobalVariables.currentRepo.name,
        forks: 0,
        topMoleculeID: GlobalVariables.topLevelMolecule.uniqueID,
        topics: [],
        readme:
          "https://raw.githubusercontent.com/" +
          GlobalVariables.currentUser +
          "/" +
          GlobalVariables.currentRepo.name +
          "/master/README.md?sanitize=true",
        contentURL:
          "https://raw.githubusercontent.com/" +
          GlobalVariables.currentUser +
          "/" +
          GlobalVariables.currentRepo.name +
          "/master/project.abundance?sanitize=true",
        githubMoleculesUsed: [],
        svgURL:
          "https://raw.githubusercontent.com/" +
          GlobalVariables.currentUser +
          "/" +
          GlobalVariables.currentRepo.name +
          "/master/project.svg?sanitize=true",
        dateCreated: GlobalVariables.currentRepo.created_at,
        html_url: GlobalVariables.currentRepo.html_url,
      };
      fetch(apiUpdateUserUrl, {
        method: "POST",
        body: JSON.stringify({
          user: GlobalVariables.currentUser,
          attributeUpdates: { likedProjects: [likedNodeBody] },
          updateType: "SET",
        }),
        headers: {
          "Content-type": "application/json; charset=UTF-8",
        },
      }).then((response) => {
        console.log(response);
        //reenable button after api call so user can unlike
        console.log("added to liked projects");
        document.getElementById("Star-button").disabled = false;
        setRedirectType(null);
      });
    });

    /*if (!starred) {
      authorizedUserOcto.rest.activity
        .starRepoForAuthenticatedUser({
          owner: owner,
          repo: repoName,
        })
        .then(() => {
          setStarred(true);
          document.getElementById("Star-button").style.backgroundColor = "gray";
        });
    } else {
      authorizedUserOcto.rest.activity
        .unstarRepoForAuthenticatedUser({
          owner: owner,
          repo: repoName,
        })
        .then(() => {
          document.getElementById("Star-button").style.backgroundColor =
            "white";
          setStarred(false);
          console.log("unstarred");
        });
    }*/
  };
  const unlikeProject = function () {
    var owner = GlobalVariables.currentRepo.owner;
    var repoName = GlobalVariables.currentRepo.repoName;
    //disable button before api call so user can't click multiple times
    starred = false;
    document.getElementById("Star-button").disabled = true;
    //document.getElementById("Star-button").style.backgroundColor = "white";

    /*add item to your liked projects on aws*/
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
      console.log(response.json());
      console.log("unliked");
      //reenable button after api call so user can unlike
      document.getElementById("Star-button").disabled = false;

      document.getElementById("Star-button").style.backgroundColor =
        "var(--abundance-color-hightlightOffWhite)";
    });
  };

  /* Makes a POST request to the API to update the ranking of the current molecule */
  const addRanking = (owner, repo) => {
    const apiUpdateUrl =
      "https://hg5gsgv9te.execute-api.us-east-2.amazonaws.com/abundance-stage/update-item";
    fetch(apiUpdateUrl, {
      method: "POST",
      body: JSON.stringify({
        owner: owner,
        repoName: repo.repoName,
        attributeUpdates: { ranking: 1 },
      }),
      headers: {
        "Content-type": "application/json; charset=UTF-8",
      },
    })
      .then((response) => {
        console.log(response);
      })
      .catch((error) => {
        console.error("Error:", error);
      });
  };

  /** forkProject takes care of making the octokit request for the authenticated user to make a copy of a not owned repo */
  const forkProject = async function (authorizedUserOcto) {
    var owner = GlobalVariables.currentRepo.owner;
    var repo = GlobalVariables.currentRepo.repoName;
    // if authenticated and it is not your project, make a clone of the project and return to create mode
    authorizedUserOcto
      .request("GET /repos/{owner}/{repo}", {
        owner: owner,
        repo: repo,
      })
      .then((result) => {
        authorizedUserOcto.rest.repos
          .createFork({
            owner: owner,
            repo: repo,
          })
          .then(() => {
            //push fork to aws
            addRanking(owner, repo);
            /*aws dynamo post*/
            const apiUrl =
              "https://hg5gsgv9te.execute-api.us-east-2.amazonaws.com/abundance-stage//post-new-project";
            let searchField = (
              result.data.name +
              " " +
              GlobalVariables.currentUser
            ).toLowerCase();
            let forkedNodeBody = {
              owner: GlobalVariables.currentUser,
              ranking: result.data.stargazers_count,
              description: result.data.description,
              searchField: searchField,
              repoName: result.data.name,
              forks: 0,
              topMoleculeID: GlobalVariables.topLevelMolecule.uniqueID,
              topics: [],
              readme:
                "https://raw.githubusercontent.com/" +
                GlobalVariables.currentUser +
                "/" +
                result.data.name +
                "/master/README.md?sanitize=true",
              contentURL:
                "https://raw.githubusercontent.com/" +
                GlobalVariables.currentUser +
                "/" +
                result.data.name +
                "/master/project.abundance?sanitize=true",
              githubMoleculesUsed: [],
              parentRepo: owner + "/" + repo,
              svgURL:
                "https://raw.githubusercontent.com/" +
                GlobalVariables.currentUser +
                "/" +
                result.data.name +
                "/master/project.svg?sanitize=true",
              dateCreated: result.data.created_at,
              html_url: result.data.html_url,
            };
            fetch(apiUrl, {
              method: "POST",
              body: JSON.stringify(forkedNodeBody),
              headers: {
                "Content-type": "application/json; charset=UTF-8",
              },
            }).then((response) => {
              console.log(response.json());
              GlobalVariables.currentRepo = forkedNodeBody;
              setRedirectType(null);
              navigate(
                `/${GlobalVariables.currentRepo.owner}/${GlobalVariables.currentRepo.repoName}`
              ),
                { replace: true };
            });
          });
      });
  };

  /** Runs if star is clicked but there's no logged in user */
  const loginLike = function () {
    console.log("no user logged in, needs new trylogin");
    const loginConfirm = confirm(
      "You are not logged in. Would you like to log in?"
    );
    if (loginConfirm) {
      loginWithRedirect();
    } else {
      // user clicked cancel and is redirected to the run mode
    }
  };

  /** Runs if fork is clicked but there's no logged in user */
  const loginRedirect = function (redirect) {
    console.log("no user logged in, needs new trylogin");
    const loginConfirm = confirm(
      "You are not logged in. Would you like to log in?"
    );
    if (loginConfirm) {
      console.log("login with redirect");
      loginHandler(redirect);
    } else {
      // user clicked cancel and is redirected to the run mode
    }
  };
  const loginHandler = (redirect) => {
    let forking = false;
    let liking = false;
    if (redirect == "fork") {
      forking = true;
    }
    if (redirect == "like") {
      liking = true;
    }

    // the client id from github
    const client_id = import.meta.env.VITE_GH_OAUTH_CLIENT_ID;

    // create a CSRF token and store it locally
    const csrfToken = window.crypto
      .getRandomValues(new Uint8Array(16))
      .reduce((acc, byte) => acc + byte.toString(16).padStart(2, "0"), "");
    localStorage.setItem("latestCSRFToken", csrfToken);
    const repo =
      GlobalVariables.currentRepo.owner +
      "/" +
      GlobalVariables.currentRepo.repoName;
    // include currentRepo in the state parameter
    const state = JSON.stringify({
      csrfToken: csrfToken,
      currentRepo: repo,
      forking: forking,
      liking: liking,
    });

    // redirect the user to github
    const link = `https://github.com/login/oauth/authorize?client_id=${client_id}&response_type=code&scope=repo&redirect_uri=${
      import.meta.env.VITE_REDIRECT_URI
    }callback&state=${encodeURIComponent(state)}`;
    window.location.assign(link);
  };

  return (
    <>
      {shareDialog ? (
        <ShareDialog
          {...{ shareDialog, setShareDialog, dialogContent, activeAtom }}
        />
      ) : null}
      <div className="run-navigation">
        <button
          onClick={() => {
            setDialog("share");
            setShareDialog(true);
          }}
          className=" run-navigation-button"
          id="Share-button"
        >
          {shareSvg}
        </button>
        <button
          className=" run-navigation-button"
          id="Fork-button"
          onClick={() => {
            authorizedUserOcto
              ? forkProject(authorizedUserOcto)
              : loginRedirect("fork");
          }}
        >
          {forkSvg}
        </button>

        <button
          className=" run-navigation-button"
          id="Star-button"
          onClick={() => {
            authorizedUserOcto && !starred
              ? likeProject(authorizedUserOcto)
              : authorizedUserOcto && starred
              ? unlikeProject(authorizedUserOcto)
              : loginRedirect("like");
          }}
        >
          {starSvg}
        </button>
        <button
          onClick={() => {
            setDialog("export");
            setShareDialog(true);
          }}
          className=" run-navigation-button"
          id="Export-button"
        >
          {exportSvg}
        </button>
        <button
          className=" run-navigation-button"
          id="Bill-button"
          onClick={() => {
            console.log("open compiled bill of materials ");
          }}
        >
          {billSvg}
        </button>
      </div>
    </>
  );
}

export default RunNavigation;
