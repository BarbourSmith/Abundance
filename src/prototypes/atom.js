import AttachmentPoint from "./attachmentpoint";
import GlobalVariables from "../js/globalvariables.js";
import showdown from "showdown";
import globalvariables from "../js/globalvariables.js";
import { parse } from "mathjs";

import {
  useControls,
  useCreateStore,
  LevaPanel,
  button,
  Leva,
  LevaInputs,
} from "leva";
import ObservableEntity from "./observableEntity.js";

// Make this an enum once we're using typescript
const AlertType = Object.freeze({
  ERROR: "error",
  WARNING: "warning",
  INFO: "info",
  NONE: "none",
});

/**
 * This class is the prototype for all atoms.
 */
export default class Atom extends ObservableEntity {
  static SELECTED_COLOR = "#484848";
  static DEFAULT_COLOR = "#F3EFEF";

  /**
   * The constructor function.
   * @param {object} values An array of values passed in which will be assigned to the class as this.x
   */
  constructor(values) {
    //Setup default values
    /**
     * An array of all of the input attachment points connected to this atom
     * @type {array}
     */
    this.inputs = [];
    /**
     * This atom's output attachment point if it has one
     * @type {object}
     */
    this.output = null;
    /**
     * This atom's unique ID. Often overwritten later when loading
     * @type {number}
     */
    this.uniqueID = GlobalVariables.generateUniqueID();

    /**
     * This atom's value...Is can this be done away with? Are we basically storing the value in the output now?
     * @type {object}
     */
    this.value = null;

    /**
     * A description of this atom
     * @type {string}
     */
    this.description = "none";
    /**
     * The X cordinate of this atom
     * @type {number}
     */
    this.x = 0;
    /**
     * The Y cordinate of this atom
     * @type {number}
     */
    this.y = 0;
    /**
     * This atom's radius as displayed on the screen is 1/72 width
     * @type {number}
     */
    this.radius = 1 / 60;

    /**
     * A flag to indicate if this atom is currently selected
     * @type {boolean}
     */
    this.selected = false;
    /**
     * This atom's current color
     * @type {string}
     */
    this.color = "#F3EFEF";
    /**
     * This atom's name
     * @type {string}
     */
    this.name = "name0";

    /**
     * A flag to indicate if this atom is currently being dragged on the screen.
     * @type {boolean}
     */
    this.isMoving = false;
    /**
     * A flag to indicate if we are hovering over this atom.
     * @type {boolean}
     */
    this.showHover = false;
    /**
     * A message displayed next to the atom. Set the type and the message to display the alert. Cleared each time the output is regenerated.
     * @type {object}
     */
    this.alert = {
      type: AlertType.NONE,
      message: "",
    };
  }

  /**
   * Applies each of the passed values to this as this.x
   * @param {object} values - A list of values to set
   */
  setValues(values) {
    //Assign the object to have the passed in values

    for (var key in values) {
      this[key] = values[key];
    }

    if (typeof this.ioValues !== "undefined") {
      this.ioValues.forEach((ioValue) => {
        //for each saved value
        this.inputs.forEach((io) => {
          //Find the matching IO and set it to be the saved value
          if (ioValue.name == io.name && io.type == "input") {
            io.value = ioValue.ioValue;
            if ("currentEquation" in ioValue) {
              io.currentEquation = ioValue.currentEquation;
            }
          }
        });
      });
    }
  }

