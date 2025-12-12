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

  /**
   * Computes the distance from parent molecule for attachment point expansion
   * based on the number of input attachment points. For molecules with more than
   * 5 inputs, the distance is increased to ensure all attachment points are accessible.
   * @param {number} inputCount - The number of input attachment points
   * @returns {number} The distance multiplier from parent molecule
   */
  static getDistFromParent(inputCount) {
    if (inputCount <= 5) {
      return AttachmentPoint.DIST_FROM_PARENT;
    }
    // Increase radius by 0.3 for each additional input beyond 5
    return AttachmentPoint.DIST_FROM_PARENT + (inputCount - 5) * 0.3;
  }

  /**
   * Gets the count of input attachment points for this attachment point's parent molecule.
   * @returns {number} The number of input attachment points
   */
  getInputCount() {
    return this.parentMolecule.inputs.filter((ap) => ap.type == "input").length;
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

  // Regular expression pattern to match simple identifier names for name-based subscriptions.
  // Matches strings that start with a letter or underscore, followed by any number of
  // letters, digits, or underscores (e.g., "wood", "diameter", "my_value").
  static get NAME_PATTERN() {
    return /^[A-Za-z_][A-Za-z0-9_]*$/;
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
     * Internal storage for currentEquation
     * @type {string}
     * @private
     */
    this._currentEquation = undefined;

    /**
     * Map of Input atoms currently subscribed to by name (variable name -> Input atom)
     * @type {Map<string, object>}
     */
    this._nameSubscribedAtoms = new Map();

    /**
     * Flag indicating if name-based subscriptions are currently active
     * @type {boolean}
     */
    this._nameSubscriptionActive = false;

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
   * Gets the current equation value
   * @returns {string} The current equation
   */
  get currentEquation() {
    return this._currentEquation;
  }

  /**
   * Sets the current equation and attempts to subscribe to matching Input atoms.
   * Extracts all variable names from the equation and subscribes to any matching
   * Input atoms for live value updates. When any subscribed Input changes,
   * the equation is re-evaluated.
   * @param {string} value - The equation string
   */
  set currentEquation(value) {
    this._currentEquation = value;

    // Skip subscription logic for geometry types
    if (this.valueType === "geometry") {
      return;
    }

    // Extract variables from the equation and subscribe to matching Input atoms
    if (typeof value === "string" && value.trim()) {
      this.subscribeToVariablesInEquation(value);
    } else {
      // Clear all subscriptions if no equation
      this.unsubscribeAllNameSubscriptions();
    }
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
    // Calculate input count for dynamic expansion radius
    const inputCount = this.getInputCount();
    const distFromParent = AttachmentPoint.getDistFromParent(inputCount);

    let activationBoundary = distFromParent * this.parentMolecule.radius;

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
        // Position output at the right edge of the Input atom, accounting for dynamic width
        const inputWidthInPixels =
          this.parentMolecule.width ||
          GlobalVariables.widthToPixels(GlobalVariables.atomSize * 3.25);
        const inputWidthFractional = GlobalVariables.pixelsToWidth(
          inputWidthInPixels * 0.75
        );
        return [
          this.parentMolecule.x + inputWidthFractional,
          this.parentMolecule.y,
        ];
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
      const inputCount = this.getInputCount();

      const distFromParent = AttachmentPoint.getDistFromParent(inputCount);
      let hoverRadius = GlobalVariables.widthToPixels(
        distFromParent * this.parentMolecule.radius -
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
    // Clean up any name-based subscriptions
    this.unsubscribeNameSubscription();

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
        if (!silent) {
          // Try to re-establish name-based subscriptions if the current equation contains variables
          const currentValue = this.currentEquation || this.value;
          if (typeof currentValue === "string" && currentValue.trim()) {
            // Re-subscribe to variables in the equation
            this.subscribeToVariablesInEquation(currentValue);
            if (
              this._nameSubscribedAtoms &&
              this._nameSubscribedAtoms.size > 0
            ) {
              // Successfully re-established name subscriptions, no need to call setDefault
              return;
            }
          }
          // Fall back to default if no subscriptions were established
          this.setDefault();
        }
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
   * Checks if two attachment points have compatible value types for connection
   * @param {AttachmentPoint} outputAP - The output attachment point
   * @param {AttachmentPoint} inputAP - The input attachment point
   * @returns {boolean} True if the types are compatible for connection
   */
  static areTypesCompatible(outputAP, inputAP) {
    // If either attachment point doesn't have a defined valueType, allow the connection
    if (!outputAP.valueType || !inputAP.valueType) {
      return true;
    }

    // Same types are always compatible
    if (outputAP.valueType === inputAP.valueType) {
      return true;
    }

    // Special compatibility rules:
    // - geometry can connect to geometry
    // - number can connect to number
    // - array can connect to array
    // - Other combinations are not compatible by default
    return false;
  }

  /**
   * Can be called to see if the target coordinates are within this ap. Returns true/false.
   * Now supports replacing existing connections if types are compatible.
   * @param {number} x - The x coordinate of the target
   * @param {number} y - The y coordinate of the target
   * @param {AttachmentPoint} outputAP - The output attachment point trying to connect (optional)
   */
  wasConnectionMade(x, y, outputAP) {
    if (!this.isCloseEnoughToTarget(x, y)) {
      return false;
    }

    // If no existing connections, allow the connection
    if (this.connectors.length === 0) {
      return true;
    }

    // If there are existing connections and no output AP provided, don't allow replacement
    if (!outputAP) {
      return false;
    }

    // Check if the new connection type is compatible with this input
    return AttachmentPoint.areTypesCompatible(outputAP, this);
  }

  /**
   * Finds an Input atom by name, starting from this AP's parent molecule and walking up the parent chain.
   * Returns the closest matching Input atom or null if not found.
   * @param {string} name - The name of the Input atom to find
   * @returns {object|null} The Input atom or null if not found
   */
  findInputAtomByName(name) {
    if (!name || typeof name !== "string") {
      return null;
    }

    let currentMolecule = this.parentMolecule?.parent || this.parentMolecule;

    // Walk up the parent chain to find the Input atom
    while (currentMolecule) {
      // Check if this molecule has the Input atom
      if (currentMolecule.nodesOnTheScreen) {
        const inputAtom = currentMolecule.nodesOnTheScreen.find(
          (atom) =>
            GlobalVariables.isReferencableByName(atom) && atom.name === name
        );
        if (inputAtom) {
          return inputAtom;
        }
      }

      // Move to parent molecule
      currentMolecule = currentMolecule.parent;
    }

    return null;
  }

  /**
   * Unsubscribes from all existing name-based subscriptions
   */
  unsubscribeAllNameSubscriptions() {
    if (this._nameSubscribedAtoms && this._nameSubscribedAtoms.size > 0) {
      for (const [varName, inputAtom] of this._nameSubscribedAtoms) {
        console.log(
          `[Name Subscription] AP "${this.name}" (${this.uniqueID}) unsubscribing from Input atom "${inputAtom.name}"`
        );
        inputAtom.unsubscribe(this.uniqueID);
      }
      this._nameSubscribedAtoms.clear();
      this._nameSubscriptionActive = false;
    }
  }

  // Alias for backward compatibility
  unsubscribeNameSubscription() {
    this.unsubscribeAllNameSubscriptions();
  }

  /**
   * Extracts variable names from an equation string.
   * Uses mathjs parsing if available on parentMolecule, otherwise falls back to regex.
   * @param {string} equation - The equation string
   * @returns {string[]} Array of variable names found in the equation
   */
  extractVariablesFromEquation(equation) {
    // Try to use parent molecule's extractVariablesFromEquation if available
    if (
      this.parentMolecule &&
      typeof this.parentMolecule.extractVariablesFromEquation === "function"
    ) {
      return this.parentMolecule.extractVariablesFromEquation(equation);
    }

    // Fallback: simple regex to find identifiers
    const identifierPattern = /[A-Za-z_][A-Za-z0-9_]*/g;
    const matches = equation.match(identifierPattern) || [];
    // Filter out common math functions and constants
    const mathFunctions = new Set([
      "sin",
      "cos",
      "tan",
      "sqrt",
      "abs",
      "min",
      "max",
      "pow",
      "log",
      "exp",
      "floor",
      "ceil",
      "round",
      "pi",
      "e",
      "tau",
      "Infinity",
      "NaN",
    ]);
    return [...new Set(matches.filter((m) => !mathFunctions.has(m)))];
  }

  /**
   * Subscribes to all Input atoms that match variables in the given equation.
   * When any subscribed Input atom changes, the equation is re-evaluated.
   * @param {string} equation - The equation string containing variable references
   */
  subscribeToVariablesInEquation(equation) {
    // First, unsubscribe from any existing subscriptions
    this.unsubscribeAllNameSubscriptions();

    // Extract variables from the equation
    const variables = this.extractVariablesFromEquation(equation);
    console.log(
      `[Name Subscription] AP "${this.name}" (${
        this.uniqueID
      }) found variables in equation "${equation}": [${variables.join(", ")}]`
    );

    if (variables.length === 0) {
      return;
    }

    // Subscribe to each variable that matches an Input atom
    let subscribedCount = 0;
    for (const varName of variables) {
      const inputAtom = this.findInputAtomByName(varName);
      if (inputAtom) {
        console.log(
          `[Name Subscription] AP "${this.name}" (${this.uniqueID}) subscribing to Input atom "${inputAtom.name}" (${inputAtom.uniqueID}) for variable "${varName}"`
        );

        this._nameSubscribedAtoms.set(varName, inputAtom);

        // Subscribe with a callback that re-evaluates the equation
        inputAtom.subscribe(
          () => {
            this.onSubscribedInputChanged(inputAtom);
          },
          this.uniqueID,
          false
        ); // Don't use immediateCallback - we'll trigger evaluation once after all subscriptions

        subscribedCount++;
      } else {
        console.log(
          `[Name Subscription] AP "${this.name}" (${this.uniqueID}) could not find Input atom for variable "${varName}"`
        );
      }
    }

    if (subscribedCount > 0) {
      this._nameSubscriptionActive = true;
      // Trigger initial evaluation
      this.reevaluateEquation();
    }
  }

  /**
   * Called when a subscribed Input atom changes. Re-evaluates the current equation.
   * @param {object} inputAtom - The Input atom that changed
   */
  onSubscribedInputChanged(inputAtom) {
    const state = inputAtom.getState();
    console.log(
      `[Name Subscription] AP "${this.name}" (${this.uniqueID}) received update from Input atom "${inputAtom.name}": status=${state.status}, value=${state.value}`
    );

    // Re-evaluate the equation
    this.reevaluateEquation();
  }

  /**
   * Re-evaluates the current equation and updates this AP's value.
   * For simple single-variable equations, uses the subscribed Input atom's value directly.
   * For complex expressions, substitutes variable values and evaluates.
   */
  reevaluateEquation() {
    if (!this._currentEquation || !this.parentMolecule) {
      return;
    }

    try {
      // For simple single-variable equations, use the Input atom's value directly
      // This ensures we get the most up-to-date value even if the molecule's inputs haven't been updated
      if (this._nameSubscribedAtoms && this._nameSubscribedAtoms.size === 1) {
        const [varName, inputAtom] = [
          ...this._nameSubscribedAtoms.entries(),
        ][0];
        if (this._currentEquation === varName) {
          const state = inputAtom.getState();
          console.log(
            `[Name Subscription] AP "${this.name}" (${this.uniqueID}) using Input atom "${inputAtom.name}" value directly: ${state.value}`
          );
          if (
            state.status === Status.READY &&
            state.value !== null &&
            state.value !== undefined
          ) {
            this.setStatus(Status.READY, state.value);
          } else {
            this.setStatus(state.status);
          }
          return;
        }
      }

      // For complex expressions with multiple variables or operators,
      // substitute the variable values directly and evaluate
      let substitutedEquation = this._currentEquation;
      let allReady = true;

      for (const [varName, inputAtom] of this._nameSubscribedAtoms) {
        const state = inputAtom.getState();
        if (
          state.status === Status.READY &&
          state.value !== null &&
          state.value !== undefined
        ) {
          const safeVar = varName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          substitutedEquation = substitutedEquation.replace(
            new RegExp(`\\b${safeVar}\\b`, "g"),
            String(state.value)
          );
        } else {
          allReady = false;
        }
      }

      if (!allReady) {
        // Some variables are not ready yet
        this.setStatus(Status.WAITING);
        return;
      }

      // Use the parent molecule's evaluateEquation on the substituted equation
      // (which now has numeric literals instead of variable names)
      let result;
      if (typeof this.parentMolecule.evaluateEquation === "function") {
        result = this.parentMolecule.evaluateEquation(substitutedEquation);
      } else {
        // Fallback: try to evaluate as a simple JavaScript expression
        result = Function(
          '"use strict"; return (' + substitutedEquation + ")"
        )();
      }

      console.log(
        `[Name Subscription] AP "${this.name}" (${this.uniqueID}) re-evaluated equation "${this._currentEquation}" (substituted: "${substitutedEquation}") = ${result}`
      );

      if (Number.isFinite(result)) {
        this.setStatus(Status.READY, result);
      } else {
        // Result is not a valid number
        this.setStatus(Status.WAITING);
      }
    } catch (err) {
      console.log(
        `[Name Subscription] AP "${this.name}" (${this.uniqueID}) equation evaluation failed: ${err.message}`
      );
      this.setStatus(Status.WAITING);
    }
  }

  /**
   * @deprecated Use subscribeToVariablesInEquation instead
   * Subscribes to an Input atom by name. The callback will update this AP's status and value
   * to match the Input atom's state.
   * @param {string} name - The name of the Input atom to subscribe to
   * @returns {boolean} True if subscription was successful, false otherwise
   */
  subscribeToInputByName(name) {
    const inputAtom = this.findInputAtomByName(name);
    if (!inputAtom) {
      console.log(
        `[Name Subscription] AP "${this.name}" (${this.uniqueID}) could not find Input atom named "${name}"`
      );
      return false;
    }

    // Use the new method for single variable equations
    this.subscribeToVariablesInEquation(name);
    return this._nameSubscribedAtoms.size > 0;
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
      // Cancel any name-based subscription when a connector is attached
      this.unsubscribeAllNameSubscriptions();

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
   * If the value is a string containing variable names, it will attempt to subscribe
   * to matching Input atoms and evaluate the expression.
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
        // No name-based subscription for geometry types
        this.unsubscribeAllNameSubscriptions();
      } else {
        // Check if newValue is a string that might contain variable references
        if (typeof newValue === "string") {
          // Store as current equation and let the setter handle subscriptions
          this.currentEquation = newValue;

          // If we successfully subscribed to variables, the reevaluateEquation will set the value
          if (this._nameSubscribedAtoms && this._nameSubscribedAtoms.size > 0) {
            // Subscriptions are active, value will be set by reevaluateEquation
            return;
          }
          // No subscriptions established, try to evaluate as-is or use as literal value
        } else {
          // Non-string value (number, etc.) - clear any existing subscriptions
          this.unsubscribeAllNameSubscriptions();
          this._currentEquation = undefined; // Clear stored equation
        }

        // This is a number or a string with no matching variables. Set the value directly.
        this.setStatus(
          newValue === undefined || newValue === null
            ? Status.WAITING
            : Status.READY,
          newValue
        );
      }
    } else {
      // this.type == "output"
      //console.log("setValue called on output..... no op");
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
