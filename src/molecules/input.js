import Atom from "../prototypes/atom";
import GlobalVariables from "../js/globalvariables.js";
import { Status } from "../prototypes/observableEntity.js";

/**
 * This class creates the input atom.
 */
export default class Input extends Atom {
  /**
   * The constructor function.
   * @param {object} values An array of values passed in which will be assigned to the class as this.x
   */
  constructor(values) {
    super(values);

    /**
     * This atom's name
     * @type {string}
     */
    this.name = "Input";
    /**
     * A description of this atom
     * @type {string}
     */
    this.description =
      "Adds an input to the parent molecule. If the parent molecule is the top level of the project then the input will be available when the project is shared or imported into another project. Name is editable";
    /**
     * The value the input is set to, defaults to 10. Is this still used or are we using the value of the attachmentPoint now?
     * @type {number}
     */
    this.value = 10;
    /**
     * This atom's type
     * @type {string}
     */
    this.atomType = "Input";
    /**
     * This atom's height for drawing
     * @type {number}
     */
    this.height;

    this.width;

    this.type = "number";
    /**
     * This atom's old name, used during name changes
     * @type {string}
     */
    this.oldName = this.name;

    this.radius = 1 / 75;

    /**
     * Flag indicating if the name text is currently truncated
     * @type {boolean}
     */
    this.isTextTruncated = false;

    /**
     * Timer for tooltip delay
     * @type {number}
     */
    this.tooltipTimer = null;

    /**
     * Reference to the tooltip DOM element
     * @type {HTMLElement}
     */
    this.tooltipElement = null;

    this.addIO("number or geometry", this.type, this.value, "output");

    // Set values first to ensure this.name is correct before creating the parent input
    this.setValues(values);

    //Add a new input to the current molecule
    if (typeof this.parent !== "undefined") {
      // parent should subscribe so it can manage it's ready/processing/etc state
      this.parentAP = this.parent.addIO(
        this.name,
        this.type,
        this.value,
        "input"
      );
      // We also subscribe directly to the parent ap.
      this.parentAP.subscribe(() => {
        this.onUpstreamChange(); // Subscribe with our callback instead of our parent's which is default.
      }, this.uniqueID);
    } else {
      throw new Error(
        "constructed an input with undefined parent. IDK what to do here"
      );
    }
  }

  enable() {
    // Instead of the usual enable behavior, we want to push the propagation of
    // enable-ment up to our parent's attachment points if any.
    if (this.status !== Status.DISABLED) {
      return false;
    }
    let didPropagateUpstream = false;
    if (this.parentAP) {
      if (this.parentAP.connectors && this.parentAP.connectors.length > 0) {
        this.parentAP.connectors.forEach((connector) => {
          const upstreamAtom = connector.attachmentPoint1?.parentMolecule;
          if (upstreamAtom && upstreamAtom !== this) {
            // Recursively enable the upstream atom
            this.setWaiting();
            didPropagateUpstream = upstreamAtom.enable();
          }
        });
      }
    }
    if (!didPropagateUpstream) {
      if (this.parentAP?.getValue()) {
        this.setReady(this.parentAP.getValue());
      } else {
        this.setWaiting();
      }
    }
    return true;
  }

  onUpstreamChange() {
    // No-op if this atom is disabled
    if (this.status === Status.DISABLED) {
      return;
    }

    // This is called when the parent attachment point changes
    // We need to update the value of this input atom
    if (this.parentAP) {
      const parentState = this.parentAP.getState();
      this.setStatus(parentState.status, parentState.value);
    } else {
      // This is a top-level input atom. Set to our value and mark as ready
      if (this.value) {
        this.setReady(this.value);
      } else {
        this.setWaiting();
      }
    }
  }

