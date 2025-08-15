import Connector from "./connector.js";
import GlobalVariables from "../js/globalvariables.js";
import Atom from "../prototypes/atom.js";
import { Global } from "@emotion/react";
import { ObservableEntity, Status } from "./observableEntity.js";

/**
 * This class creates a new attachmentPoint which are the input and output blobs on Atoms
 */
export default class AttachmentPoint extends ObservableEntity {
  // Constant dictates how far from the parent molecule APs are rendered when in a hover position.
  // Expressed as a multiple of the parents radius.
  static get DIST_FROM_PARENT() {
    return 2;
  }

  // Constant dictates how much larger an AP becomes when it's activated for selection, ie, when clicking
  // or unclicking will engage the AP.
  static get TARGET_SCALEUP() {
    return 1.2;
  }

  // Constant dictates the radius of all APs, as a fraction of page width.
  static get RADIUS() {
    return 1 / 150;
  }

  /**
   * The constructor function.
   * @param {object} values An array of values passed in which will be assigned to the class as this.x
   */
  constructor(values) {
    super();

    /**
     * Whether this AP is currently visible in the Flow Canvas, eg if the mouse is close to this
     * APs parent molecule.
     */
    this.isVisible = false;

    /**
     * If this AP is in a 'targeted' state. This AP is 'targeted' if a at the mouse's current location a
     * click or release will activate this AP, starting or completing a connection respectively.
     */
    this.isTargeted = false;

    /**
     * The current position of this AP. Measured in fraction of canvas width (x) or canvas height (x).
     */
    this.x;
    this.y;

    /**
     * A unique identifying number for this attachment point among all other elements on the Flow Canvas.
     * @type {number}
     */
    this.uniqueID = 0; // This always gets reset in the values loop below but it could be made so much clearer.

    /**
     * The attachment point type.
     * @type {string}
     */
    this.atomType = "AttachmentPoint";

    /**
     * The attachment point value type. Options are number, geometry, array.
     * @type {string}
     */
    this.valueType = "number";

    /**
     * The attachment point type. Options are input, output.
     * @type {string}
     */
    this.type = "output";

    this.connectors = [];

    /**
     * The default value to be used by the ap when nothing is attached
     * @type {string}
     */
    this.defaultValue = this.valueType == "number" ? 10 : null;

    /**
     * This atom's parent, usually the molecule which contains this atom...how is this different from this.parent?
     * @type {object}
     */
    this.parentMolecule = null;

    for (var key in values) {
      /**
       * Assign values in values as this.x
       */
      this[key] = values[key];
    }

    // Initially hide this attachment point.
    this.unexpand();
    this.setDefault();
  }

  /**
   * Gets the scaled radius of this attachment point based on the parent molecule's radius
   */
  get scaledRadius() {
    // Scale the attachment point radius based on the parent atom's radius
    // Using the default atom radius (1/60) as reference
    return AttachmentPoint.RADIUS * (this.parentMolecule.radius / (1 / 60));
  }

  /**
   * Draws the attachment point on the screen. Called with each frame.
   */
  draw() {
    // No-op if this AP is not currently visible.
    if (!this.isVisible) {
      return;
    }
    let xInPixels = GlobalVariables.widthToPixels(this.x);
    let yInPixels = GlobalVariables.heightToPixels(this.y);

    let radiusInPixels = GlobalVariables.widthToPixels(this.scaledRadius);

    if (this.isTargeted) {
      radiusInPixels = radiusInPixels * AttachmentPoint.TARGET_SCALEUP;
    }

    GlobalVariables.c.font = GlobalVariables.canvasFont;
    var textWidth = GlobalVariables.c.measureText(this.name).width;

    var bubbleColor =
      this.name === "geometry" ? Atom.SELECTED_COLOR : "#C300FF";
    var halfRadius = radiusInPixels * 0.5;
    GlobalVariables.c.globalCompositeOperation = "source-over";
    GlobalVariables.c.beginPath();
    GlobalVariables.c.fillStyle = bubbleColor;

    var topEdge = yInPixels - radiusInPixels;
    var leftEdge = xInPixels;
    if (this.type == "input") {
      leftEdge = xInPixels - textWidth - radiusInPixels - halfRadius;
    }

    var textStart = leftEdge;
    if (this.type == "output") {
      textStart = leftEdge + radiusInPixels + halfRadius;
    }

    // Draw pill-shape for the text of this AP
    GlobalVariables.c.arc(
      leftEdge,
      yInPixels,
      radiusInPixels,
      Math.PI / 2,
      (-1 * Math.PI) / 2
    );
    GlobalVariables.c.rect(
      leftEdge,
      topEdge,
      textWidth + radiusInPixels + halfRadius,
      radiusInPixels * 2
    );
    GlobalVariables.c.arc(
      leftEdge + textWidth + radiusInPixels + halfRadius,
      yInPixels,
      radiusInPixels,
      (-1 * Math.PI) / 2,
      Math.PI / 2
    );
    GlobalVariables.c.fill();

    // Draw text name of this AP
    GlobalVariables.c.beginPath();
    GlobalVariables.c.fillStyle = Atom.DEFAULT_COLOR;
    GlobalVariables.c.fillText(this.name, textStart, yInPixels + 2);
    GlobalVariables.c.fill();
    GlobalVariables.c.closePath();

    // Draw the circular connection target
    GlobalVariables.c.beginPath();
    if (this.type == "output") {
      GlobalVariables.c.fillStyle = this.parentMolecule.color;
    } else {
      GlobalVariables.c.fillStyle = Atom.statusAsColor(
        this.status,
        this.parentMolecule.selected
      );
    }

    GlobalVariables.c.strokeStyle = this.parentMolecule.selected
      ? Atom.DEFAULT_COLOR
      : Atom.SELECTED_COLOR;
    GlobalVariables.c.lineWidth = 1;

    GlobalVariables.c.arc(
      xInPixels,
      yInPixels,
      radiusInPixels,
      0,
      Math.PI * 2,
      false
    );
    GlobalVariables.c.fill();
    GlobalVariables.c.stroke();
    GlobalVariables.c.closePath();
  }

