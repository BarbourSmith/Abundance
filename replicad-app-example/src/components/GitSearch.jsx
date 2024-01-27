import React, { useEffect, useState, useRef } from "react";
import GlobalVariables from "./js/globalvariables.js";
import { Octokit } from "https://esm.sh/octokit@2.0.19";
import { re } from "mathjs";

function GitSearch(props) {
  let searchBarValue = "";
  var [gitRepos, setGitRepos] = useState([]);
  var [loadingGit, setLoadingGit] = useState(false);

  /**
   * Runs when a menu option is clicked to place a new atom from searching on GitHub.
   * @param {object} ev - The event triggered by clicking on a menu item.
   */
  function placeGitHubMolecule(e, item) {
    GlobalVariables.currentMolecule.placeAtom(
      {
        x: GlobalVariables.pixelsToWidth(GlobalVariables.lastClick[0]),
        y: GlobalVariables.pixelsToHeight(GlobalVariables.lastClick[1]),
        parent: GlobalVariables.currentMolecule,
        atomType: "GitHubMolecule",
        projectID: item.id,
        uniqueID: GlobalVariables.generateUniqueID(),
      },
      true
    );
    props.setSearchingGitHub(false);
    setGitRepos([]);
  }
  // conditional query for maslow projects
  const searchGitHub = function () {
    var query = searchBarValue + " topic:maslowcreate";
    let octokit = new Octokit();
    octokit
      .request("GET /search/repositories", {
        q: query,
        per_page: 50,
        headers: {
          accept: "application/vnd.github.mercy-preview+json",
        },
      })
      .then((result) => {
        let resultingRepos = [];
        result.data.items.forEach((repo) => {
          resultingRepos.push(repo);
        });
        setGitRepos(resultingRepos);
        setLoadingGit(false);
      });
  };

  const handleKeyDown = function (e) {
    if (e.key === "Enter") {
      setLoadingGit(true);
      searchGitHub();
    }
  };
  const handleChange = function (e) {
    searchBarValue = e.target.value;
  };

  const [isHovering, setIsHovering] = useState(false);
  const [panelItem, setPanelItem] = useState({});

  const handleMouseOver = (item, key) => {
    setPanelItem(item);
    setIsHovering(true);
  };
  const handleMouseOut = () => {
    setPanelItem({});
    setIsHovering(false);
  };

  const GitList = function () {
    return gitRepos.map((item, key) => {
      return (
        <>
          <li
            onClick={(e) => placeGitHubMolecule(e, item)}
            key={key}
            onMouseEnter={() => handleMouseOver(item, key)}
            onMouseLeave={() => handleMouseOut()}
          >
            {item.name}
          </li>
        </>
      );
    });
  };

  return (
    <>
      {props.searchingGitHub ? (
        <div className="search-container">
          <div
            id="git_search"
            style={{
              top: GlobalVariables.lastClick[1] + "px",
              left: GlobalVariables.lastClick[0] + "px",
            }}
          >
            <input
              type="text"
              id="menuInput"
              //onBlur="value=''"
              onKeyDown={handleKeyDown}
              onChange={handleChange}
              placeholder="Search for atom.."
              className="menu_search_canvas"
            ></input>
            <GitList />
          </div>
          {isHovering ? (
            <div
              className="GitProjectInfoPanel"
              style={{
                top: GlobalVariables.lastClick[1] - 50 + "px",
                left: GlobalVariables.lastClick[0] - 350 + "px",
              }}
            >
              <div className="GitInfoLeft">
                <img src={"/imgs/defaultThumbnail.svg"}></img>
                <div style={{ display: "flex" }}>
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    style={{ transform: "scale(.7)" }}
                    width="16"
                    height="16"
                  >
                    <path d="M8 .2l4.9 15.2L0 6h16L3.1 15.4z" />
                  </svg>
                  <p>{panelItem.stargazers_count}</p>
                </div>
              </div>

              <div className="GitInfo">
                <span>Project Name: {panelItem.name}</span>
                <span>Owner: {panelItem.owner.login}</span>
                <span>Description: {panelItem.description || null}</span>
                <span>PLACEHOLDER FOR README</span>
                <span>Tags: PLACEHOLDER FOR tags or categories</span>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </>
  );
}

export default GitSearch;
