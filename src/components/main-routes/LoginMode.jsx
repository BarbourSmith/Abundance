import React, { useEffect, useRef, useState, useMemo } from "react";
import GlobalVariables from "../../js/globalvariables.js";
import { Link } from "react-router-dom";
import globalvariables from "../../js/globalvariables.js";
import NewProjectPopUp from "../secondary/NewProjectPopUp.jsx";
import { useQuery } from "react-query";
import useDebounce from "../../hooks/useDebounce.js";
import { useNavigate } from "react-router-dom";
import { useLocation } from "react-router-dom";
import {
  useAuth,
  useAppState,
  useBrowseSettings,
} from "../../contexts/index.js";
import { useTutorial } from "../../tutorial/TutorialManager";
import { useProject } from "../../contexts/index.js";
import { licenses } from "../../js/licenseOptions.js";
import RenderProgressBar from "../secondary/RenderProgressBar.jsx";
import RenameProjectDialog from "../secondary/RenameProjectDialog.jsx";
import ProjectNotFoundDialog from "../secondary/ProjectNotFoundDialog.jsx";
import { convertToDisplayName } from "../../js/projectNameUtils.js";
import FilterPanel from "../secondary/FilterPanel.jsx";
import DropdownSectionDisplay from "./DropdownSectionDisplay.jsx";
import FAQDisplay from "./FAQDisplay.jsx";
import on from "../../js/circular-menu/src/on.js";

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
  const [svgCacheBuster, setSvgCacheBuster] = useState(Date.now());
  const [failedImages, setFailedImages] = useState(new Set());
  const {
    browseType,
    updateBrowseType,
    orderType,
    updateOrderType,
    filters,
    updateFilters,
  } = useBrowseSettings();
  let nodes = projectsLoaded ? projectsLoaded["repos"] : [];

  let initialOrder =
    projectToShow == "featured"
      ? "byStars"
      : projectToShow == "all"
        ? "byDateModified"
        : projectToShow == "owned"
          ? "byDateModified"
          : "byName";

  // Use persistent settings from context
  // Pick a random featured project from all available nodes - memoized to prevent re-render loop
  const randomFeaturedNode = useMemo(() => {
    if (projectToShow == "featured" && nodes.length > 0) {
      const randomIndex = Math.floor(Math.random() * nodes.length);
      return nodes[randomIndex];
    }
    return null;
  }, [projectToShow, nodes.length]);

  // Apply fork filter
  if (!filters.showForks) {
    // filter out forks
    nodes = nodes.filter((node) => node.parentRepo === null);
  }

  // Apply filters
  const hasActiveFilters =
    filters.users.size > 0 || filters.tags.size > 0 || filters.years.size > 0;

  if (hasActiveFilters) {
    nodes = nodes.filter((node) => {
      // User filter
      if (filters.users.size > 0 && !filters.users.has(node.owner)) {
        return false;
      }

      // Tag filter
      if (filters.tags.size > 0) {
        const hasMatchingTag =
          node.topics && node.topics.some((tag) => filters.tags.has(tag));
        if (!hasMatchingTag) {
          return false;
        }
      }

      // Year filter
      if (filters.years.size > 0) {
        const projectYear = new Date(node.dateCreated).getFullYear();
        if (!filters.years.has(projectYear)) {
          return false;
        }
      }

      return true;
    });
  }

  const handleFilterChange = (newFilters) => {
    updateFilters(newFilters);
  };

  return (
    <>
      <div
        id="sorting-button-div"
        style={{ display: "flex", alignItems: "center" }}
      >
        <button
          className="list_thumb_button"
          key="list-filter-button"
          onClick={() => updateBrowseType("list")}
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
          onClick={() => updateBrowseType("thumb")}
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
            value={orderType}
            onChange={(e) => updateOrderType(e.target.value)}
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
      </div>
      <div className="projects-and-filters-container">
        <div className="project-items-wrapper">
          <div className={`project-items-div`}>
            {projectToShow == "featured" && randomFeaturedNode ? (
              <FeaturedHighlight randomFeaturedNode={randomFeaturedNode} />
            ) : null}
            {nodes.length > 0 ? (
              <ProjectDiv
                {...{
                  nodes,
                  browseType,
                  orderType,
                  authorizedUserOcto,
                  svgCacheBuster,
                  failedImages,
                  setFailedImages,
                  projectToShow,
                }}
              />
            ) : (
              <p>No projects match your search</p>
            )}
          </div>
        </div>
        {/*<FilterPanel
          projects={projectsLoaded ? projectsLoaded["repos"] : []}
          onFilterChange={handleFilterChange}
        />*/}
      </div>
    </>
  );
};

