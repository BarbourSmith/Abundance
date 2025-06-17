import { create, all } from "mathjs";
import { v4 as uuidv4 } from "uuid";
import Assembly from "../molecules/assembly.js";
import Circle from "../molecules/circle.js";
import Color from "../molecules/color.js";
import CutLayout from "../molecules/cutlayout.js";
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
      box: { creator: Box, atomType: "Box" },
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
      group: { creator: Group, atomType: "Group", atomCategory: "None" },
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
      color: { creator: Color, atomType: "Color", atomCategory: "Actions" },
      tag: { creator: Tag, atomType: "Tag", atomCategory: "Tags" },
      extracttag: {
        creator: ExtractTag,
        atomType: "ExtractTag",
        atomCategory: "Tags",
      },
      cutLayout: {
        creator: CutLayout,
        atomType: "CutLayout",
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
      GeneticAlgorithm: {
        creator: GeneticAlgorithm,
        atomType: "GeneticAlgorithm",
        atomCategory: "Actions",
      },
      //nest:               {creator: Nest, atomType: 'Nest', atomCategory: 'Export'},
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
     * A reference to the top level molecule of the project.
     * @type {object}
     */
    this.topLevelMolecule;

    /**
     * A flag to indicate of the project is currently in run mode
     */
    this.runMode = false;
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
     * An array to keep track of recent molecule changes to allow undo to revert back recently deleted molecules.
     * @type {array}
     */
    this.recentMoleculeRepresentation = [];

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
      return storedSize ? parseFloat(storedSize) : 1 / 60;
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
      { override: true }
    );
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
        navigator.userAgent
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
    const encoder = new TextEncoder();
    // 1: split the UTF-16 string into an array of bytes
    const charCodes = encoder.encode(str);
    // 2: concatenate byte data to create a binary string
    return String.fromCharCode(...charCodes);
  }

  /**
   * A function which reads the value of a unique ID and passes to display
   * @param {string} The unique ID to read from
   */
  writeToDisplay(id, resetView = false) {
    console.log("Write to display not set"); //This is a placedholder. It is created in flowCanvas.js
  }

  /**
   * A function to generate a unique ID value.
   */
  generateUniqueID() {
    return uuidv4();
  }

  /**
   * A function to avoid repeating input names in a molecule
   */
  incrementVariableName(varName, molecule) {
    if (molecule.inputs.find((o) => o.name === varName)) {
      // Find the last number in the variable name
      let lastNumber = varName.match(/\d+(?=\D*$)/);

      // Increment the number by 1
      const incrementedNumber = parseInt(lastNumber[0]) + 1;

      // Replace the last occurrence of the number in the variable name with the incremented number
      const incrementedVarName = varName.replace(
        new RegExp(lastNumber[0] + "(?=\\D*$)"),
        incrementedNumber
      );
      return this.incrementVariableName(incrementedVarName, molecule);
    } else {
      return varName;
    }
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
}

/**
 * Because we want global variables to be the same every time it is imported we export an instance of global variables instead of the constructor.
 */
export default new GlobalVariables();
