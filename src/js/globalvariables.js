import { create, all } from "mathjs";
import Assembly from "../molecules/assembly.js";
import Circle from "../molecules/circle.js";
import Color from "../molecules/color.js";
import CutLayout from "../molecules/cutlayout.js";
import CutOrient from "../molecules/cutOrient.js";
import ShrinkWrap from "../molecules/shrinkWrap.js";
import Rectangle from "../molecules/rectangle.js";
import Loft from "../molecules/loft.js";
import Move from "../molecules/move.js";
import Tag from "../molecules/tag.js";
import RegularPolygon from "../molecules/regularPolygon.js";
import Extrude from "../molecules/extrude.js";
import Fusion from "../molecules/fusion.js";
//import Nest              from '../molecules/nest.js'
import Intersection from "../molecules/intersection.js";
import Difference from "../molecules/difference.js";
import Constant from "../molecules/constant.js";
import Equation from "../molecules/equation.js";
import ExtractTag from "../molecules/extracttag.js";
import Molecule from "../molecules/molecule.js";
import GeneticAlgorithm from "../molecules/geneticAlgorithm.js";
import Input from "../molecules/input.js";
import Readme from "../molecules/readme.js";
import AddBOMTag from "../molecules/BOM.js";
import Rotate from "../molecules/rotate.js";
import GitHubMolecule from "../molecules/githubmolecule.js";
import Output from "../molecules/output.js";
import Gcode from "../molecules/gcode.js";
import Code from "../molecules/code.js";
import Group from "../molecules/group.js";
import Import from "../molecules/import.js";
import Export from "../molecules/export.js";
import Text from "../molecules/text.js";
import Box from "../molecules/box.js";
import Label from "../molecules/label.js";

/**
 * This class defines things which are made available to all objects which import it. It is a singlton which means that each time it is imported the same instance is made available so if it is written to in one place, it can be read somewhere else.
 */
