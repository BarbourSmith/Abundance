import React, { useEffect, useRef, useState } from "react";
import GlobalVariables from "../../js/globalvariables.js";
import { Link } from "react-router-dom";
import globalvariables from "../../js/globalvariables.js";
import NewProjectPopUp from "../secondary/NewProjectPopUp.jsx";
import { useQuery } from "react-query";
import useDebounce from "../../hooks/useDebounce.js";
import { useNavigate } from "react-router-dom";
import { useLocation } from "react-router-dom";
import { useAuth, useAppState } from "../../contexts/index.js";
import { useTutorial } from "../../tutorial/TutorialManager";
import { useProject } from "../../contexts/index.js";
import { licenses } from "../../js/licenseOptions.js";
import RenderProgressBar from "../secondary/RenderProgressBar.jsx";
import RenameProjectDialog from "../secondary/RenameProjectDialog.jsx";

/**
 * Initial log component displays pop Up to either attempt Github login/browse projects
 *
 */
const InitialLog = ({ setNoUserBrowsing }) => {
  const { authRedirectHandler } = useAuth();

  return (
    <div className="login-page">
      <div className="form animate fadeInUp one">
        <div id="gitSide" className="logindiv">
          <img
            className="logo"
            src={
              import.meta.env.VITE_APP_PATH_FOR_PICS +
              "/imgs/abundance_logo.png"
            }
            alt="logo"
          />
          <div id="welcome">
            <img
              src={
                import.meta.env.VITE_APP_PATH_FOR_PICS +
                "/imgs/abundance_lettering.png"
              }
              alt="logo"
              className="login-logo"
            />
          </div>
          <p style={{ padding: "0 20px" }}>
            Abundance projects are stored through GitHub. You control your
            files.{" "}
          </p>
          <form className="login-form">
            <button
              type="button"
              id="loginButton"
              style={{ height: "40px" }}
              className="submit-btn"
              onClick={() => authRedirectHandler()}
            >
              Login With GitHub
            </button>
            <p className="message">
              Don't have an account?{" "}
              <a href="https://github.com/join">Create a free account</a>
            </p>
          </form>
        </div>
        <div id="nonGitSide" className="logindiv curiousBrowse">
          <p
            style={{
              justifyContent: "flex-start",
              display: "inline",
            }}
          >
            Check out what others have designed in Abundance
          </p>

          <button
            type="button"
            onClick={() => {
              setNoUserBrowsing(true);
            }}
            className="submit-btn"
            id="browseNonGit"
            style={{ padding: "0 30px" }}
          >
            Browse all projects
          </button>
        </div>
      </div>
    </div>
  );
};

// adds individual projects after API call
const AddProject = ({ projectsLoaded, authorizedUserOcto, projectToShow }) => {
  const [browseType, setBrowseType] = useState("thumb");
  let nodes = projectsLoaded ? projectsLoaded["repos"] : [];
  const [showForks, setShowForks] = useState(true);
  let initialOrder =
    projectToShow == "featured"
      ? "byStars"
      : projectToShow == "all"
      ? "byDateModified"
      : projectToShow == "owned"
      ? "byDateModified"
      : "byName";

  const [orderType, setOrderType] = useState(initialOrder);

  //looking for highest ranking project and tool
  let highestRankingNode = null;
  let highestRankingToolNode = null;

  if (projectToShow == "featured" && nodes.length > 0) {
    const filteredNodes = nodes.filter((node) => {
      return !node.topics.includes("abundance-tool");
    });
    const sortedNodes = filteredNodes.sort((a, b) => b.ranking - a.ranking);
    highestRankingNode = sortedNodes[0];

    const toolNodes = nodes.filter((node) =>
      node.topics.includes("abundance-tool")
    );
    const sortedToolNodes = toolNodes.sort((a, b) => b.ranking - a.ranking);
    highestRankingToolNode = sortedToolNodes[0];
  }
  if (!showForks) {
    // filter out forks
    nodes = nodes.filter((node) => node.parentRepo === null);
  }

  return (
    <>
      <div
        id="sorting-button-div"
        style={{ display: "flex", alignItems: "center" }}
      >
        <button
          className="list_thumb_button"
          key="list-filter-button"
          onClick={() => setBrowseType("list")}
        >
          <img
            src={import.meta.env.VITE_APP_PATH_FOR_PICS + "/imgs/list.svg"}
            alt="list_search"
            style={{
              width: "20px",
              marginRight: "5px",
              opacity: "0.8",
            }}
          />
        </button>
        <button
          className="list_thumb_button"
          key="thumb-filter-button"
          onClick={() => setBrowseType("thumb")}
        >
          <img
            src={import.meta.env.VITE_APP_PATH_FOR_PICS + "/imgs/thumbnail.svg"}
            alt="thumb_search"
            style={{
              width: "20px",
              marginRight: "5px",
              opacity: "0.8",
            }}
          />
        </button>
        <label
          htmlFor="order-by"
          style={{ display: "flex", alignItems: "center" }}
        >
          <select
            className="order_dropdown"
            id="order-by"
            defaultValue={orderType}
            onChange={(e) => setOrderType(e.target.value)}
          >
            <option key={"name_order"} value={"byName"}>
              Name
            </option>
            <option key={"forks_order"} value={"byForks"}>
              Forks
            </option>
            <option key={"stars_order"} value={"byStars"}>
              Stars
            </option>
            <option key={"owner_order"} value={"byOwnerName"}>
              Creator
            </option>
            <option key={"date_order"} value={"byDateCreated"}>
              Date Created
            </option>
            <option key={"dateModified_order"} value={"byDateModified"}>
              Date Modified
            </option>
          </select>
        </label>
        <label
          style={{ display: "flex", alignItems: "center", marginLeft: "10px" }}
        >
          <img
            src={import.meta.env.VITE_APP_PATH_FOR_PICS + "/imgs/fork.svg"}
            alt="Show/Hide Forks"
            style={{
              width: "25px",
              opacity: "0.8",
              marginRight: "0px",
            }}
          />
          <input
            type="checkbox"
            id="show-hide-forks"
            defaultChecked={true}
            onChange={(e) => {
              const showForks = e.target.checked;
              setShowForks(showForks);
            }}
            style={{ marginLeft: "-3px" }}
          />
        </label>
      </div>
      <div className="project-items-div">
        {projectToShow == "featured" &&
        highestRankingNode &&
        highestRankingToolNode ? (
          <FeaturedHighlight
            highestRankingNode={highestRankingNode}
            highestRankingToolNode={highestRankingToolNode}
          />
        ) : null}
        {nodes.length > 0 ? (
          <ProjectDiv
            {...{ nodes, browseType, orderType, authorizedUserOcto }}
          />
        ) : (
          <p>No projects match your search</p>
        )}
      </div>
    </>
  );
};

