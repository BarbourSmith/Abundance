import React, { memo, useEffect, useState, useRef } from "react";
import GlobalVariables from "./js/globalvariables";
import Molecule from "./molecules/molecule";
import { createCMenu, cmenu } from "./js/NewMenu.js";
import { Octokit } from "https://esm.sh/octokit@2.0.19";
import GitSearch from "./GitSearch.jsx";

function onWindowResize() {
  const flowCanvas = document.getElementById("flow-canvas");
  flowCanvas.width = window.innerWidth;
  flowCanvas.height = window.innerHeight * 0.45;
}

window.addEventListener(
  "resize",
  () => {
    onWindowResize();
  },
  false
);

export default memo(function FlowCanvas(props) {
  //Todo this is not very clean
  let cad = props.displayProps.cad;
  let size = props.displayProps.size;
  let setMesh = props.displayProps.setMesh;
  let mesh = props.displayProps.mesh;
  let loadProject = props.props.loadProject;

  /** State for github molecule search input */
  const [searchingGitHub, setSearchingGitHub] = useState(false);

  useEffect(() => {
    GlobalVariables.writeToDisplay = (id, resetView = false) => {
      console.log("write to display running " + id);

      cad.generateDisplayMesh(id).then((m) => setMesh(m));
    };

    GlobalVariables.cad = cad;
  });

  const canvasRef = useRef(null);
  const circleMenu = useRef(null);

  // On component mount create a new top level molecule before project load
  useEffect(() => {
    GlobalVariables.canvas = canvasRef;
    GlobalVariables.c = canvasRef.current.getContext("2d");

    /** Only run loadproject() if the project is different from what is already loaded  */
    if (GlobalVariables.currentRepo !== GlobalVariables.loadedRepo) {
      //Load a blank project
      GlobalVariables.topLevelMolecule = new Molecule({
        x: 0,
        y: 0,
        topLevel: true,
        atomType: "Molecule",
      });
      GlobalVariables.currentMolecule = GlobalVariables.topLevelMolecule;
      loadProject(GlobalVariables.currentRepo);
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
    GlobalVariables.currentMolecule.nodesOnTheScreen.forEach((molecule) => {
      molecule.clickMove(e.clientX, e.clientY);
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

    /**
     * Object containing letters and values used for keyboard shortcuts
     * @type {object?}
     */
    var shortCuts = {
      a: "Assembly",
      b: "ShrinkWrap", //>
      c: "Copy",
      d: "Difference",
      e: "Extrude",
      g: "GitHub", // Not working yet
      i: "Input",
      j: "Translate",
      k: "Rectangle",
      l: "Circle",
      m: "Molecule",
      s: "Save",
      v: "Paste",
      x: "Equation",
      y: "Code", //is there a more natural code letter? can't seem to prevent command t new tab behavior
      z: "Undo", //saving this letter
    };

    //Copy /paste listeners
    if (e.key == "Control" || e.key == "Meta") {
      GlobalVariables.ctrlDown = true;
    }

    if (GlobalVariables.ctrlDown && shortCuts.hasOwnProperty([e.key])) {
      e.preventDefault();
      //Copy & Paste
      if (e.key == "c") {
        GlobalVariables.atomsSelected = [];
        console.log(GlobalVariables.atomsSelected);
        GlobalVariables.currentMolecule.copy();
      }
      if (e.key == "v") {
        GlobalVariables.atomsSelected.forEach((item) => {
          let newAtomID = GlobalVariables.generateUniqueID();
          item.uniqueID = newAtomID;
          GlobalVariables.currentMolecule.placeAtom(item, true);
        });
      }
      //Save project

      if (e.key == "s") {
        props.props.setSavePopUp(true);
        props.props.saveProject(props.props.setSaveState);
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
          props.props.setActiveAtom(idi);

          clickHandledByMolecule = true;
        }
      });
      if (!clickHandledByMolecule) {
        /* Background click - molecule is active atom */
        props.props.setActiveAtom(GlobalVariables.currentMolecule);
        GlobalVariables.currentMolecule.sendToRender();
      }
    }
  };

  /*Handles click on a molecule - go down level*/
  const onDoubleClick = (event) => {
    GlobalVariables.currentMolecule.nodesOnTheScreen.forEach((molecule) => {
      molecule.doubleClick(event.clientX, event.clientY);
    });
    props.props.setActiveAtom(GlobalVariables.currentMolecule);
  };

  /**
   * Called by mouse up
   */
  const onMouseUp = (event) => {
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

  return (
    <>
      <canvas
        ref={canvasRef}
        id="flow-canvas"
        tabIndex={0}
        onMouseMove={mouseMove}
        onMouseDown={onMouseDown}
        onMouseUp={onMouseUp}
        onDoubleClick={onDoubleClick}
        onKeyUp={keyUp}
        onKeyDown={keyDown}
      ></canvas>
      <div>
        <p
          style={{
            position: "absolute",
            zIndex: "5",
            top: "1%",
            right: "5%",
            color: "rgb(255 255 255 / 34%)",
          }}
        >
          {GlobalVariables.currentRepo.name}
        </p>
      </div>
      <div>
        <div id="circle-menu1" className="cn-menu1" ref={circleMenu}></div>
        <GitSearch
          searchingGitHub={searchingGitHub}
          setSearchingGitHub={setSearchingGitHub}
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