  /**
   * Draws the atom on the screen
   */
  draw(drawType) {
    this.radius = GlobalVariables.atomSize;
    let xInPixels = GlobalVariables.widthToPixels(this.x);
    let yInPixels = GlobalVariables.heightToPixels(this.y);
    let radiusInPixels = GlobalVariables.widthToPixels(this.radius);

    this.inputs.forEach((child) => {
      child.draw();
    });

    GlobalVariables.c.beginPath();
    GlobalVariables.c.font = GlobalVariables.canvasFont;

    let strokeColor = Atom.DEFAULT_COLOR;
    if (this.status === Status.PROCESSING) {
      GlobalVariables.c.fillStyle = "blue";
    } else if (this.selected) {
      GlobalVariables.c.fillStyle = Atom.SELECTED_COLOR;
      GlobalVariables.c.strokeStyle = Atom.SELECTED_COLOR;
      this.color = Atom.SELECTED_COLOR;
    } else {
      GlobalVariables.c.fillStyle = Atom.DEFAULT_COLOR;
      GlobalVariables.c.strokeStyle = Atom.SELECTED_COLOR;
      this.color = Atom.DEFAULT_COLOR;
      strokeColor = Atom.SELECTED_COLOR;
    }

    GlobalVariables.c.beginPath();
    if (drawType == "rect") {
      GlobalVariables.c.rect(
        xInPixels - radiusInPixels * 1.25,
        yInPixels - this.height / 1.5,
        2.5 * radiusInPixels,
        this.height * 1.25
      );
    } else if (drawType == "square") {
      GlobalVariables.c.rect(
        xInPixels - radiusInPixels,
        yInPixels - radiusInPixels,
        2 * radiusInPixels,
        2 * radiusInPixels
      );
    } else {
      GlobalVariables.c.arc(
        xInPixels,
        yInPixels,
        radiusInPixels,
        0,
        Math.PI * 2,
        false
      );
    }
    GlobalVariables.c.textAlign = "start";
    GlobalVariables.c.fill();
    GlobalVariables.c.strokeStyle = strokeColor;
    GlobalVariables.c.fillStyle = "white";
    GlobalVariables.c.stroke();
    GlobalVariables.c.closePath();

    GlobalVariables.c.beginPath();
    GlobalVariables.c.textAlign = "start";
    GlobalVariables.c.fillText(
      this.name,
      xInPixels + radiusInPixels,
      yInPixels - radiusInPixels
    );
    GlobalVariables.c.fill();
    GlobalVariables.c.strokeStyle = strokeColor;
    GlobalVariables.c.lineWidth = 1;
    GlobalVariables.c.stroke();
    GlobalVariables.c.closePath();

    if (this.showHover) {
      if (this.alert.type != AlertType.NONE) {
        this.color = "red";
        let prefix = "ERROR: ";
        switch (this.alert.type) {
          case AlertType.WARNING:
            prefix = "WARNING: ";
            this.color = "orange";
            break;
          case AlertType.INFO:
            prefix = "INFO: ";
            this.color = Atom.DEFAULT_COLOR;
            break;
        }

        //Draw Alert block
        GlobalVariables.c.beginPath();
        const padding = 10;
        GlobalVariables.c.fillStyle = this.color;
        GlobalVariables.c.rect(
          xInPixels + radiusInPixels - padding / 2,
          yInPixels - radiusInPixels + padding / 2,
          GlobalVariables.c.measureText(prefix + this.alert.message).width +
            padding,
          -(parseInt(GlobalVariables.c.font) + padding)
        );
        GlobalVariables.c.fill();
        GlobalVariables.c.strokeStyle = "black";
        GlobalVariables.c.lineWidth = 1;
        GlobalVariables.c.stroke();
        GlobalVariables.c.closePath();

        GlobalVariables.c.beginPath();
        GlobalVariables.c.fillStyle = "black";
        GlobalVariables.c.fillText(
          prefix + this.alert.message,
          xInPixels + radiusInPixels,
          yInPixels - radiusInPixels
        );
        GlobalVariables.c.closePath();
      }
    }
  }

  /**
   * Adds a new attachment point to this atom
   * @param {boolean} type - The type of the IO (input or output)
   * @param {string} name - The name of the new attachment point
   * @param {object} target - The atom to attach the new attachment point to. Should we force this to always be this one?
   * @param {string} valueType - Describes the type of value the input is expecting options are number, geometry, array
   * @param {object} defaultValue - The default value to be used when the value is not yet set
   */
  addIO(type, name, target, valueType, defaultValue, ready, primary = false) {
    //compute the baseline offset from parent node
    if (
      target.inputs.find((o) => o.name === name && o.type === type) == undefined
    ) {
      var offset;
      if (type == "input") {
        offset = -1 * target.scaledRadius;
      } else {
        offset = target.scaledRadius;
      }
      var newAp = new AttachmentPoint({
        parentMolecule: target,
        defaultOffsetX: offset,
        defaultOffsetY: 0,
        type: type,
        valueType: valueType,
        name: name,
        primary: primary,
        value: defaultValue,
        defaultValue: defaultValue,
        uniqueID: GlobalVariables.generateUniqueID(),
        atomType: "AttachmentPoint",
        ready: true,
      });

      if (type == "input") {
        target.inputs.push(newAp);
      } else {
        target.output = newAp;
      }
    }
  }