  /**
   * Handles mouse click down. If the click is inside the AP it's connectors are selected if it is an input.
   * @param {number} x - The x coordinate of the click
   * @param {number} y - The y coordinate of the click
   * @param {boolean} clickProcessed - Has the click already been handled
   */
  clickDown(x, y, clickProcessed) {
    if (this.isCloseEnoughToTarget(x, y) && !clickProcessed) {
      if (this.type == "output") {
        //begin to extend a connector from this if it is an output
        new Connector({
          parentMolecule: this.parentMolecule,
          attachmentPoint1: this,
          atomType: "Connector",
          isMoving: true,
        });
      }
      if (this.type == "input") {
        //connectors can only be selected by clicking on an input
        this.connectors.forEach((connector) => {
          //select any connectors attached to this node
          connector.selected = true;
        });
      }

      return true; //indicate that the click was handled by this object
    } else {
      if (this.type == "input") {
        //connectors can only be selected by clicking on an input
        this.connectors.forEach((connector) => {
          //unselect any connectors attached to this node
          connector.selected = false;
        });
      }
      return false; //indicate that the click was not handled by this object
    }
  }

  /**
   * Handles mouse click up. If the click is inside the AP and a connector is currently extending, then a connection is made
   * @param {number} x - The x coordinate of the click
   * @param {number} y - The y coordinate of the click
   */
  clickUp(x, y) {
    this.connectors.forEach((connector) => {
      connector.clickUp(x, y);
    });
  }

  /**
   * Handles mouse click and move to expand the AP.
   * @param {number} x - The x coordinate of the click
   * @param {number} y - The y coordinate of the click
   */
  mouseMove(x, y) {
    let activationBoundary =
      AttachmentPoint.DIST_FROM_PARENT * this.parentMolecule.radius;

    let parentXInPixels = GlobalVariables.widthToPixels(this.parentMolecule.x);
    let parentYInPixels = GlobalVariables.heightToPixels(this.parentMolecule.y);
    if (
      GlobalVariables.distBetweenPoints(
        parentXInPixels,
        x,
        parentYInPixels,
        y
      ) <= GlobalVariables.widthToPixels(activationBoundary)
    ) {
      this.isVisible = true;
      [this.x, this.y] = this.computePosition(activationBoundary);
      [this.x, this.y] = GlobalVariables.constrainToCanvasBorders(
        this.x,
        this.y
      );
      this.isTargeted = this.isCloseEnoughToTarget(x, y);
    } else {
      this.unexpand();
    }

    this.connectors.forEach((connector) => {
      connector.mouseMove(x, y);
    });
  }