class GlobalVariables {
  /**
   * The constructor creates a new instance of the Global Variables object.
   */
  constructor() {
    /**
     * The canvas object on which the atoms are drawn.
     * @type {object}
     */
    this.canvas = null;
    /**
     * The 2D reference to the canvas object on which the atoms are drawn.
     * @type {object}
     */
    this.c = null;
    /**
     * An array of all of the available types of atoms which can be placed with a right click.
     * @type {array}
     */
    this.availableTypes = {
      box: { creator: Box, atomType: "Box", atomCategory: "Shapes" },
      intersection: {
        creator: Intersection,
        atomType: "Intersection",
        atomCategory: "Interactions",
      },
      difference: {
        creator: Difference,
        atomType: "Difference",
        atomCategory: "Interactions",
      },
      assembly: {
        creator: Assembly,
        atomType: "Assembly",
        atomCategory: "Interactions",
      },
      fusion: {
        creator: Fusion,
        atomType: "Fusion",
        atomCategory: "Interactions",
      },
      loft: {
        creator: Loft,
        atomType: "Loft",
        atomCategory: "Interactions",
      },
      shrinkWrap: {
        creator: ShrinkWrap,
        atomType: "ShrinkWrap",
        atomCategory: "Interactions",
      },

      readme: { creator: Readme, atomType: "Readme", atomCategory: "Tags" },
      addBOMTag: {
        creator: AddBOMTag,
        atomType: "Add-BOM-Tag",
        atomCategory: "Tags",
      },
      color: { creator: Color, atomType: "Color", atomCategory: "Tags" },
      tag: { creator: Tag, atomType: "Tag", atomCategory: "Tags" },
      extracttag: {
        creator: ExtractTag,
        atomType: "ExtractTag",
        atomCategory: "Tags",
      },
      regularPolygon: {
        creator: RegularPolygon,
        atomType: "RegularPolygon",
        atomCategory: "Shapes",
      },
      constant: {
        creator: Constant,
        atomType: "Constant",
        atomCategory: "Inputs",
      },
      circle: { creator: Circle, atomType: "Circle", atomCategory: "Shapes" },
      text: { creator: Text, atomType: "Text", atomCategory: "Shapes" },
      label: { creator: Label, atomType: "Label", atomCategory: "Tags" },
      rectangle: {
        creator: Rectangle,
        atomType: "Rectangle",
        atomCategory: "Shapes",
      },
      molecule: {
        creator: Molecule,
        atomType: "Molecule",
        atomCategory: "Shapes",
      },
      input: { creator: Input, atomType: "Input", atomCategory: "Inputs" },
      equation: {
        creator: Equation,
        atomType: "Equation",
        atomCategory: "Inputs",
      },
      code: { creator: Code, atomType: "Code", atomCategory: "Inputs" },

      rotate: { creator: Rotate, atomType: "Rotate", atomCategory: "Actions" },
      extrude: {
        creator: Extrude,
        atomType: "Extrude",
        atomCategory: "Actions",
      },
      move: { creator: Move, atomType: "Move", atomCategory: "Actions" },
      gcode: {
        creator: Gcode,
        atomType: "Gcode",
        atomCategory: "ImportExport",
      },
      import: {
        creator: Import,
        atomType: "Import",
        atomCategory: "ImportExport",
      },
      export: {
        creator: Export,
        atomType: "Export",
        atomCategory: "ImportExport",
      },
      cutOrient: {
        creator: CutOrient,
        atomType: "CutOrient",
        atomCategory: "ImportExport",
      },
      cutLayout: {
        creator: CutLayout,
        atomType: "CutLayout",
        atomCategory: "ImportExport",
      },
      githubmolecule: {
        creator: GitHubMolecule,
        atomType: "GitHubMolecule",
        atomCategory: "ImportExport",
      },

      output: { creator: Output, atomType: "Output" },
    };
    /**
     * A reference to the molecule curently being displayed on the screen.
     * @type {object}
     */
    this.currentMolecule;
    /**
     * A reference to logged in authenticated.
     * @type {string}
     */
    this.currentUser;
    /** 
          /** 
         * A reference to the selected repository name.
         * @type {string}
         */
    this.currentRepoName;
    /**
     * A reference to the selected repository authenticated.
     * @type {string}
     */
    this.currentRepo;
    /**
     * A reference to the repo that goes through loaded project().
     * @type {string}
     */
    this.loadedRepo;
    /**
     * A reference to the AWS node that is used to make calls to the backend.
     * @type {object}
     */
    this.currentAWSnode;
    /**
     * A reference to the top level molecule of the project.
     * @type {object}
     */
    this._topLevelMolecule;

    /**
     * A flag to indicate if the program is running with a touch interface. Set in flowDraw.js.
     * @type {boolean}
     */
    this.touchInterface = false;
    /**
     * The replicad object which is used to interact with the replicad worker.
     * @type {object}
     */
    this.cad = null; //Set in flowCanvas
    /**
     * A total of the number of atoms in this project
     * @type {integer}
     */
    this.totalAtomCount = 0;
    /**
     * A counter used during the loading process to keep track of how many atoms are still to be loaded.
     * @type {integer}
     */
    this.numberOfAtomsToLoad = 0;
    /**
     * A flag to indicate if the project is currently loading/deserializing.
     * Used to block saves during deserialization to prevent wiping out the project structure.
     * @type {boolean}
     */
    this.projectIsLoading = false;
    /**
     * A flag to indicate if the project is a fork.
     * @type {boolean}
     */
    this.fork = false;
    /**
     * A flag to indicate if command is pressed
     * @type {boolean}
     */
    this.ctrlDown = false;
    /**
     * A variable to save array to be copied
     * @type {array}
     */
    this.atomsSelected = [];
    /**
     * The size (in mm) of segments to use for circles.
     * @type {number}
     */
    this.circleSegmentSize = 2;
    /**
     * A flag to indicate if a display value is currently being processed.
     * @type {bool}
     */
    this.displayProcessing = false;
    /**
     * The function to call to cancel the processing of the prevous display value.
     * @type {function}
     */
    this.cancelLastDisplayWorker = function () {};
    /**
     * A flag to indicate if a grid should be displayed behind the shape
     * @type {boolean}
     */
    this.displayGrid = true;
    /**
     * A flag to indicate if the edges of the shape should be displayed.
     * @type {boolean}
     */
    this.displayAxis = true;
    /**
     * A flag to indicate if the display should show axis.
     * @type {boolean}
     */
    this.displayTriangles = true;

    /**
     * A flag to indicate if the faces of the shape should be displayed.
     * @type {boolean}
     */
    this.displayEdges = true;
    /**
     * Stack of undo commands. Each entry is an instance of one of the command classes
     * from undoCommands.js (DeleteAtomsCommand, AddAtomCommand, ReplaceConnectionCommand,
     * ValueChangeCommand). Replaces the previous full-serialization approach.
     * @type {array}
     */
    this.undoCommandStack = [];

    /**
     * Set to true while an undo is executing to prevent cascading undo captures.
     * @type {boolean}
     */
    this.isUndoing = false;

    /**
     * A counter for generating short, sequential unique IDs instead of long UUIDs.
     * This significantly reduces project file sizes.
     * @type {number}
     */
    this.idCounter = 1;

    /**
     * The Input atom currently in part-selection mode, or null.
     * Set via enterSelectionMode() / exitSelectionMode().
     * @type {object|null}
     */
    this.selectionModeAtom = null;

    /**
     * A ring buffer of recent console errors captured for debugging.
     * Stores up to 50 entries, each with a timestamp and message string.
     * @type {Array<{timestamp: string, message: string}>}
     */
    this.recentErrors = [];

    // Intercept console.error to populate the ring buffer without suppressing output.
    if (typeof console !== "undefined" && typeof console.error === "function") {
      const self = this;
      const _originalConsoleError = console.error.bind(console);
      console.error = function (...args) {
        const message = args
          .map((a) => {
            try {
              return typeof a === "object" ? JSON.stringify(a) : String(a);
            } catch {
              return String(a);
            }
          })
          .join(" ");
        self.recentErrors.push({
          timestamp: new Date().toISOString(),
          message,
        });
        if (self.recentErrors.length > 50) {
          self.recentErrors.shift();
        }
        _originalConsoleError(...args);
      };
    }

    /**
     * A string to indicate a stored user font for the canvas.
     * @type {string}
     */
    this.canvasFont = (() => {
      const storedFont = localStorage.getItem("canvasFont");
      return storedFont ? storedFont : `12px Work Sans Bold`;
    })();

    /**
     * A number to indicate the size of the atoms in the canvas. This is used to scale the atoms to fit on the canvas.
     * @type {number}
     */
    this.atomSize = (() => {
      const storedSize = localStorage.getItem("atomSize");
      return storedSize
        ? parseFloat(storedSize)
        : this.isMobile()
          ? 1 / 30
          : 1 / 65;
    })();

    const math = create(all); //What does this do? I think it is used to evalue strings as math
    /**
     * An evaluator for strings as mathmatical equations which is sandboxed and secure.
     * @type {function}
     */
    this.limitedEvaluate = math.evaluate;
    this.lastClick;

    math.import(
      {
        import: function () {
          throw new Error("Function import is disabled");
        },
        createUnit: function () {
          throw new Error("Function createUnit is disabled");
        },
        evaluate: function () {
          throw new Error("Function evaluate is disabled");
        },
        parse: function () {
          throw new Error("Function parse is disabled");
        },
        simplify: function () {
          throw new Error("Function simplify is disabled");
        },
        derivative: function () {
          throw new Error("Function derivative is disabled");
        },
      },
      { override: true },
    );
  }

