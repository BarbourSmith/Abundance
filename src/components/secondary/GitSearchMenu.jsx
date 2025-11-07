import { useEffect, useState, useMemo } from "react";
import { SimpleControlPanel } from "./SimpleControlPanel";
import { useControls } from "../../hooks/useControls";
import GlobalVariables from "../../js/globalvariables";
import { useQuery } from "react-query";
import useDebounce from "../../hooks/useDebounce.js";

export default function GitSearchMenu({
  activeAtom,
  id,
  contentCollapsed,
  setContentCollapsed,
  setParamsMenuExpanded,
  position,
  collapsedOffset,
  gitRef,
  setErrorNotification,
  closeMenu,
}) {
  const [inputChanged, setInputChanged] = useState("");
  const [inputValue, setInputValue] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [panelItem, setPanelItem] = useState({});
  const [isHovering, setIsHovering] = useState(false);
  const [yearShow, setYearShow] = useState("2024");
  const [lastKey, setLastKey] = useState("");

  const debouncedSearchTerm = useDebounce(inputValue, 200);

  const handleSearchBarValueChange = function (value) {
    setInputValue(value.toLowerCase());
  };

  let lastKeyQuery = lastKey
    ? "&lastKey=" + lastKey.repoName + "~" + lastKey.owner
    : "&lastKey";

  let searchQuery;
  if (debouncedSearchTerm != "") {
    searchQuery = "&query=" + debouncedSearchTerm + "&yearShow=" + yearShow;
  } else {
    searchQuery = "&query" + "&yearShow=" + yearShow;
  }

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

  /**
   * Runs when a menu option is clicked to place a new atom from searching on GitHub.
   * @param {object} ev - The event triggered by clicking on a menu item.
   */
  function placeGitHubMolecule(e, item, position) {
    GlobalVariables.currentMolecule
      .loadGithubMoleculeByName(item, {}, [], position)
      .catch(() => {
        setErrorNotification(`Error: Project Missing`);
        // Auto-dismiss notification after 3 seconds
        setTimeout(() => setErrorNotification(null), 3000);
      });
    //setIsShortcutTriggered(false);
    setInputValue("");
    setIsHovering(false);
    setParamsMenuExpanded();
  }
  /**
   * Runs when a local atom option is clicked to place a new atom from the circular menu atoms.
   * @param {object} ev - The event triggered by clicking on a menu item.
   * @param {string} atomType - The type of atom to place.
   */
  function placeLocalAtom(e, atomType, position) {
    GlobalVariables.currentMolecule.placeAtom(
      {
        x: position.x
          ? position.x
          : GlobalVariables.pixelsToWidth(window.innerWidth * 0.75),
        y: position.y
          ? position.y
          : GlobalVariables.pixelsToHeight(window.innerHeight * 0.37),
        parent: GlobalVariables.currentMolecule,
        atomType: atomType,
        uniqueID: GlobalVariables.generateUniqueID(),
      },
      true
    );

    setInputValue("");
    //setIsShortcutTriggered(false);
    setIsHovering(false);
    setParamsMenuExpanded();
  }
  const handleMouseOver = (item, key) => {
    setPanelItem(item);
    setIsHovering(true);
  };
  const handleMouseOut = () => {
    setPanelItem({});
    setIsHovering(false);
  };

  let getGitListItems = () => {
    const localAtoms = getFilteredLocalAtoms(debouncedSearchTerm);

    if (isLoading || isError) {
      // Show local atoms even while loading GitHub results
      const items = [...localAtoms];

      // Add loading or error indicator
      if (isLoading && debouncedSearchTerm) {
        items.push({
          id: "loading-indicator",
          isLoading: true,
          message: "Searching GitHub molecules...",
        });
      } else if (isError && debouncedSearchTerm) {
        items.push({
          id: "error-indicator",
          isError: true,
          message: "Error loading GitHub results",
        });
      }

      if (items.length > 0) {
        return {
          type: "list",
          value: items,
          label: localAtoms.length > 0 ? "Local Results" : "",
          order: 1,
          itemRenderer: (item, idx) => {
            const isSelected = selectedIndex === idx;

            // Render loading indicator
            if (item.isLoading) {
              return (
                <div
                  key={item.id}
                  className="loading-item"
                  title="Searching for GitHub molecules"
                >
                  {item.message}
                </div>
              );
            }

            // Render error indicator
            if (item.isError) {
              return (
                <div
                  key={item.id}
                  className="error-item"
                  title="Failed to load GitHub results"
                >
                  {item.message}
                </div>
              );
            }

            // Render local atom
            return (
              <div
                key={item.id}
                className={`local-atom ${
                  isSelected ? "selected" : ""
                } disabled`}
                title={`Local Atom - ${item.atomCategory}`}
              >
                {item.atomType}{" "}
                <span className="atom-category">({item.atomCategory})</span>
              </div>
            );
          },
        };
      }
    }
    // Combine local atoms with GitHub results
    const combinedResults = [...localAtoms];
    if (data?.repos) {
      // Sort GitHub repos by ranking (descending, higher is better)
      const sortedRepos = [...data.repos].sort((a, b) => {
        // If ranking is missing, treat as 0
        const rankA = typeof a.ranking === "number" ? a.ranking : 0;
        const rankB = typeof b.ranking === "number" ? b.ranking : 0;
        return rankB - rankA;
      });
      combinedResults.push(
        ...sortedRepos.map((repo) => ({ ...repo, isLocal: false }))
      );
    }

    // Show "no results found" message if search completed with no results
    if (
      combinedResults.length === 0 &&
      debouncedSearchTerm &&
      !isLoading &&
      !isError
    ) {
      return {
        type: "list",
        value: [
          {
            id: "no-results-indicator",
            isNoResults: true,
            message: "No projects found",
          },
        ],
        order: 1,
        itemRenderer: (item, idx) => {
          return (
            <div
              key={item.id}
              className="loading-item"
              title="No GitHub molecules found for this search"
            >
              {item.message}
            </div>
          );
        },
      };
    }

    if (combinedResults.length === 0) {
      return {};
    }

    return {
      type: "list",
      value: [...combinedResults],

      order: 2,
      onItemClick: (item) => {
        handleItemClick(null, item);
      },
      onItemMouseOver: (item) => {
        // Don't show info panel for loading, error, or no results indicators
        if (!item.isLoading && !item.isError && !item.isNoResults) {
          handleMouseOver(item);
        }
      },
      onItemMouseOut: () => {
        handleMouseOut();
      },
      onItemKeyDown: (item, idx, event) => {
        console.log("Key Down Event on Item:", item, "Event:", event);
        if (event.key === "Enter") {
          handleItemClick(event, item);
        }
      },
      itemRenderer: (item, idx) => {
        const isSelected = false; //selectedIndex === idx;
        if (item.isLocal) {
          return (
            <div
              key={item.id}
              className={`local-atom ${isSelected ? "selected" : ""}`}
              title={`Local Atom - ${item.atomCategory}`}
              style={{
                borderLeft: "3px solid var(--abundance-color-brightPurple)",
                backgroundColor: "rgba(124, 77, 255, 0.1)",
                paddingLeft: "5px",
              }}
            >
              {item.atomType}{" "}
              <span className="atom-category">({item.atomCategory})</span>
            </div>
          );
        } else {
          return (
            <div
              key={item.id}
              className={`github-repo ${isSelected ? "selected" : ""}`}
              title="GitHub Repository"
            >
              {item.repoName}
            </div>
          );
        }
      },
    };
  };
  const gitList = useMemo(() => {
    return getGitListItems();
  }, [data, debouncedSearchTerm]);

  const handleItemClick = (e, item) => {
    e?.stopPropagation(); // Prevent event propagation

    // Don't handle clicks on loading, error, or no results indicators
    if (item.isLoading || item.isError || item.isNoResults) {
      return;
    }
    setIsHovering(false);
    let position;
    if (
      activeAtom &&
      activeAtom.atomType == "GitHubMolecule" &&
      !activeAtom.parentRepo
    ) {
      console.log(activeAtom);
      position = { x: activeAtom.x, y: activeAtom.y };
      activeAtom.deleteNode();
    }
    if (item.isLocal) {
      placeLocalAtom(e, item.atomType, position);
    } else {
      placeGitHubMolecule(e, item, position);
    }
  };

  /**
   * Get the icon path for a local atom based on its type
   * @param {string} atomType - The type of the atom (e.g., "Circle", "Rectangle")
   * @returns {string} Path to the icon image
   */
  function getLocalAtomIconPath(atomType) {
    // Map atom types to their corresponding image files
    const iconMap = {
      Circle: "/imgs/circle.png",
      Rectangle: "/imgs/rectangle.png",
      RegularPolygon: "/imgs/RegularPolygon.png",
      Text: "/imgs/text.png",
      Assembly: "/imgs/Assembly.png",
      Fusion: "/imgs/fusion.png",
      Intersection: "/imgs/intersection.png",
      Difference: "/imgs/difference.png",
      ShrinkWrap: "/imgs/shrinkwrap.png",
      Loft: "/imgs/loft.png",
      Extrude: "/imgs/extrude.png",
      Move: "/imgs/move.png",
      Rotate: "/imgs/Rotate.png",
      Constant: "/imgs/Constant.png",
      Equation: "/imgs/Equation.png",
      Input: "/imgs/Input.png",
      Code: "/imgs/code.png",
      Gcode: "/imgs/gcode.png",
      Molecule: "/imgs/molecule.png",
      GitHubMolecule: "/imgs/githubmolecule.png",
      Import: "/imgs/Import_menu.svg",
      Export: "/imgs/Export_menu.svg",
      Tag: "/imgs/tag.png",
      "Add-BOM-Tag": "/imgs/Bom.png",
      Readme: "/imgs/readme.png",
      Color: "/imgs/Color.png",
      ExtractTag: "/imgs/extracttag.png",
      CutLayout: "/imgs/cutlayout.png",
      GeneticAlgorithm: "/imgs/genetic.svg",
    };

    // Return the icon path or a default thumbnail
    return iconMap[atomType] || "/imgs/defaultThumbnail.svg";
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
          iconPath: getLocalAtomIconPath(atom.atomType),
        });
      }
    }
    return filteredAtoms;
  }

  let gitParams = {
    gitsearch: {
      type: "string",
      value: inputValue,
      placeholder: "Search for GitHub Molecules",
      order: 1,
      onChange: (value) => {
        handleSearchBarValueChange(value);
      },
    },
    gitList: gitList,
  };
  const [
    values,
    setControlValue,
    { controls, registerControl, removeControl },
  ] = useControls(gitParams, [inputChanged, gitList]);

  const screenHeight = window.innerHeight;

  // GitHub logo icon, scaled for 20x20 viewBox
  const GitHubIcon = ({ size = 14 }) => (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <g transform="scale(0.0083, -0.0083) translate(0, -2400)">
        <path
          d="M970 2301 c-305 -68 -555 -237 -727 -493 -301 -451 -241 -1056 143-1442 115 -116 290 -228 422 -271 49 -16 55 -16 77 -1 24 16 25 20 25 135 l0 118 -88 -5 c-103 -5 -183 13 -231 54 -17 14 -50 62 -73 106 -38 74 -66 108-144 177 -26 23 -27 24 -9 37 43 32 130 1 185 -65 96 -117 133 -148 188 -160 49 -10 94 -6 162 14 9 3 21 24 27 48 6 23 22 58 35 77 l24 35 -81 16 c-170 35-275 96-344 200 -64 96-85 179-86 334 0 146 16 206 79 288 28 36 31 47 23 68 -15 36 -11 188 5 234 13 34 20 40 47 43 45 5 129 -24 214 -72 l73 -42 64 15 c91 21 364 20 446 0 l62 -16 58 35 c77 46 175 82 224 82 39 0 39 -1 55 -52 17 -59 20 -166 5 -217 -8 -30 -6 -39 16 -68 109 -144 121 -383 29 -579 -62-129 -193-219 -369-252 l-84 -16 31 -55 32 -56 3 -223 4 -223 25 -16 c23-15 28-15 76 2 80 27 217 101 292 158 446 334 590 933 343 1431 -145 293-419 518-733 602 -137 36 -395 44 -525 15z"
          fill="var(--control-text-muted)"
        />
      </g>
    </svg>
  );

  return (
    <>
      <div>
        <SimpleControlPanel
          controls={controls}
          id={id}
          position={position || { top: screenHeight / 2 - 10, left: 55 }}
          title={"Github Molecule Search"}
          initialCollapsed={true}
          minWidth={280}
          maxHeight={350}
          collapsedIcon={GitHubIcon}
          collapsedOffset={collapsedOffset} // shifts expanded panel by 45px right, 45px down
          contentCollapsed={contentCollapsed}
          setContentCollapsed={setContentCollapsed}
          ref={gitRef}
          closeMenu={closeMenu}
        />
      </div>
      {isHovering ? (
        <div
          className="GitProjectInfoPanel"
          height={screenHeight / 2}
          style={{
            position: "absolute",
            top: position?.top - 85 || 0,
            left: position?.left + 350 || 0,
          }}
        >
          <div className="GitInfoLeft">
            <img
              src={panelItem.isLocal ? panelItem.iconPath : panelItem.svgURL}
              onError={({ currentTarget }) => {
                currentTarget.onerror = null; // prevents looping
                currentTarget.src = "/imgs/defaultThumbnail.svg";
              }}
              alt={panelItem.isLocal ? panelItem.atomType : panelItem.repoName}
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
    </>
  );
}
