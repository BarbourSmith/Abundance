import React, { memo, useEffect, useState, useRef } from "react";
import GlobalVariables from "../../js/globalvariables.js";
import Molecule from "../../molecules/molecule.js";
import { createCMenu, cmenu } from "../../js/NewMenu.js";
import { useNavigate } from "react-router-dom";

export default memo(function FlowCanvas({
  loadProject,
  setActiveAtom,
  shortCuts,
  authorizedUserOcto,
  userNotification,
  setUserNotification,
  notificationType = "error",
  setExpandedMenu,
  windowSize,
  redirectType,
  saveProject,
  setSaveState,
  setSavePopUp,
}) {
  /** State for github molecule search input */
  const [isHovering, setIsHovering] = useState(false);
  const [search, setSearch] = useState("");

  /** State for undo notification */
  const [undoNotification, setUndoNotification] = useState(null);
  const [isShortcut, setIsShortcutTriggered] = useState(false);

  const canvasRef = useRef(null);
  const circleMenu = useRef(null);
  const navigate = useNavigate();
  let lastTouchMove = null;
  let longPressTimer = useRef(null);
  let touchStartPos = useRef({ x: 0, y: 0 });
  const canvasHeightScale = 0.45;

  // Double tap detection
  let lastTapTime = useRef(0);
  let lastTapPosition = useRef({ x: 0, y: 0 });
  let doubleTapDelay = 300; // milliseconds
  let doubleTapRadius = 20; // pixel radius for considering taps to be at the same position

  // On component mount create a new top level molecule before project load
  useEffect(() => {
    GlobalVariables.canvas = canvasRef;
    GlobalVariables.c = canvasRef.current.getContext("2d");

    // Check if we need to load a project (first load or different project)
    const needsProjectLoad =
      !GlobalVariables.loadedRepo ||
      GlobalVariables.currentAWSnode.repoName !==
        GlobalVariables.loadedRepo.name;

    if (needsProjectLoad) {
      // Clean up any stale localStorage entries for the previously loaded project
      // This prevents accumulation of saved states when switching between projects
      // Only clean up if we're actually loading a DIFFERENT project
      if (
        GlobalVariables.loadedRepo?.owner?.login &&
        GlobalVariables.loadedRepo?.name &&
        GlobalVariables.loadedRepo.name !==
          GlobalVariables.currentAWSnode.repoName
      ) {
        const previousProjectKey = `unsavedProject_${GlobalVariables.loadedRepo.owner.login}_${GlobalVariables.loadedRepo.name}`;
        localStorage.removeItem(previousProjectKey);
        console.log(
          `Cleared localStorage for previous project: ${previousProjectKey}`,
        );
      }

      GlobalVariables.resetView();
      //Load a blank project
      GlobalVariables.topLevelMolecule = new Molecule({
        x: 0,
        y: 0,
        topLevel: true,
        atomType: "Molecule",
      });
      GlobalVariables.currentMolecule = GlobalVariables.topLevelMolecule;

      /*if you've been redirected after reauthentication*/
      if (
        (redirectType === "save" || redirectType === "reauth") &&
        authorizedUserOcto
      ) {
        // If there's a pending project save in local storage, load it
        const pendingProject = localStorage.getItem("pendingProjectSave");
        if (pendingProject) {
          // Only deserialize after all atoms have been deleted
          let rawFile = JSON.parse(pendingProject);
          // Check if pending project matches current project
          const pendingRepo = rawFile.repoName || rawFile.name;
          const currentRepo = GlobalVariables.currentAWSnode.repoName;
          if (pendingRepo === currentRepo) {
            // Reset ID counter to avoid collisions with existing IDs
            GlobalVariables.resetIdCounter(rawFile);
            let deserializedMolecule;
            async function loadAndDeserialize() {
              deserializedMolecule =
                await GlobalVariables.topLevelMolecule.deserialize(rawFile);
              setActiveAtom(GlobalVariables.currentMolecule);
              GlobalVariables.currentMolecule.selected = true;
              GlobalVariables.currentMolecule =
                GlobalVariables.topLevelMolecule;
              // Only save if project matches
              setSavePopUp(true);
              saveProject(
                setSaveState,
                "auto-save after reauthentication",
              ).then(() => {
                localStorage.removeItem("pendingProjectSave");
                setSavePopUp(false);
              });
            }
            loadAndDeserialize();
          } else {
            // If not matching, clear pending and just load the current project
            console.warn(
              "Pending project does not match current project. Skipping auto-save.",
            );
            localStorage.removeItem("pendingProjectSave");
            loadProject(GlobalVariables.currentAWSnode, authorizedUserOcto);
          }
        } else {
          console.warn("No pending project found in local storage.");
          // If no pending project found, just load the current project
          loadProject(GlobalVariables.currentAWSnode, authorizedUserOcto);
        }
      } else {
        // Check for unsaved project state from browsing projects
        // Note: owner and repoName come from GitHub's API and are validated by GitHub,
        // so they are safe to use in the localStorage key
        const projectKey = `unsavedProject_${GlobalVariables.currentAWSnode.owner}_${GlobalVariables.currentAWSnode.repoName}`;
        const unsavedProject = localStorage.getItem(projectKey);

        if (unsavedProject) {
          console.log("Loading unsaved project state from localStorage...");
          try {
            let rawFile = JSON.parse(unsavedProject);
            // Reset ID counter to avoid collisions with existing IDs
            GlobalVariables.resetIdCounter(rawFile);
            // Deserialize the saved project state
            GlobalVariables.topLevelMolecule.deserialize(rawFile);
            setActiveAtom(GlobalVariables.currentMolecule);
            GlobalVariables.currentMolecule.selected = true;
            GlobalVariables.currentMolecule = GlobalVariables.topLevelMolecule;
            // Clear the unsaved state from localStorage after restoring
            localStorage.removeItem(projectKey);
            // Also load the project metadata from GitHub (without overwriting the molecules)
            if (authorizedUserOcto) {
              const octokit = authorizedUserOcto;
              octokit
                .request("GET /repos/{owner}/{repo}", {
                  owner: GlobalVariables.currentAWSnode.owner,
                  repo: GlobalVariables.currentAWSnode.repoName,
                })
                .then(async (response) => {
                  GlobalVariables.loadedRepo = response.data;
                  GlobalVariables.currentRepo = response.data;
                  GlobalVariables.currentRepoName =
                    GlobalVariables.currentAWSnode.repoName;
                })
                .catch((e) => {
                  console.error("Error loading repo metadata:", e);
                  if (setUserNotification) {
                    setUserNotification(
                      "Error loading project metadata: " + e.message,
                      "error",
                    );
                    setTimeout(() => setUserNotification(null), 5000);
                  }
                });
            }
          } catch (e) {
            console.error("Error restoring unsaved project:", e);
            // If restoration fails, load from GitHub
            loadProject(GlobalVariables.currentAWSnode, authorizedUserOcto);
            localStorage.removeItem(projectKey);
          }
        } else {
          loadProject(GlobalVariables.currentAWSnode, authorizedUserOcto);
        }
      }
    } else {
      // Same project is being accessed again (e.g., after toggling Run/Create mode)
      // Check if there's an unsaved state for this project and clean it up
      const projectKey = `unsavedProject_${GlobalVariables.currentAWSnode.owner}_${GlobalVariables.currentAWSnode.repoName}`;
      const unsavedProject = localStorage.getItem(projectKey);

      if (unsavedProject) {
        console.log(`Cleaning up localStorage for same project: ${projectKey}`);
        // Remove the entry to prevent accumulation
        // We don't restore it because the project is already loaded in memory
        localStorage.removeItem(projectKey);
      }
    }

    GlobalVariables.currentMolecule.nodesOnTheScreen.forEach((atom) => {
      atom.update();
    });
  }, []);

  useEffect(() => {
    if (canvasRef.current && windowSize) {
      canvasRef.current.width = windowSize.width;
      canvasRef.current.height = windowSize.height * canvasHeightScale;
    }
  }, [windowSize]);

  const draw = () => {
    GlobalVariables.c.clearRect(
      0,
      0,
      GlobalVariables.canvas.current.width,
      GlobalVariables.canvas.current.height,
    );

    GlobalVariables.currentMolecule.nodesOnTheScreen.forEach((atom) => {
      atom.update();
    });
  };

  /**
   * Helper function to convert viewport coordinates to canvas-relative coordinates
   * This is necessary because when the on-screen keyboard appears, the page can scroll
   * and touch coordinates (clientX/clientY) are relative to the viewport, not the canvas
   */
  const getCanvasCoordinates = (clientX, clientY) => {
    if (!canvasRef.current) {
      return { x: clientX, y: clientY };
    }
    // Trigger layout reflow to ensure getBoundingClientRect returns current values
    void canvasRef.current.offsetHeight;

    const rect = canvasRef.current.getBoundingClientRect();
    return {
      x: clientX - rect.left,
      y: clientY - rect.top,
    };
  };

  const mouseMove = (e) => {
    if (e.touches && e.touches.length > 0) {
      // Set touchInterface flag to true when touch is detected
      GlobalVariables.touchInterface = true;

      lastTouchMove = e;
      e.clientX = e.touches[0].clientX;
      e.clientY = e.touches[0].clientY;

      // Cancel long press if finger moved significantly (more than 10 pixels)
      if (longPressTimer.current && touchStartPos.current) {
        const moveDistance = Math.sqrt(
          Math.pow(e.clientX - touchStartPos.current.x, 2) +
            Math.pow(e.clientY - touchStartPos.current.y, 2),
        );

        if (moveDistance > 10) {
          clearTimeout(longPressTimer.current);
          longPressTimer.current = null;
        }
      }
    }

    // Skip if clientX/Y are not defined (can happen when touchend fires with no coordinates)
    if (e.clientX === undefined || e.clientY === undefined) {
      return;
    }

    // Convert viewport coordinates to canvas-relative coordinates
    const canvasCoords = getCanvasCoordinates(e.clientX, e.clientY);

    GlobalVariables.currentMolecule.nodesOnTheScreen.forEach((molecule) => {
      molecule.mouseMove(canvasCoords.x, canvasCoords.y);
    });
  };

  /* Paste function to handle atom and connector pasting logic */
  const Paste = () => {
    // Deselect all currently selected atoms before pasting
    GlobalVariables.currentMolecule.nodesOnTheScreen.forEach((atom) => {
      atom.selected = false;
    });

    // If we have connectors to paste, handle the full molecule structure
    if (
      GlobalVariables.connectorsSelected &&
      GlobalVariables.connectorsSelected.length > 0
    ) {
      // Create a temporary molecule data structure
      const moleculeData = {
        allAtoms: GlobalVariables.atomsSelected,
        allConnectors: GlobalVariables.connectorsSelected,
        fileTypeVersion: 1,
      };

      // Remap IDs to avoid conflicts
      const remappedData =
        GlobalVariables.currentMolecule.remapIDs(moleculeData);

      // Place atoms first
      const atomPromises = [];
      if (remappedData?.allAtoms) {
        remappedData.allAtoms.forEach((atomData) => {
          const promise = GlobalVariables.currentMolecule.placeAtom(
            atomData,
            true,
            undefined,
            true, // skipAutoConnect = true for paste operations
          );
          atomPromises.push(promise);
        });
      }

      // Wait for all atoms to be placed, then place connectors
      Promise.all(atomPromises).then(() => {
        if (remappedData?.allConnectors) {
          remappedData.allConnectors.forEach((connectorData) => {
            GlobalVariables.currentMolecule.placeConnector(connectorData);
          });
        }
      });
    } else {
      // Regular paste without connectors
      GlobalVariables.atomsSelected.forEach((item) => {
        if (item.atomType == "Molecule" || item.atomType == "GitHubMolecule") {
          // For regular molecules, use comprehensive ID remapping that handles nested atoms
          item = GlobalVariables.currentMolecule.remapIDs(item);
          GlobalVariables.currentMolecule.placeAtom(
            item,
            true,
            undefined,
            true,
          ); // skipAutoConnect = true for paste
        } else {
          // For simple atoms, just assign a new unique ID
          item.uniqueID = GlobalVariables.generateUniqueID();
          GlobalVariables.currentMolecule.placeAtom(
            item,
            true,
            undefined,
            true,
          ); // skipAutoConnect = true for paste
        }
      });
    }
  };

  const keyDown = async (e) => {
    if (e.key == "Backspace" || e.key == "Delete") {
      e.stopPropagation();
      /* Save undo state before deletion */
      GlobalVariables.saveUndoState("DELETE", "Deleted selected atoms");

      GlobalVariables.atomsSelected = [];
      //Adds items to the  array that we will use to delete
      GlobalVariables.currentMolecule.copy();
      GlobalVariables.atomsSelected.forEach((item) => {
        GlobalVariables.currentMolecule.nodesOnTheScreen.forEach(
          (nodeOnTheScreen) => {
            if (nodeOnTheScreen.uniqueID == item.uniqueID) {
              nodeOnTheScreen.deleteNode();
            }
          },
        );
      });
      //every time a key is pressed
      GlobalVariables.currentMolecule.nodesOnTheScreen.forEach((molecule) => {
        molecule.keyPress(e.key);
      });
      setActiveAtom(GlobalVariables.currentMolecule);
    }

    if (GlobalVariables.ctrlDown && shortCuts.hasOwnProperty([e.key])) {
      e.preventDefault();
      // Undo
      if (e.key == "z") {
        // Get operation info before undo (it gets popped during undo)
        const operationInfo =
          GlobalVariables.undoOperationHistory.length > 0
            ? GlobalVariables.undoOperationHistory[
                GlobalVariables.undoOperationHistory.length - 1
              ]
            : null;

        const hadUndoHistory =
          GlobalVariables.recentMoleculeRepresentation.length > 0;

        await GlobalVariables.currentMolecule.undo();

        // Show notification based on what was undone
        if (hadUndoHistory && operationInfo) {
          setUndoNotification(
            `Undone: ${operationInfo.context || operationInfo.type}`,
          );
        } else if (hadUndoHistory) {
          setUndoNotification("Undone: Previous action");
        } else {
          setUndoNotification("No action to undo");
        }

        // Auto-dismiss notification after 3 seconds
        setTimeout(() => setUndoNotification(null), 3000);
      }
      //Copy & Paste
      else if (e.key == "c") {
        GlobalVariables.atomsSelected = [];
        GlobalVariables.connectorsSelected = [];
        // Ctrl+C: Enhanced copy with connectors
        GlobalVariables.currentMolecule.copyWithConnectors();
      } else if (e.key == "v") {
        Paste();
      }

      // Move selected atoms to new molecule with connectors
      else if (e.key == "m") {
        GlobalVariables.currentMolecule.moveSelectedAtomsToMolecule();
      }
      //Opens menu to search for github molecule
      else if (e.key == "g") {
        setExpandedMenu("git-search");
        setIsShortcutTriggered(true); // Set the shortcut flag
        GlobalVariables.ctrlDown = false;
      } else {
        GlobalVariables.currentMolecule.placeAtom(
          {
            parentMolecule: GlobalVariables.currentMolecule,
            x: 0.5,
            y: 0.5,
            parent: GlobalVariables.currentMolecule,
            atomType: `${shortCuts[e.key]}`,
            uniqueID: GlobalVariables.generateUniqueID(),
          },
          true,
        );
      }
    }
  };

  const keyUp = (e) => {
    if (e.key == "Shift") {
      GlobalVariables.shiftDown = false;
    }
  };

  /**
   * Called by mouse down
   */
  const onMouseDown = (event) => {
    // Clear any existing long press timer
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }

    if (event.touches) {
      // Set touchInterface flag to true when touch is detected
      GlobalVariables.touchInterface = true;

      // Store the initial touch position
      touchStartPos.current = {
        x: event.touches[0].clientX,
        y: event.touches[0].clientY,
      };

      // Set clientX/Y for event handling
      event.clientX = event.touches[0].clientX;
      event.clientY = event.touches[0].clientY;

      // Double tap detection
      const currentTime = new Date().getTime();
      const tapTimeDiff = currentTime - lastTapTime.current;

      // Check if this tap is within time and distance thresholds of last tap
      if (tapTimeDiff < doubleTapDelay) {
        // Calculate distance between current tap and last tap
        const tapDistance = Math.sqrt(
          Math.pow(event.clientX - lastTapPosition.current.x, 2) +
            Math.pow(event.clientY - lastTapPosition.current.y, 2),
        );

        // If within radius, consider it a double tap
        if (tapDistance < doubleTapRadius) {
          // This is a double tap
          onDoubleClick(event);
          lastTapTime.current = 0; // Reset the timer
          return;
        }
      }

      // Save this tap's time and position for potential double tap detection
      lastTapTime.current = currentTime;
      lastTapPosition.current = { x: event.clientX, y: event.clientY };

      // Start a long press timer for touch events (700ms is a common duration for long press)
      longPressTimer.current = setTimeout(() => {
        // When timer completes, show the circular menu at touch position
        // Convert viewport coordinates to canvas-relative coordinates for correct positioning
        const canvasCoords = getCanvasCoordinates(
          touchStartPos.current.x,
          touchStartPos.current.y,
        );
        cmenu.show([canvasCoords.x, canvasCoords.y], false);
        longPressTimer.current = null;
      }, 500);
    } else {
      // For mouse events, don't start a long press timer
      longPressTimer.current = null;
    }

    // if it's a right click show the circular menu
    var isRightMB;
    if ("which" in event) {
      // Gecko (Firefox), WebKit (Safari/Chrome) & Opera
      isRightMB = event.which == 3;
    } else if ("button" in event) {
      // IE, Opera
      isRightMB = event.button == 2;
    }
    // if it's a right click show the circular menu
    if (isRightMB) {
      var doubleClick = false;
      // Convert viewport coordinates to canvas-relative coordinates for correct positioning
      const canvasCoords = getCanvasCoordinates(event.clientX, event.clientY);
      cmenu.show([canvasCoords.x, canvasCoords.y], doubleClick);
      return;
    } else {
      cmenu.hide();

      setIsShortcutTriggered(false);
      setIsHovering(false);
      setSearch("");

      // Convert viewport coordinates to canvas-relative coordinates
      const canvasCoords = getCanvasCoordinates(event.clientX, event.clientY);

      var clickHandledByMolecule = false;
      var activeAtom = null;
      /*Run through all the atoms on the screen and decide if one was clicked*/
      // Iterate in reverse order to give priority to newer atoms
      for (
        let i = GlobalVariables.currentMolecule.nodesOnTheScreen.length - 1;
        i >= 0;
        i--
      ) {
        const molecule = GlobalVariables.currentMolecule.nodesOnTheScreen[i];
        let atomClicked;

        atomClicked = molecule.clickDown(
          canvasCoords.x,
          canvasCoords.y,
          clickHandledByMolecule,
        );
        if (atomClicked !== undefined && !clickHandledByMolecule) {
          activeAtom = atomClicked;
          /* Clicked atom is now the active atom */
          GlobalVariables.currentMolecule.selected = false;
          clickHandledByMolecule = true;
        }
      }

      // Set the active atom after all atoms have been processed
      if (activeAtom) {
        /* If it's an unloaded GitHub molecule, show GitHub search menu otherwise show params */
        if (
          activeAtom.atomType == "GitHubMolecule" &&
          activeAtom.parentRepo == null
        ) {
          // Show GitHub-specific options
          setExpandedMenu("git-search");
        } else {
          setExpandedMenu("params");
        }
        setActiveAtom(activeAtom);
      }
      //
      //Draw the selection box
      if (!clickHandledByMolecule && GlobalVariables.ctrlDown) {
        GlobalVariables.currentMolecule
          .placeAtom(
            {
              parentMolecule: GlobalVariables.currentMolecule,
              x: GlobalVariables.pixelsToWidth(canvasCoords.x),
              y: GlobalVariables.pixelsToHeight(canvasCoords.y),
              parent: GlobalVariables.currentMolecule,
              name: "Box",
              atomType: "Box",
            },
            false, // Don't pass to undo
          )
          .then((newAtom) => {
            console.log("Box atom placed:", newAtom);
          });
      }

      if (!clickHandledByMolecule) {
        /* Background click - molecule is active atom */
        setActiveAtom(GlobalVariables.currentMolecule);
        setExpandedMenu("params");
        GlobalVariables.currentMolecule.selected = true;
        GlobalVariables.currentMolecule.sendToRender();
      }
    }
  };

  /*Handles click on a molecule - go down level*/
  const onDoubleClick = (event) => {
    // Cancel long press timer on double click
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }

    // Handle touch events
    if (event.touches && event.touches.length > 0) {
      event.clientX = event.touches[0].clientX;
      event.clientY = event.touches[0].clientY;
    } else if (event.changedTouches && event.changedTouches.length > 0) {
      event.clientX = event.changedTouches[0].clientX;
      event.clientY = event.changedTouches[0].clientY;
    }

    // Convert viewport coordinates to canvas-relative coordinates
    const canvasCoords = getCanvasCoordinates(event.clientX, event.clientY);

    // Iterate in reverse order to give priority to newer atoms
    for (
      let i = GlobalVariables.currentMolecule.nodesOnTheScreen.length - 1;
      i >= 0;
      i--
    ) {
      const molecule = GlobalVariables.currentMolecule.nodesOnTheScreen[i];
      const handled = molecule?.doubleClick(canvasCoords.x, canvasCoords.y);
    }
  };

  /**
   * Called by mouse up
   */
  const onMouseUp = (event) => {
    // Clear long press timer when touch ends
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }

    if (
      lastTouchMove &&
      lastTouchMove.touches &&
      lastTouchMove.touches.length > 0
    ) {
      event.clientX = lastTouchMove.touches[0].clientX;
      event.clientY = lastTouchMove.touches[0].clientY;
    } else if (event.changedTouches && event.changedTouches.length > 0) {
      // For touchend events, touches array is empty, but changedTouches contains the touch that ended
      event.clientX = event.changedTouches[0].clientX;
      event.clientY = event.changedTouches[0].clientY;
    }

    // If no coordinates were set, skip further processing
    if (event.clientX === undefined || event.clientY === undefined) {
      return;
    }

    // Convert viewport coordinates to canvas-relative coordinates
    const canvasCoords = getCanvasCoordinates(event.clientX, event.clientY);

    //every time the mouse button goes up
    GlobalVariables.currentMolecule.nodesOnTheScreen.forEach((molecule) => {
      molecule.clickUp(canvasCoords.x, canvasCoords.y);
    });
    GlobalVariables.currentMolecule.clickUp(canvasCoords.x, canvasCoords.y);
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas.getContext("2d");
    let frameCount = 0;
    let animationFrameId;
    //Our draw came here
    const render = () => {
      frameCount++;
      draw(context, frameCount);
      animationFrameId = window.requestAnimationFrame(render);
    };
    render();

    return () => {
      window.cancelAnimationFrame(animationFrameId);
    };
  }, [draw]);

  useEffect(() => {
    createCMenu(circleMenu, setExpandedMenu, shortCuts);
  }, []);

  const getMoleculeDisplayName = (mol) =>
    mol.topLevel && GlobalVariables.currentAWSnode?.repoName
      ? GlobalVariables.currentAWSnode.repoName
      : mol.name;

  let parentLinkPath = [];
  if (GlobalVariables.currentMolecule) {
    parentLinkPath.unshift(
      getMoleculeDisplayName(GlobalVariables.currentMolecule),
    );
    let currentParent = GlobalVariables.currentMolecule.parent;
    while (currentParent) {
      parentLinkPath.unshift(getMoleculeDisplayName(currentParent));
      currentParent = currentParent.parent ? currentParent.parent : null;
    }
  }

  return (
    <>
      <canvas
        ref={canvasRef}
        id="flow-canvas"
        tabIndex={0}
        style={{
          width: windowSize?.width || 0,
          height: (windowSize?.height || 0) * canvasHeightScale,
        }}
        onMouseMove={mouseMove}
        onTouchMove={mouseMove}
        onTouchStart={onMouseDown}
        onMouseDown={onMouseDown}
        onMouseUp={onMouseUp}
        onTouchEnd={onMouseUp}
        onTouchCancel={onMouseUp}
        onDoubleClick={onDoubleClick}
        onKeyUp={keyUp}
        onKeyDown={keyDown}
      ></canvas>
      <div
        id="molecule-path-link-div"
        style={{
          position: "absolute",
          display: "inline",
          zIndex: "5",
          top: "20px",
          left: "55px",
          color: "var(---flowCanvas-background)",
        }}
      >
        {parentLinkPath.map((item, index) => {
          return (
            <a
              className="repo-name-path"
              key={"repo-name-path" + index}
              onClick={() => {
                while (
                  GlobalVariables.currentMolecule &&
                  !GlobalVariables.currentMolecule.topLevel &&
                  GlobalVariables.currentMolecule.name !== item
                ) {
                  GlobalVariables.currentMolecule.goToParentMolecule(item);
                  setActiveAtom(GlobalVariables.currentMolecule);
                }
              }}
            >
              &nbsp; {item} /
            </a>
          );
        })}
      </div>
      <div>
        <div id="circle-menu1" className="cn-menu1" ref={circleMenu}></div>
      </div>

      {/* Undo notification */}
      {undoNotification && (
        <div className="undo-notification">{undoNotification}</div>
      )}

      {/* User notification */}
      {userNotification && (
        <div className={`${notificationType}-notification`}>
          {userNotification}
        </div>
      )}
    </>
  );
});