const FeaturedHighlight = ({ highestRankingNode, highestRankingToolNode }) => (
  <div id="featured-div">
    <Link
      onClick={() => {
        GlobalVariables.currentAWSnode = highestRankingNode;
      }}
      id="left-featured-div"
      className="featured-project-div"
      key={highestRankingNode.owner + highestRankingNode.repoName}
      to={
        highestRankingNode.owner == globalvariables.currentUser
          ? `/${highestRankingNode.owner}/${highestRankingNode.repoName}`
          : `/run/${highestRankingNode.owner}/${highestRankingNode.repoName}`
      }
    >
      <div style={{ flexBasis: "60%" }}>
        <p className="project_name">{highestRankingNode.repoName}</p>
        <p className="project_name">By {highestRankingNode.owner}</p>
      </div>
      <img
        style={{ flexBasis: "10%" }}
        className="project_image"
        src={highestRankingNode.svgURL}
        onError={({ currentTarget }) => {
          currentTarget.onerror = null; // prevents looping
          currentTarget.src =
            import.meta.env.VITE_APP_PATH_FOR_PICS +
            "/imgs/defaultThumbnail.svg";
        }}
        alt={highestRankingNode.repoName}
      ></img>
    </Link>

    <Link
      id="right-featured-div"
      onClick={() => {
        GlobalVariables.currentAWSnode = highestRankingToolNode;
      }}
      className="featured-project-div"
      key={highestRankingToolNode?.owner + highestRankingToolNode?.repoName}
      to={
        highestRankingToolNode?.owner == globalvariables.currentUser
          ? `/${highestRankingToolNode?.owner}/${highestRankingToolNode?.repoName}`
          : `/run/${highestRankingToolNode?.owner}/${highestRankingToolNode?.repoName}`
      }
    >
      <div style={{ flexBasis: "60%" }}>
        <p className="project_name">{highestRankingToolNode?.repoName}</p>
        <p className="project_name">By {highestRankingToolNode?.owner}</p>
      </div>
      <img
        className="project_image"
        src={highestRankingToolNode?.svgURL}
        onError={({ currentTarget }) => {
          currentTarget.onerror = null; // prevents looping
          currentTarget.src =
            import.meta.env.VITE_APP_PATH_FOR_PICS +
            "/imgs/defaultThumbnail.svg";
        }}
        alt={highestRankingToolNode.repoName}
      ></img>
    </Link>
  </div>
);

