import React, { useEffect, useState, useRef } from "react";
import ShareDialog from "./ShareDialog.jsx";
import { useNavigate } from "react-router-dom";
import GlobalVariables from "./js/globalvariables.js";

//navigation svg icons - turn into key pairs later
let shareSvg = (
  <svg
    fill="#c4a3d5"
    height="30px"
    width="30px"
    version="1.1"
    id="Capa_1"
    xmlns="http://www.w3.org/2000/svg"
    xmlns:xlink="http://www.w3.org/1999/xlink"
    viewBox="0 0 227.216 227.216"
    xml:space="preserve"
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
      stroke-width="1.5"
      stroke-linecap="round"
      stroke-linejoin="round"
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
      stroke-width="1.5"
      stroke-linecap="round"
    />
    <path
      d="M7 11H7.5"
      stroke="#c4a3d5"
      stroke-width="1.5"
      stroke-linecap="round"
    />
    <path
      d="M7 7.5H7.5"
      stroke="#c4a3d5"
      stroke-width="1.5"
      stroke-linecap="round"
    />
    <path
      d="M7 14.5H7.5"
      stroke="#c4a3d5"
      stroke-width="1.5"
      stroke-linecap="round"
    />
    <path
      d="M17 14.5H16M10.5 14.5H13.5"
      stroke="#c4a3d5"
      stroke-width="1.5"
      stroke-linecap="round"
    />
    <path
      d="M17 7.5H14M10.5 7.5H11.5"
      stroke="#c4a3d5"
      stroke-width="1.5"
      stroke-linecap="round"
    />
    <path
      d="M21 7V6.37006C21 5.17705 21 4.58055 20.842 4.09946C20.5425 3.18719 19.8468 2.47096 18.9606 2.16261C18.4933 2 17.9139 2 16.755 2H7.24502C6.08614 2 5.50671 2 5.03939 2.16261C4.15322 2.47096 3.45748 3.18719 3.15795 4.09946C3 4.58055 3 5.17705 3 6.37006V15M21 11V20.3742C21 21.2324 20.015 21.6878 19.3919 21.1176C19.0258 20.7826 18.4742 20.7826 18.1081 21.1176L17.625 21.5597C16.9834 22.1468 16.0166 22.1468 15.375 21.5597C14.7334 20.9726 13.7666 20.9726 13.125 21.5597C12.4834 22.1468 11.5166 22.1468 10.875 21.5597C10.2334 20.9726 9.26659 20.9726 8.625 21.5597C7.98341 22.1468 7.01659 22.1468 6.375 21.5597L5.8919 21.1176C5.52583 20.7826 4.97417 20.7826 4.6081 21.1176C3.985 21.6878 3 21.2324 3 20.3742V19"
      stroke="#c4a3d5"
      stroke-width="1.5"
      stroke-linecap="round"
    />
  </svg>
);

function RunNavigation(props) {
  let [shareDialog, setShareDialog] = useState(false);
  let authorizedUserOcto = props.authorizedUserOcto;

  var navigate = useNavigate();

  /**
   * Like a project on github by unique ID.
   */
  const starProject = function (id) {
    //Find out the information of who owns the project we are trying to like

    var owner = GlobalVariables.currentRepo.owner.login;
    var repoName = GlobalVariables.currentRepo.name;

    document.getElementById("Star-button").style.backgroundColor = "gray";

    authorizedUserOcto.rest.activity
      .starRepoForAuthenticatedUser({
        owner: owner,
        repo: repoName,
      })
      .then(() => {
        console.log("starred");
      });
    //Find out if the project has been starred and unstar if it is
    /* octokit.activity.checkStarringRepo({
                      owner:user,
                      repo: repoName
                  }).then(() => { 
                      var button= document.getElementById("Star-button")
                      button.setAttribute("class","browseButton")
                      button.innerHTML = "Star"
                      octokit.activity.unstarRepo({
                          owner: user,
                          repo: repoName
                      })
                  })*/
  };

  /** forkProject takes care of making the octokit request for the authenticated user to make a copy of a not owned repo */
  const forkProject = async function () {
    console.log("fork function running");
    var owner = GlobalVariables.currentRepo.owner.login;
    var repo = GlobalVariables.currentRepo.name;
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
            var activeUser = GlobalVariables.currentUser;
            // return to create mode
            authorizedUserOcto
              .request("GET /repos/{owner}/{repo}", {
                owner: activeUser,
                repo: repo,
              })
              .then((result) => {
                console.log("fork");
                GlobalVariables.currentRepo = result.data;
                navigate(`/${GlobalVariables.currentRepo.id}`),
                  { replace: true };
              });
          });
      });
  };

  /** Runs if star is clicked but there's no logged in user */
  const loginStar = function () {
    if (props.tryLogin()) {
      starProject(GlobalVariables.currentRepo.id);
    }
  };
  /** Runs if fork is clicked but there's no logged in user */
  const loginFork = function () {
    if (props.tryLogin()) {
      forkProject();
    }
  };

  return (
    <>
      <ShareDialog setShareDialog={setShareDialog} shareDialog={shareDialog} />
      <div className="run-navigation">
        <button
          onClick={() => {
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
          onClick={authorizedUserOcto ? forkProject : loginFork}
        >
          {forkSvg}
        </button>
        <button
          className=" run-navigation-button"
          id="Star-button"
          onClick={
            authorizedUserOcto
              ? starProject(GlobalVariables.currentRepo.id)
              : loginStar
          }
        >
          {starSvg}
        </button>
        <button className=" run-navigation-button" id="Bill-button">
          {billSvg}
        </button>
      </div>
    </>
  );
}

export default RunNavigation;

/*<div className="runSideBar">
          <p className="molecule_title">{globalvariables.currentRepoName}</p>
          <p className="atom_description">Description</p>
          <div className="runSideBarDiv">
            <div className="sidebar-subitem">
              <button className=" browseButton" id="BillOfMaterials-button">
                Bill Of Materials
              </button>
              {props.props.authorizedUserOcto ? (
                <button
                  className=" browseButton"
                  id="Fork-button"
                  onClick={forkProject}
                >
                  Fork
                </button>
              ) : null}

              <button
                className=" browseButton"
                id="Share-button"
                onClick={() => {
                  var shareDialog = document.querySelector("dialog");
                  shareDialog.showModal();
                }}
              >
                Share
              </button>
              <button
                className=" browseButton"
                id="Star-button"
                onClick={() => {
                  starProject(GlobalVariables.currentRepo.id);
                }}
              >
                Star
              </button>
            </div>
            <Link to={`/`}>
              <button>Return to browsing</button>
            </Link>
          </div>
        </div> */