  /** Solution to canvas overflow https://stackoverflow.com/questions/10508988/html-canvas-text-overflow-ellipsis*/
  fittingString(c, str, maxWidth) {
    if (!str) {
      this.isTextTruncated = false;
      return str || "";
    }

    var width = c.measureText(str).width;
    var ellipsis = "…";
    var ellipsisWidth = c.measureText(ellipsis).width;
    if (width <= maxWidth || width <= ellipsisWidth) {
      this.isTextTruncated = false;
      return str;
    } else {
      this.isTextTruncated = true;
      var len = str.length;
      while (width >= maxWidth - ellipsisWidth && len-- > 0) {
        str = str.substring(0, len);
        width = c.measureText(str).width;
      }
      return str + ellipsis;
    }
  }

  /**
   * Draws the atom on the screen.
   */
  draw() {
    // Always lock the inputs to the left side
    /**
     * The x position of the atom
     * @type {number}
     */
    this.x = GlobalVariables.atomSize * 1.65;
    this.radius = GlobalVariables.atomSize * 1.3;

    let xInPixels = GlobalVariables.widthToPixels(this.x);
    let yInPixels = GlobalVariables.heightToPixels(this.y);
    let radiusInPixels = GlobalVariables.widthToPixels(this.radius);

    /**
     * Relates height to radius
     * @type {number}
     */
    this.height = radiusInPixels;
    this.width = radiusInPixels * 2.5;
    //Check if the name has been updated
    if (this.name != this.oldName) {
      this.updateParentName();
    }

    //Set colors
    GlobalVariables.c.fillStyle = Atom.DEFAULT_COLOR;
    this.color = Atom.statusAsColor(this.status, this.selected);
    GlobalVariables.c.strokeStyle = this.selected
      ? Atom.DEFAULT_COLOR
      : Atom.SELECTED_COLOR;

    GlobalVariables.c.beginPath();
    GlobalVariables.c.moveTo(0, yInPixels + this.height / 2);
    GlobalVariables.c.lineTo(this.width, yInPixels + this.height / 2);
    GlobalVariables.c.lineTo(this.width + radiusInPixels / 2, yInPixels);
    GlobalVariables.c.lineTo(this.width, yInPixels - this.height / 2);
    GlobalVariables.c.lineTo(0, yInPixels - this.height / 2);
    GlobalVariables.c.lineWidth = 1;
    GlobalVariables.c.fillStyle = this.color;
    GlobalVariables.c.fill();
    GlobalVariables.c.fillStyle = Atom.DEFAULT_COLOR;
    GlobalVariables.c.closePath();
    GlobalVariables.c.stroke();
    GlobalVariables.c.font = GlobalVariables.fontSize;
    GlobalVariables.c.textAlign = "start";
    GlobalVariables.c.fillStyle = "black";
    GlobalVariables.c.width = 20;
    GlobalVariables.c.textOverflow = "ellipsis";

    GlobalVariables.c.fillText(
      this.fittingString(GlobalVariables.c, this.name, 50),
      5,
      yInPixels + 3
    );

    // Draw the inputs
    this.inputs.forEach((input) => {
      input.draw();
    });

    // Draw the output
    if (this.output) {
      this.output.draw();
    }
  }

  /**
   * Remove the input from the parent molecule, then delete the atom normally.
   */
  deleteNode(backgroundClickAfter = true, deletePath = true, silent = false) {
    // Clean up tooltip
    this.clearTooltipTimer();
    this.hideTooltip();

    //Remove this input from the parent molecule
    if (typeof this.parent !== "undefined") {
      this.parent.removeIO("input", this.name, this.parent, silent);
    }

    super.deleteNode(backgroundClickAfter, deletePath, silent);
  }

  /**
   * Called when the name has changed to updated the name of the parent molecule IO
   */
  updateParentName() {
    //Run through the parent molecule and find the input with the same name
    this.parent.inputs.forEach((child) => {
      if (child.name == this.oldName) {
        child.name = this.name;
      }
    });
    this.oldName = this.name;

    // Clear tooltip if name is no longer truncated
    // Note: isTextTruncated will be updated in the next draw() call
    // But we can hide tooltip immediately to avoid showing outdated info
    if (this.tooltipElement) {
      this.hideTooltip();
    }
  }

