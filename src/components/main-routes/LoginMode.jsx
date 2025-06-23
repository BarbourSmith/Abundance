import React, { useEffect, useRef, useState } from "react";
import GlobalVariables from "../../js/globalvariables.js";
import { Octokit } from "https://esm.sh/octokit@2.0.19";
import { Link } from "react-router-dom";
import globalvariables from "../../js/globalvariables.js";
import NewProjectPopUp from "../secondary/NewProjectPopUp.jsx";
import { useQuery } from "react-query";
import useDebounce from "../../hooks/useDebounce.js";
import { useNavigate } from "react-router-dom";
import { useLocation } from "react-router-dom";

/**
 * Initial log component displays pop Up to either attempt Github login/browse projects
 *
 */
const InitialLog = ({ setNoUserBrowsing }) => {
  const location = useLocation();

  const loginHandler = () => {
    const params = new URLSearchParams(location.search);
    let scope = "public_repo";
    if (params.has("private")) {
      scope = "repo";
    }

    // the client id from github
    const client_id = import.meta.env.VITE_GH_OAUTH_CLIENT_ID;

    // create a CSRF token and store it locally
    const csrfToken = window.crypto
      .getRandomValues(new Uint8Array(16))
      .reduce((acc, byte) => acc + byte.toString(16).padStart(2, "0"), "");
    localStorage.setItem("latestCSRFToken", csrfToken);

    // include currentRepo in the state parameter
    const state = JSON.stringify({
      csrfToken: csrfToken,
      forking: false,
    });
    // redirect the user to github
    const link = `https://github.com/login/oauth/authorize?client_id=${client_id}&response_type=code&scope=repo&redirect_uri=${
      import.meta.env.VITE_REDIRECT_URI
    }callback&state=${state}&scope=${scope}`;
    window.location.assign(link);
  };

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
              onClick={() => loginHandler() /*loginWithRedirect()*/}
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
      : projectToShow == "recents"
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
          <div id="featured-div">
            <div
              id="left-featured-div"
              style={{ width: "50%", display: "flex" }}
              className="project"
            >
              <div>
                <h3 className="project_name">Featured Project: </h3>
                <p className="project_name">{highestRankingNode.repoName}</p>
                <p className="project_name">{highestRankingNode.owner}</p>
              </div>
              <img
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
            </div>
            <div
              id="right-featured-div"
              style={{ width: "50%", display: "flex" }}
              className="project"
            >
              <div>
                <h3 className="project_name">Featured Tool</h3>
                <p className="project_name">
                  {highestRankingToolNode.repoName}
                </p>
                <p className="project_name">{highestRankingToolNode.owner}</p>
              </div>
              <img
                className="project_image"
                src={highestRankingToolNode.svgURL}
                onError={({ currentTarget }) => {
                  currentTarget.onerror = null; // prevents looping
                  currentTarget.src =
                    import.meta.env.VITE_APP_PATH_FOR_PICS +
                    "/imgs/defaultThumbnail.svg";
                }}
                alt={highestRankingToolNode.repoName}
              ></img>
            </div>
          </div>
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

const ProjectDiv = ({ nodes, browseType, orderType }) => {
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
          GlobalVariables.currentRepo = node;
        }}
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
          GlobalVariables.currentRepo = node.node;
        }}
      >
        <p className="project_name_list">{node.node.repoName}</p>

        <p className="project_name_list">{node.node.owner}</p>
        <p style={{ width: "20%", display: "block" }}>
          {" "}
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
  loginWithRedirect,
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
        console.log("lastkey");
        console.log(data["lastKey"]);
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
    ).then((res) => res.json());
  };
  const fetchRecents = async ({ signal }) => {
    return fetch(
      "https://hg5gsgv9te.execute-api.us-east-2.amazonaws.com/abundance-stage/queryRecentProjects?" +
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
  const fetchLikedRepos = async ({ signal }) => {
    return fetch(
      "https://hg5gsgv9te.execute-api.us-east-2.amazonaws.com/abundance-stage/USER-TABLE?user=" +
        user +
        "&liked=true",
      { signal }
    ).then((res) => res.json());
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
    data: recentRepos,
    isLoading: isLoadingRecents,
    isError: isErrorRecents,
  } = useQuery({
    queryKey: ["recentRepos", debouncedSearchTerm],
    queryFn: fetchRecents,
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
    setProjectsToShow(user ? "recents" : "featured");
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
              html_url: "https://github.com/" + GlobalVariables.currentUser + "/" + result.data.name,
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
          (projectToShow == "recents" ? " login-nav-item-clicked" : "")
        }
        onClick={() => {
          setProjectsToShow("recents");
        }}
      >
        <p> Recent Projects</p>
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
          loginWithRedirect();
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
    recents: {
      label: "Recent Projects",
      data: recentRepos,
      loading: isLoadingRecents,
      error: isErrorRecents,
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
          {showDict[projectToShow]["loading"] ? (
            <p> Searching for projects ... </p>
          ) : null}
          {showDict[projectToShow]["error"] ? (
            <p> There was an error: please try again </p>
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

function LoginMode({
  exportPopUp,
  setExportPopUp,
  setIsLoggedIn,
  authorizedUserOcto,
  setAuthorizedUserOcto,
  isAuthorized,
}) {
  const pageDict = { 0: null };

  const [noUserBrowsing, setNoUserBrowsing] = useState(false);
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
          loginWithRedirect,
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
        GlobalVariables.currentRepo.owner == GlobalVariables.currentUser &&
        isAuthorized ? (
          <Link
            to={`/${GlobalVariables.currentRepo.owner}/${GlobalVariables.currentRepo.repoName}`}
          >
            <button
              className="closeButton"
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
            className="closeButton"
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
            <button
              className="closeButtonmobile"
              onClick={() => {
                logoutHandler();
              }}
            >
              <span> Log out </span>
            </button>

            <div className="menu">
              <div
                className="login-nav-item"
                onClick={() => {
                  setExportPopUp(true);
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
                }}
              >
                <p>My Projects</p>
              </div>
              <div
                className={
                  "login-nav-item" +
                  (projectToShow == "recents" ? " login-nav-item-clicked" : "")
                }
                onClick={() => {
                  setProjectsToShow("recents");
                }}
              >
                <p> Recent Projects</p>
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
          </section>
        ) : null}
      </div>
      {popUpContent}
    </div>
  );
}

export default LoginMode;

/*--Credit to https://codepen.io/colorlib/pen/rxddKy */
