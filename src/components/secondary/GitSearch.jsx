import React, { useState, useRef, useEffect } from "react";
import GlobalVariables from "../../js/globalvariables.js";
import { useQuery } from "react-query";
import useDebounce from "../../hooks/useDebounce.js";

function GitSearch({
  searchingGitHub,
  setSearchingGitHub,
  search,
  setSearch,
  isHovering,
  setIsHovering,
  isShortcut,
  setIsShortcutTriggered,
}) {
  let searchBarValue = "";
  const [lastKey, setLastKey] = useState("");
  const [yearShow, setYearShow] = useState("2024");
  const [panelItem, setPanelItem] = useState({});
  const [selectedIndex, setSelectedIndex] = useState(-1);

  //const [search, setSearch] = useState("");
  const debouncedSearchTerm = useDebounce(search, 200);

  let lastKeyQuery = lastKey
    ? "&lastKey=" + lastKey.repoName + "~" + lastKey.owner
    : "&lastKey";

  let searchQuery;
  if (searchBarValue != "") {
    searchQuery = "&query=" + searchBarValue + "&yearShow=" + yearShow;
  } else {
    searchQuery = "&query" + "&yearShow=" + yearShow;
  }
  // let query = "attribute=searchField" + searchQuery + "&user" + lastKeyQuery;

  const { data, isLoading, isError } = useQuery({
    queryKey: ["search", debouncedSearchTerm],
    queryFn: () => {
      if (debouncedSearchTerm) {
        return fetch(
          "https://hg5gsgv9te.execute-api.us-east-2.amazonaws.com/abundance-stage/scan-search-abundance?" +
            "attribute=searchField" +
            "&query=" +
            debouncedSearchTerm +
            "&yearShow=" +
            yearShow +
            "&user" +
            lastKeyQuery
        ).then((res) => res.json());
      }
      return undefined;
    },
  });

  // Update panel item when keyboard navigation changes selection
  useEffect(() => {
    const localAtoms = getFilteredLocalAtoms(debouncedSearchTerm);
    const combinedResults = [...localAtoms];
    if (data && data.repos) {
      combinedResults.push(
        ...data.repos.map((repo) => ({ ...repo, isLocal: false }))
      );
    }

    if (
      combinedResults.length > 0 &&
      selectedIndex >= 0 &&
      selectedIndex < combinedResults.length
    ) {
      const selectedItem = combinedResults[selectedIndex];
      setPanelItem(selectedItem);
      setIsHovering(true);
    } else if (selectedIndex === -1) {
      setPanelItem({});
      setIsHovering(false);
    }
  }, [selectedIndex, data, debouncedSearchTerm]);

  // Reset selected index when search results change
  useEffect(() => {
    setSelectedIndex(-1);
  }, [data]);

  /**
   * Runs when a menu option is clicked to place a new atom from searching on GitHub.
   * @param {object} ev - The event triggered by clicking on a menu item.
   */
  function placeGitHubMolecule(e, item) {
    GlobalVariables.currentMolecule.loadGithubMoleculeByName(item);
    setSearchingGitHub(false);
    setIsShortcutTriggered(false);
    setSearch("");
    setIsHovering(false);

    // Ensure canvas regains focus after placing molecule
    const flowCanvas = document.getElementById("flow-canvas");
    if (flowCanvas) {
      flowCanvas.focus();
    }
  }

  /**
   * Runs when a local atom option is clicked to place a new atom from the circular menu atoms.
   * @param {object} ev - The event triggered by clicking on a menu item.
   * @param {string} atomType - The type of atom to place.
   */
  function placeLocalAtom(e, atomType) {
    GlobalVariables.currentMolecule.placeAtom(
      {
        x: GlobalVariables.pixelsToWidth(
          GlobalVariables.lastClick
            ? GlobalVariables.lastClick[0]
            : window.innerWidth * 0.75
        ),
        y: GlobalVariables.pixelsToHeight(
          GlobalVariables.lastClick
            ? GlobalVariables.lastClick[1]
            : window.innerHeight * 0.37
        ),
        parent: GlobalVariables.currentMolecule,
        atomType: atomType,
        uniqueID: GlobalVariables.generateUniqueID(),
      },
      true
    );
    setSearchingGitHub(false);
    setSearch("");
    setIsShortcutTriggered(false);
    setIsHovering(false);

    // Ensure canvas regains focus after placing atom
    const flowCanvas = document.getElementById("flow-canvas");
    if (flowCanvas) {
      flowCanvas.focus();
    }
  }

  /**
   * Filters local atoms based on search term
   * @param {string} searchTerm - The search term to filter by
   * @returns {Array} Array of matching local atoms
   */
  function getFilteredLocalAtoms(searchTerm) {
    if (!searchTerm || searchTerm.length < 1) {
      return [];
    }

    const filteredAtoms = [];
    for (const key in GlobalVariables.availableTypes) {
      const atom = GlobalVariables.availableTypes[key];
      if (
        atom.atomType?.toLowerCase().includes(searchTerm.toLowerCase()) &&
        atom.atomType?.toLowerCase() !== "box"
      ) {
        filteredAtoms.push({
          id: `local-${key}`,
          atomType: atom.atomType,
          atomCategory: atom.atomCategory || "General",
          isLocal: true,
        });
      }
    }
    return filteredAtoms;
  }

  const handleChange = function (e) {
    searchBarValue = e.target.value.toLowerCase();
    setSearch(e.target.value.toLowerCase());
    setSelectedIndex(-1); // Reset selection when search changes
  };

  const handleKeyDown = function (e) {
    if (e.key === "Escape" || e.key === "Shift") {
      setSearchingGitHub(false);
    }
    const localAtoms = getFilteredLocalAtoms(debouncedSearchTerm);
    const combinedResults = [...localAtoms];
    if (data && data.repos) {
      combinedResults.push(
        ...data.repos.map((repo) => ({ ...repo, isLocal: false }))
      );
    }

    if (combinedResults.length === 0) return;

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setSelectedIndex((prevIndex) =>
          prevIndex < combinedResults.length - 1 ? prevIndex + 1 : 0
        );
        break;
      case "ArrowUp":
        e.preventDefault();
        setSelectedIndex((prevIndex) =>
          prevIndex > 0 ? prevIndex - 1 : combinedResults.length - 1
        );
        break;
      case "Enter":
        e.preventDefault();
        if (selectedIndex >= 0 && selectedIndex < combinedResults.length) {
          const selectedItem = combinedResults[selectedIndex];
          if (selectedItem.isLocal) {
            placeLocalAtom(e, selectedItem.atomType);
          } else {
            placeGitHubMolecule(e, selectedItem);
          }
        }
        break;
      case "Escape":
        e.preventDefault();
        setSearchingGitHub(false);
        setIsShortcutTriggered(false);
        setSearch("");
        setIsHovering(false);
        setSelectedIndex(-1);
        break;
    }
  };

  const handleMouseOver = (item, key) => {
    setPanelItem(item);
    setIsHovering(true);
    setSelectedIndex(key); // Sync mouse hover with keyboard selection
  };
  const handleMouseOut = () => {
    setPanelItem({});
    setIsHovering(false);
    // Don't reset selectedIndex here to allow keyboard navigation to continue
  };

  // Calculate smart positioning for the info panel to avoid overlap
  const calculatePanelPosition = () => {
    const gitSearchElement = document.getElementById("git_search");
    if (!gitSearchElement) {
      return { left: "50%", top: "35%" };
    }

    const searchRect = gitSearchElement.getBoundingClientRect();
    const panelWidth = 340; // Width from CSS
    const margin = 30; // Minimum margin between elements

    const viewportWidth = window.innerWidth;
    const maxPanelLeft = viewportWidth - panelWidth - margin;

    // Try to position panel to the right of the search box
    let panelLeft = searchRect.right + margin;

    // Check if it goes off the right edge
    if (panelLeft + panelWidth > viewportWidth - margin) {
      // Position to the left of the search box
      panelLeft = searchRect.left - panelWidth - margin;
    }

    // Ensure panel does not extend beyond viewport
    panelLeft = Math.min(panelLeft, maxPanelLeft);
    panelLeft = Math.max(panelLeft, margin);

    return {
      left: panelLeft + "px",
      top: searchRect.top + "px",
    };
  };

  const calculateSearchPosition = (isShortcut) => {
    if (isShortcut) {
      const marginLeft = 30; // Minimum margin between elements
      const marginTop = 10; // Minimum margin between elements
      const searchWidth = 210; // Width from CSS
      const searchHeight = 50; // Approximate height of the search box

      const viewportWidth = window.innerWidth;
      const canvasHeight = GlobalVariables.canvas.current.height;

      return {
        left: viewportWidth - searchWidth - marginLeft + "px",
        top: canvasHeight - searchHeight - marginTop + "px",
      };
    }

    if (!GlobalVariables.lastClick) {
      return { left: "75%", top: "37%" };
    }

    const clickX = GlobalVariables.lastClick[0];
    const clickY = GlobalVariables.lastClick[1];
    const searchWidth = 210; // Width from CSS
    const margin = 20; // Minimum margin between elements

    const viewportWidth = window.innerWidth;
    const maxLeft = viewportWidth - searchWidth - margin;

    let left = clickX;
    if (left + searchWidth > viewportWidth - margin) {
      left = maxLeft;
    }
    left = Math.max(left, margin);

    return {
      left: left + "px",
      top: clickY + "px",
    };
  };

  const GitList = function () {
    const localAtoms = getFilteredLocalAtoms(debouncedSearchTerm);

    if (isLoading) {
      // Show local atoms even while loading GitHub results
      if (localAtoms.length > 0) {
        const items = localAtoms.map((atom, key) => {
          const isSelected = selectedIndex === key;
          return (
            <li
              key={atom.id}
              className={`local-atom ${isSelected ? "selected" : ""} disabled`}
              title={`Local Atom - ${atom.atomCategory}`}
            >
              {atom.atomType}{" "}
              <span className="atom-category">({atom.atomCategory})</span>
            </li>
          );
        });
        items.push(
          <li key="loading" className="loading-item">
            Loading GitHub results...
          </li>
        );
        return items;
      }
      return <li>Loading...</li>;
    }

    if (isError) {
      // Show local atoms even if GitHub search fails
      if (localAtoms.length > 0) {
        const items = localAtoms.map((atom, key) => {
          const isSelected = selectedIndex === key;
          return (
            <li
              key={atom.id}
              className={`local-atom ${isSelected ? "selected" : ""} disabled`}
              title={`Local Atom - ${atom.atomCategory}`}
            >
              {atom.atomType}{" "}
              <span className="atom-category">({atom.atomCategory})</span>
            </li>
          );
        });
        items.push(
          <li key="error" className="error-item">
            Error loading GitHub results
          </li>
        );
        return items;
      }
      return <li>Error loading data</li>;
    }

    // Combine local atoms with GitHub results
    const combinedResults = [...localAtoms];
    if (data?.repos) {
      combinedResults.push(
        ...data.repos.map((repo) => ({ ...repo, isLocal: false }))
      );
    }

    if (combinedResults.length === 0) {
      return <li>No results found</li>;
    }

    const handleItemClick = (e, item) => {
      e.stopPropagation(); // Prevent event propagation
      if (item.isLocal) {
        placeLocalAtom(e, item.atomType);
      } else {
        placeGitHubMolecule(e, item);
      }
    };

    return combinedResults.map((item, key) => {
      const isSelected = selectedIndex === key;

      if (item.isLocal) {
        return (
          <li
            onClick={(e) => !isLoading && handleItemClick(e, item)}
            key={item.id}
            onMouseEnter={() => handleMouseOver(item, key)}
            onMouseLeave={() => handleMouseOut()}
            className={`local-atom ${isSelected ? "selected" : ""}`}
            title={`Local Atom - ${item.atomCategory}`}
          >
            {item.atomType}{" "}
            <span className="atom-category">({item.atomCategory})</span>
          </li>
        );
      } else {
        return (
          <li
            onClick={(e) => !isLoading && handleItemClick(e, item)}
            key={item.id}
            onMouseEnter={() => handleMouseOver(item, key)}
            onMouseLeave={() => handleMouseOut()}
            className={`github-repo ${isSelected ? "selected" : ""}`}
            title="GitHub Repository"
          >
            {item.repoName}
          </li>
        );
      }
    });
  };

  return (
    <>
      {searchingGitHub ? (
        <div className="search-container">
          <div
            id="git_search"
            style={{
              position: "absolute",
              ...calculateSearchPosition(isShortcut),
            }}
          >
            <input
              type="text"
              id="menuInput"
              autoFocus
              onChange={handleChange}
              onKeyDown={handleKeyDown}
              placeholder="Search for atom.."
              className="menu_search_canvas"
              autoComplete="off"
            ></input>

            <GitList />
          </div>
          {isHovering ? (
            <div
              className="GitProjectInfoPanel"
              style={{
                position: "absolute",
                ...calculatePanelPosition(),
              }}
            >
              <div className="GitInfoLeft">
                <img src={panelItem.svgURL}></img>
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
                    {panelItem.ranking || (panelItem.isLocal ? "Local" : "")}
                  </p>
                </div>
              </div>

              <div className="GitInfo">
                {panelItem.isLocal ? (
                  // Display info for local atoms
                  <>
                    <div>
                      <strong>Atom Type: </strong>
                      <span>{panelItem.atomType}</span>
                    </div>
                    <div>
                      <strong>Category: </strong>
                      <span>{panelItem.atomCategory || "General"}</span>
                    </div>
                    <div>
                      <strong>Source: </strong>
                      <span>Local Atom (Circular Menu)</span>
                    </div>
                    <div>
                      <strong>Description: </strong>
                      <span>Click to place this atom on the canvas</span>
                    </div>
                  </>
                ) : (
                  // Display info for GitHub repos
                  <>
                    <div>
                      <strong>Project Name: </strong>
                      <span>{panelItem.repoName}</span>
                    </div>
                    <div>
                      <strong>Creator: </strong>
                      <span>{panelItem.owner}</span>
                    </div>
                    <div>
                      <strong>Description: </strong>
                      <span>{panelItem.description || null}</span>
                    </div>
                    <div>
                      <strong>Topics: </strong>
                      <span>{panelItem.topics}</span>
                    </div>
                    <div>
                      <strong>Created: </strong>
                      <span>{panelItem.dateCreated}</span>
                    </div>
                  </>
                )}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </>
  );
}

export default GitSearch;