const ProjectDiv = ({ nodes, browseType, orderType, authorizedUserOcto }) => {
  const { renameProject } = useProject();
  const navigate = useNavigate();

  const [contextMenu, setContextMenu] = useState({
    visible: false,
    x: 0,
    y: 0,
    node: null,
  });
  const [renameDialog, setRenameDialog] = useState(false);
  const [renamingProject, setRenamingProject] = useState(false);
  const [renameProgress, setRenameProgress] = useState(0);
  const [projectToRename, setProjectToRename] = useState(null);

  // Handler for right-click on a project
  const handleProjectRightClick = (event, node) => {
    event.preventDefault();
    setContextMenu({ visible: true, x: event.clientX, y: event.clientY, node });
  };

  // Handler for closing the context menu
  const handleCloseContextMenu = () => {
    setContextMenu({ visible: false, x: 0, y: 0, node: null });
  };

  // Handler for menu actions
  const handleMenuAction = (action) => {
    if (!contextMenu.node) return;
    const repoUrl = `https://github.com/${contextMenu.node.owner}/${contextMenu.node.repoName}`;
    if (action === "see") {
      window.open(repoUrl, "_blank");
    } else if (action === "delete") {
      window.open(`${repoUrl}/settings?tab=delete`, "_blank");
    } else if (action === "rename") {
      // Set up for rename
      GlobalVariables.currentAWSnode = contextMenu.node;
      setProjectToRename(contextMenu.node);
      setRenameDialog(true);
    }
    handleCloseContextMenu();
  };

  // Execute the rename
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
      window.alert(`Project successfully renamed to "${newName}"`);
      // Reload the page to show updated projects
      // window.location.reload();
    }
  };

  const ThumbItem = ({ node }) => {
    return (
      <div
        className="project"
        style={
          node.owner != GlobalVariables.currentUser
            ? { backgroundColor: "rgb(233 221 242 / 58%)" }
            : null
        }
        key={node.topMoleculeID + node.owner}
        id={node.repoName}
        onClick={() => {
          GlobalVariables.currentAWSnode = node;
        }}
        onContextMenu={(e) => handleProjectRightClick(e, node)}
      >
        <p className="project_name">{node.repoName}</p>
        <img
          className="project_image"
          src={node.svgURL}
          onError={({ currentTarget }) => {
            currentTarget.onerror = null; // prevents looping
            currentTarget.src =
              import.meta.env.VITE_APP_PATH_FOR_PICS +
              "/imgs/defaultThumbnail.svg";
          }}
          alt={node.repoName}
        ></img>
        <div
          style={{
            height: "30px",
            display: "flex",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", justifyContent: "flex-start" }}>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              style={{ transform: "scale(.7)", alignSelf: "center" }}
              width="16"
              height="16"
            >
              <path d="M8 .2l4.9 15.2L0 6h16L3.1 15.4z" />
            </svg>
            <p
              style={{
                fontSize: ".7em",
                display: "inline",
                alignSelf: "center",
              }}
            >
              {node.ranking}
            </p>
          </div>
          <div style={{ alignSelf: "center" }}>
            {node.topics && node.topics.includes("abundance-tool") ? (
              <p> {"\u{1F528} "} </p>
            ) : null}
          </div>
          {node.parentRepo ? (
            <div style={{ alignSelf: "center" }}>
              <svg
                fill="#000000"
                width="14"
                height="14"
                viewBox="0 0 33.627 33.628"
                style={{ verticalAlign: "middle" }}
                xmlns="http://www.w3.org/2000/svg"
              >
                <g>
                  <path
                    d="M27.131,8.383c0-2.092-1.701-3.794-3.794-3.794s-3.793,1.702-3.793,3.794c0,0.99,0.39,1.885,1.013,2.561
      c-0.474,2.004-1.639,2.393-4.167,3.029c-1.279,0.322-2.753,0.7-4.099,1.501V7.003c1.072-0.671,1.793-1.854,1.793-3.209
      C14.084,1.702,12.382,0,10.292,0C8.199,0,6.497,1.702,6.497,3.794c0,1.356,0.722,2.539,1.795,3.21v19.62
      c-1.073,0.671-1.795,1.854-1.795,3.21c0,2.092,1.702,3.794,3.795,3.794c2.092,0,3.793-1.702,3.793-3.794
      c0-1.355-0.722-2.539-1.793-3.209v-3.846c0.496-3.768,2.321-4.232,5.075-4.926c2.527-0.637,5.955-1.513,7.048-5.852
      C25.981,11.535,27.131,10.099,27.131,8.383z M10.292,2.002c0.988,0,1.793,0.805,1.793,1.794c0,0.989-0.806,1.793-1.793,1.793
      c-0.989,0-1.795-0.805-1.795-1.793C8.498,2.806,9.302,2.002,10.292,2.002z M10.292,31.627c-0.989,0-1.795-0.807-1.795-1.794
      c0-0.989,0.806-1.793,1.795-1.793c0.988,0,1.793,0.806,1.793,1.793C12.085,30.824,11.28,31.627,10.292,31.627z M23.337,10.177
      c-0.989,0-1.793-0.805-1.793-1.793c0-0.989,0.806-1.794,1.793-1.794c0.988,0,1.794,0.805,1.794,1.794
      C25.131,9.373,24.327,10.177,23.337,10.177z"
                  />
                </g>
              </svg>
            </div>
          ) : null}
        </div>
      </div>
    );
  };
  const ListItem = (node) => {
    let dateCreated = new Date(node.node.dateCreated).toDateString(); //converts date to string
    if (dateCreated == "Invalid Date") {
      dateCreated = "Date Created";
    }
    return (
      <div
        className="project_list"
        key={node.node.id}
        id={node.node.id}
        onClick={() => {
          GlobalVariables.currentAWSnode = node.node;
        }}
        onContextMenu={(e) => handleProjectRightClick(e, node.node)} // <-- add right-click handler for list mode
      >
        <p className="project_name_list">{node.node.repoName}</p>

        <p className="project_name_list">{node.node.owner}</p>
        <p style={{ width: "20%", display: "block" }}>
          {node.node.topics && node.node.topics.includes("abundance-tool")
            ? "\u{1F528} "
            : null}
        </p>
        <p className="project_name_list">{dateCreated}</p>

        <div
          style={{
            width: "10%",
            display: "flex",
            flexDirection: "row",
            alignItems: "center",
          }}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            style={{ transform: "scale(.75)" }}
            width="16"
            height="16"
          >
            <path d="M8 .2l4.9 15.2L0 6h16L3.1 15.4z" />
          </svg>
          <p className="project_name_list">{node.node.ranking}</p>
        </div>
      </div>
    );
  };

  var sorters = {
    byName: function (a, b) {
      return a.repoName < b.repoName ? -1 : a.repoName > b.repoName ? 1 : 0;
    },
    byForks: function (a, b) {
      return b.forks - a.forks;
    },
    byStars: function (a, b) {
      return b.ranking - a.ranking;
    },
    byOwnerName: function (a, b) {
      return a.owner < b.owner ? -1 : a.owner > b.owner ? 1 : 0;
    },
    byDateCreated: function (a, b) {
      return new Date(a.dateCreated) > new Date(b.dateCreated)
        ? -1
        : new Date(a.dateCreated) < new Date(b.dateCreated)
        ? 1
        : 0;
    },
    byDateModified: function (a, b) {
      return a.dateModified > b.dateModified
        ? -1
        : a.dateModified < b.dateModified
        ? 1
        : 0;
    },
  };
  const dummyNode = {
    forks: "Forks",
    ranking: "#",
    dateCreated: "Date Created",
    owner: "Creator",
    repoName: "Name",
  };

  // Add effect to close context menu on outside click
  React.useEffect(() => {
    if (!contextMenu.visible) return;
    const handleClickOutside = (event) => {
      // Only close if click is outside the context menu
      const menu = document.querySelector(".context-menu");
      if (menu && !menu.contains(event.target)) {
        handleCloseContextMenu();
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [contextMenu.visible]);

  return (
    <>
      <div className="project-item-div">
        {browseType == "list" ? <ListItem node={dummyNode} /> : null}
        {nodes.sort(sorters[orderType]).map((node) => (
          <Link
            key={node.owner + node.repoName}
            to={
              node.owner == globalvariables.currentUser
                ? `/${node.owner}/${node.repoName}`
                : `/run/${node.owner}/${node.repoName}`
            }
          >
            {browseType == "list" ? (
              <ListItem {...{ node }} />
            ) : (
              <ThumbItem {...{ node }} />
            )}
          </Link>
        ))}
      </div>
      {/* Context menu dropdown */}
      {contextMenu.visible && (
        <div
          className="context-menu"
          style={{
            top: contextMenu.y,
            left: contextMenu.x,
          }}
          onMouseLeave={handleCloseContextMenu}
        >
          <div style={{ display: "flex", flexDirection: "column" }}>
            <button
              className="context-menu-btn"
              onClick={() => handleMenuAction("see")}
            >
              See Repository
            </button>
            {contextMenu.node &&
              contextMenu.node.owner === GlobalVariables.currentUser && (
                <>
                  <button
                    className="context-menu-btn"
                    onClick={() => handleMenuAction("rename")}
                  >
                    Rename
                  </button>
                  <button
                    className="context-menu-btn"
                    onClick={() => handleMenuAction("delete")}
                  >
                    Delete
                  </button>
                </>
              )}
          </div>
        </div>
      )}
      {/* Rename dialog */}
      {renameDialog && projectToRename && (
        <RenameProjectDialog
          isOpen={renameDialog}
          onClose={() => setRenameDialog(false)}
          onConfirm={executeRename}
          currentName={projectToRename.repoName}
        />
      )}
      {/* Rename progress bar */}
      {renamingProject && (
        <div className="save-bar">
          <div className="progress">
            <div
              className="progress-done"
              data-done="70"
              style={{ width: renameProgress + "%", opacity: "1" }}
            >
              {renameProgress !== 100
                ? renameProgress + "%"
                : "Project Renamed!"}
            </div>
          </div>
        </div>
      )}
    </>
  );
};

/* to add: if current user is null show this next part */
const ShowProjects = ({
  projectToShow,
  setExportPopUp,
  setProjectsToShow,
  user,
  authorizedUserOcto,
  pageDict,
  setNoUserBrowsing,
}) => {
  const [search, setSearch] = useState("");
  const debouncedSearchTerm = useDebounce(search, 200);
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 6 }, (_, i) => currentYear - i);
  const [lastKey, setLastKey] = useState("");
  const [pageNumber, setPageNumber] = useState(0);

  // not used by aws but need to update function before deleting
  const [yearShow, setYearShow] = useState(currentYear);

  let lastKeyQuery = lastKey
    ? "&lastKey=" + lastKey.repoName + "~" + lastKey.owner
    : "&lastKey";

  const fetchAll = async ({ signal }) => {
    return fetch(
      "https://hg5gsgv9te.execute-api.us-east-2.amazonaws.com/abundance-stage/scan-search-abundance?" +
        "attribute=searchField" +
        "&query=" +
        debouncedSearchTerm +
        "&yearShow=" +
        yearShow +
        "&user" +
        lastKeyQuery,
      { signal }
    )
      .then((res) => res.json())
      .then((data) => {
        return data;
      });
  };
  const fetchUserRepos = async ({ signal }) => {
    return fetch(
      "https://hg5gsgv9te.execute-api.us-east-2.amazonaws.com/abundance-stage/scan-search-abundance?" +
        "attribute=searchField" +
        "&query=" +
        debouncedSearchTerm +
        "&yearShow=" +
        yearShow +
        "&user=" +
        user +
        lastKeyQuery,
      { signal }
    ).then((res) => res.json());
  };
  const fetchFeaturedRepos = async ({ signal }) => {
    return fetch(
      "https://hg5gsgv9te.execute-api.us-east-2.amazonaws.com/abundance-stage/queryFeaturedProjects",
      { signal }
    )
      .then((res) => res.json())
      .then((data) => {
        return data;
      });
  };
  const fetchLikedRepos = async ({ signal }) => {
    return fetch(
      "https://hg5gsgv9te.execute-api.us-east-2.amazonaws.com/abundance-stage/USER-TABLE?user=" +
        user +
        "&liked=true",
      { signal }
    )
      .then((res) => res.json())
      .then((data) => {
        return data;
      });
  };

  const {
    data: allRepos,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["search", debouncedSearchTerm],
    queryFn: fetchAll,
  });

  const {
    data: myRepos,
    isLoading: isLoadingUser,
    isError: isErrorUser,
  } = useQuery({
    queryKey: ["userRepos", debouncedSearchTerm],
    queryFn: fetchUserRepos,
  });

  const {
    data: featuredRepos,
    isLoading: isLoadingFeatured,
    isError: isErrorFeatured,
  } = useQuery({
    queryKey: ["featuredRepos", debouncedSearchTerm],
    queryFn: fetchFeaturedRepos,
  });

  const {
    data: likedRepos,
    isLoading: isLoadingLiked,
    isError: isErrorLiked,
  } = useQuery({
    queryKey: ["likedRepos", debouncedSearchTerm],
    queryFn: fetchLikedRepos,
  });

  useEffect(() => {
    setProjectsToShow(user ? "owned" : "featured");
  }, [GlobalVariables.currentUser]);

  const forkProject = async function (authorizedUserOcto, owner, repo) {
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
              topMoleculeID: result.data.id,
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
              html_url:
                "https://github.com/" +
                GlobalVariables.currentUser +
                "/" +
                result.data.name,
            };
            fetch(apiUrl, {
              method: "POST",
              body: JSON.stringify(forkedNodeBody),
              headers: {
                "Content-type": "application/json; charset=UTF-8",
              },
            });
          });
      });
  };

  /* Function to fork a dummy project if user has no projects */
  const forkDummyProject = async function (authorizedUserOcto) {
    console.log("User has no projects, forking dummy project");
    await forkProject(authorizedUserOcto, "alzatin", "my-first-project");
  };

  const handleSearchChange = (e) => {
    setSearch(e.target.value.toLowerCase());
    setPageNumber(0);
  };

  const navigate = useNavigate();
  const { start, isActive } = useTutorial();
  const { createProject } = useProject();

  const [loadingTutorialBar, setLoadingTutorialBar] = useState(0);
  const [loadingTutorial, setLoadingTutorial] = useState(false);

  async function fetchFirstOrCreateAndStartTutorial(tutorial) {
    setLoadingTutorial(true);
    setLoadingTutorialBar(5);
    // Try to fetch the user's tutorial-default project
    let project = await fetchProject(
      GlobalVariables.currentUser,
      "tutorial-default"
    );
    if (!project) {
      // If not found, create it
      project = await createProject(
        authorizedUserOcto,
        [
          "tutorial-default",
          ["Tutorial"],
          "A project to get you started with Abundance",
          licenses[0],
          "MM",
        ],
        null, // No loaded molecule
        false, // not exporting
        setLoadingTutorialBar
      );
    }
    if (project) {
      navigate(`${GlobalVariables.currentUser}/tutorial-default`);
      // Start the tutorial (pass project if needed)
      start(tutorial.value);
      setLoadingTutorialBar(100);
      setLoadingTutorial(false);
    }
  }

  const fetchProject = async (owner, repoName) => {
    try {
      const response = await fetch(
        `https://hg5gsgv9te.execute-api.us-east-2.amazonaws.com/abundance-stage/fetchSingleRepo?owner=${owner}&repoName=${repoName}`
      );
      setLoadingTutorialBar(10);
      const data = await response.json();
      if (data && data.item) {
        console.log("Fetched AWS project data:", data.item);
        GlobalVariables.currentAWSnode = data.item;
        return data.item;
      }
    } catch (error) {
      console.error("Error fetching project:", error);
      return null;
    }
  };

  const UserNavDiv = (
    <div className="left-login-div">
      <div
        className="login-nav-item"
        onClick={() => {
          setExportPopUp(true);
        }}
      >
        <p>New project</p>
      </div>
      <div
        className="login-nav-item"
        onClick={() => setProjectsToShow("tutorials")}
      >
        {" "}
        {/**fetchFirst()*/}
        <p>Getting started</p>
      </div>
      <div
        className={
          "login-nav-item" +
          (projectToShow == "owned" ? " login-nav-item-clicked" : "")
        }
        onClick={(e) => {
          setProjectsToShow("owned");
        }}
      >
        <p>My Projects</p>
      </div>
      <div
        className={
          "login-nav-item" +
          (projectToShow == "liked" ? " login-nav-item-clicked" : "")
        }
        onClick={() => {
          setProjectsToShow("liked");
        }}
      >
        <p> Liked Projects</p>
      </div>
      <div
        className={
          "login-nav-item" +
          (projectToShow == "featured" ? " login-nav-item-clicked" : "")
        }
        onClick={() => {
          setProjectsToShow("featured");
        }}
      >
        <p> Browse Featured Projects</p>
      </div>
      <div
        className={
          "login-nav-item" +
          (projectToShow == "all" ? " login-nav-item-clicked" : "")
        }
        onClick={() => {
          setProjectsToShow("all");
        }}
      >
        <p> Browse All Other Projects</p>
      </div>
    </div>
  );

  const noUserNavDiv = (
    <div className="left-login-div">
      <div
        className="login-nav-item"
        onClick={() => {
          setNoUserBrowsing(false);
        }}
      >
        <p>Login</p>
      </div>
      <div
        className={
          "login-nav-item" +
          (projectToShow == "featured" ? " login-nav-item-clicked" : "")
        }
        onClick={() => {
          setProjectsToShow("featured");
        }}
      >
        <p> Browse Featured Projects</p>
      </div>
      <div
        className={
          "login-nav-item" +
          (projectToShow == "all" ? " login-nav-item-clicked" : "")
        }
        onClick={() => {
          setProjectsToShow("all");
        }}
      >
        <p> Browse All Other Projects</p>
      </div>
    </div>
  );

  const PageComponent = (
    <>
      {isLoading ? null : (
        <div
          style={{
            display: "flex",
            flexDirection: "row",
            margin: "0px 10px 0px 10px",
          }}
        >
          {lastKey ? (
            <button
              onClick={() => {
                if (pageNumber > 0) {
                  setPageNumber(pageNumber - 1);
                }
              }}
              className="page_back_button"
            >
              {"\u2190"}
            </button>
          ) : null}

          {lastKey ? (
            <button
              className="page_forward_button"
              onClick={() => {
                if (lastKey != "") {
                  setPageNumber(pageNumber + 1);
                }
              }}
            >
              {"\u2192"}
            </button>
          ) : null}
        </div>
      )}
    </>
  );

  const showDict = {
    all: {
      label: "Browsing Projects",
      data: allRepos,
      loading: isLoading,
      error: isError,
    },
    owned: {
      label: "My Projects",
      data: myRepos,
      loading: isLoadingUser,
      error: isErrorUser,
    },
    featured: {
      label: "Featured Projects",
      data: featuredRepos,
      loading: isLoadingFeatured,
      error: isErrorFeatured,
    },
    liked: {
      label: "My Liked Projects",
      data: likedRepos,
      loading: isLoadingLiked,
      error: isErrorLiked,
    },
    tutorials: {
      label: "Available Tutorials",
      tutorials: [
        { label: "Abundance Basics", value: "gettingStarted" },
        {
          label: "Input Atoms (Coming Soon)",
          value: "inputsSteps",
        },
        {
          label: "Molecules and GitHub Molecules (Coming Soon)",
          value: "moleculesAndGithubMolecules",
        },
        //{ label: "Assemblies and Fusions", value: "assembliesAndFusions" },
      ],
    },
  };

  return (
    <>
      <div className="login-content-div">
        {GlobalVariables.currentUser ? UserNavDiv : noUserNavDiv}
        <div className="right-login-div">
          <span style={{ fontFamily: "Roboto" }}>
            Welcome {GlobalVariables.currentUser}
          </span>
          <div className="home-section">{showDict[projectToShow]["label"]}</div>
          <hr width="100%" color="#D3D3D3" />

          {projectToShow !== "featured" ? (
            <div className="search-bar-div">
              {PageComponent}
              <input
                type="text"
                key="project-search-bar"
                placeholder={search}
                value={search}
                onChange={(e) => {
                  handleSearchChange(e);
                }}
                className="menu_search searchButton"
                id="project_search"
              />
              <button className="list_thumb_button">
                <img
                  src={
                    import.meta.env.VITE_APP_PATH_FOR_PICS +
                    "/imgs/search_icon.svg"
                  }
                  alt="search"
                  style={{
                    width: "20px",
                    color: "white",
                    marginRight: "5px",
                    opacity: "0.5",
                  }}
                />
              </button>
            </div>
          ) : null}
          {showDict[projectToShow]["loading"] ? (
            <p> Searching for projects ... </p>
          ) : null}
          {showDict[projectToShow]["error"] ? (
            <p> There was an error: please try again </p>
          ) : null}
          {showDict[projectToShow]["tutorials"] ? (
            <div className="tutorials-list">
              {showDict[projectToShow]["tutorials"].map((tutorial, index) => (
                <div
                  key={index}
                  className="login-nav-item"
                  onClick={() => fetchFirstOrCreateAndStartTutorial(tutorial)}
                >
                  {" "}
                  {/**fetchFirst()*/}
                  <p>{tutorial.label}</p>
                </div>
              ))}
            </div>
          ) : null}
          {loadingTutorial ? (
            <RenderProgressBar
              progress={loadingTutorialBar}
              run={true}
              label={"Loading tutorial"}
            />
          ) : null}
          {showDict[projectToShow]["data"] ? (
            <AddProject
              {...{
                setYearShow,
                projectsLoaded: showDict[projectToShow]["data"],
                authorizedUserOcto,
                user,
                projectToShow,
              }}
            />
          ) : null}
        </div>
      </div>
    </>
  );
};

