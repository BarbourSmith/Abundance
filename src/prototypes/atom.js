import { parse } from "mathjs";
import GlobalVariables from "../js/globalvariables.js";
import AttachmentPoint from "./attachmentpoint";
import { ObservableEntity, Status } from "./observableEntity.js";
import { getPredictedAtoms } from "../js/atomPrediction.js";
import React from "react";

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

  static statusAsColor(status, selected = false) {
    if (selected) {
      return Atom.SELECTED_COLOR;
    }
    switch (status) {
      case Status.DISABLED:
        return "#b3b2b3ff"; // light-Grey
      case Status.WAITING:
        return "#6bcfd6"; // light-blue
      case Status.PROCESSING:
        return "blue";
      case Status.ERROR:
        return "red";
      case Status.UPSTREAM_ERROR:
        return "#eed202";
      case Status.READY:
        return Atom.DEFAULT_COLOR;
    }
  }

  /**
   * The constructor function.
   * @param {object} values An array of values passed in which will be assigned to the class as this.x
   */
  constructor(values) {
    super();
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
    this.uniqueID = values?.uniqueID || GlobalVariables.generateUniqueID();

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

    this.context = undefined;

    this.subscribe(this.selfSubscriber.bind(this), "self-clear-alert");
  }

  selfSubscriber() {
    const status = this.getState().status;
    if (status != Status.ERROR) {
      this.alert = {
        type: AlertType.NONE,
        message: "",
      };
    }
    if (status == Status.READY && this.selected) {
      // if status just became ready and we're selected, update the render
      this.sendToRender();
    }
  }

  /**
   * Gets the context of this atom for passing to the worker functions.
   * See RequestContext type defined in geometryProvider.ts
   */
  getContext() {
    if (!this.context) {
      let curr = this;
      while (curr.parent) {
        curr = curr.parent;
      }
      this.context = { project: curr.uniqueID };
    }
    return this.context;
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
        this.inputs.forEach((ap) => {
          //Find the matching IO and set it to be the saved value
          if (ioValue.name == ap.name && ap.type == "input") {
            ap.value = ioValue.ioValue;
            if (
              "currentEquation" in ioValue &&
              !Number.isFinite(Number(ioValue.currentEquation))
            ) {
              // only load currentEquation if it exists and isn't a numeric literal
              ap.currentEquation = ioValue.currentEquation;
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

    this.color = Atom.statusAsColor(this.getState().status, this.selected);
    GlobalVariables.c.fillStyle = this.color;
    GlobalVariables.c.strokeStyle = Atom.SELECTED_COLOR;
    let strokeColor = this.selected ? Atom.DEFAULT_COLOR : Atom.SELECTED_COLOR;

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

  _subscribeToInputs() {
    this.inputs.forEach((input) => {
      input.subscribe(
        () => {
          this.onUpstreamChange();
        },
        this.uniqueID,
        false // Force no immediate callback
      );
    });
    if (this.inputs.length > 0) {
      this.onUpstreamChange();
    }
  }

  _addIOWithoutSubscribing(
    name,
    valueType,
    defaultValue = undefined,
    type = "input"
  ) {
    const prior = this.inputs.find((o) => o.name === name && o.type === type);
    if (prior == undefined) {
      var offset;
      if (type == "input") {
        offset = -1 * this.scaledRadius;
      } else {
        offset = this.scaledRadius;
      }
      var newAp = new AttachmentPoint({
        parentMolecule: this,
        defaultOffsetX: offset,
        defaultOffsetY: 0,
        type: type,
        valueType: valueType,
        name: name,
        value: defaultValue,
        defaultValue: defaultValue,
        uniqueID: GlobalVariables.generateUniqueID(),
        atomType: "AttachmentPoint",
      });
      if (type == "input") {
        this.inputs.push(newAp);
      } else {
        this.output = newAp;
      }
      return newAp;
    } else {
      return prior;
    }
  }

  /**
   * Add multiple IOs to this atom. Doesn't subscribe until all IOs have been added.
   *
   * ioList should be a list of {name: "inputName", valueType: "number"|"geometry", defaultValue: 0|undefined, type: "output"|undefined}
   */
  addAllIOs(ioList) {
    ioList.forEach((io) => {
      this._addIOWithoutSubscribing(
        io.name,
        io.valueType,
        io.defaultValue,
        io.type
      );
    });
    this._subscribeToInputs();
  }

  /**
   * Adds a new attachment point to this atom
   * @param {string} name - The name of the new attachment point
   * @param {string} valueType - Describes the type of value the input is expecting options are number, geometry, array
   * @param {object} defaultValue - The default value to be used when the value is not yet set
   * @param {string} type - Default is "input", may be overwritten to "output"
   */
  //type, name, target, valueType, defaultValue, ready, primary = false)
  addIO(name, valueType, defaultValue = undefined, type = "input") {
    const io = this._addIOWithoutSubscribing(
      name,
      valueType,
      defaultValue,
      type
    );
    this._subscribeToInputs();
    return io;
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
        input.unsubscribe(this.uniqueID);
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
      this.setError(err || "Unknown error occurred");
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
   * Enable this atom and all it's upstream connections.
   *
   * Returns a boolean indicating if the atom became enabled (true) or was already enabled (false).
   */
  enable() {
    // Case 1: This atom is already enabled - this call is therefore a no-op. Return false.
    if (this.isEnabled()) {
      return false;
    }

    // Check if this atom has input connections
    const hasUpstreamConnections = this.inputs.some(
      (input) => input.connectors && input.connectors.length > 0
    );

    if (hasUpstreamConnections) {
      // Case 2: This atom has input connections - switch to waiting then enable upstream atoms.
      this.setWaiting();
      const upstreamEnableResults = [];
      this.inputs.forEach((input) => {
        if (input.connectors && input.connectors.length > 0) {
          input.connectors.forEach((connector) => {
            // Find the upstream atom through the connector
            // attachmentPoint1 is the output (upstream), attachmentPoint2 is the input (this atom)
            const upstreamAtom = connector.attachmentPoint1?.parentMolecule;
            if (upstreamAtom && upstreamAtom !== this) {
              // Recursively enable the upstream atom
              upstreamEnableResults.push(upstreamAtom.enable());
            }
          });
        }
      });

      // Special case where all our inputs were already enabled.
      // Kick off propagation from here without delay
      if (upstreamEnableResults.every((res) => res === false)) {
        this.onUpstreamChange();
      }
    } else {
      this.setWaiting(); // transition out of disabled.
      this.onUpstreamChange(); // prompt atom to compute it's value and callback its subscribers.
    }
    return true;
  }

  disable() {
    // TODO(tristan): do something clever about preserving value for cases
    // where we'll be re-enabled.
    this.setDisabled(false);
  }

  /**
   * Check if this atom is currently enabled (not in DISABLED status)
   * @returns {boolean} true if enabled, false if disabled
   */
  isEnabled() {
    return this.status !== Status.DISABLED;
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
      input.unsubscribe(this.uniqueID);
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
    );
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
    this.inputs.forEach((ap) => {
      if (
        typeof ap.getValue() == "number" ||
        typeof ap.getValue() == "string"
      ) {
        var saveIO = {
          name: ap.name,
          ioValue: ap.getValue(),
        };
        // Only include currentEquation if it exists
        if (ap.currentEquation) {
          saveIO.currentEquation = ap.currentEquation;
        }
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
    throw new Error(
      "compute method must be overwritten. Missing in subclass: " +
        this.constructor.name
    );
  }

  setError(err) {
    if (err instanceof Error) {
      err = err.message;
    }
    this.alert = { type: AlertType.ERROR, message: String(err) };
    this.setStatus(Status.ERROR);
  }

  /**
   * Return true if our inputs are ready for us to compute a value.
   */
  inputsAreReady() {
    return this.inputs.every((input) => {
      return input.getState().status == Status.READY;
    });
  }

  /**
   * Return true if any of our inputs have an error or upstream error.
   */
  inputsHaveErrors() {
    return this.inputs.some((input) => {
      const status = input.getState().status;
      return status === Status.ERROR || status === Status.UPSTREAM_ERROR;
    });
  }

  /**
   * This method defines the core logic for propagating changes in the DAG.
   *
   * Called any time an input to this atom changes (including an input
   * becoming stale, becoming ready etc). There are two possible cases:
   * 1. After the change all inputs are ready. Set self to processing (and propagate this
   *   change downstream). Then compute a new value for this atom asynchronously and update
   *   to either READY or ERROR once that computation is done.
   * 2. If not all inputs are ready, set self to stale and propagate this change downstream
   *   as well.
   */
  onUpstreamChange() {
    // No-op if this atom isn't enabled
    if (!this.isEnabled()) {
      return;
    }

    // Check for errors in inputs first
    if (this.inputsHaveErrors()) {
      this.setUpstreamError();
      return;
    }

    if (this.inputsAreReady()) {
      const argsDict = Object.fromEntries(
        this.inputs.map((input) => [input.name, input.getState().value])
      );

      // const inputVals = this.inputs.map((input) => {input.getValue());
      this.setProcessing();
      this.compute(argsDict)
        .then((value) => {
          this.setReady(value);
        })
        .catch(this.alertingErrorHandler());
    } else {
      this.setWaiting();
      GlobalVariables.cad
        .deleteFromLibrary(this.uniqueID)
        .catch(this.alertingErrorHandler());
    }
  }

  /**
   * Send the value of this atom to the 3D display.
   */
  sendToRender() {
    //Send code to JSxCAD to render
    try {
      GlobalVariables.writeToDisplay(this.value);
    } catch (err) {
      this.setError(err);
    }
  }

  /**  */
  createPredictedParams() {
    if (this.atomType == "Molecule") {
      return {};
    }
    let predictedParams = {};
    predictedParams[this.uniqueID + "spacer"] = {
      type: "spacer",
      height: 12,
    };
    let predictedAtoms = getPredictedAtoms(this.atomType);
    // Create a buttongroup for all predicted atoms
    predictedParams[this.uniqueID + "predictedGroup"] = {
      type: "buttongroup",
      buttons: predictedAtoms.map((atom) => {
        const hasIcon =
          GlobalVariables.availableTypes &&
          Object.prototype.hasOwnProperty.call(
            GlobalVariables.availableTypes,
            atom.toLowerCase()
          );
        return {
          icon: hasIcon
            ? React.createElement("span", {
                className: atom,
                style: {
                  display: "inline-block",
                  width: 24,
                  height: 24,
                  verticalAlign: "middle",
                  backgroundSize: "contain",
                  backgroundRepeat: "no-repeat",
                },
                //title: atom,
              })
            : undefined,
          ghostStyle: true,
          label: hasIcon ? `Add ${atom}` : `Add ${atom}`,
          onClick: () => {
            GlobalVariables.currentMolecule.placeAtom(
              {
                x: this.x + 0.1,
                y: this.y,
                parent: GlobalVariables.currentMolecule,
                atomType: atom,
                uniqueID: GlobalVariables.generateUniqueID(),
              },
              true
            );
          },
        };
      }),
    };

    return predictedParams;
  }

  createInputParams() {
    let inputParams = {};

    /** Runs through active atom inputs and adds IO parameters to default param*/
    if (this.inputs) {
      this.inputs.map((input) => {
        const checkConnector = () => {
          return input.connectors.length > 0;
        };
        /* Makes inputs for Io's other than geometry */
        if (input.valueType === "string") {
          inputParams[this.uniqueID + input.name] = {
            type: input.valueType,
            value: input.value,
            label: input.name,
            disabled: checkConnector(),
            onChange: (value) => {
              if (input.value !== value) {
                input.setValue(value);
              }
            },
          };
        } else if (input.valueType !== "geometry") {
          inputParams[this.uniqueID + input.name] = {
            type: "string", //forcing string type to evaluate as equation
            value: input.currentEquation ? input.currentEquation : input.value,
            label: input.name,
            disabled: checkConnector(),
            onChange: (value) => {
              let currentEquation = String(value).trim();
              input.currentEquation = currentEquation;
              try {
                // Ensure inputs exist for variables in the equation before evaluating
                this.ensureInputsForEquation(currentEquation);
                const result = this.evaluateEquation(currentEquation);

                if (Number.isFinite(result)) {
                  if (result !== input.value) {
                    input.setValue(result);
                  }
                }
              } catch (err) {
                console.log("setting value to NaN");
                input.setValue(NaN);
                this.alertingErrorHandler()(err);
              }
            },
          };
        }
      });
    }
    const flowCanvas = document.getElementById("flow-canvas");
    if (
      GlobalVariables.isMobile() &&
      flowCanvas &&
      flowCanvas.style.display !== "none" //in runMode don't show delete button
    ) {
      inputParams[this.uniqueID + "delete"] = {
        type: "button",
        label: "Delete Selected",
        onClick: () => {
          flowCanvas.focus();
          const event = new KeyboardEvent("keydown", {
            bubbles: true,
            cancelable: true,
            key: "Delete",
            code: "Delete",
            keyCode: 46,
          });
          flowCanvas.dispatchEvent(event);
        },
      };
    }

    return inputParams;
  }

  /**
   * Ensure that inputs exist for all variables in the given equation.
   * This method adds missing inputs dynamically but doesn't remove existing ones.
   * @param {string} equation - The equation to check for variables
   */
  ensureInputsForEquation(equation) {
    const variables = this.extractVariablesFromEquation(equation);
    const BUILTIN_CONSTS = new Set(["pi", "e", "tau", "Infinity", "NaN"]);
    const parentInputs =
      (this.parent && this.parent.inputs) ||
      (this.parentMolecule && this.parentMolecule.inputs) ||
      [];

    // Get parent input names to avoid duplicating them
    const parentInputNames = parentInputs.map((input) => input.name);

    const inputsToAdd = [];

    for (const variable of variables) {
      if (BUILTIN_CONSTS.has(variable)) {
        continue; // Skip built-in constants
      }

      // Check if variable already exists as an input on this atom
      const existsAsInput = this.inputs.some(
        (input) => input.name === variable
      );

      // Check if variable exists as a parent input
      const existsAsParentInput = parentInputNames.includes(variable);

      // Only add input if variable doesn't exist anywhere
      if (!existsAsInput && !existsAsParentInput) {
        inputsToAdd.push({
          name: variable,
          valueType: "number",
          defaultValue: 1,
        });
      }
    }

    // Add all needed inputs at once to avoid multiple subscription updates
    if (inputsToAdd.length > 0) {
      this.addAllIOs(inputsToAdd);
    }
  }

  /**
   * Evaluate the equation
   */
  evaluateEquation(equation) {
    let substitutedEquation = String(equation ?? "").trim();

    // Handle empty or whitespace-only equations gracefully
    if (!substitutedEquation) {
      // If the equation is empty, treat it as zero
      substitutedEquation = "0";
    }

    // Check if equation contains string literals (quoted text)
    const hasStringLiterals = /["']/.test(substitutedEquation);

    if (hasStringLiterals) {
      // Handle as string concatenation
      return this.evaluateStringExpression(substitutedEquation);
    } else {
      // Handle as mathematical expression (existing behavior)
      return this.evaluateMathExpression(substitutedEquation);
    }
  }

  /**
   * Evaluate string concatenation expressions
   */
  evaluateStringExpression(equation) {
    // Parse string concatenation expression
    const parts = [];
    let current = "";
    let inQuotes = false;
    let quoteChar = "";

    for (let i = 0; i < equation.length; i++) {
      const char = equation[i];

      if ((char === '"' || char === "'") && !inQuotes) {
        inQuotes = true;
        quoteChar = char;
        current += char; // Keep the quote
      } else if (char === quoteChar && inQuotes) {
        inQuotes = false;
        current += char; // Keep the quote
        quoteChar = "";
      } else if (char === "+" && !inQuotes) {
        if (current.trim()) {
          parts.push(current.trim());
        }
        current = "";
      } else {
        current += char;
      }
    }
    if (current.trim()) {
      parts.push(current.trim());
    }

    // Evaluate each part and concatenate
    let result = "";
    for (const part of parts) {
      if (part.startsWith('"') && part.endsWith('"')) {
        // String literal with double quotes - remove quotes and keep content
        result += part.slice(1, -1);
      } else if (part.startsWith("'") && part.endsWith("'")) {
        // String literal with single quotes - remove quotes and keep content
        result += part.slice(1, -1);
      } else {
        // Variable or number - resolve its value
        const trimmed = part.trim();
        if (trimmed) {
          const value = this.resolveVariable(trimmed);
          result += String(value);
        }
      }
    }

    return result;
  }

  /**
   * Evaluate mathematical expressions (existing logic extracted)
   */
  evaluateMathExpression(substitutedEquation) {
    const variables = this.extractVariablesFromEquation(substitutedEquation);
    const unresolved = [];
    const resolvedValues = {};
    const BUILTIN_CONSTS = new Set(["pi", "e", "tau", "Infinity", "NaN"]);
    if (variables.length > 0) {
      const parentInputs =
        (this.parent && this.parent.inputs) ||
        (this.parentMolecule && this.parentMolecule.inputs) ||
        [];
      for (const variable of variables) {
        if (BUILTIN_CONSTS.has(variable)) {
          continue; // let evaluator handle it
        }
        let value = null;
        // Try parent inputs first
        for (let j = 0; j < parentInputs.length; j++) {
          if (parentInputs[j].name === variable) {
            value =
              typeof parentInputs[j].getValue === "function"
                ? parentInputs[j].getValue()
                : parentInputs[j].value;
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

      // Safely evaluate the mathematical expression with error handling
      try {
        const result = GlobalVariables.limitedEvaluate(substitutedEquation);
        return result;
      } catch (error) {
        // Handle mathematical expression parsing errors gracefully
        const msg = `Invalid mathematical expression: "${substitutedEquation}". ${error.message}`;
        console.warn("Mathematical expression evaluation failed:", msg);
        throw new Error(msg);
      }
    }
  }

  /**
   * Resolve a variable name to its value
   */
  resolveVariable(variableName) {
    const BUILTIN_CONSTS = new Set(["pi", "e", "tau", "Infinity", "NaN"]);

    if (BUILTIN_CONSTS.has(variableName)) {
      return variableName; // Let it be handled as constant
    }

    // Check if it's a number
    const num = Number(variableName);
    if (!isNaN(num) && isFinite(num)) {
      return num;
    }

    // Try parent inputs first
    const parentInputs =
      (this.parent && this.parent.inputs) ||
      (this.parentMolecule && this.parentMolecule.inputs) ||
      [];
    for (let j = 0; j < parentInputs.length; j++) {
      if (parentInputs[j].name === variableName) {
        const value =
          typeof parentInputs[j].getValue === "function"
            ? parentInputs[j].getValue()
            : parentInputs[j].value;
        return value !== null && value !== undefined ? value : variableName;
      }
    }

    // Then this atom's inputs
    for (let i = 0; i < this.inputs.length; i++) {
      if (this.inputs[i].name === variableName) {
        const value = this.findIOValue(this.inputs[i].name);
        return value !== null && value !== undefined ? value : variableName;
      }
    }

    // If variable not found, return the variable name itself
    return variableName;
  }

  /**
   * Extracts variable names from the current equation using mathjs AST parsing.
   * Only true variables (not function names) are returned.
   * @returns {string[]} Array of variable names
   */
  extractVariablesFromEquation(equation) {
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