  updateIO(type, name, target, valueType, value) {
    let ap = target.inputs.find((o) => o.name === name && o.type === type);
    if (ap) {
      ap.valueType = valueType;
      ap.value = value;
    }
  }

  /**
   * Removes an attachment point from an atom.
   * @param {boolean} type - The type of the IO (input or output).
   * @param {string} name - The name of the new attachment point.
   * @param {object} target - The attom which the attachment point is attached to. Should
   * @param {object} silent - Should any connected atoms be informed of the change
   */
  removeIO(type, name, target, silent = false) {
    //Remove the target IO attachment point
    target.inputs.forEach((input) => {
      if (input.name == name && input.type == type) {
        target.inputs.splice(target.inputs.indexOf(input), 1);
        input.deleteSelf(silent);
      }
    });
  }

  /**
   * Returns an error handler function usable with Promise.catch.
   * Prints the stack trace of a thrown error in the console and sets
   * an alert on this atom with the message of the error.
   * @returns
   */
  alertingErrorHandler() {
    return (err) => {
      console.log("Error in atom: " + this.name);
      console.log(err);
      this.setError(err.message || "Unkown error occurred");
    };
  }

  /**
   * Set a warning alert on this atom. Indicates an issue but that
   * processing will continue.
   */
  setWarning(message) {
    this.alert = { type: AlertType.WARNING, message: String(message) };
  }

  /** Set an informational alert on this atom */
  setInfo(message) {
    this.alert = { type: AlertType.INFO, message: String(message) };
  }

  /**
   * Clears the alert message attached to this atom.
   */
  clearAlert() {
    this.color = Atom.DEFAULT_COLOR;
    this.alert = { type: AlertType.NONE, message: "" };
  }

  /**
   * Delineates bounds for selection box.
   */
  selectBox(x, y, xEnd, yEnd) {
    let xIn = Math.min(x, xEnd);
    let xOut = Math.max(x, xEnd);
    let yIn = Math.min(y, yEnd);
    let yOut = Math.max(y, yEnd);
    let xInPixels = GlobalVariables.widthToPixels(this.x);
    let yInPixels = GlobalVariables.heightToPixels(this.y);
    if (xInPixels >= xIn && xInPixels <= xOut) {
      if (yInPixels >= yIn && yInPixels <= yOut) {
        //this.isMoving = true
        this.selected = true;
      }
    }
  }

  /**
   * Set the atom's response to a mouse click. This usually means selecting the atom and displaying it's contents in 3D
   * @param {number} x - The X coordinate of the click
   * @param {number} y - The Y coordinate of the click
   * @param {boolean} clickProcessed - A flag to indicate if the click has already been processed
   */
  clickDown(x, y, clickProcessed) {
    let xInPixels = GlobalVariables.widthToPixels(this.x);
    let yInPixels = GlobalVariables.heightToPixels(this.y);
    let radiusInPixels = GlobalVariables.widthToPixels(this.radius);
    let atomSelected;
    //If none of the inputs processed the click see if the atom should, if not clicked, then deselected
    if (
      !clickProcessed &&
      GlobalVariables.distBetweenPoints(x, xInPixels, y, yInPixels) <
        radiusInPixels
    ) {
      this.isMoving = true;
      this.selected = true;
      atomSelected = this;
      this.sendToRender();
    }
    //Deselect this if it wasn't clicked on, unless control is held
    else if (!GlobalVariables.ctrlDown) {
      this.selected = false;
    }
    //Returns true if something was done with the click
    this.inputs.forEach((child) => {
      if (child.clickDown(x, y, clickProcessed) == true) {
        clickProcessed = true;
      }
    });
    if (this.output && !atomSelected) {
      if (this.output.clickDown(x, y, clickProcessed) == true) {
        clickProcessed = true;
      }
    }

    return atomSelected;
  }