  /**
   * Creates and shows the tooltip element
   */
  showTooltip(x, y) {
    if (!this.isTextTruncated || !this.name || this.tooltipElement) {
      return;
    }

    // Get canvas position to properly position tooltip
    const canvas = GlobalVariables.canvas.current;
    const canvasRect = canvas.getBoundingClientRect();

    this.tooltipElement = document.createElement("div");
    this.tooltipElement.className = "tooltip";
    this.tooltipElement.textContent = this.name;

    // Position tooltip relative to the page, not just the canvas
    this.tooltipElement.style.left = x + canvasRect.left + "px";
    this.tooltipElement.style.top = y + canvasRect.top - 35 + "px";
    this.tooltipElement.style.display = "block";
    this.tooltipElement.style.padding = "4px 8px";
    this.tooltipElement.style.borderRadius = "4px";
    this.tooltipElement.style.whiteSpace = "nowrap";

    document.body.appendChild(this.tooltipElement);
  }

  /**
   * Hides and removes the tooltip element
   */
  hideTooltip() {
    if (this.tooltipElement) {
      document.body.removeChild(this.tooltipElement);
      this.tooltipElement = null;
    }
  }

  /**
   * Override mouseMove to handle tooltip functionality
   */
  mouseMove(x, y) {
    super.mouseMove(x, y);

    // Only show tooltip if text is truncated
    if (!this.isTextTruncated) {
      this.clearTooltipTimer();
      this.hideTooltip();
      return;
    }

    // Check if mouse is over this input atom using the input's actual dimensions
    let xInPixels = GlobalVariables.widthToPixels(this.x);
    let yInPixels = GlobalVariables.heightToPixels(this.y);

    // Use the input's width and height instead of just radius
    const isOverAtom =
      x >= xInPixels - (this.width || 100) / 2 &&
      x <= xInPixels + (this.width || 100) / 2 &&
      y >= yInPixels - (this.height || 30) / 2 &&
      y <= yInPixels + (this.height || 30) / 2;

    if (isOverAtom) {
      // Mouse is over the atom
      if (!this.tooltipTimer) {
        // Start timer for delayed tooltip
        this.tooltipTimer = setTimeout(() => {
          this.showTooltip(x, y);
          this.tooltipTimer = null;
        }, 1000); // 1 second delay
      }
    } else {
      // Mouse is not over the atom
      this.clearTooltipTimer();
      this.hideTooltip();
    }
  }

  /**
   * Clears the tooltip timer
   */
  clearTooltipTimer() {
    if (this.tooltipTimer) {
      clearTimeout(this.tooltipTimer);
      this.tooltipTimer = null;
    }
  }

  /**
   * Create Leva Menu Inputs for Editable Input Names - returns to ParameterEditor
   */
  createLevaInputs() {
    let inputNames = {};
    inputNames[this.uniqueID] = {
      value: this.name,
      label: "Input Name",
      disabled: false,
      onChange: (newName) => {
        if (this.name !== newName) {
          this.name = newName;
          this.parentAP.name = newName; // Update the attachment point name
        }
      },
    };
    inputNames[this.uniqueID + "type"] = {
      value: this.type,
      label: "Input Type",
      disabled: false,
      options: ["number", "string", "geometry", "array"],
      onChange: (newType) => {
        if (this.type !== newType) {
          this.type = newType;
          this.output.valueType = newType;
          //Add a new input to the current molecule
          if (this.parentAP) {
            this.parentAP.valueType = newType;
          }
        }
      },
    };
    return inputNames;
  }
  /**
   * Returns the current value being output
   */
  getOutput() {
    return this.output.getValue();
  }

  /**
   * Add the input Type choice to the object which is saved for this molecule
   */
  serialize(offset = { x: 0, y: 0 }) {
    var superSerialObject = super.serialize(offset);

    //Write the current color selection to the serialized object
    superSerialObject.type = this.type;

    return superSerialObject;
  }
}
