import { parse } from "mathjs";
import GlobalVariables from "../js/globalvariables.js";
import { ValueChangeCommand } from "../js/undoCommands.js";
import AttachmentPoint from "./attachmentpoint";
import { ObservableEntity, Status } from "./observableEntity.js";
import { getPredictedAtoms } from "../js/atomPrediction.js";
import React from "react";

/*THREEJS*/
import * as THREE from "three";
import { Line2 } from "three/addons/lines/Line2.js";
import { LineMaterial } from "three/addons/lines/LineMaterial.js";
import { LineGeometry } from "three/examples/jsm/lines/LineGeometry.js";

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

    /**
     * An object that stores threeJS geometry and material to be rendered.
     * @type {object}
     */
    this.nonReplicadGeom = {
      geometry: [],
      material: null,
      hideMainMesh: false, // whether to hide the main mesh when rendering this geometry (used for gcode visualization)
    };

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
   * @param {object} backCompatInputNames - A mapping of current input names to old input names for backwards compatibility when loading old saves. Format is {currentName: [oldName1, oldName2, ...]}
   */
  setValues(values, backCompatInputNames = {}) {
    //Assign the object to have the passed in values

    for (var key in values) {
      this[key] = values[key];
    }

    if (typeof this.ioValues !== "undefined") {
      // this.inputs is set by current version of this atom's code.

      this.inputs.forEach((ap) => {
        if (ap.name in backCompatInputNames) {
          ap.oldNames = backCompatInputNames[ap.name];
        }

        //Find the matching IO and set it to be the saved value
        const matchingSavedVal = this.ioValues?.find(
          (savedVal) =>
            savedVal.name === ap.name || ap.oldNames?.includes(savedVal.name),
        );

        if (matchingSavedVal && ap.type == "input") {
          ap.value = matchingSavedVal.ioValue;
          if (
            "currentEquation" in matchingSavedVal &&
            !Number.isFinite(Number(matchingSavedVal.currentEquation))
          ) {
            // only load currentEquation if it exists and isn't a numeric literal
            ap.currentEquation = matchingSavedVal.currentEquation;
          }
        }
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
        this.height * 1.25,
      );
    } else if (drawType == "square") {
      GlobalVariables.c.rect(
        xInPixels - radiusInPixels,
        yInPixels - radiusInPixels,
        2 * radiusInPixels,
        2 * radiusInPixels,
      );
    } else {
      GlobalVariables.c.arc(
        xInPixels,
        yInPixels,
        radiusInPixels,
        0,
        Math.PI * 2,
        false,
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
      yInPixels - radiusInPixels,
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

        // Wrap text to maximum width
        const fullMessage = prefix + this.alert.message;
        const maxWidth = 300; // Maximum width in pixels
        const padding = 20;
        const lineHeight = parseInt(GlobalVariables.c.font) + 4;

        // Helper function to wrap text
        const wrapText = (text, maxPixelWidth) => {
          const lines = [];
          const words = text.split(" ");
          let currentLine = "";

          for (let word of words) {
            const testLine = currentLine ? currentLine + " " + word : word;
            const lineWidth = GlobalVariables.c.measureText(testLine).width;

            if (lineWidth > maxPixelWidth && currentLine) {
              lines.push(currentLine);
              currentLine = word;
            } else {
              currentLine = testLine;
            }
          }
          if (currentLine) {
            lines.push(currentLine);
          }

          return lines;
        };

        const wrappedLines = wrapText(fullMessage, maxWidth);
        const boxHeight = -(wrappedLines.length * lineHeight + padding);

        // Draw Alert block
        GlobalVariables.c.beginPath();
        GlobalVariables.c.fillStyle = this.color;
        GlobalVariables.c.rect(
          xInPixels + radiusInPixels - padding / 2,
          yInPixels - radiusInPixels + padding / 2,
          maxWidth + padding,
          boxHeight,
        );
        GlobalVariables.c.fill();
        GlobalVariables.c.strokeStyle = "black";
        GlobalVariables.c.lineWidth = 1;
        GlobalVariables.c.stroke();
        GlobalVariables.c.closePath();

        // Draw wrapped text lines
        GlobalVariables.c.beginPath();
        GlobalVariables.c.fillStyle = "black";
        wrappedLines.forEach((line, index) => {
          GlobalVariables.c.fillText(
            line,
            xInPixels + radiusInPixels,
            yInPixels - radiusInPixels + index * lineHeight + boxHeight / 2,
          );
        });
        GlobalVariables.c.closePath();
      }
    }
  }

  /**
   * Register this.onUpstreamChange as a subscriber to all inputs. If there are
   * more than zero inputs call back onUpstreamChange once after all inputs
   * are added and return True. Returns False if there were no inputs, and
   * therefore onUpstreamChange wasn't called.
   */
  _subscribeToInputs() {
    this.inputs.forEach((input) => {
      input.subscribe(
        () => {
          this.onUpstreamChange();
        },
        this.uniqueID,
        false, // Force no immediate callback
      );
    });
    if (this.inputs.length > 0) {
      this.onUpstreamChange();
      return true;
    }
    return false;
  }

  _addIOWithoutSubscribing(
    name,
    valueType,
    defaultValue = undefined,
    type = "input",
    options = {},
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
        options: options,
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
        io.type,
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
      type,
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
      console.error("Error in atom: " + this.getAtomPath());
      console.error(err);
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
      (input) => input.connectors && input.connectors.length > 0,
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
      yInPixels,
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
      if (this.atomType == "Input") {
        // Input atoms are locked to the left side, only update y position
        this.y = GlobalVariables.pixelsToHeight(y);
      } else {
        this.x = GlobalVariables.pixelsToWidth(x);
        this.y = GlobalVariables.pixelsToHeight(y);
      }
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
      yInPixels,
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
    // Dispose of label geometries to free GPU memory
    this.disposeLabelGeometry();

    this.inputs.forEach((input) => {
      input.unsubscribe(this.uniqueID);
      input.deleteSelf(silent);
    });
    if (this.output) {
      this.output.deleteSelf(silent);
    }

    this.parent.nodesOnTheScreen.splice(
      this.parent.nodesOnTheScreen.indexOf(this),
      1,
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
   * Helper method to safely add a value to a serialized object.
   * Prevents accidentally serializing large objects or geometry data.
   * @param {object} target - The object to add the value to
   * @param {string} key - The property name
   * @param {any} value - The value to add
   * @param {string} atomName - Name of the atom for logging
   * @returns {boolean} - True if value was added, false if skipped
   */
  static safeSerializeValue(target, key, value, atomName = "unknown") {
    const MAX_VALUE_SIZE = 10000; // 10KB limit

    // Skip null/undefined
    if (value === null || value === undefined) {
      return false;
    }

    // Skip geometry objects
    if (
      typeof value === "object" &&
      value !== null &&
      (value.geometry || value.dimension || value.tags)
    ) {
      console.warn(
        `Skipping serialization of geometry object for ${atomName}.${key}`,
      );
      return false;
    }

    // Check string size
    if (typeof value === "string" && value.length > MAX_VALUE_SIZE) {
      console.warn(
        `Skipping serialization of large string (${value.length} chars) for ${atomName}.${key}`,
      );
      return false;
    }

    // Check object size when stringified
    if (typeof value === "object" && value !== null) {
      try {
        const stringified = JSON.stringify(value);
        if (stringified.length > MAX_VALUE_SIZE) {
          console.warn(
            `Skipping serialization of large object (${stringified.length} chars) for ${atomName}.${key}`,
          );
          return false;
        }
      } catch (e) {
        console.warn(
          `Skipping serialization of non-serializable object for ${atomName}.${key}:`,
          e.message,
        );
        return false;
      }
    }

    // Value is safe to add
    target[key] = value;
    return true;
  }

  /**
   * Create an object containing the information about this atom that we want to save.
   */
  serialize(offset = { x: 0, y: 0 }) {
    //Offsets are used to make copy and pasted atoms move over a little bit
    var ioValues = [];
    this.inputs.forEach((ap) => {
      // Skip geometry outputs entirely
      if (ap.valueType === "geometry") {
        if (ap.type !== "input") {
          // Skip non-input geometry
          return;
        } else {
          // For geometry inputs, serialize a placeholder
          ioValues.push({
            name: ap.name,
            ioValue: "__GEOMETRY_INPUT__",
          });
          return;
        }
      }
      // Handle array values
      if (ap.valueType === "array" && Array.isArray(ap.getValue())) {
        const currentValue = ap.getValue();
        const isDifferentFromDefault =
          !Array.isArray(ap.defaultValue) ||
          JSON.stringify(ap.defaultValue) !== JSON.stringify(currentValue);
        const isMoleculeInput = ap.type === "input";
        if (isDifferentFromDefault || isMoleculeInput) {
          ioValues.push({
            name: ap.name,
            ioValue: currentValue,
          });
        }
        return;
      }

      // Handle point2d and point3d values (which are arrays)
      if (
        (ap.valueType === "point2d" || ap.valueType === "point3d") &&
        Array.isArray(ap.getValue())
      ) {
        const currentValue = ap.getValue();
        const isDifferentFromDefault =
          !Array.isArray(ap.defaultValue) ||
          JSON.stringify(ap.defaultValue) !== JSON.stringify(currentValue);
        const isMoleculeInput = ap.type === "input";
        if (isDifferentFromDefault || isMoleculeInput) {
          ioValues.push({
            name: ap.name,
            ioValue: currentValue,
          });
        }
        return;
      }

      if (
        typeof ap.getValue() == "number" ||
        typeof ap.getValue() == "string" ||
        typeof ap.getValue() == "boolean"
      ) {
        // Only save values that differ from defaults or have custom equations
        const currentValue = ap.getValue();
        const hasCustomEquation =
          ap.currentEquation && ap.currentEquation.trim() !== "";
        const isDifferentFromDefault = ap.defaultValue !== currentValue;

        // Skip if value is a very large string (likely serialized object data)
        // Normal equations and values should be under 10KB
        const MAX_VALUE_SIZE = 10000;
        if (
          typeof currentValue === "string" &&
          currentValue.length > MAX_VALUE_SIZE
        ) {
          console.warn(
            `Skipping serialization of large string value (${currentValue.length} chars) for attachment point: ${ap.name}`,
          );
          return;
        }

        // For attachment points that are inputs to molecules (created by Input atoms),
        // ALWAYS save values (even if they match defaults) because they define
        // the molecule's interface. Input attachments have type="input".
        const isMoleculeInput = ap.type === "input";

        // Save if value changed from default OR has custom equation OR is a molecule input
        if (isDifferentFromDefault || hasCustomEquation || isMoleculeInput) {
          var saveIO = {
            name: ap.name,
            ioValue: currentValue,
          };
          // Only include currentEquation if it exists and it's not too large
          if (hasCustomEquation) {
            if (ap.currentEquation.length > MAX_VALUE_SIZE) {
              console.warn(
                `Skipping serialization of large equation (${ap.currentEquation.length} chars) for attachment point: ${ap.name}`,
              );
            } else {
              saveIO.currentEquation = ap.currentEquation;
            }
          }
          ioValues.push(saveIO);
        }
      }
    });
    var object = {
      atomType: this.atomType,
      x: this.x + offset.x,
      y: this.y - offset.y,
      uniqueID: this.uniqueID,
    };

    // Only save name if it differs from atomType or for special types that can have custom names
    const needsName =
      this.atomType === "Molecule" ||
      this.atomType === "GitHubMolecule" ||
      this.name !== this.atomType;
    if (needsName) {
      object.name = this.name;
    }

    // Only save ioValues if not empty
    if (ioValues.length > 0) {
      object.ioValues = ioValues;
    }

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
        this.constructor.name,
    );
  }

  setError(err) {
    if (err instanceof Error) {
      err = err.message;
    }
    const path = this.getAtomPath();
    const message = path ? `[${path}] ${err}` : String(err);
    this.alert = { type: AlertType.ERROR, message };
    this.setStatus(Status.ERROR);
  }

  /**
   * Get the full path of this atom in the molecule hierarchy.
   * Example: "top level/molecule1/moleculemimi/code"
   * @returns {string} The full path of this atom
   */
  getAtomPath() {
    const path = [];
    let current = this;

    // Walk up the parent chain
    while (current) {
      path.unshift(current.name || current.atomType || "unknown");
      current = current.parent || current.parentMolecule;
    }

    return path.join("/");
  }

  /**
   * Return true if our inputs are ready for us to compute a value.
   */
  inputsAreReady() {
    return this.inputs.every((input) => {
      return input.getState().status == Status.READY || input.isOptional;
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

  // For label atoms, we serialize the geometry data in a custom way and reconstruct as THREEJS geometry here
  disposeLabelGeometry() {
    if (
      this.nonReplicadGeom?.geometry &&
      Array.isArray(this.nonReplicadGeom.geometry)
    ) {
      this.nonReplicadGeom.geometry.forEach((obj) => {
        if (obj && typeof obj === "object") {
          // Dispose geometry if it exists
          if (obj.geometry && obj.geometry.dispose) {
            obj.geometry.dispose();
          }
          // Dispose all materials and their textures
          if (obj.material) {
            if (Array.isArray(obj.material)) {
              obj.material.forEach((mat) => {
                if (mat && mat.dispose) {
                  mat.dispose();
                }
                if (mat && mat.map && mat.map.dispose) {
                  mat.map.dispose();
                }
              });
            } else if (obj.material.dispose) {
              obj.material.dispose();
              if (obj.material.map && obj.material.map.dispose) {
                obj.material.map.dispose();
              }
            }
          }
        }
      });
      this.nonReplicadGeom.geometry = null;
    }
  }

  reconstructLabelGeometry(serializedLabels) {
    // Accepts an array of label objects
    const labels = Array.isArray(serializedLabels)
      ? serializedLabels
      : [serializedLabels];
    const geometries = [];
    labels.forEach((serializedLabel, idx) => {
      // --- Line ---
      const start = new THREE.Vector3(...serializedLabel.line.start);
      const end = new THREE.Vector3(...serializedLabel.line.end);

      const lineGeo = new LineGeometry();
      lineGeo.setPositions([
        ...serializedLabel.line.start,
        ...serializedLabel.line.end,
      ]);

      const lineMat = new LineMaterial({
        color: serializedLabel.line.color,
        linewidth: serializedLabel.line.linewidth,
        resolution: new THREE.Vector2(window.innerWidth, window.innerHeight),
      });

      const line = new Line2(lineGeo, lineMat);
      line.name = `label-line-${idx}`;
      geometries.push(line);

      // --- End Segments (perpendicular marks at line endpoints) ---
      if (serializedLabel.endSegments) {
        // Start end segment
        const startSegGeo = new LineGeometry();
        startSegGeo.setPositions([
          ...serializedLabel.endSegments.start.p1,
          ...serializedLabel.endSegments.start.p2,
        ]);
        const startSegMat = new LineMaterial({
          color: serializedLabel.endSegments.color,
          linewidth: serializedLabel.endSegments.linewidth,
          resolution: new THREE.Vector2(window.innerWidth, window.innerHeight),
        });
        const startSegLine = new Line2(startSegGeo, startSegMat);
        startSegLine.name = `label-end-segment-start-${idx}`;
        geometries.push(startSegLine);

        // End end segment
        const endSegGeo = new LineGeometry();
        endSegGeo.setPositions([
          ...serializedLabel.endSegments.end.p1,
          ...serializedLabel.endSegments.end.p2,
        ]);
        const endSegMat = new LineMaterial({
          color: serializedLabel.endSegments.color,
          linewidth: serializedLabel.endSegments.linewidth,
          resolution: new THREE.Vector2(window.innerWidth, window.innerHeight),
        });
        const endSegLine = new Line2(endSegGeo, endSegMat);
        endSegLine.name = `label-end-segment-end-${idx}`;
        geometries.push(endSegLine);
      }

      // --- Text Sprite ---
      const canvas = document.createElement("canvas");
      canvas.width = 2048; // Large width to accommodate longer text, will be scaled down by sprite scale
      canvas.height = 1024;
      const ctx = canvas.getContext("2d");
      ctx.font = serializedLabel.text.font;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";

      // Draw stroke (text color)
      ctx.strokeStyle = serializedLabel.text.color;
      ctx.lineWidth = 15;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.strokeText(
        serializedLabel.text.value,
        canvas.width / 2,
        canvas.height / 2,
      );

      // Draw fill (white)
      ctx.fillStyle = "white";
      ctx.fillText(
        serializedLabel.text.value,
        canvas.width / 2,
        canvas.height / 2,
      );

      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      const material = new THREE.SpriteMaterial({
        map: texture,
        depthTest: false,
      });
      const sprite = new THREE.Sprite(material);
      sprite.scale.set(...serializedLabel.text.scale);
      sprite.position.set(...serializedLabel.text.position);
      sprite.name = `label-text-${idx}`;

      geometries.push(sprite);
    });
    return {
      geometry: geometries,
      material: null,
      hideMainMesh: false,
    };
  }

  //gets called after compute if there is a non-Replicad geometry result to convert it to threeJS geometry for rendering
  buildNonReplicadGeom(atomValue) {
    // Dispose old label geometries first
    this.disposeLabelGeometry();

    let nrs = atomValue.nonReplicadSerialized;

    // Filter out empty objects from the array
    if (Array.isArray(nrs)) {
      nrs = nrs.filter((item) => item && Object.keys(item).length > 0);
    }

    // Check if we have valid data to process
    if (!nrs || (Array.isArray(nrs) && nrs.length === 0)) {
      // No geometry to process
      this.nonReplicadGeom = {
        geometry: [],
        material: null,
        hideMainMesh: false,
      };
      return;
    }

    // Check if this is Label geometry
    const hasLabels =
      (Array.isArray(nrs) && nrs.length > 0 && nrs[0].type === "Label") ||
      nrs.type === "Label";

    if (hasLabels) {
      this.nonReplicadGeom = this.reconstructLabelGeometry(nrs);
    } else {
      // For non-Label geometry, pass it through as-is
      // The nonReplicadGeometry context will handle rendering
      this.nonReplicadGeom = {
        geometry: [],
        material: null,
        hideMainMesh: false,
      };
    }
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
        this.inputs.map((input) => [input.name, input.getState().value]),
      );
      this.setProcessing();

      this.compute(argsDict)
        .then((value) => {
          this.buildNonReplicadGeom(value);
          this.setReady(value);

          if (
            this.setInputChanged &&
            typeof this.setInputChanged === "function"
          ) {
            this.setInputChanged(this.status);
          }
        })
        .catch(this.alertingErrorHandler());
    } else {
      this.setWaiting();
    }
  }

  /**
   * Send the value of this atom to the 3D display.
   */
  sendToRender() {
    //Send code to JSxCAD to render
    try {
      GlobalVariables.writeToDisplay(
        this.value,
        this.getContext(),
        false,
        this.nonReplicadGeom,
      );
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
            atom.toLowerCase(),
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
              true,
            );
          },
        };
      }),
    };

    return predictedParams;
  }

  createInputParams(setInputChanged) {
    // Stash the React-side state setter so other code on this atom (e.g.
    // `Code#updateCode` after re-parsing its `Inputs = [...]` block, or
    // `Import#loadFile` after a file load completes) can ask the input
    // panel to re-derive its controls. Subclasses no longer need to
    // duplicate this assignment.
    if (typeof setInputChanged === "function") {
      this.setInputChanged = setInputChanged;
    }

    let inputParams = {};

    /** Runs through active atom inputs and adds IO parameters to default param*/
    if (this.inputs) {
      this.inputs.map((input) => {
        // Check if input has a connector attached
        const hasConnector = input.connectors.length > 0;

        // Handle import type inputs
        if (input.options?.importType) {
          const inputAtom = input.options.inputAtom;
          if (!hasConnector && inputAtom) {
            inputParams[this.uniqueID + input.name + "_load"] = {
              type: "button",
              label: "Import " + input.name,
              onClick: () => {
                if (inputAtom) {
                  const fileType = (input.options.importOptions || [
                    "SVG",
                    "STL",
                    "STEP",
                  ])[inputAtom.importIndex || 0];
                  inputAtom.loadFile(fileType, () => {
                    // Trigger update after file is loaded
                    if (typeof inputAtom.setInputChanged === "function") {
                      inputAtom.setInputChanged(inputAtom.fileName);
                    }
                  });
                }
              },
            };
          }
        } else if (input.valueType === "string") {
          /* Makes inputs for Io's other than geometry */
          // When connector is attached, show the value from upstream connection
          const displayValue = hasConnector ? input.getValue() : input.value;
          inputParams[this.uniqueID + input.name] = {
            type: input.valueType,
            value: displayValue,
            label: input.name,
            disabled: hasConnector,
            onChange: (value) => {
              if (input.value !== value) {
                if (!GlobalVariables.isUndoing && this.parent) {
                  const oldVal = input.value;
                  const inputName = input.name;
                  GlobalVariables.pushUndoCommand(
                    new ValueChangeCommand(
                      this.uniqueID,
                      this.parent,
                      inputName,
                      oldVal,
                      (atom, val) => {
                        const inp = atom.inputs.find(
                          (i) => i.name === inputName,
                        );
                        if (inp) inp.setValue(val);
                      },
                      `Change ${this.name} "${input.name}"`,
                    ),
                  );
                }
                input.setValue(value);
              }
            },
          };
        } else if (input.valueType === "point2d") {
          // Handle 2D point inputs
          const displayValue = hasConnector ? input.getValue() : input.value;
          inputParams[this.uniqueID + input.name] = {
            type: "point",
            value: [displayValue?.[0] ?? 0, displayValue?.[1] ?? 0],
            label: input.name,
            step: 0.1,
            disabled: hasConnector,
            onChange: (value) => {
              if (!GlobalVariables.isUndoing && this.parent) {
                const oldVal = input.value ? [...input.value] : [0, 0];
                const inputName = input.name;
                GlobalVariables.pushUndoCommand(
                  new ValueChangeCommand(
                    this.uniqueID,
                    this.parent,
                    inputName,
                    oldVal,
                    (atom, val) => {
                      const inp = atom.inputs.find((i) => i.name === inputName);
                      if (inp) inp.setValue(val);
                    },
                    `Change ${this.name} "${input.name}"`,
                  ),
                );
              }
              input.setValue([value[0], value[1]]);
            },
          };
        } else if (input.valueType === "point3d") {
          // Handle 3D point inputs
          const displayValue = hasConnector ? input.getValue() : input.value;
          inputParams[this.uniqueID + input.name] = {
            type: "point",
            value: [
              displayValue?.[0] ?? 0,
              displayValue?.[1] ?? 0,
              displayValue?.[2] ?? 0,
            ],
            label: input.name,
            step: 0.1,
            disabled: hasConnector,
            onChange: (value) => {
              if (!GlobalVariables.isUndoing && this.parent) {
                const oldVal = input.value ? [...input.value] : [0, 0, 0];
                const inputName = input.name;
                GlobalVariables.pushUndoCommand(
                  new ValueChangeCommand(
                    this.uniqueID,
                    this.parent,
                    inputName,
                    oldVal,
                    (atom, val) => {
                      const inp = atom.inputs.find((i) => i.name === inputName);
                      if (inp) inp.setValue(val);
                    },
                    `Change ${this.name} "${input.name}"`,
                  ),
                );
              }
              input.setValue([value[0], value[1], value[2]]);
            },
          };
        } else if (input.valueType === "array") {
          // Handle array editor controls for array inputs
          // Value is the actual array; fall back to options (legacy
          // comma-separated default values) or an empty array.
          const arrVal = Array.isArray(input.value)
            ? input.value
            : Array.isArray(input.options)
              ? [...input.options]
              : [];
          inputParams[this.uniqueID + input.name] = {
            type: "array",
            value: arrVal,
            label: input.name,
            disabled: hasConnector,
            elementType: input.elementType,
            onChange: (value) => {
              const newArr = Array.isArray(value) ? [...value] : [];
              if (!GlobalVariables.isUndoing && this.parent) {
                const oldVal = Array.isArray(input.value)
                  ? [...input.value]
                  : input.value;
                const inputName = input.name;
                GlobalVariables.pushUndoCommand(
                  new ValueChangeCommand(
                    this.uniqueID,
                    this.parent,
                    inputName,
                    oldVal,
                    (atom, val) => {
                      const inp = atom.inputs.find((i) => i.name === inputName);
                      if (inp) inp.setValue(val);
                    },
                    `Change ${this.name} "${input.name}"`,
                  ),
                );
              }
              input.setValue(newArr);
            },
          };
        } else if (input.valueType === "range") {
          // Handle range slider for range inputs
          const min = input.options?.min ?? 0;
          const max = input.options?.max ?? 100;
          const step = input.options?.step ?? 1;
          inputParams[this.uniqueID + input.name] = {
            type: "rangeSlider",
            value: input.value ?? min,
            label: input.name,
            min: min,
            max: max,
            step: step,
            disabled: hasConnector,
            onChange: (value) => {
              if (!GlobalVariables.isUndoing && this.parent) {
                const oldVal = Array.isArray(input.value)
                  ? [...input.value]
                  : input.value;
                const inputName = input.name;
                GlobalVariables.pushUndoCommand(
                  new ValueChangeCommand(
                    this.uniqueID,
                    this.parent,
                    inputName,
                    oldVal,
                    (atom, val) => {
                      const inp = atom.inputs.find((i) => i.name === inputName);
                      if (inp) inp.setValue(val);
                    },
                    `Change ${this.name} "${input.name}"`,
                  ),
                );
              }
              input.setValue(value);
            },
          };
        } else if (input.valueType === "boolean") {
          inputParams[this.uniqueID + input.name] = {
            type: "boolean",
            value: input.value,
            label: input.name,
            onChange: (value) => {
              if (!GlobalVariables.isUndoing && this.parent) {
                const oldVal = input.value;
                const inputName = input.name;
                GlobalVariables.pushUndoCommand(
                  new ValueChangeCommand(
                    this.uniqueID,
                    this.parent,
                    inputName,
                    oldVal,
                    (atom, val) => {
                      const inp = atom.inputs.find((i) => i.name === inputName);
                      if (inp) inp.setValue(val);
                    },
                    `Change ${this.name} "${input.name}"`,
                  ),
                );
              }
              input.setValue(value);
            },
          };
        } else if (input.valueType !== "geometry") {
          // When connector is attached, show the value from upstream connection
          let displayValue;
          if (hasConnector) {
            displayValue = input.getValue();
          } else {
            displayValue = input.currentEquation || input.value;
          }
          inputParams[this.uniqueID + input.name] = {
            type: "string", //forcing string type to evaluate as equation
            value: displayValue,
            label: input.name,
            disabled: hasConnector,
            onChange: (value) => {
              let currentEquation = String(value).trim();
              if (!GlobalVariables.isUndoing && this.parent) {
                const oldEquation =
                  input.currentEquation != null
                    ? input.currentEquation
                    : input.value;
                const inputName = input.name;
                GlobalVariables.pushUndoCommand(
                  new ValueChangeCommand(
                    this.uniqueID,
                    this.parent,
                    inputName,
                    oldEquation,
                    (atom, val) => {
                      const inp = atom.inputs.find((i) => i.name === inputName);
                      if (inp) {
                        inp.currentEquation = val;
                        try {
                          atom.ensureInputsForEquation(val);
                          if (
                            inp._nameSubscriptionActive &&
                            inp._nameSubscribedAtoms &&
                            inp._nameSubscribedAtoms.size > 0
                          )
                            return;
                          const result = atom.evaluateEquation(val);
                          if (Number.isFinite(result)) inp.setValue(result);
                        } catch (err) {
                          // Invalid equation - don't update the value to NaN
                          // Keep the previous value instead
                        }
                      }
                    },
                    `Change ${this.name} "${input.name}"`,
                  ),
                );
              }
              input.currentEquation = currentEquation;
              try {
                // Ensure inputs exist for variables in the equation before evaluating
                this.ensureInputsForEquation(currentEquation);

                // If the AttachmentPoint has active name-based subscriptions, it will handle
                // the evaluation and value updates. Skip duplicate evaluation.
                if (
                  input._nameSubscriptionActive &&
                  input._nameSubscribedAtoms &&
                  input._nameSubscribedAtoms.size > 0
                ) {
                  // Subscriptions are handling updates, no need to evaluate here
                  return;
                }

                const result = this.evaluateEquation(currentEquation);

                if (Number.isFinite(result)) {
                  if (result !== input.value) {
                    input.setValue(result);
                  }
                }
              } catch (err) {
                // Invalid equation - don't update the value, which prevents NaN from propagating
                // The error is shown to user via alertingErrorHandler, and the value remains unchanged
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
   * Create parameters for export menu. Base implementation returns empty object.
   * Override in subclasses that support export functionality (e.g., Molecule).
   * @param {function} setInputChanged - Callback to trigger re-render of input panel
   * @returns {object} Object of export menu parameters
   */
  createExportMenuInputs(setInputChanged) {
    return {};
  }

  /**
   * Ensure that inputs exist for all variables in the given equation.
   * This method adds missing inputs dynamically but doesn't remove existing ones.
   * NOTE: Only Equation and Code atoms are allowed to dynamically add new inputs.
   * Other atoms will get an error when evaluating if variables are not found.
   * @param {string} equation - The equation to check for variables
   */
  ensureInputsForEquation(equation) {
    // Only Equation and Code atoms are allowed to dynamically add new inputs
    // Other atoms should get an error if variables are not recognized
    if (this.atomType !== "Equation" && this.atomType !== "Code") {
      return; // Don't add inputs for other atom types
    }

    const variables = this.extractVariablesFromEquation(equation);
    const BUILTIN_CONSTS = new Set(["pi", "e", "tau", "Infinity", "NaN"]);
    // Check all ancestor molecules, not just the immediate parent
    const ancestorInputs = this.getInputsFromAncestors();

    // Get parent input names to avoid duplicating them
    const parentInputNames = ancestorInputs.map((input) => input.name);

    const inputsToAdd = [];

    for (const variable of variables) {
      if (BUILTIN_CONSTS.has(variable)) {
        continue; // Skip built-in constants
      }

      // Check if variable already exists as an input on this atom
      const existsAsInput = this.inputs.some(
        (input) => input.name === variable,
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

    // Normalize smart/curly quotes to standard ASCII quotes
    // This handles copy-paste from Word, Google Docs, etc.
    substitutedEquation = substitutedEquation
      .replace(/[\u201C\u201D\u201E\u201F\u2033\u2036]/g, '"') // Various double quote styles
      .replace(/[\u2018\u2019\u201A\u201B\u2032\u2035]/g, "'"); // Various single quote styles

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
    const notFound = [];
    const nonFinite = [];
    const resolvedValues = {};
    const BUILTIN_CONSTS = new Set(["pi", "e", "tau", "Infinity", "NaN"]);
    if (variables.length > 0) {
      // Get inputs from all ancestors up the chain, not just immediate parent
      const parentInputs = this.getInputsFromAncestors();
      for (const variable of variables) {
        if (BUILTIN_CONSTS.has(variable)) {
          continue; // let evaluator handle it
        }
        let value = null;
        let wasFound = false;
        // Try parent inputs first (now includes all ancestors)
        for (let j = 0; j < parentInputs.length; j++) {
          if (parentInputs[j].name === variable) {
            value =
              typeof parentInputs[j].getValue === "function"
                ? parentInputs[j].getValue()
                : parentInputs[j].value;
            wasFound = true;

            break;
          }
        }
        // Then this atom's inputs
        if (!wasFound) {
          for (let i = 0; i < this.inputs.length; i++) {
            if (this.inputs[i].name === variable) {
              value = this.findIOValue(this.inputs[i].name);
              wasFound = true;
              break;
            }
          }
        }

        // If variable was never found in any inputs
        if (!wasFound) {
          notFound.push(variable);
        } else {
          // Variable was found, but check if it resolves to a finite number
          let num = Number(value);
          if (
            value === null ||
            value === undefined ||
            (typeof value === "string" && value.trim() === "") ||
            !Number.isFinite(num)
          ) {
            nonFinite.push({ name: variable, value });
          } else {
            resolvedValues[variable] = num;
          }
        }
      }
    }
    // Check for errors and throw appropriate message
    if (notFound.length) {
      const msg = `Variable(s) not found: ${notFound.join(
        ", ",
      )}. Make sure the variables you are using exist as inputs in ${this.getAtomPath()}`;
      console.warn(msg);
      throw new Error(msg);
    }
    if (nonFinite.length) {
      const details = nonFinite
        .map((item) => `"${item.name}" (value: ${JSON.stringify(item.value)})`)
        .join(", ");
      const msg = `Variable(s) could not be resolved to finite number: ${details}. Ensure equations in input values are fully resolvable in ${this.getAtomPath()}`;
      console.warn(msg);
      throw new Error(msg);
    }

    this.clearAlert();
    // Substitute all resolved variables
    for (const variable of Object.keys(resolvedValues)) {
      const safeVar = variable.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const variablePattern = new RegExp(`\\b${safeVar}\\b`, "gu");
      substitutedEquation = substitutedEquation.replace(
        variablePattern,
        String(resolvedValues[variable]),
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

  /**
   * Get all inputs from this atom and all ancestor molecules up the chain
   * @returns {Array} Array of all ancestor inputs
   */
  getInputsFromAncestors() {
    const allInputs = [];
    let current = this;

    // Traverse up the parent chain (molecule hierarchy)
    while (current) {
      const parentInputs =
        (current.parent && current.parent.inputs) ||
        (current.parentMolecule && current.parentMolecule.inputs) ||
        null;

      if (parentInputs) {
        // Add inputs from this level, avoiding duplicates (prefer higher in hierarchy)
        parentInputs.forEach((input) => {
          if (!allInputs.some((i) => i.name === input.name)) {
            allInputs.push(input);
          }
        });
      }

      // Move up to parent molecule
      current = current.parent || current.parentMolecule;
      if (current && !current.inputs) {
        // Stop if we hit a non-molecule parent
        break;
      }
    }

    return allInputs;
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

    // Try parent inputs first (now includes all ancestors up the chain)
    const parentInputs = this.getInputsFromAncestors();
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
