import React, { memo, useEffect, useState, useRef } from "react";
import GlobalVariables from "../../js/globalvariables.js";
import Molecule from "../../molecules/molecule.js";
import { createCMenu, cmenu } from "../../js/NewMenu.js";
import GitSearch from "../secondary/GitSearch.jsx";
import { useNavigate } from "react-router-dom";

function onWindowResize() {
  const flowCanvas = document.getElementById("flow-canvas");
  if (GlobalVariables.isMobile()) {
    flowCanvas.width = window.screen.width;
    flowCanvas.height = window.screen.height * 0.45;
  } else {
    flowCanvas.width = window.innerWidth;
    flowCanvas.height = window.innerHeight * 0.45;
  }
}

window.addEventListener(
  "resize",
  () => {
    onWindowResize();
  },
  false
);

export default memo(function FlowCanvas({
  loadProject,
  setActiveAtom,
  shortCuts,
  authorizedUserOcto,
}) {
  /** State for github molecule search input */
  const [searchingGitHub, setSearchingGitHub] = useState(false);
  const [isHovering, setIsHovering] = useState(false);
  const [search, setSearch] = useState("");

  const canvasRef = useRef(null);
  const circleMenu = useRef(null);
  const navigate = useNavigate();
  let lastTouchMove = null;
  let longPressTimer = useRef(null);
  let touchStartPos = useRef({ x: 0, y: 0 });

  // Double tap detection
  let lastTapTime = useRef(0);
  let lastTapPosition = useRef({ x: 0, y: 0 });
  let doubleTapDelay = 300; // milliseconds
  let doubleTapRadius = 20; // pixel radius for considering taps to be at the same position

  // On component mount create a new top level molecule before project load
  useEffect(() => {
    GlobalVariables.canvas = canvasRef;
    GlobalVariables.c = canvasRef.current.getContext("2d");
    /** Only run loadproject() if the project is different from what is already loaded  */
    if (
      !GlobalVariables.loadedRepo ||
      GlobalVariables.currentRepo.repoName !==
        GlobalVariables.loadedRepo.repoName
    ) {
      GlobalVariables.writeToDisplay(
        GlobalVariables.currentRepo.topMoleculeID,
        true
      );
      //Load a blank project
      GlobalVariables.topLevelMolecule = new Molecule({
        x: 0,
        y: 0,
        topLevel: true,
        atomType: "Molecule",
      });
      GlobalVariables.currentMolecule = GlobalVariables.topLevelMolecule;

      loadProject(GlobalVariables.currentRepo, authorizedUserOcto).catch(
        (error) => {
          navigate("/");
        }
      );
    }
    GlobalVariables.currentMolecule.nodesOnTheScreen.forEach((atom) => {
      atom.update();
    });
  }, []);

  const draw = () => {
    GlobalVariables.c.clearRect(
      0,
      0,
      GlobalVariables.canvas.current.width,
      GlobalVariables.canvas.current.height
    );

    GlobalVariables.currentMolecule.nodesOnTheScreen.forEach((atom) => {
      atom.update();
    });
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
            Math.pow(e.clientY - touchStartPos.current.y, 2)
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

    GlobalVariables.currentMolecule.nodesOnTheScreen.forEach((molecule) => {
      molecule.mouseMove(e.clientX, e.clientY);
    });
  };

  const keyDown = (e) => {
    //Prevents default behavior of the browser on canvas to allow for copy/paste/delete
    // if(e.srcElement.tagName.toLowerCase() !== ("textarea")
    //     && e.srcElement.tagName.toLowerCase() !== ("input")
    //     &&(!e.srcElement.isContentEditable)
    //     && ['c','v','Backspace'].includes(e.key)){
    //     e.preventDefault()
    // }

    if (e.key == "Backspace" || e.key == "Delete") {
      /* Copy the top level molecule to the recently deleted atoms for undo */
      const topLevelMoleculeCopy = JSON.stringify(
        GlobalVariables.topLevelMolecule.serialize(),
        null,
        4
      );

      GlobalVariables.recentMoleculeRepresentation.push(topLevelMoleculeCopy);
      //max the number of backups at 5
      if (GlobalVariables.recentMoleculeRepresentation.length > 5) {
        GlobalVariables.recentMoleculeRepresentation.shift();
      }

      GlobalVariables.atomsSelected = [];
      //Adds items to the  array that we will use to delete
      GlobalVariables.currentMolecule.copy();
      GlobalVariables.atomsSelected.forEach((item) => {
        GlobalVariables.currentMolecule.nodesOnTheScreen.forEach(
          (nodeOnTheScreen) => {
            if (nodeOnTheScreen.uniqueID == item.uniqueID) {
              nodeOnTheScreen.deleteNode();
            }
          }
        );
      });
    }

    //Copy /paste listeners
    if (e.key == "Control" || e.key == "Meta") {
      GlobalVariables.ctrlDown = true;
    }

    if (GlobalVariables.ctrlDown && shortCuts.hasOwnProperty([e.key])) {
      e.preventDefault();
      //Undo
      if (e.key == "z") {
        GlobalVariables.currentMolecule.undo();
      }
      //Copy & Paste
      if (e.key == "c") {
        GlobalVariables.atomsSelected = [];
        GlobalVariables.currentMolecule.copy();
      }
      if (e.key == "v") {
        GlobalVariables.atomsSelected.forEach((item) => {
          let newAtomID = GlobalVariables.generateUniqueID();
          item.uniqueID = newAtomID;
          if (
            item.atomType == "Molecule" ||
            item.atomType == "GitHubMolecule"
          ) {
            item = GlobalVariables.currentMolecule.remapIDs(item);
          }
          GlobalVariables.currentMolecule.placeAtom(item, true);
        });
      }

      //Opens menu to search for github molecule
      if (e.key == "g") {
        setSearchingGitHub(true);
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
          true
        );
      }
    }
    //every time a key is pressed
    GlobalVariables.currentMolecule.nodesOnTheScreen.forEach((molecule) => {
      molecule.keyPress(e.key);
    });
  };

  const keyUp = (e) => {
    if (e.key == "Control" || e.key == "Meta") {
      GlobalVariables.ctrlDown = false;
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
            Math.pow(event.clientY - lastTapPosition.current.y, 2)
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
        cmenu.show([touchStartPos.current.x, touchStartPos.current.y], false);
        longPressTimer.current = null;
      }, 700);
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
      cmenu.show([event.clientX, event.clientY], doubleClick);
      return;
    } else {
      cmenu.hide();
      setSearchingGitHub(false);
      setIsHovering(false);
      setSearch("");

      var clickHandledByMolecule = false;
      /*Run through all the atoms on the screen and decide if one was clicked*/
      // Iterate in reverse order to give priority to newer atoms
      for (let i = GlobalVariables.currentMolecule.nodesOnTheScreen.length - 1; i >= 0; i--) {
        const molecule = GlobalVariables.currentMolecule.nodesOnTheScreen[i];
        let atomClicked;

        atomClicked = molecule.clickDown(
          event.clientX,
          event.clientY,
          clickHandledByMolecule
        );
        if (atomClicked !== undefined) {
          let idi = atomClicked;
          /* Clicked atom is now the active atom */
          setActiveAtom(idi);
          GlobalVariables.currentMolecule.selected = false;
          clickHandledByMolecule = true;
          break; // Stop processing once an atom handles the click
        }
      }

      //Draw the selection box
      if (!clickHandledByMolecule && GlobalVariables.ctrlDown) {
        GlobalVariables.currentMolecule.placeAtom(
          {
            parentMolecule: GlobalVariables.currentMolecule,
            x: GlobalVariables.pixelsToWidth(event.clientX),
            y: GlobalVariables.pixelsToHeight(event.clientY),
            parent: GlobalVariables.currentMolecule,
            name: "Box",
            atomType: "Box",
          },
          null,
          GlobalVariables.availableTypes
        );
      }

      if (!clickHandledByMolecule) {
        /* Background click - molecule is active atom */
        setActiveAtom(GlobalVariables.currentMolecule);
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

    // Iterate in reverse order to give priority to newer atoms
    for (let i = GlobalVariables.currentMolecule.nodesOnTheScreen.length - 1; i >= 0; i--) {
      const molecule = GlobalVariables.currentMolecule.nodesOnTheScreen[i];
      const handled = molecule.doubleClick(event.clientX, event.clientY);
      if (handled) {
        break; // Stop processing once an atom handles the double click
      }
    }
    setActiveAtom(GlobalVariables.currentMolecule);
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

    //every time the mouse button goes up
    GlobalVariables.currentMolecule.nodesOnTheScreen.forEach((molecule) => {
      molecule.clickUp(event.clientX, event.clientY);
    });
    GlobalVariables.currentMolecule.clickUp(event.clientX, event.clientY);
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
    onWindowResize();
  }, []);

  useEffect(() => {
    createCMenu(circleMenu, setSearchingGitHub);
  }, []);

  let parentLinkPath = [];
  if (GlobalVariables.currentMolecule) {
    parentLinkPath.unshift(GlobalVariables.currentMolecule.name);
    let currentParent = GlobalVariables.currentMolecule.parent;
    while (currentParent) {
      let parentName = currentParent.name;
      let parentLink = parentName;
      parentLinkPath.unshift(parentLink);
      currentParent = currentParent.parent ? currentParent.parent : null;
    }
  }

  return (
    <>
      <canvas
        ref={canvasRef}
        id="flow-canvas"
        tabIndex={0}
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
        <GitSearch
          {...{
            search,
            setSearch,
            searchingGitHub,
            setSearchingGitHub,
            isHovering,
            setIsHovering,
          }}
        />
      </div>
    </>
  );
});

{
  /* i'd really like to make the tooltip for the circular menu happen with react here. Have not
                found a way to grab anchor ID from this component yet. 
    <div id="tool_tip_circular" className='tooltip'>hello</div>; */
}