function LoginMode() {
  const {
    isloggedIn,
    setIsLoggedIn,
    isAuthorized,
    authorizedUserOcto,
    setAuthorizedUserOcto,
  } = useAuth();
  const { exportPopUp, setExportPopUp } = useAppState();
  const navigate = useNavigate();
  const location = useLocation();

  const pageDict = { 0: null };

  // Check if we're coming from run mode (Browse Projects was clicked)
  const fromRunMode = location.state?.fromRunMode;

  const [noUserBrowsing, setNoUserBrowsing] = useState(fromRunMode || false);
  const [projectToShow, setProjectsToShow] = useState("all");

  const logoutHandler = () => {
    localStorage.removeItem("latestCSRFToken");
    window.location.assign("/");
  };

  let popUpContent;
  if (exportPopUp && authorizedUserOcto) {
    popUpContent = (
      <NewProjectPopUp
        {...{ setExportPopUp, authorizedUserOcto, exporting: false }}
      />
    );
  } else if (isAuthorized && authorizedUserOcto) {
    popUpContent = (
      <ShowProjects
        {...{
          projectToShow,
          setExportPopUp,
          setProjectsToShow,
          user: GlobalVariables.currentUser,
          authorizedUserOcto,
          pageDict,
        }}
      />
    );
  } else if (noUserBrowsing) {
    popUpContent = (
      <ShowProjects
        {...{
          projectToShow,
          setExportPopUp,
          setProjectsToShow,
          user: null,
          authorizedUserOcto,
          pageDict,
          setNoUserBrowsing,
        }}
      />
    );
  } else {
    popUpContent = <InitialLog {...{ setNoUserBrowsing }} />;
  }
  return (
    <div
      className="login-popup"
      id="projects-popup"
      style={{
        padding: "0",
        border: "10px solid #3e3d3d",
      }}
    >
      <div>
        {" "}
        {GlobalVariables.currentRepo &&
        GlobalVariables.currentRepo.owner.login ==
          GlobalVariables.currentUser &&
        isAuthorized ? (
          <Link
            to={`/${GlobalVariables.currentAWSnode.owner}/${GlobalVariables.currentAWSnode.repoName}`}
          >
            <button
              className="longButton"
              onClick={() => {
                setExportPopUp(false);
              }}
            >
              <img></img>
              <span> Return to project</span>
            </button>
          </Link>
        ) : null}
        {isAuthorized ? (
          <button
            className="longButton"
            onClick={() => {
              logoutHandler();
            }}
          >
            <span> Log out </span>
          </button>
        ) : null}
      </div>
      <div className="top-banner" style={{ margin: "35px 0 0 30px" }}>
        <div id="welcome-logo">
          <img
            src={
              import.meta.env.VITE_APP_PATH_FOR_PICS +
              "/imgs/abundance_logo.png"
            }
            alt="logo"
            id="welcome-logo-img"
          />
          <img
            src={
              import.meta.env.VITE_APP_PATH_FOR_PICS +
              "/imgs/abundance_lettering.png"
            }
            alt="logo"
            id="welcome-logo-lettering"
            style={{ height: "20px", padding: "10px" }}
          />
        </div>

        {isAuthorized ? (
          <section id="mobile-nav" className="top-nav">
            <input id="menu-toggle" type="checkbox" />
            <label className="menu-button-container" htmlFor="menu-toggle">
              <div className="menu-button"></div>
            </label>

            <div className="menu">
              <div
                className="login-nav-item"
                onClick={() => {
                  setExportPopUp(true);
                  document.getElementById("menu-toggle").checked = false;
                }}
              >
                <p>New project</p>
              </div>
              <div
                className={
                  "login-nav-item" +
                  (projectToShow == "owned" ? " login-nav-item-clicked" : "")
                }
                onClick={(e) => {
                  setProjectsToShow("owned");
                  document.getElementById("menu-toggle").checked = false;
                }}
              >
                <p>My Projects</p>
              </div>
              <div
                className={
                  "login-nav-item" +
                  (projectToShow == "liked" ? " login-nav-item-clicked" : "")
                }
                onClick={() => {
                  setProjectsToShow("liked");
                  document.getElementById("menu-toggle").checked = false;
                }}
              >
                <p> Liked Projects</p>
              </div>
              <div
                className={
                  "login-nav-item" +
                  (projectToShow == "featured" ? " login-nav-item-clicked" : "")
                }
                onClick={() => {
                  setProjectsToShow("featured");
                  document.getElementById("menu-toggle").checked = false;
                }}
              >
                <p> Browse Featured Projects</p>
              </div>
              <div
                className={
                  "login-nav-item" +
                  (projectToShow == "all" ? " login-nav-item-clicked" : "")
                }
                onClick={() => {
                  setProjectsToShow("all");
                  document.getElementById("menu-toggle").checked = false;
                }}
              >
                <p> Browse All Other Projects</p>
              </div>
            </div>
          </section>
        ) : noUserBrowsing ? (
          <section id="mobile-nav" className="top-nav">
            <input id="menu-toggle-guest" type="checkbox" />
            <label
              className="menu-button-container"
              htmlFor="menu-toggle-guest"
            >
              <div className="menu-button"></div>
            </label>

            <div className="menu">
              <div
                className="login-nav-item"
                onClick={() => {
                  setNoUserBrowsing(false);
                  document.getElementById("menu-toggle-guest").checked = false;
                }}
              >
                <p>Login</p>
              </div>
              <div
                className={
                  "login-nav-item" +
                  (projectToShow == "featured" ? " login-nav-item-clicked" : "")
                }
                onClick={() => {
                  setProjectsToShow("featured");
                  document.getElementById("menu-toggle-guest").checked = false;
                }}
              >
                <p> Browse Featured Projects</p>
              </div>
              <div
                className={
                  "login-nav-item" +
                  (projectToShow == "all" ? " login-nav-item-clicked" : "")
                }
                onClick={() => {
                  setProjectsToShow("all");
                  document.getElementById("menu-toggle-guest").checked = false;
                }}
              >
                <p> Browse All Other Projects</p>
              </div>
            </div>
          </section>
        ) : null}
      </div>
      {popUpContent}
    </div>
  );
}

export default LoginMode;

/*--Credit to https://codepen.io/colorlib/pen/rxddKy */