  /**
   * Set the atom's response to a mouse double click. By default this isn't to do anything other than mark the double click as handled.
   * @param {number} x - The X cordinate of the click
   * @param {number} y - The Y cordinate of the click
   */
  doubleClick(x, y) {
    //returns true if something was done with the click
    let xInPixels = GlobalVariables.widthToPixels(this.x);
    let yInPixels = GlobalVariables.heightToPixels(this.y);
    var clickProcessed = false;

    var distFromClick = GlobalVariables.distBetweenPoints(
      x,
      xInPixels,
      y,
      yInPixels
    );

    if (distFromClick < xInPixels) {
      clickProcessed = true;
    }

    return clickProcessed;
  }

  /**
   * Set the atom's response to a mouse click up. If the atom is moving this makes it stop moving.
   * @param {number} x - The X cordinate of the click
   * @param {number} y - The Y cordinate of the click
   */
  clickUp(x, y) {
    this.isMoving = false;

    this.inputs.forEach((child) => {
      child.clickUp(x, y);
    });
    if (this.output) {
      this.output.clickUp(x, y);
    }
  }

  /**
   * Handle change in position of the mouse. If this atom is currently being moved it's position will be
   * dragged along with the mouse.
   * Also forwards the mouse move event to children of this atom so they can react if needed.
   * @param {number} x - The X cordinate of the click
   * @param {number} y - The Y cordinate of the click
   */
  mouseMove(x, y) {
    let xInPixels = GlobalVariables.widthToPixels(this.x);
    let yInPixels = GlobalVariables.heightToPixels(this.y);
    let radiusInPixels = GlobalVariables.widthToPixels(this.radius);
    if (this.isMoving == true) {
      this.x = GlobalVariables.pixelsToWidth(x);
      this.y = GlobalVariables.pixelsToHeight(y);
    }

    this.inputs.forEach((child) => {
      child.mouseMove(x, y);
    });
    if (this.output) {
      this.output.mouseMove(x, y);
    }

    var distFromClick = GlobalVariables.distBetweenPoints(
      x,
      xInPixels,
      y,
      yInPixels
    );

    //If we are close to the attachment point move it to it's hover location to make it accessible
    if (distFromClick < radiusInPixels) {
      this.showHover = true;
    } else {
      this.showHover = false;
    }
  }

  /**
   * Set the atom's response to a key press. Is used to delete the atom if it is selected.
   * @param {string} key - The key which has been pressed.
   */
  keyPress(key) {
    this.inputs.forEach((child) => {
      child.keyPress(key);
    });
  }

  /**
   * Delete this atom. Silent prevents it from telling its neighbors
   */
  deleteNode(backgroundClickAfter = true, deletePath = true, silent = false) {
    this.inputs.forEach((input) => {
      //disable the inputs before deleting
      input.ready = false;
    });

    const inputsCopy = [...this.inputs]; //Make a copy of the inputs list to delete all of them
    inputsCopy.forEach((input) => {
      input.deleteSelf(silent);
    });
    if (this.output) {
      this.output.deleteSelf(silent);
    }
    /* Remove from worker library */
    GlobalVariables.cad.deleteFromLibrary(this.uniqueID).then(() => {});

    this.parent.nodesOnTheScreen.splice(
      this.parent.nodesOnTheScreen.indexOf(this),
      1
    ); //remove this node from the list
  }

  /**
   * UI rendering update. Runs with each frame to draw the atom.
   */
  update() {
    this.inputs.forEach((child) => {
      child.update();
    });
    if (this.output) {
      this.output.update();
    }

    this.draw();
  }