  get topLevelMolecule() {
    return this._topLevelMolecule;
  }

  set topLevelMolecule(molecule) {
    if (this._topLevelMolecule) {
      this._topLevelMolecule.disable();
    }
    this._topLevelMolecule = molecule;
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("top-level-molecule-changed", {
          detail: { molecule },
        }),
      );
    }
  }

  /**
   * Snaps the given x,y coordinates to the nearest point within the canvas boundaries. Where x
   * and y are width fraction and heigh fraction respectively.
   * @param {} x
   * @param {*} y
   * @return a tuple of [snapped x position, snapped y position], both in fractional position
   */
  constrainToCanvasBorders(x, y) {
    return [Math.max(0, Math.min(1, x)), Math.max(0, Math.min(1, y))];
  }

  /**
   * Snaps the given x,y coordinates to the nearest point within the canvas boundaries. Where x
   * and y are measuring pixels from the top-left of the canvas.
   * @param {} xPixels
   * @param {*} yPixels
   * @return a tuple of [snapped x position, snapped y position], both in pixels
   */
  constrainToCanvasBordersPixels(xPixels, yPixels) {
    return [
      Math.max(0, Math.min(this.canvas.current.width, xPixels)),
      Math.max(0, Math.min(this.canvas.current.height, yPixels)),
    ];
  }

  /**
   * A function to check if the user is on a mobile device.
   * @return {boolean} True if the user is on a mobile device, false otherwise.
   */
  isMobile() {
    // Check for common mobile device indicators in the user agent string
    if (
      /Mobi|Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
        navigator.userAgent,
      )
    ) {
      return true;
    }

    // Check screen size (not entirely reliable)
    if (window.innerWidth <= 768) {
      return true;
    }

    return false;
  }

  /**
   * A function to generate a pixel value for 0-1 location on screen depending on screen width.
   * @param {number} width
   */
  widthToPixels(width) {
    let pixels = this.canvas.current.width * width;
    return pixels;
  }
  /**
   * A function to generate a 0-1 value from pixels for location on screen depending on screen width.
   * @param {number} width
   */
  pixelsToWidth(pixels) {
    let width = 1 / (this.canvas.current.width / pixels);
    return width;
  }
  /**
   * Convert from a fractional height value to a number of pixels.
   * @param {number} width
   */
  heightToPixels(height) {
    let pixels = this.canvas.current.height * height;
    return pixels;
  }

  /**
   * Convert from a pixel position or distance to a fraction of the page height between 0 and 1 inclusive.
   * @param {number} width
   */
  pixelsToHeight(pixels) {
    let height = 1 / (this.canvas.current.height / pixels);
    return height;
  }

  /**
   * A function to encode strings that contain characters outside of latin range so they can pass through btoa
   * @param {str} The string to encode
   */
  toBinaryStr(str) {
    // Use percent encoding to safely convert UTF-8 to binary for btoa
    return unescape(encodeURIComponent(str));
  }

  /**
   * A function to decode strings that were encoded with toBinaryStr and passed through atob
   * @param {str} The binary string to decode back to UTF-8
   */
  fromBinaryStr(binaryStr) {
    // Decode percent-encoded UTF-8 back to original string
    return decodeURIComponent(escape(binaryStr));
  }

  /**
   * Clear current display and camera position.
   */
  resetView() {
    // Placeholder function - implementation is set in App.jsx
  }

  /**
   * Enter part-selection mode for a partselect Input atom.
   * The React setter is wired in by App.jsx on mount.
   * @param {object} inputAtom - The Input atom instance entering selection mode
   */
  enterSelectionMode(inputAtom) {
    this.selectionModeAtom = inputAtom;
    if (typeof this.setSelectionModeAtom === "function") {
      this.setSelectionModeAtom(inputAtom);
    }
    // Push the raw connected geometry to the renderer so the user sees
    // exactly the assembly they are selecting parts from
    const rawGeom = inputAtom.parentAP?.getState().value;
    if (rawGeom && typeof this.writeToDisplay === "function") {
      this.writeToDisplay(rawGeom, inputAtom.getContext());
    }

    // For edge/face select modes, kick off async per-element mesh generation.
    // Show outdatedMesh state during the async load so the user gets feedback.
    if (
      rawGeom &&
      (inputAtom.type === "edgeselect" || inputAtom.type === "faceselect") &&
      this.pool
    ) {
      inputAtom._perElementMeshes = null;
      if (typeof this.setOutdatedMesh === "function") {
        this.setOutdatedMesh(true);
      }
      const workerFn =
        inputAtom.type === "faceselect"
          ? "generatePerFaceMeshes"
          : "generatePerEdgeMeshes";
      this.pool
        .proxy()
        .then((worker) => worker[workerFn](rawGeom, inputAtom.getContext()))
        .then((meshes) => {
          // Only apply if still in this selection mode
          if (this.selectionModeAtom === inputAtom) {
            inputAtom._perElementMeshes = meshes;
            if (typeof this.setOutdatedMesh === "function") {
              this.setOutdatedMesh(false);
            }
            this.bumpSelectionVersion();
          }
        })
        .catch((err) => {
          console.error("Failed to generate per-element meshes:", err);
          if (typeof this.setOutdatedMesh === "function") {
            this.setOutdatedMesh(false);
          }
        });
    }
  }

  /**
   * Exit part-selection mode.
   */
  exitSelectionMode() {
    const prev = this.selectionModeAtom;
    this.selectionModeAtom = null;
    if (typeof this.setSelectionModeAtom === "function") {
      this.setSelectionModeAtom(null);
    }
    // Clean up cached per-element meshes
    if (prev) {
      prev._perElementMeshes = null;
    }
    // Now propagate the final selection downstream
    if (prev && typeof prev.onUpstreamChange === "function") {
      prev.onUpstreamChange();
    }
    // Restore the molecule's rendered output
    if (prev?.parent && typeof prev.parent.sendToRender === "function") {
      prev.parent.sendToRender();
    }
    // Refresh the control panel so the button label reverts to "Select Parts"
    if (prev && typeof prev.setInputChanged === "function") {
      prev.setInputChanged(String(Date.now()));
    }
  }

  /**
   * Placeholder wired by App.jsx — call enterSelectionMode / exitSelectionMode instead.
   */
  setSelectionModeAtom(atom) {
    // Placeholder function - implementation is set in App.jsx
  }

  /**
   * Notify React that the part selection has changed, triggering a re-render.
   * Wired by App.jsx on mount.
   */
  bumpSelectionVersion() {
    if (typeof this._bumpSelectionVersion === "function") {
      this._bumpSelectionVersion((v) => v + 1);
    }
  }

  /**
   * Display a given atom's mesh on the screen. Requires also the molecule context. See atom's getContext() function.
   * @param {string} The value of the molecule to display
   * @param {object} context - Project context of the atom to display.
   *
   */
  writeToDisplay(moleculeValue, context) {
    // Placeholder function - implementation is set in App.jsx
  }

  /**
   * A function to generate a unique ID value.
   * Uses a sequential counter instead of UUIDs to reduce file size.
   */
  generateUniqueID() {
    return `id-${this.idCounter++}`;
  }

  /**
   * Resets the ID counter based on existing IDs in a deserialized project.
   * Scans through the project JSON to find the highest ID number and sets
   * the counter to start from there + 1 to avoid collisions.
   * @param {object} projectJson - The deserialized project JSON
   */
  resetIdCounter(projectJson) {
    let maxId = 0;

    const extractIdNumber = (id) => {
      if (typeof id === "string" && id.startsWith("id-")) {
        const num = parseInt(id.substring(3), 10);
        if (!isNaN(num)) {
          return num;
        }
      }
      return 0;
    };

    const scanForIds = (obj) => {
      if (!obj || typeof obj !== "object") {
        return;
      }

      // Check uniqueID at this level
      if (obj.uniqueID) {
        const idNum = extractIdNumber(obj.uniqueID);
        if (idNum > maxId) {
          maxId = idNum;
        }
      }

      // Recursively scan arrays
      if (Array.isArray(obj)) {
        obj.forEach((item) => scanForIds(item));
      } else {
        // Recursively scan object properties
        Object.values(obj).forEach((value) => scanForIds(value));
      }
    };

    scanForIds(projectJson);

    // Set counter to start from max + 1
    this.idCounter = maxId + 1;
  }

  /**
   * Return true iff this atom is of a type which can be referenced by name in equations.
   */
  isReferencableByName(atom) {
    return atom && (atom.atomType === "Input" || atom.atomType === "Constant");
  }

  /**
   * A function to avoid repeating input names in a molecule
   */
  incrementVariableName(varName, molecule, excludeAtoms = []) {
    if (
      molecule.nodesOnTheScreen.find(
        (o) =>
          this.isReferencableByName(o) &&
          o.name === varName &&
          !excludeAtoms.includes(o),
      )
    ) {
      // Look for the pattern " (number)" at the end of the variable name
      let suffixMatch = varName.match(/^(.+)_(\d+)$/);

      if (suffixMatch) {
        // Extract base name and current number
        const baseName = suffixMatch[1];
        const currentNumber = parseInt(suffixMatch[2]);

        // Increment the number and try again
        const incrementedVarName = `${baseName}_${currentNumber + 1}`;
        return this.incrementVariableName(
          incrementedVarName,
          molecule,
          excludeAtoms,
        );
      } else {
        // No " (number)" suffix found, add "_1"
        return this.incrementVariableName(
          varName + "_1",
          molecule,
          excludeAtoms,
        );
      }
    } else {
      return varName;
    }
  }

  /**
   * Pushes an undo command onto the stack.
   * No-ops during undo execution to prevent cascading captures.
   * Consecutive ValueChangeCommands for the same atom+field are merged so
   * rapid typing produces only a single undo step.
   * @param {object} command - An instance from undoCommands.js
   */
  pushUndoCommand(command) {
    if (this.isUndoing) return;

    // Merge consecutive value changes for the same atom+field
    if (this.undoCommandStack.length > 0) {
      const top = this.undoCommandStack[this.undoCommandStack.length - 1];
      if (
        top.fieldKey !== undefined &&
        command.fieldKey !== undefined &&
        top.atomUniqueID === command.atomUniqueID &&
        top.fieldKey === command.fieldKey
      ) {
        // Keep oldest "before" value; discard this command
        return;
      }
    }

    this.undoCommandStack.push(command);
    // Keep maximum of 20 undo steps
    if (this.undoCommandStack.length > 20) {
      this.undoCommandStack.shift();
    }
  }

  /**
   * Remaps unique IDs in a collection of serialized atoms to ensure pasted atoms have new unique IDs
   * @param {array} atomsArray - Array of serialized atoms to remap IDs for
   * @returns {array} - Array of atoms with remapped unique IDs
   */
  remapIDsForPaste(atomsArray) {
    // First pass: create mapping of old IDs to new IDs for all atoms
    const idMapping = {};
    atomsArray.forEach((atom) => {
      const oldID = atom.uniqueID;
      const newID = this.generateUniqueID();
      idMapping[oldID] = newID;

      // Also map any nested atom IDs (for complex molecules)
      if (atom.allAtoms) {
        atom.allAtoms.forEach((nestedAtom) => {
          const oldNestedID = nestedAtom.uniqueID;
          const newNestedID = this.generateUniqueID();
          idMapping[oldNestedID] = newNestedID;
        });
      }
    });

    // Second pass: apply the ID mapping to all atoms and their connectors
    return atomsArray.map((atom) => {
      // Create a deep copy to avoid modifying the original
      const atomCopy = JSON.parse(JSON.stringify(atom));

      // Update the main atom's unique ID
      if (idMapping[atomCopy.uniqueID]) {
        atomCopy.uniqueID = idMapping[atomCopy.uniqueID];
      }

      // Update nested atoms (for complex molecules)
      if (atomCopy.allAtoms) {
        atomCopy.allAtoms.forEach((nestedAtom) => {
          if (idMapping[nestedAtom.uniqueID]) {
            nestedAtom.uniqueID = idMapping[nestedAtom.uniqueID];
          }
        });
      }

      // Update connector references
      if (atomCopy.allConnectors) {
        atomCopy.allConnectors.forEach((connector) => {
          if (connector.ap1ID && idMapping[connector.ap1ID]) {
            connector.ap1ID = idMapping[connector.ap1ID];
          }
          if (connector.ap2ID && idMapping[connector.ap2ID]) {
            connector.ap2ID = idMapping[connector.ap2ID];
          }
        });
      }

      return atomCopy;
    });
  }

  /**
   * Computes the distance between two points on a plane. This is a duplicate of the one in utils which should probably be deleted.
   * @param {number} x1 - The x cordinate of the first point.
   * @param {number} x2 - The x cordinate of the second point.
   * @param {number} y1 - The y cordinate of the first point.
   * @param {number} y2 - The y cordinate of the second point.
   */
  distBetweenPoints(x1, x2, y1, y2) {
    var a2 = Math.pow(x1 - x2, 2);
    var b2 = Math.pow(y1 - y2, 2);
    var dist = Math.sqrt(a2 + b2);

    return dist;
  }

  /**
   * Generates a structured JSON snapshot of the current system state.
   * Intended to be copied and shared with AI assistants or developers to
   * diagnose loading failures and other reliability issues.
   * @returns {string} A formatted JSON string describing the current state.
   */
  getSystemStateReport() {
    const describeAtom = (atom) => {
      const entry = {
        name: atom.name,
        atomType: atom.atomType,
        uniqueID: atom.uniqueID,
        status: atom.status,
      };
      if (atom.processing) entry.processing = true;
      if (atom.alertMessage) entry.alertMessage = atom.alertMessage;
      return entry;
    };

    // Diagnose WHY an atom is stuck by capturing the state of the graph edges
    // that should have moved it forward. A "waiting" atom whose inputs are all
    // "ready", or a "processing" molecule whose output atom has already settled
    // to "ready"/"error", indicates a dropped status-propagation notification
    // (the atom never got the edge that should have re-run its onUpstreamChange).
    //
    // For each input attachment point we also capture the UPSTREAM source (the
    // output AP feeding it, via connector.attachmentPoint1). If an input AP is
    // "waiting"/"processing" while its source AP is "ready", the edge from that
    // source into the input was dropped — that pinpoints exactly where in the
    // graph the notification was lost.
    const describeAP = (ap) => {
      const connectors = Array.isArray(ap.connectors) ? ap.connectors : [];
      const sources = connectors
        .map((c) => c?.attachmentPoint1)
        .filter(Boolean)
        .map((src) => ({
          sourceAtom: src.parentMolecule?.name ?? null,
          sourceAtomType: src.parentMolecule?.atomType ?? null,
          sourceAtomStatus: src.parentMolecule?.status ?? null,
          sourceApStatus: src.status ?? null,
        }));
      return {
        name: ap.name,
        status: ap.status,
        connectors: connectors.length,
        sources,
      };
    };

    // True when this AP is not ready but every upstream source feeding it is
    // ready — i.e. the edge into this AP was dropped.
    const apHasLostEdge = (apInfo) =>
      apInfo.status !== "ready" &&
      apInfo.sources.length > 0 &&
      apInfo.sources.every((s) => s.sourceApStatus === "ready");

    const diagnoseStuck = (atom) => {
      const diag = {};
      const inputs = Array.isArray(atom.inputs) ? atom.inputs : [];
      if (inputs.length) {
        const inputInfos = inputs.map(describeAP);
        diag.inputs = inputInfos;
        diag.allInputsReady = inputInfos.every((i) => i.status === "ready");
        diag.anyInputError = inputInfos.some(
          (i) => i.status === "error" || i.status === "upstream_error",
        );
        // Inputs whose upstream source is ready but the input AP itself is not:
        // these are dropped edges INTO this atom.
        const lostInputEdges = inputInfos.filter(apHasLostEdge);
        if (lostInputEdges.length) diag.lostInputEdges = lostInputEdges;
      }
      // For molecules, the output atom drives the molecule's own status.
      if (typeof atom.getOutputAtom === "function") {
        try {
          const out = atom.getOutputAtom();
          if (out) {
            const outInput = out.inputs?.[0];
            const outInputInfo = outInput ? describeAP(outInput) : null;
            diag.outputAtom = {
              status: out.status,
              subscribedByMolecule: Object.prototype.hasOwnProperty.call(
                out.subscribers ?? {},
                atom.uniqueID,
              ),
              subscriberCount: Object.keys(out.subscribers ?? {}).length,
              input: outInputInfo,
            };
            // The decisive signals:
            // - output "ready" but molecule still "processing"  => dropped
            //   output->molecule edge (Root cause A/B on that subscription).
            // - output not ready but its own input's source is ready => dropped
            //   edge one hop upstream of the output atom.
            if (out.status === "ready" && atom.status === "processing") {
              diag.outputAtom.droppedOutputToMoleculeEdge = true;
            }
            if (outInputInfo && apHasLostEdge(outInputInfo)) {
              diag.outputAtom.droppedEdgeIntoOutput = true;
            }
          }
        } catch {
          /* getOutputAtom may throw on a partially-initialized molecule */
        }
      }
      return diag;
    };

    // Walk the whole tree collecting every atom in ERROR status with its actual
    // error message (atom.alert.message, set by Atom.setError). This shows the
    // real failure reason per failing instance — distinguishing genuine geometry
    // errors (e.g. fillet "radiusConfigFun") from execution-environment failures
    // (e.g. "No warm cache for operation batch-...", OCCT BindingError) that only
    // appear at this project's scale. upstream_error atoms are excluded (they are
    // just victims of a real error somewhere upstream).
    const collectErroredAtoms = (topMolecule) => {
      const results = [];
      const visited = new Set();
      const pathOf = (atom) => {
        const parts = [];
        let m = atom;
        let guard = 0;
        while (m && guard++ < 40) {
          if (m.name) parts.unshift(m.name);
          m = m.parent;
        }
        return parts.join(" / ");
      };
      const walk = (mol, depth) => {
        if (!mol || depth > 25 || visited.has(mol.uniqueID)) return;
        visited.add(mol.uniqueID);
        (mol.nodesOnTheScreen ?? []).forEach((atom) => {
          if (atom.status === "error") {
            results.push({
              path: pathOf(atom),
              atomType: atom.atomType,
              message: atom.alert?.message ?? atom.alertMessage ?? null,
            });
          }
          if (
            atom.atomType === "Molecule" ||
            atom.atomType === "GitHubMolecule"
          ) {
            walk(atom, depth + 1);
          }
        });
      };
      walk(topMolecule, 0);
      return results;
    };

    // Recursively collect every atom still "processing" or "waiting", descending
    // into nested molecules. The top-level report only lists the current
    // molecule's direct children, so a stall inside a sub-molecule (the common
    // case) is otherwise invisible. Tracks visited IDs to guard against cycles.
    const collectStuckAtoms = (molecule) => {
      const stuck = [];
      const visited = new Set();
      const walk = (mol, path, depth) => {
        if (!mol || depth > 25 || visited.has(mol.uniqueID)) return;
        visited.add(mol.uniqueID);
        const children = mol.nodesOnTheScreen ?? [];
        children.forEach((atom) => {
          if (atom.status === "processing" || atom.status === "waiting") {
            stuck.push({
              ...describeAtom(atom),
              path: path ? `${path} / ${atom.name}` : atom.name,
              ...diagnoseStuck(atom),
            });
          }
          if (
            (atom.atomType === "Molecule" ||
              atom.atomType === "GitHubMolecule") &&
            atom !== mol
          ) {
            walk(atom, path ? `${path} / ${atom.name}` : atom.name, depth + 1);
          }
        });
      };
      walk(molecule, "", 0);
      return stuck;
    };

    const currentMol = this.currentMolecule;
    const topMol = this._topLevelMolecule;

    const stuckAtoms = collectStuckAtoms(topMol ?? currentMol);
    const erroredAtoms = collectErroredAtoms(topMol ?? currentMol);

    const report = {
      generatedAt: new Date().toISOString(),
      project: {
        name: this.currentRepoName || null,
        owner: this.currentAWSnode?.owner ?? null,
        repoUrl: this.currentRepo?.html_url ?? null,
        isLoading: this.projectIsLoading,
        totalAtomCount: this.totalAtomCount,
        pendingAtomCount: this.numberOfAtomsToLoad,
        loadElapsedMs: this.startTime ? Date.now() - this.startTime : null,
        topLevelMoleculeStatus: (topMol ?? currentMol)?.status ?? null,
        completion: (() => {
          const mol = topMol ?? currentMol;
          if (!mol || typeof mol.getCompletionTuple !== "function") {
            return null;
          }
          try {
            const [ready, total] = mol.getCompletionTuple();
            return { ready, total, remaining: total - ready };
          } catch {
            return null;
          }
        })(),
      },
      currentMolecule: currentMol
        ? {
            name: currentMol.name,
            atomType: currentMol.atomType,
            uniqueID: currentMol.uniqueID,
            isTopLevel: currentMol.topLevel ?? false,
            atomCount: currentMol.nodesOnTheScreen?.length ?? 0,
            atoms: (currentMol.nodesOnTheScreen ?? []).map(describeAtom),
          }
        : null,
      topLevelMolecule:
        topMol && topMol !== currentMol
          ? {
              name: topMol.name,
              atomType: topMol.atomType,
              uniqueID: topMol.uniqueID,
              totalAtomCount: topMol.totalAtomCount ?? null,
            }
          : null,
      cadWorker:
        this.cad && typeof this.cad.getQueueSnapshot === "function"
          ? this.cad.getQueueSnapshot()
          : null,
      stuckAtoms: stuckAtoms,
      stallDiagnosis: {
        stuckCount: stuckAtoms.length,
        processingCount: stuckAtoms.filter((a) => a.status === "processing")
          .length,
        waitingCount: stuckAtoms.filter((a) => a.status === "waiting").length,
        // Molecules whose output atom is already ready but that are still
        // "processing" — a dropped output->molecule notification edge.
        droppedOutputToMoleculeEdges: stuckAtoms
          .filter((a) => a.outputAtom?.droppedOutputToMoleculeEdge)
          .map((a) => ({
            path: a.path,
            outputStatus: a.outputAtom.status,
            subscribedByMolecule: a.outputAtom.subscribedByMolecule,
          })),
        // Atoms with an input whose upstream source is ready but the input AP
        // itself is not — a dropped edge INTO the atom.
        atomsWithLostInputEdges: stuckAtoms
          .filter((a) => a.lostInputEdges?.length)
          .map((a) => ({ path: a.path, status: a.status })),
        // Molecules whose output atom is blocked by a dropped edge one hop
        // upstream of the output.
        droppedEdgesIntoOutput: stuckAtoms
          .filter((a) => a.outputAtom?.droppedEdgeIntoOutput)
          .map((a) => ({ path: a.path })),
      },
      erroredAtoms: erroredAtoms,
      workerLogs:
        this.cad && typeof this.cad.getRecentWorkerLogs === "function"
          ? this.cad.getRecentWorkerLogs(50)
          : [],
      recentErrors: this.recentErrors.slice(-20),
    };

    if (typeof navigator !== "undefined") {
      report.browser = { userAgent: navigator.userAgent };
      if (typeof performance !== "undefined" && performance.memory) {
        report.browser.memoryMB = {
          usedJSHeap: Math.round(performance.memory.usedJSHeapSize / 1_048_576),
          totalJSHeap: Math.round(
            performance.memory.totalJSHeapSize / 1_048_576,
          ),
        };
      }
    }

    return JSON.stringify(report, null, 2);
  }
}

const globalVariables = new GlobalVariables();

if (typeof window !== "undefined") {
  window.GlobalVarsForPuppeteer = globalVariables;
}

/**
 * Because we want global variables to be the same every time it is imported we export an instance of global variables instead of the constructor.
 */
export default globalVariables;
