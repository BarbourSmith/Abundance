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
    if (e.touches) {
      lastTouchMove = e;
      e.clientX = e.touches[0].clientX;
      e.clientY = e.touches[0].clientY;
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
    if (event.touches) {
      event.clientX = event.touches[0].clientX;
      event.clientY = event.touches[0].clientY;
    }

    console.log("onMouseDown", event.clientX, event.clientY);

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
      GlobalVariables.currentMolecule.nodesOnTheScreen.forEach((molecule) => {
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
        }
      });

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

  /* Handles click on a molecule - go up level */
  GlobalVariables.mouseDown = onMouseDown;

  /*Handles click on a molecule - go down level*/
  const onDoubleClick = (event) => {
    GlobalVariables.currentMolecule.nodesOnTheScreen.forEach((molecule) => {
      molecule.doubleClick(event.clientX, event.clientY);
    });
    setActiveAtom(GlobalVariables.currentMolecule);
  };

  /**
   * Called by mouse up
   */
  const onMouseUp = (event) => {
    if (lastTouchMove) {
      event.clientX = lastTouchMove.touches[0].clientX;
      event.clientY = lastTouchMove.touches[0].clientY;
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