const FeaturedHighlight = ({ randomFeaturedNode }) => {
  const [showQuickView, setShowQuickView] = useState(false);
  const [panelOnLeft, setPanelOnLeft] = useState(false);
  const hoverTimerRef = useRef(null);
  const projectRef = useRef(null);

  const PANEL_WIDTH = 300;
  const PANEL_MARGIN = 20;

  useEffect(() => {
    return () => {
      if (hoverTimerRef.current) {
        clearTimeout(hoverTimerRef.current);
      }
    };
  }, []);

  const handleEyeMouseEnter = () => {
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
    }
    hoverTimerRef.current = setTimeout(() => {
      if (projectRef.current) {
        const rect = projectRef.current.getBoundingClientRect();
        const spaceOnRight = window.innerWidth - rect.right;
        setPanelOnLeft(spaceOnRight < PANEL_WIDTH + PANEL_MARGIN);
      }
      setShowQuickView(true);
    }, 500);
  };

  const handleEyeMouseLeave = () => {
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
    setShowQuickView(false);
  };

  return (
    <div id="featured-div">
      <Link
        onClick={() => {
          GlobalVariables.currentAWSnode = randomFeaturedNode;
        }}
        id="featured-project-highlight"
        className="featured-project-div"
        key={randomFeaturedNode.owner + randomFeaturedNode.repoName}
        to={
          randomFeaturedNode.owner == globalvariables.currentUser
            ? `/${randomFeaturedNode.owner}/${randomFeaturedNode.repoName}`
            : `/run/${randomFeaturedNode.owner}/${randomFeaturedNode.repoName}`
        }
        ref={projectRef}
      >
        <div style={{ position: "relative", left: "5%", top: "5%" }}>
          <p className="project_name">
            {convertToDisplayName(randomFeaturedNode.repoName)}
          </p>
          <p className="project_name">By {randomFeaturedNode.owner}</p>
        </div>
        <img
          className="project_image"
          style={{ left: "80%", top: "30%" }}
          src={randomFeaturedNode.svgURL}
          onError={({ currentTarget }) => {
            currentTarget.onerror = null; // prevents looping
            currentTarget.src =
              import.meta.env.VITE_APP_PATH_FOR_PICS +
              "/imgs/defaultThumbnail.svg";
          }}
          alt={randomFeaturedNode.repoName}
        ></img>

        {/* Ranking and Eye Icon Overlay */}
        <div
          style={{
            display: "flex",
            height: "100%",
            position: "absolute",
            top: "1rem",
            right: "1rem",
            flexDirection: "column",
          }}
        >
          {/* Ranking */}
          <div
            className="ranking-icon"
            style={{
              display: "flex",
              justifyContent: "flex-start",
            }}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              style={{
                transform: "scale(.7)",
                fill: "#5a0562",
                alignSelf: "center",
              }}
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
              {randomFeaturedNode.ranking}
            </p>
          </div>

          {/* Eye icon overlay */}
          <div
            className="thumb-eye-icon"
            onMouseEnter={handleEyeMouseEnter}
            onMouseLeave={handleEyeMouseLeave}
            onClick={(e) => e.stopPropagation()}
            style={{
              marginTop: "5px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ aspectRatio: "1 / 1" }}
            >
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
              <circle cx="12" cy="12" r="3"></circle>
            </svg>
          </div>

          {/* Quick view panel */}
          {showQuickView && (
            <div
              className={`thumb-quick-view-panel ${panelOnLeft ? "panel-on-left" : ""}`}
              onMouseEnter={() => {
                if (hoverTimerRef.current) {
                  clearTimeout(hoverTimerRef.current);
                  hoverTimerRef.current = null;
                }
              }}
              onMouseLeave={handleEyeMouseLeave}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="GitInfoLeft">
                <img
                  src={randomFeaturedNode.svgURL}
                  onError={({ currentTarget }) => {
                    currentTarget.onerror = null;
                    currentTarget.src =
                      import.meta.env.VITE_APP_PATH_FOR_PICS +
                      "/imgs/defaultThumbnail.svg";
                  }}
                  alt={randomFeaturedNode.repoName}
                />
                <div style={{ display: "flex", alignItems: "center" }}>
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    style={{ transform: "scale(.7)" }}
                    width="16"
                    height="16"
                  >
                    <path d="M8 .2l4.9 15.2L0 6h16L3.1 15.4z" />
                  </svg>
                  <p style={{ fontSize: "0.5em" }}>
                    {randomFeaturedNode.ranking}
                  </p>
                </div>
              </div>
              <div className="GitInfo">
                <div>
                  <strong>Project Name: </strong>
                  <span>
                    {convertToDisplayName(randomFeaturedNode.repoName)}
                  </span>
                </div>
                <div>
                  <strong>Creator: </strong>
                  <span>{randomFeaturedNode.owner}</span>
                </div>
                <div>
                  <strong>Description: </strong>
                  <span>
                    {randomFeaturedNode.description || "No description"}
                  </span>
                </div>
                <div>
                  <strong>Tags: </strong>
                  {randomFeaturedNode.topics &&
                  randomFeaturedNode.topics.length > 0 ? (
                    randomFeaturedNode.topics.map((tag, idx) => (
                      <span key={tag + idx} className="bubble-tag">
                        {tag}
                      </span>
                    ))
                  ) : (
                    <span>None</span>
                  )}
                </div>
                <div>
                  <strong>Created: </strong>
                  <span>
                    {new Date(
                      randomFeaturedNode.dateCreated,
                    ).toLocaleDateString()}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      </Link>
    </div>
  );
};

const ProjectDiv = ({
  nodes,
  browseType,
  orderType,
  authorizedUserOcto,
  svgCacheBuster,
  failedImages,
  setFailedImages,
  projectToShow,
}) => {
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

  // State for not found dialog
  const [notFoundDialog, setNotFoundDialog] = useState(false);
  const [notFoundProject, setNotFoundProject] = useState(null);

  // Handler for clicking on a not-found project
  const handleNotFoundProjectClick = (event, node) => {
    event.preventDefault();
    setNotFoundProject(node);
    setNotFoundDialog(true);
  };

  // Handler for retrying to load a not-found project
  const handleRetryNotFoundProject = async () => {
    if (!notFoundProject) return;

    // Clear the notFound flag in AWS
    try {
      const apiUpdateUrl =
        "https://hg5gsgv9te.execute-api.us-east-2.amazonaws.com/abundance-stage/update-item";

      await fetch(apiUpdateUrl, {
        method: "POST",
        body: JSON.stringify({
          owner: notFoundProject.owner,
          repoName: notFoundProject.repoName,
          attributeUpdates: {
            notFound: false,
          },
        }),
        headers: {
          "Content-type": "application/json; charset=UTF-8",
        },
      });

      // Update the local node to remove the notFound flag
      notFoundProject.notFound = false;

      // Navigate to the project
      GlobalVariables.currentAWSnode = notFoundProject;
      if (notFoundProject.owner === GlobalVariables.currentUser) {
        navigate(`/${notFoundProject.owner}/${notFoundProject.repoName}`);
      } else {
        navigate(`/run/${notFoundProject.owner}/${notFoundProject.repoName}`);
      }
    } catch (error) {
      console.error("Error clearing notFound flag:", error);
      window.alert("Error retrying project load. Please try again.");
    }
  };

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
      setRenameProgress,
    );

    setRenamingProject(false);

    if (updatedProject) {
      window.alert(`Project successfully renamed to "${newName}"`);
      // Reload the page to show updated projects
      // window.location.reload();
    }
  };

  const handleImageError = (repoUrl) => {
    if (repoUrl) {
      setFailedImages((prev) => new Set(prev).add(repoUrl));
    }
  };

  // Memoize image URLs to avoid rebuilding on every render
  const imageUrlMap = useMemo(() => {
    const map = new Map();
    nodes.forEach((node) => {
      if (!node?.svgURL || failedImages.has(node.svgURL)) {
        map.set(
          node.svgURL || `${node.owner}/${node.repoName}`,
          import.meta.env.VITE_APP_PATH_FOR_PICS + "/imgs/defaultThumbnail.svg",
        );
      } else {
        const separator = node.svgURL.includes("?") ? "&" : "?";
        map.set(node.svgURL, `${node.svgURL}${separator}cb=${svgCacheBuster}`);
      }
    });
    return map;
  }, [nodes, svgCacheBuster, failedImages]);

  const getImageSrc = (node) => {
    return (
      imageUrlMap.get(node.svgURL || `${node.owner}/${node.repoName}`) ||
      import.meta.env.VITE_APP_PATH_FOR_PICS + "/imgs/defaultThumbnail.svg"
    );
  };

  const ThumbItem = React.memo(({ node, svgCacheBuster }) => {
    const [showQuickView, setShowQuickView] = useState(false);
    const [panelOnLeft, setPanelOnLeft] = useState(false);
    const hoverTimerRef = useRef(null);
    const projectRef = useRef(null);

    // Quick view panel dimensions
    const PANEL_WIDTH = 300;
    const PANEL_MARGIN = 20;

    // Cleanup timer on component unmount to prevent memory leaks
    useEffect(() => {
      return () => {
        if (hoverTimerRef.current) {
          clearTimeout(hoverTimerRef.current);
        }
      };
    }, []);

    const handleEyeMouseEnter = () => {
      // Clear any existing timer before starting a new one
      if (hoverTimerRef.current) {
        clearTimeout(hoverTimerRef.current);
      }
      // Start a timer to show quick view after 1 second
      hoverTimerRef.current = setTimeout(() => {
        // Check if panel would overflow on the right
        if (projectRef.current) {
          const rect = projectRef.current.getBoundingClientRect();
          const spaceOnRight = window.innerWidth - rect.right;

          // If not enough space on the right, show panel on the left
          setPanelOnLeft(spaceOnRight < PANEL_WIDTH + PANEL_MARGIN);
        }
        setShowQuickView(true);
      }, 1000);
    };

    const handleEyeMouseLeave = () => {
      // Clear the timer if user stops hovering before 1 second
      if (hoverTimerRef.current) {
        clearTimeout(hoverTimerRef.current);
        hoverTimerRef.current = null;
      }
      setShowQuickView(false);
    };

    return (
      <div
        ref={projectRef}
        className={`project ${node.notFound ? "project-not-found" : ""}`}
        style={
          node.owner != GlobalVariables.currentUser
            ? { backgroundColor: "rgb(233 221 242 / 58%)" }
            : null
        }
        key={node.topMoleculeID + node.owner}
        id={node.repoName}
        onClick={(e) => {
          if (node.notFound) {
            handleNotFoundProjectClick(e, node);
          } else {
            GlobalVariables.currentAWSnode = node;
          }
        }}
        onContextMenu={(e) => handleProjectRightClick(e, node)}
      >
        <p className="project_name">{convertToDisplayName(node.repoName)}</p>

        <div style={{ position: "relative" }}>
          <div style={{ display: "flex", flexDirection: "row" }}>
            <img
              className="project_image"
              src={getImageSrc(node)}
              onError={() => handleImageError(node.svgURL)}
              alt={node.repoName}
            />
            <div
              className="symbol-div"
              style={{
                display: "flex",
                height: "100%",
                position: "absolute",
                top: "-10px",
                right: "2px",
                flexDirection: "column",
              }}
            >
              {/* Ranking */}
              <div
                className="ranking-icon"
                style={{
                  display: "flex",
                  justifyContent: "flex-start",
                }}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  style={{
                    transform: "scale(.7)",
                    fill: "#5a0562",
                    alignSelf: "center",
                  }}
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
              {/* Forked repo icon */}
              <div
                style={{ opacity: 1, marginTop: "5px" }}
                className="ranking-icon"
              >
                {node.parentRepo ? (
                  <div style={{ alignSelf: "center" }}>
                    <svg
                      fill="#5a0562"
                      fillOpacity={1}
                      width="17"
                      height="17"
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
              {/* Eye icon overlay */}
              <div
                className="thumb-eye-icon"
                onMouseEnter={handleEyeMouseEnter}
                onMouseLeave={handleEyeMouseLeave}
                onClick={(e) => e.stopPropagation()}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                  <circle cx="12" cy="12" r="3"></circle>
                </svg>
              </div>

              {/* Quick view panel */}
              {showQuickView && (
                <div
                  className={`thumb-quick-view-panel ${panelOnLeft ? "panel-on-left" : ""}`}
                  onMouseEnter={() => {
                    // Keep panel open when hovering over it
                    if (hoverTimerRef.current) {
                      clearTimeout(hoverTimerRef.current);
                      hoverTimerRef.current = null;
                    }
                  }}
                  onMouseLeave={handleEyeMouseLeave}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="GitInfoLeft">
                    <img
                      src={getImageSrc(node)}
                      onError={() => handleImageError(node.svgURL)}
                      alt={node.repoName}
                    />
                    <div style={{ display: "flex", alignItems: "center" }}>
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        style={{ transform: "scale(.7)" }}
                        width="16"
                        height="16"
                      >
                        <path d="M8 .2l4.9 15.2L0 6h16L3.1 15.4z" />
                      </svg>
                      <p style={{ fontSize: "0.5em" }}>{node.ranking}</p>
                    </div>
                  </div>
                  <div className="GitInfo">
                    <div>
                      <strong>Project Name: </strong>
                      <span>{convertToDisplayName(node.repoName)}</span>
                    </div>
                    <div>
                      <strong>Creator: </strong>
                      <span>{node.owner}</span>
                    </div>
                    <div>
                      <strong>Description: </strong>
                      <span>{node.description || "No description"}</span>
                    </div>
                    <div>
                      <strong>Tags: </strong>
                      {node.topics && node.topics.length > 0 ? (
                        node.topics.map((tag, idx) => (
                          <span key={tag + idx} className="bubble-tag">
                            {tag}
                          </span>
                        ))
                      ) : (
                        <span>None</span>
                      )}
                    </div>
                    <div>
                      <strong>Created: </strong>
                      <span>
                        {new Date(node.dateCreated).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  });
  const ListItem = (node) => {
    let dateCreated = new Date(node.node.dateCreated).toDateString(); //converts date to string
    if (dateCreated == "Invalid Date") {
      dateCreated = "Date Created";
    }

    // Get first 3 tags, excluding 'abundance-tool' tag
    const displayTagsArr = node.node.topics
      ? node.node.topics.filter((tag) => tag !== "abundance-tool").slice(0, 3)
      : [];

    return (
      <div
        className={`project_list ${
          node.node.notFound ? "project-not-found" : ""
        }`}
        style={{ textDecoration: "none" }}
        key={node.node.id}
        id={node.node.id}
        onClick={(e) => {
          if (node.node.notFound) {
            handleNotFoundProjectClick(e, node.node);
          } else {
            GlobalVariables.currentAWSnode = node.node;
          }
        }}
        onContextMenu={(e) => handleProjectRightClick(e, node.node)} // <-- add right-click handler for list mode
      >
        <p className="project_name_list">
          {convertToDisplayName(node.node.repoName)}
        </p>

        <p className="project_name_list">{node.node.owner}</p>

        <p className="project_name_list">{dateCreated}</p>
        <div
          className="project_name_list"
          style={{
            fontSize: "0.9em",
            width: "30%",
            display: "flex",
            gap: "4px",
            alignItems: "center",
            flexWrap: "wrap",
            fontStyle: displayTagsArr.length ? "normal" : "italic",
            opacity: displayTagsArr.length ? 1 : 0.6,
          }}
        >
          {displayTagsArr.length > 0 ? (
            displayTagsArr.map((tag, idx) => (
              <span key={tag + idx} className="bubble-tag">
                {tag}
              </span>
            ))
          ) : (
            <span>No tags</span>
          )}
        </div>

        <div
          style={{
            width: "15%",
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
          <p
            style={{
              fontFamily: "Roboto, sans-serif",
              color: "var(--loginPopup-text)",
              width: "23%",
              marginLeft: "5px",
              textDecoration: "none",
            }}
          >
            {typeof node.node.ranking === "number"
              ? node.node.ranking.toFixed(2)
              : node.node.ranking}
          </p>
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
    ranking: "",
    dateCreated: "Date Created",
    owner: "Creator",
    repoName: "Project Name",
    topics: ["Tags"],
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

  // Stable sort to prevent unnecessary re-renders
  const sortedNodes = useMemo(
    () => nodes.sort(sorters[orderType]),
    [nodes, orderType, sorters],
  );

  // Memoized project link item component
  const ProjectLinkItem = React.memo(({ node }) => {
    const handleLinkClick = (e) => {
      if (node.notFound) {
        e.preventDefault();
      }
    };

    return (
      <Link
        to={
          node.owner == globalvariables.currentUser
            ? `/${node.owner}/${node.repoName}`
            : `/run/${node.owner}/${node.repoName}`
        }
        onClick={handleLinkClick}
      >
        {browseType == "list" ? (
          <ListItem {...{ node }} />
        ) : (
          <ThumbItem {...{ node }} />
        )}
      </Link>
    );
  });

  return (
    <>
      <div
        className={`project-item-div ${projectToShow === "featured" ? "featured-active" : ""}`}
      >
        {browseType == "list" ? <ListItem node={dummyNode} /> : null}
        {sortedNodes.map((node) => (
          <ProjectLinkItem key={node.owner + node.repoName} node={node} />
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
      {/* Not Found dialog */}
      {notFoundDialog && notFoundProject && (
        <ProjectNotFoundDialog
          isOpen={notFoundDialog}
          onClose={() => setNotFoundDialog(false)}
          onRetry={handleRetryNotFoundProject}
          projectName={convertToDisplayName(notFoundProject.repoName)}
        />
      )}
      {/* Rename progress bar */}
      {renamingProject && (
        <div className="rename-bar">
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

// Helper function to extract video ID and generate YouTube thumbnail
const getYouTubeThumbnail = (youtubeUrl) => {
  let videoId = "";
  if (youtubeUrl.includes("/embed/")) {
    videoId = youtubeUrl.split("/embed/")[1];
  } else if (youtubeUrl.includes("watch?v=")) {
    videoId = youtubeUrl.split("watch?v=")[1];
  }
  // Return high quality thumbnail, falls back to default if not available
  return videoId ? `https://img.youtube.com/vi/${videoId}/hqdefault.jpg` : "";
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
        "&mode=all" +
        "&yearShow=" +
        yearShow +
        lastKeyQuery,
      { signal },
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
        GlobalVariables.currentUser +
        "&mode=user" +
        lastKeyQuery,
      { signal },
    ).then((res) => res.json());
  };
  const fetchFeaturedRepos = async ({ signal }) => {
    return fetch(
      "https://hg5gsgv9te.execute-api.us-east-2.amazonaws.com/abundance-stage/queryFeaturedProjects",
      { signal },
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
      { signal },
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

  const handleSearchChange = (e) => {
    setSearch(e.target.value.toLowerCase());
    setPageNumber(0);
  };

  // Determine if user is new (no projects), triggers animation to draw attention to getting started tab
  // Only trigger when search is empty - a search with no results should not be treated as "no projects"
  const isNewUser =
    !isLoadingUser &&
    !search &&
    myRepos &&
    (!myRepos.repos || myRepos.repos.length === 0);

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
      "tutorial-default",
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
        setLoadingTutorialBar,
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
        `https://hg5gsgv9te.execute-api.us-east-2.amazonaws.com/abundance-stage/fetchSingleRepo?owner=${owner}&repoName=${repoName}`,
      );
      setLoadingTutorialBar(10);
      const data = await response.json();
      if (data && data.item) {
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
        className={
          "login-nav-item" +
          (isNewUser && projectToShow !== "getting_started"
            ? " login-nav-item-highlight"
            : "")
        }
        onClick={() => setProjectsToShow("getting_started")}
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
    faq: {
      label: "Frequently Asked Questions",
      faq: true,
    },
    getting_started: {
      label: "Getting Started",
      sections: [
        {
          label: "Tutorials",
          value: [
            {
              label: "Canvas Basics",
              value: "canvasBasics",
              thumbnail:
                "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100' viewBox='0 0 100 100'%3E%3Cdefs%3E%3CradialGradient id='singleAtomGrad' cx='35%25' cy='35%25' r='50%25'%3E%3Cstop offset='0%25' style='stop-color:%23be3fe5;stop-opacity:1' /%3E%3Cstop offset='100%25' style='stop-color:%23a855b8;stop-opacity:1' /%3E%3C/radialGradient%3E%3C/defs%3E%3Crect width='100' height='100' fill='%23f8f3fb'/%3E%3Ccircle cx='50' cy='50' r='20' fill='url(%23singleAtomGrad)' opacity='0.95'/%3E%3Ccircle cx='50' cy='50' r='18' fill='none' stroke='%23ffffff' stroke-width='2' opacity='0.4'/%3E%3Ccircle cx='50' cy='50' r='5' fill='%23ffffff' opacity='0.6'/%3E%3C/svg%3E",
              onClick: () => {
                fetchFirstOrCreateAndStartTutorial({
                  name: "Canvas Basics",
                  value: "canvasBasics",
                });
              },
            },
            {
              label: "Abundance Basics",
              value: "gettingStarted",
              thumbnail:
                "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100' viewBox='0 0 100 100'%3E%3Cdefs%3E%3CradialGradient id='abGrad1' cx='35%25' cy='35%25' r='50%25'%3E%3Cstop offset='0%25' style='stop-color:%23be3fe5;stop-opacity:1' /%3E%3Cstop offset='100%25' style='stop-color:%23a855b8;stop-opacity:1' /%3E%3C/radialGradient%3E%3CradialGradient id='abGrad2' cx='35%25' cy='35%25' r='50%25'%3E%3Cstop offset='0%25' style='stop-color:%23c4a3d5;stop-opacity:1' /%3E%3Cstop offset='100%25' style='stop-color:%239d40b0;stop-opacity:1' /%3E%3C/radialGradient%3E%3C/defs%3E%3Crect width='100' height='100' fill='%23f8f3fb'/%3E%3Cline x1='28' y1='35' x2='52' y2='35' stroke='%23be3fe5' stroke-width='2' opacity='0.5' stroke-dasharray='2,2'/%3E%3Cline x1='48' y1='35' x2='72' y2='55' stroke='%23be3fe5' stroke-width='2' opacity='0.5' stroke-dasharray='2,2'/%3E%3Cline x1='72' y1='65' x2='50' y2='75' stroke='%23be3fe5' stroke-width='2' opacity='0.5' stroke-dasharray='2,2'/%3E%3Ccircle cx='20' cy='35' r='9' fill='url(%23abGrad1)' opacity='0.95'/%3E%3Ccircle cx='60' cy='35' r='9' fill='url(%23abGrad2)' opacity='0.9'/%3E%3Ccircle cx='80' cy='55' r='9' fill='url(%23abGrad1)' opacity='0.85'/%3E%3Ccircle cx='50' cy='75' r='9' fill='url(%23abGrad2)' opacity='0.8'/%3E%3Ccircle cx='20' cy='35' r='6' fill='none' stroke='%23ffffff' stroke-width='1.2' opacity='0.5'/%3E%3Ccircle cx='60' cy='35' r='6' fill='none' stroke='%23ffffff' stroke-width='1.2' opacity='0.5'/%3E%3Ccircle cx='80' cy='55' r='6' fill='none' stroke='%23ffffff' stroke-width='1.2' opacity='0.4'/%3E%3Ccircle cx='50' cy='75' r='6' fill='none' stroke='%23ffffff' stroke-width='1.2' opacity='0.4'/%3E%3Ccircle cx='20' cy='35' r='2.5' fill='%23ffffff' opacity='0.6'/%3E%3Ccircle cx='60' cy='35' r='2.5' fill='%23ffffff' opacity='0.6'/%3E%3Ccircle cx='80' cy='55' r='2.5' fill='%23ffffff' opacity='0.5'/%3E%3Ccircle cx='50' cy='75' r='2.5' fill='%23ffffff' opacity='0.5'/%3E%3C/svg%3E",
              onClick: () => {
                fetchFirstOrCreateAndStartTutorial({
                  name: "Abundance Basics",
                  value: "gettingStarted",
                });
              },
            },
            {
              label: "Input Atoms",
              value: "inputsSteps",
              thumbnail:
                "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100' viewBox='0 0 100 100'%3E%3Cdefs%3E%3ClinearGradient id='inputStackGrad' x1='0%25' y1='0%25' x2='0%25' y2='100%25'%3E%3Cstop offset='0%25' style='stop-color:%23be3fe5;stop-opacity:1' /%3E%3Cstop offset='100%25' style='stop-color:%23c4a3d5;stop-opacity:1' /%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='100' height='100' fill='%23f8f3fb'/%3E%3Cpolygon points='10,18 45,18 55,25 45,32 10,32' fill='url(%23inputStackGrad)' opacity='0.9' stroke='%23ffffff' stroke-width='1.2'/%3E%3Cpolygon points='10,45 45,45 55,52 45,59 10,59' fill='url(%23inputStackGrad)' opacity='0.7' stroke='%23ffffff' stroke-width='1.2'/%3E%3Cpolygon points='10,72 45,72 55,79 45,86 10,86' fill='url(%23inputStackGrad)' opacity='0.5' stroke='%23ffffff' stroke-width='1.2'/%3E%3C/svg%3E",
              onClick: () => {
                fetchFirstOrCreateAndStartTutorial({
                  name: "Input Atoms",
                  value: "inputsSteps",
                });
              },
            },
            {
              label: "Assemblies",
              value: "assemblySteps",
              thumbnail:
                "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100' viewBox='0 0 100 100'%3E%3Cdefs%3E%3CradialGradient id='atomGrad1' cx='35%25' cy='35%25' r='50%25'%3E%3Cstop offset='0%25' style='stop-color:%23be3fe5;stop-opacity:1' /%3E%3Cstop offset='100%25' style='stop-color:%23a855b8;stop-opacity:1' /%3E%3C/radialGradient%3E%3CradialGradient id='atomGrad2' cx='35%25' cy='35%25' r='50%25'%3E%3Cstop offset='0%25' style='stop-color:%23c4a3d5;stop-opacity:1' /%3E%3Cstop offset='100%25' style='stop-color:%239d40b0;stop-opacity:1' /%3E%3C/radialGradient%3E%3C/defs%3E%3Crect width='100' height='100' fill='%23f8f3fb'/%3E%3Ccircle cx='35' cy='50' r='18' fill='url(%23atomGrad1)' opacity='0.95'/%3E%3Ccircle cx='65' cy='50' r='18' fill='url(%23atomGrad2)' opacity='0.95'/%3E%3Cpath d='M 53 48 L 47 52' stroke='%23be3fe5' stroke-width='3' opacity='0.7'/%3E%3Cpath d='M 53 50 L 47 50' stroke='%23be3fe5' stroke-width='3' opacity='0.7'/%3E%3Cpath d='M 53 52 L 47 48' stroke='%23be3fe5' stroke-width='3' opacity='0.7'/%3E%3Ccircle cx='35' cy='50' r='15' fill='none' stroke='%23ffffff' stroke-width='2' opacity='0.4'/%3E%3Ccircle cx='65' cy='50' r='15' fill='none' stroke='%23ffffff' stroke-width='2' opacity='0.4'/%3E%3Ccircle cx='35' cy='50' r='4' fill='%23ffffff' opacity='0.6'/%3E%3Ccircle cx='65' cy='50' r='4' fill='%23ffffff' opacity='0.6'/%3E%3C/svg%3E",
              onClick: () => {
                fetchFirstOrCreateAndStartTutorial({
                  name: "Assemblies",
                  value: "assemblySteps",
                });
              },
            },
            {
              label: "Molecules",
              value: "Molecules",
              thumbnail:
                "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100' viewBox='0 0 100 100'%3E%3Cdefs%3E%3CradialGradient id='molAtomCenter' cx='35%25' cy='35%25' r='50%25'%3E%3Cstop offset='0%25' style='stop-color:%23be3fe5;stop-opacity:1' /%3E%3Cstop offset='100%25' style='stop-color:%238b2db5;stop-opacity:1' /%3E%3C/radialGradient%3E%3CradialGradient id='molAtomOuter' cx='35%25' cy='35%25' r='50%25'%3E%3Cstop offset='0%25' style='stop-color:%23c4a3d5;stop-opacity:1' /%3E%3Cstop offset='100%25' style='stop-color:%239d40b0;stop-opacity:1' /%3E%3C/radialGradient%3E%3C/defs%3E%3Crect width='100' height='100' fill='%23f8f3fb'/%3E%3Cline x1='50' y1='50' x2='30' y2='30' stroke='%23be3fe5' stroke-width='2.5' opacity='0.6'/%3E%3Cline x1='50' y1='50' x2='70' y2='30' stroke='%23be3fe5' stroke-width='2.5' opacity='0.6'/%3E%3Cline x1='50' y1='50' x2='70' y2='70' stroke='%23be3fe5' stroke-width='2.5' opacity='0.6'/%3E%3Cline x1='50' y1='50' x2='30' y2='70' stroke='%23be3fe5' stroke-width='2.5' opacity='0.6'/%3E%3Ccircle cx='50' cy='50' r='16' fill='url(%23molAtomCenter)' opacity='0.95'/%3E%3Ccircle cx='30' cy='30' r='10' fill='url(%23molAtomOuter)' opacity='0.85'/%3E%3Ccircle cx='70' cy='30' r='10' fill='url(%23molAtomOuter)' opacity='0.85'/%3E%3Ccircle cx='70' cy='70' r='10' fill='url(%23molAtomOuter)' opacity='0.85'/%3E%3Ccircle cx='30' cy='70' r='10' fill='url(%23molAtomOuter)' opacity='0.85'/%3E%3Ccircle cx='50' cy='50' r='13' fill='none' stroke='%23ffffff' stroke-width='1.5' opacity='0.3'/%3E%3Ccircle cx='30' cy='30' r='8' fill='none' stroke='%23ffffff' stroke-width='1.5' opacity='0.3'/%3E%3Ccircle cx='70' cy='30' r='8' fill='none' stroke='%23ffffff' stroke-width='1.5' opacity='0.3'/%3E%3Ccircle cx='70' cy='70' r='8' fill='none' stroke='%23ffffff' stroke-width='1.5' opacity='0.3'/%3E%3Ccircle cx='30' cy='70' r='8' fill='none' stroke='%23ffffff' stroke-width='1.5' opacity='0.3'/%3E%3C/svg%3E",
              onClick: () => {
                fetchFirstOrCreateAndStartTutorial({
                  name: "Molecules",
                  value: "Molecules",
                });
              },
            },
            {
              label: "Github Molecules",
              value: "GitHubMolecule",
              thumbnail:
                "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100' viewBox='0 0 100 100'%3E%3Cdefs%3E%3CradialGradient id='molAtomCenter' cx='35%25' cy='35%25' r='50%25'%3E%3Cstop offset='0%25' style='stop-color:%23be3fe5;stop-opacity:1' /%3E%3Cstop offset='100%25' style='stop-color:%238b2db5;stop-opacity:1' /%3E%3C/radialGradient%3E%3CradialGradient id='molAtomOuter' cx='35%25' cy='35%25' r='50%25'%3E%3Cstop offset='0%25' style='stop-color:%23c4a3d5;stop-opacity:1' /%3E%3Cstop offset='100%25' style='stop-color:%239d40b0;stop-opacity:1' /%3E%3C/radialGradient%3E%3C/defs%3E%3Crect width='100' height='100' fill='%23f8f3fb'/%3E%3Cline x1='50' y1='50' x2='30' y2='30' stroke='%23be3fe5' stroke-width='2.5' opacity='0.6'/%3E%3Cline x1='50' y1='50' x2='70' y2='30' stroke='%23be3fe5' stroke-width='2.5' opacity='0.6'/%3E%3Cline x1='50' y1='50' x2='70' y2='70' stroke='%23be3fe5' stroke-width='2.5' opacity='0.6'/%3E%3Cline x1='50' y1='50' x2='30' y2='70' stroke='%23be3fe5' stroke-width='2.5' opacity='0.6'/%3E%3Ccircle cx='50' cy='50' r='16' fill='url(%23molAtomCenter)' opacity='0.95'/%3E%3Ccircle cx='30' cy='30' r='10' fill='url(%23molAtomOuter)' opacity='0.85'/%3E%3Ccircle cx='70' cy='30' r='10' fill='url(%23molAtomOuter)' opacity='0.85'/%3E%3Ccircle cx='70' cy='70' r='10' fill='url(%23molAtomOuter)' opacity='0.85'/%3E%3Ccircle cx='30' cy='70' r='10' fill='url(%23molAtomOuter)' opacity='0.85'/%3E%3Ccircle cx='50' cy='50' r='13' fill='none' stroke='%23ffffff' stroke-width='1.5' opacity='0.3'/%3E%3Ccircle cx='30' cy='30' r='8' fill='none' stroke='%23ffffff' stroke-width='1.5' opacity='0.3'/%3E%3Ccircle cx='70' cy='30' r='8' fill='none' stroke='%23ffffff' stroke-width='1.5' opacity='0.3'/%3E%3Ccircle cx='70' cy='70' r='8' fill='none' stroke='%23ffffff' stroke-width='1.5' opacity='0.3'/%3E%3Ccircle cx='30' cy='70' r='8' fill='none' stroke='%23ffffff' stroke-width='1.5' opacity='0.3'/%3E%3Cg transform='translate(50,50) scale(0.85)'%3E%3Cpath d='M -6 -4 C -8 -4 -9 -3 -9 -1 L -9 4 C -9 5 -8 6 -6 6 L -3 6 L -3 2 C -3 1 -2 0 -1 0 L 1 0 C 2 0 3 1 3 2 L 3 6 L 6 6 C 8 6 9 5 9 4 L 9 -1 C 9 -3 8 -4 6 -4 Z' fill='%23ffffff' opacity='0.9'/%3E%3Ccircle cx='-3' cy='-1' r='1' fill='%23ffffff' opacity='0.9'/%3E%3Ccircle cx='3' cy='-1' r='1' fill='%23ffffff' opacity='0.9'/%3E%3Cpath d='M -1 5 L 0 7 L 1 5' fill='%23ffffff' opacity='0.8'/%3E%3C/g%3E%3C/svg%3E",
              onClick: () => {
                fetchFirstOrCreateAndStartTutorial({
                  name: "GitHubMolecule",
                  value: "GitHubMolecule",
                });
              },
            },
            //{ label: "Assemblies and Fusions", value: "assembliesAndFusions" },
          ],
        },
        {
          label: "Videos",
          type: "videos",
          value: [
            {
              label: "Introduction to Abundance",
              url: "https://www.youtube.com/watch?v=k4pZ8ex20sM",
              thumbnail: getYouTubeThumbnail(
                "https://www.youtube.com/watch?v=k4pZ8ex20sM",
              ),
            },
            {
              label: "Abundance - TAGS/EXTRACT TAG",
              url: "https://www.youtube.com/watch?v=AwGbaCevFKc",
              thumbnail: getYouTubeThumbnail(
                "https://www.youtube.com/watch?v=AwGbaCevFKc",
              ),
            },
            {
              label: "Abundance- ASSEMBLIES AND FUSIONS",
              url: "https://www.youtube.com/watch?v=WU1Ou8ps9Bs",
              thumbnail: getYouTubeThumbnail(
                "https://www.youtube.com/watch?v=WU1Ou8ps9Bs",
              ),
            },
            {
              label: "Abundance - Github Molecules",
              url: "https://www.youtube.com/watch?v=HSGGM8ijP5I",
              thumbnail: getYouTubeThumbnail(
                "https://www.youtube.com/watch?v=HSGGM8ijP5I",
              ),
            },
            {
              label: "Abundance - Inputs",
              url: "https://youtu.be/exlEQ5dIfHI",
              thumbnail: getYouTubeThumbnail("https://youtu.be/exlEQ5dIfHI"),
            },
            {
              label: "Extruded Ellipse with the Code atom",
              url: "https://www.youtube.com/watch?v=z9ti5OeI9TM",
              thumbnail: getYouTubeThumbnail(
                "https://www.youtube.com/watch?v=z9ti5OeI9TM",
              ),
            },
            {
              label: "Abundance - Make a custom sign with an svg",
              url: "https://www.youtube.com/watch?v=9R-l8GRrO2c",
              thumbnail: getYouTubeThumbnail(
                "https://www.youtube.com/watch?v=9R-l8GRrO2c",
              ),
            },
          ],
        },
        {
          label: "User Resources",
          value: [
            {
              label: "User Guide",
              value: "userGuide",
              thumbnail:
                "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100' viewBox='0 0 100 100'%3E%3Cdefs%3E%3ClinearGradient id='bookGradient' x1='0%25' y1='0%25' x2='100%25' y2='100%25'%3E%3Cstop offset='0%25' style='stop-color:%23be3fe5;stop-opacity:1' /%3E%3Cstop offset='100%25' style='stop-color:%23c4a3d5;stop-opacity:1' /%3E%3C/linearGradient%3E%3ClinearGradient id='bookShine' x1='0%25' y1='0%25' x2='100%25' y2='0%25'%3E%3Cstop offset='0%25' style='stop-color:%23ffffff;stop-opacity:0.4' /%3E%3Cstop offset='100%25' style='stop-color:%23ffffff;stop-opacity:0' /%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='100' height='100' fill='%23f8f3fb'/%3E%3Cpath d='M 25 18 Q 22 18 22 21 L 22 79 Q 22 82 25 82 L 50 82 Q 52 82 52 80 L 52 20 Q 52 18 50 18 Z' fill='url(%23bookGradient)'/%3E%3Cpath d='M 50 20 Q 48 18 50 18 L 75 18 Q 78 18 78 21 L 78 79 Q 78 82 75 82 L 50 82 Q 52 82 52 80 L 52 20 Z' fill='url(%23bookGradient)' opacity='0.85'/%3E%3Cline x1='50' y1='18' x2='50' y2='82' stroke='%23fff' stroke-width='2' opacity='0.5'/%3E%3Cline x1='30' y1='35' x2='45' y2='35' stroke='%23fff' stroke-width='1.5' opacity='0.7'/%3E%3Cline x1='30' y1='46' x2='45' y2='46' stroke='%23fff' stroke-width='1.5' opacity='0.7'/%3E%3Cline x1='30' y1='57' x2='42' y2='57' stroke='%23fff' stroke-width='1.5' opacity='0.7'/%3E%3Cline x1='55' y1='35' x2='70' y2='35' stroke='%23fff' stroke-width='1.5' opacity='0.7'/%3E%3Cline x1='55' y1='46' x2='70' y2='46' stroke='%23fff' stroke-width='1.5' opacity='0.7'/%3E%3Cline x1='55' y1='57' x2='68' y2='57' stroke='%23fff' stroke-width='1.5' opacity='0.7'/%3E%3Crect x='25' y='18' width='25' height='64' fill='url(%23bookShine)' rx='2'/%3E%3C/svg%3E",
              onClick: () => {
                window.open("/user-guide", "_blank");
              },
            },
            {
              label: "FAQ",
              value: "faq",
              thumbnail:
                "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100' viewBox='0 0 100 100'%3E%3Cdefs%3E%3CradialGradient id='qGradient' cx='40%25' cy='40%25' r='60%25'%3E%3Cstop offset='0%25' style='stop-color:%23be3fe5;stop-opacity:1' /%3E%3Cstop offset='100%25' style='stop-color:%23a855b8;stop-opacity:1' /%3E%3C/radialGradient%3E%3CradialGradient id='qShine' cx='35%25' cy='35%25' r='50%25'%3E%3Cstop offset='0%25' style='stop-color:%23ffffff;stop-opacity:0.6' /%3E%3Cstop offset='100%25' style='stop-color:%23ffffff;stop-opacity:0' /%3E%3C/radialGradient%3E%3C/defs%3E%3Crect width='100' height='100' fill='%23f8f3fb'/%3E%3Ccircle cx='50' cy='50' r='38' fill='url(%23qGradient)'/%3E%3Ccircle cx='50' cy='50' r='36' fill='none' stroke='%23c4a3d5' stroke-width='2.5' opacity='0.6'/%3E%3Ccircle cx='50' cy='50' r='30' fill='url(%23qShine)' opacity='0.5'/%3E%3Ctext x='50' y='58' font-size='48' font-weight='bold' fill='%23fff' text-anchor='middle' dominant-baseline='central' font-family='Arial'%3E?%3C/text%3E%3C/svg%3E",
              onClick: () => {
                setProjectsToShow("faq");
              },
            },
            {
              label: "Maslow Forums",
              thumbnail:
                "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100' viewBox='0 0 100 100'%3E%3Cdefs%3E%3ClinearGradient id='chatGradient1' x1='0%25' y1='0%25' x2='100%25' y2='100%25'%3E%3Cstop offset='0%25' style='stop-color:%23c4a3d5;stop-opacity:1' /%3E%3Cstop offset='100%25' style='stop-color:%23be3fe5;stop-opacity:1' /%3E%3C/linearGradient%3E%3ClinearGradient id='chatGradient2' x1='0%25' y1='0%25' x2='100%25' y2='100%25'%3E%3Cstop offset='0%25' style='stop-color:%23be3fe5;stop-opacity:0.9' /%3E%3Cstop offset='100%25' style='stop-color:%23a855b8;stop-opacity:1' /%3E%3C/linearGradient%3E%3CfilterEffect id='shadow' x='-50%25' y='-50%25' width='200%25' height='200%25'%3E%3CfeDropShadow dx='1' dy='1' stdDeviation='2' flood-opacity='0.3'/%3E%3C/filterEffect%3E%3C/defs%3E%3Crect width='100' height='100' fill='%23f8f3fb'/%3E%3Cpath d='M 15 28 Q 15 20 23 20 L 50 20 Q 58 20 58 28 L 58 48 Q 58 56 50 56 L 32 56 L 26 66 L 32 56 L 25 56 Q 15 56 15 48 Z' fill='url(%23chatGradient1)' filter='url(%23shadow)'/%3E%3Cpath d='M 48 62 Q 48 55 55 55 L 78 55 Q 85 55 85 62 L 85 70 Q 85 77 78 77 L 68 77 L 63 85 L 68 77 L 60 77 Q 52 77 52 70' fill='url(%23chatGradient2)' filter='url(%23shadow)'/%3E%3Ccircle cx='28' cy='36' r='2.5' fill='%23fff' opacity='0.8'/%3E%3Ccircle cx='38' cy='36' r='2.5' fill='%23fff' opacity='0.8'/%3E%3Ccircle cx='48' cy='36' r='2.5' fill='%23fff' opacity='0.8'/%3E%3C/svg%3E",
              onClick: () => {
                window.open(
                  "https://forums.maslowcnc.com/c/software-issues/abundance/41",
                  "_blank",
                );
              },
            },
          ],
        },
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
          {showDict[projectToShow]["sections"] ? (
            <>
              <DropdownSectionDisplay
                fetchFirstOrCreateAndStartTutorial={
                  fetchFirstOrCreateAndStartTutorial
                }
                authorizedUserOcto={authorizedUserOcto}
                sections={showDict[projectToShow]["sections"]}
              />
            </>
          ) : null}
          {showDict[projectToShow]["faq"] ? (
            <>
              <FAQDisplay />
            </>
          ) : null}
          {loadingTutorial ? (
            <RenderProgressBar
              progress={loadingTutorialBar}
              run={true}
              offsetTop={-300}
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
    isAuthorized,
    authorizedUserOcto,
    setAuthorizedUserOcto,
    clearStoredToken,
    isRestoringSession,
  } = useAuth();
  const { exportPopUp, setExportPopUp } = useAppState();
  const { projectTab, updateProjectTab, resetSettings } = useBrowseSettings();
  const navigate = useNavigate();
  const location = useLocation();

  const pageDict = { 0: null };

  // Check if we're coming from run mode (Browse Projects was clicked)
  const fromRunMode = location.state?.fromRunMode;

  const [noUserBrowsing, setNoUserBrowsing] = useState(fromRunMode || false);

  // Use persistent projectTab from context
  const projectToShow = projectTab;
  const setProjectsToShow = (tab) => {
    updateProjectTab(tab);
  };

  const logoutHandler = () => {
    localStorage.removeItem("latestCSRFToken");
    clearStoredToken(); // Clear the stored access token
    resetSettings(); // Reset browse settings on logout
    window.location.assign("/");
  };

  let popUpContent;
  if (isRestoringSession) {
    // Show loading state while checking for cached token
    popUpContent = (
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
            <p style={{ padding: "0 20px" }}>Restoring your session...</p>
          </div>
        </div>
      </div>
    );
  } else if (exportPopUp && authorizedUserOcto) {
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
      <div className="top-banner" style={{ margin: "20px 0px 30px 30px" }}>
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