  /**
   * Create an object containing the information about this atom that we want to save.
   */
  serialize(offset = { x: 0, y: 0 }) {
    //Offsets are used to make copy and pasted atoms move over a little bit
    var ioValues = [];
    this.inputs.forEach((io) => {
      if (
        typeof io.getValue() == "number" ||
        typeof io.getValue() == "string"
      ) {
        var saveIO = {
          name: io.name,
          ioValue: io.getValue(),
          currentEquation: io.currentEquation || null,
        };
        ioValues.push(saveIO);
      }
    });

    var object = {
      atomType: this.atomType,
      name: this.name,
      x: this.x + offset.x,
      y: this.y - offset.y,
      uniqueID: this.uniqueID,
      ioValues: ioValues,
      description: this.description,
    };
    return object;
  }

  /**
   * Return any contribution from this atom to the README file
   */
  requestReadme() {
    //request any contributions from this atom to the readme

    return [];
  }

  /**
   * Compute the value of this atom. This must be overwritten by each atom type.
   * Passed the list of input values.
   *
   * Return a promise which resolves to the computed value or throws an error
   * if computation fails.
   */
  compute(...args) {
    throw new Error("compute method not implemented in Atom prototype");
  }

  setReady(value) {
    this.setStatus(Status.READY);
    this.value = value;
  }

  setError(message) {
    this.setStatus(Status.ERROR);
    this.alert = { type: AlertType.ERROR, message: String(message) };
  }

  /**
   * This method defines the core logic for propagating changes in the DAG.
   *
   * This method is called any time an input to this atom changes (including an input
   * becoming stale, becoming ready etc). There are two possible cases:
   * 1. After the change all inputs are ready. Set self to processing (and propagate this
   *   change downstream). Then compute a new value for this atom asynchronously and update
   *   to either READY or ERROR once that computation is done.
   * 2. If not all inputs are ready, set self to stale and propagate this change downstream
   *   as well.
   */
  onUpstreamChange() {
    if (
      this.inputs.filter((input) => input.ready).length == this.inputs.length
    ) {
      const inputVals = this.inputs.map((input) => input.getValue());
      this.setProcessing();
      this.compute(...inputVals)
        .then((value) => {
          this.setReady(value);
        })
        .catch(this.alertingErrorHandler);
    } else {
      this.setStale();
    }
  }

  /**
   * Set's the output value and shows the atom output on the 3D view.
   */
  decreaseToProcessCountByOne() {
    GlobalVariables.topLevelMolecule.census();
  }

  /**
   * Token update value function to give each atom one by default
   * @param {string} inputName - The name of the input that changed (optional)
   */
  updateValue(inputName) {
    // If called with an input name parameter (from AttachmentPoint),
    // just call the main updateValue logic
    if (inputName !== undefined) {
      this.updateValue();
      return;
    }

    this.waitOnComingInformation();
  }

  /**
   * Used to walk back out the tree generating a list of constants...used for evolve
   */
  walkBackForConstants(callback) {
    //Pass the call further up the chain
    this.inputs.forEach((input) => {
      input.connectors.forEach((connector) => {
        connector.walkBackForConstants(callback);
      });
    });
  }

  /**
   * Sets the atom to wait on coming information. Basically a pass through, but used for molecules
   */
  waitOnComingInformation() {
    if (this.output) {
      this.output.waitOnComingInformation();
    }
    if (this.processing) {
      //console.log("information sent to something processing");
      // this.processing = false;
    }
  }

  /**
   * Calls a worker thread to compute the atom's value.
   */
  basicThreadValueProcessing() {
    this.decreaseToProcessCountByOne();
    this.clearAlert();
    if (this.output) {
      this.output.setValue(this.uniqueID);
      this.output.ready = true;
    }
    this.processing = false;
    if (this.selected) {
      this.sendToRender();
    }
  }

  /**
   * Starts propagation placeholder. Most atom types do not begin propagation.
   */
  beginPropagation() {}

  /**
   * Returns an array of length two indicating that this is one atom and if it is waiting to be computed
   */
  census() {
    var waiting = 0;
    this.inputs.forEach((input) => {
      if (input.ready != true) {
        waiting = 1;
      }
    });
    return [1, waiting];
  }