  /**
   * Unexpands this attachment point, eg: when the app starts, when the mouse
   * is moved out of the expansion range, etc.
   */
  unexpand() {
    this.isVisible = false;
    this.isTargeted = false;
    // Also restore this.x and this.x to be on the perimiter of parent module
    // since those values are used when rendering connectors.
    this.y = this.parentMolecule.y;
    if (this.type == "input") {
      this.x = this.parentMolecule.x - this.parentMolecule.radius;
    } else {
      if (this.parentMolecule.atomType == "Input") {
        this.x = GlobalVariables.atomSize * 3.5;
      } else {
        this.x = this.parentMolecule.x + this.parentMolecule.radius;
      }
    }
    [this.x, this.y] = GlobalVariables.constrainToCanvasBorders(this.x, this.y);
  }

  /**
   * Computes the correct position for this AP based on parent and the provided boundary.
   * Returns a tuple of [xposition, yposition] both values in fraction-of-screen units.
   * @param {} boundary - radius of the boundary within which APs must be displayed relative to
   * the parent molecule.
   */
  computePosition(boundary) {
    const inputList = this.parentMolecule.inputs.filter(
      (ap) => ap.type == "input"
    );

    if (this.type == "output") {
      if (this.parentMolecule.atomType == "Input") {
        return [GlobalVariables.atomSize * 4, this.parentMolecule.y];
      } else {
        // Outputs are always singular and always positioned partially overlapped by the right-most
        // pole of the parent molecule.
        return [
          this.parentMolecule.x +
            this.parentMolecule.radius +
            this.scaledRadius * 0.75,
          this.parentMolecule.y,
        ];
      }
    } else if (this.type == "input" && inputList.length == 1) {
      // Singular inputs are located in a mirror of the output, ie partially overlapped by the
      // left-most pole of the parent molecule.
      return [
        this.parentMolecule.x -
          this.parentMolecule.radius -
          this.scaledRadius * 0.75,
        this.parentMolecule.y,
      ];
    } else {
      // This is one of several input APs for the parent molecule.
      // Otherwise APs are spaced in an arc at a distance around the parent molecule.
      const attachmentPointNumber = inputList.indexOf(this);
      const anglePerIO = Math.PI / (inputList.length + 1);
      // Reduce radius to ensure that the entire attachment point is inside boundary, even when targetted.
      const hoverRadius =
        boundary - this.scaledRadius * AttachmentPoint.TARGET_SCALEUP;

      // angle correction so that it centers menu adjusting to however many attachment points there are
      const angleCorrection = Math.PI / 2 + anglePerIO;
      let hoverOffsetX =
        hoverRadius *
        Math.cos(attachmentPointNumber * anglePerIO + angleCorrection);

      // Do this calculation in pixels. The fractional units of height(y) might not be 1:1 proportionate with
      // fractional units of width(x) if the canvas is rectangular. We always want these APs to look like they're
      // in a circular pattern so do this calculation in pixels then convert back to height fraction.
      let hoverOffsetY =
        -1 *
        GlobalVariables.pixelsToHeight(
          GlobalVariables.widthToPixels(hoverRadius) *
            Math.sin(attachmentPointNumber * anglePerIO + angleCorrection)
        );

      return [
        this.parentMolecule.x + hoverOffsetX,
        this.parentMolecule.y + hoverOffsetY,
      ];
    }
  }

  /**
   * Returns true if the given point is close enough to this AP that this AP should be "targetted",
   * ie, should treat clicks or mouse-releases as if they hit this AP.
   * Always false if this AP isn't visible.
   *
   * @param {} x - position in pixels
   * @param {*} y - position in pixels
   */
  isCloseEnoughToTarget(x, y) {
    if (!this.isVisible) {
      return false;
    }
    const dist = GlobalVariables.distBetweenPoints(
      x,
      GlobalVariables.widthToPixels(this.x),
      y,
      GlobalVariables.heightToPixels(this.y)
    );

    const apRadiusInPixels = GlobalVariables.widthToPixels(this.scaledRadius);

    if (this.type == "output") {
      return dist <= apRadiusInPixels * 2;
    } else {
      // this.type == "input"
      let targetRadius = apRadiusInPixels * 2;
      // check if this creates overlapping target areas in the case where there's multiple inputs.
      // If so reduce the targetting radius.
      const inputCount = this.parentMolecule.inputs.filter(
        (ap) => ap.type == "input"
      ).length;

      let hoverRadius = GlobalVariables.widthToPixels(
        AttachmentPoint.DIST_FROM_PARENT * this.parentMolecule.radius -
          this.scaledRadius * AttachmentPoint.TARGET_SCALEUP
      );

      const anglePerIO = Math.PI / (inputCount + 1);
      const maxNonOverlappingRadius = hoverRadius * Math.sin(anglePerIO / 2);

      targetRadius = Math.max(
        apRadiusInPixels,
        Math.min(targetRadius, maxNonOverlappingRadius)
      );
      return dist < targetRadius;
    }
  }

  /**
   * Just passes a key press to the attached connectors. No impact on the connector.
   * @param {string} key - The key which was pressed
   */
  keyPress(key) {
    if (this.type == "input" && this.connectors.length > 0) {
      if (
        this.connectors[0].selected &&
        ["Delete", "Backspace"].includes(key)
      ) {
        this.deleteConnector(this.connectors[0]);
      }
    }
  }

  /**
   * this AP is being deleted. Either because the parent molecule is being deleted, or because
   * this AP is being removed from it's parent (eg: an equation has been changed or this AP is
   * being removed from an assembly)
   */
  deleteSelf(silent = false) {
    for (const connector of [...this.connectors]) {
      this.deleteConnector(connector, silent);
    }
    this.connectors = [];
  }

  deleteConnector(connector, silent = false) {
    if (this.type == "input") {
      if (this.connectors.length == 1) {
        if (this.connectors[0] !== connector) {
          throw new Error(
            "Input connector exists but doesn't match delete target"
          );
        }
        const otherAP = connector.getOtherAP(this);
        if (otherAP) {
          otherAP.parentMolecule.unsubscribe(this.uniqueID);
          otherAP.deleteConnector(connector, silent);
        }
        this.connectors = [];
        this.setDefault();
      } else if (this.connectors.length > 1) {
        throw new Error("Multiple connectors attached to a single Input AP");
      }
    } else {
      // this is an output
      const index = this.connectors.indexOf(connector);
      if (index > -1) {
        this.connectors.splice(index, 1);
        connector.getOtherAP(this)?.deleteConnector(connector, silent);
      }
    }
  }

  /**
   * Can be called to see if the target coordinates are within this ap. Returns true/false.
   * @param {number} x - The x coordinate of the target
   * @param {number} y - The y coordinate of the target
   */
  wasConnectionMade(x, y) {
    return this.isCloseEnoughToTarget(x, y) && this.connectors.length == 0;
  }

  /**
   * Attaches a new connector to this ap
   * @param {object} connector - The connector to attach
   */
  attach(connector) {
    if (!(connector instanceof Connector)) {
      throw new Error("Connector must be an instance of Connector");
    }

    if (this.type == "input") {
      if (this.connectors.length === 1) {
        this.deleteConnector(this.connectors[0]); // new inbound connector usurps the old one.
      } else if (this.connectors.length > 1) {
        throw new Error("Multiple connectors attached to a single Input AP");
      }

      this.connectors = [connector];
      const upstream = connector.getOtherAP(this).parentMolecule;
      if (this.parentMolecule === upstream) {
        throw new Error("Tried to make a circular connection");
      }
      upstream.subscribe(() => {
        this.onUpstreamChange();
      }, this.uniqueID);
    } else {
      this.connectors.push(connector);
    }
  }

  onUpstreamChange() {
    if (this.connectors.length === 0) {
      console.warn("Got upstream change callback but no connector attached");
      return;
    }
    const upstreamMolecule = this.connectors[0].attachmentPoint1.parentMolecule;
    const state = upstreamMolecule.getState();
    if (state.status === Status.READY) {
      this.setStatus(Status.READY, state.value);
    } else {
      this.setStatus(upstreamMolecule.status); // No values for non-ready states
    }
  }

  /**
   * Restores the ap to it's default value.
   */
  setDefault() {
    this.setValue(this.defaultValue);
  }

  /**
   * Reads and returns the current value of the ap.
   */
  getValue() {
    return this.getState().value;
  }

  /**
   * Sets the current value of the ap.
   */
  setValue(newValue, type = this.valueType) {
    if (this.type == "input") {
      this.valueType = type; // TODO: do we need to force a propagation if this changed?
      if (this.valueType == "geometry") {
        // This should only be called when deserializing. For geometries we'll allow the
        // id to be stored in this.value, but status stays "WAITING" until it's overwritten
        // by the onUpstreamChange callback subscribed a connector
        this.value = newValue;
        this.setWaiting();
      } else {
        // This is a number input. As long as the deserialized value is defined then we're
        // ready.
        this.setStatus(
          newValue === undefined || newValue === null
            ? Status.WAITING
            : Status.READY,
          newValue
        );
      }
    } else {
      // this.type == "output"
      console.log("setValue called on output..... no op");
    }
  }

  /**
   * Computes the curent position and then draws the ap on the screen.
   */
  update() {
    this.draw();

    this.connectors.forEach((connector) => {
      //update any connectors attached to this node
      connector.update();
    });
  }
}