  /**
   * Send the value of this atom to the 3D display.
   */
  sendToRender() {
    //Send code to JSxCAD to render
    try {
      GlobalVariables.writeToDisplay(this.uniqueID);
    } catch (err) {
      this.setError(err);
    }
  }
  /**
   * Create Leva Menu Inputs - returns to ParameterEditor
   */
  createLevaInputs() {
    let inputParams = {};

    /** Runs through active atom inputs and adds IO parameters to default param*/
    if (this.inputs) {
      this.inputs.map((input) => {
        const checkConnector = () => {
          return input.connectors.length > 0;
        };

        /* Makes inputs for Io's other than geometry */
        if (input.valueType !== "geometry") {
          inputParams[this.uniqueID + input.name] = {
            value: input.currentEquation ? input.currentEquation : input.value,
            label: input.name,
            step: 0.25,
            type: LevaInputs.STRING,
            disabled: checkConnector(),
            onChange: async (value) => {
              let currentEquation = String(value).trim();
              input.currentEquation = currentEquation;
              try {
                const result = await this.evaluateEquation(
                  currentEquation,
                  input.name
                );
                if (Number.isFinite(result)) {
                  if (result !== input.value) {
                    input.setValue(result);
                  }
                }
              } catch (err) {
                input.setValue(NaN);
                this.alertingErrorHandler()(err);
              }
            },
          };
        }
      });
      return inputParams;
    }
  }

  /**
   * Evaluate the equation
   */
  async evaluateEquation(equation) {
    let substitutedEquation = String(equation ?? "").trim();
    const variables = await this.extractVariablesFromEquation(
      substitutedEquation
    );
    const unresolved = [];
    const resolvedValues = {};
    if (variables.length > 0) {
      const parentInputs =
        (this.parent && this.parent.inputs) ||
        (this.parentMolecule && this.parentMolecule.inputs) ||
        [];
      for (const variable of variables) {
        let value = null;
        // Try parent inputs first
        for (let j = 0; j < parentInputs.length; j++) {
          if (parentInputs[j].name === variable) {
            value = parentInputs[j].value;
            break;
          }
        }
        // Then this atom's inputs
        if (value === null || value === undefined) {
          for (let i = 0; i < this.inputs.length; i++) {
            if (this.inputs[i].name === variable) {
              value = this.findIOValue(this.inputs[i].name);
              break;
            }
          }
        }
        let num = Number(value);
        if (
          value === null ||
          value === undefined ||
          (typeof value === "string" && value.trim() === "") ||
          !Number.isFinite(num)
        ) {
          unresolved.push(variable);
        } else {
          resolvedValues[variable] = num;
        }
      }
    }
    if (unresolved.length) {
      const msg = `Variable(s) not found: ${unresolved.join(
        ", "
      )}. Make sure the variables you are using exist as inputs`;
      console.warn(msg);
      throw new Error(msg);
    } else {
      this.clearAlert();
      // Substitute all resolved variables
      for (const variable of Object.keys(resolvedValues)) {
        const safeVar = variable.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const variablePattern = new RegExp(`\\b${safeVar}\\b`, "gu");
        substitutedEquation = substitutedEquation.replace(
          variablePattern,
          String(resolvedValues[variable])
        );
      }
      const result = await GlobalVariables.limitedEvaluate(substitutedEquation);
      return result;
    }
  }

  /**
   * Extracts variable names from the current equation using mathjs AST parsing.
   * Only true variables (not function names) are returned.
   * @returns {string[]} Array of variable names
   */
  async extractVariablesFromEquation(equation) {
    let variables = [];
    try {
      const node = parse(equation);
      node.traverse(function (n, path, parent) {
        if (
          n.isSymbolNode &&
          !(
            parent &&
            parent.isFunctionNode &&
            parent.fn &&
            parent.fn.name === n.name
          )
        ) {
          variables.push(n.name);
        }
      });
      // Remove duplicates
      variables = [...new Set(variables)];
    } catch (e) {
      variables = [];
    }
    return variables;
  }
  /**
   * Find the value of an input for with a given name.
   * @param {string} ioName - The name of the target attachment point.
   */
  findIOValue(ioName) {
    ioName = ioName.split("~").join("");
    var ioValue = null;

    this.inputs.forEach((child) => {
      if (child.name == ioName && child.type == "input") {
        ioValue = child.getValue();
      }
    });
    return ioValue;
  }
}
