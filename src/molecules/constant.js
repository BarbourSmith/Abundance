import Atom from "../prototypes/atom";
import GlobalVariables from "../js/globalvariables.js";
import { Status } from "../prototypes/observableEntity.js";

/**
 * This class creates the constant atom instance which can be used to define a numerical constant.
 */
export default class Constant extends Atom {
  /**
   * Creates a new constant atom.
   * @param {object} values - An object of values. Each of these values will be applied to the resulting atom.
   */
  constructor(values) {
    super(values);

    /**
     * This atom's type
     * @type {string}
     */
    this.type = "constant";
    /**
     * This atom's name
     * @type {string}
     */
    this.name = "Constant";
    /**
     * This atom's type
     * @type {string}
     */
    this.atomType = "Constant";
    /**
     * A description of this atom
     * @type {string}
     */
    this.description = "Defines a mathematical constant.";
    /**
     * This atom's height as drawn on the screen
     */
    this.height = 16;
    /**
     * A flag to indicate if this constant should be evolved by genetic algorithms
     * @type {boolean}
     */
    this.evolve = false;
    /**
     * Minimum value to be used when evolving constant
     * @type {float}
     */
    this.min = 0;
    /**
     * Maximum value to be used when evolving constant
     * @type {float}
     */
    this.max = 20;

    /**
     * The default value for the constant
     * @type {float}
     */
    this.value = 10.0;

    this.addAllIOs([{ name: "number", valueType: "number", type: "output" }]);

    this.setValues(values); //This will overwrite the default value if one is loaded
  }

  /**
   * Draw the Bill of material atom which has a BOM icon.
   */
  draw() {
    super.draw("rect");
    let pixelsX = GlobalVariables.widthToPixels(this.x);
    let pixelsY = GlobalVariables.heightToPixels(this.y);
    let pixelsRadius = GlobalVariables.widthToPixels(this.radius);
    /**
     * Relates height to radius
     * @type {number}
     */
    this.height = pixelsRadius;

    GlobalVariables.c.beginPath();
    GlobalVariables.c.fillStyle = "#484848";
    GlobalVariables.c.font = `${pixelsRadius}px Work Sans Bold`;
    const text = String.fromCharCode(0x039b);
    const textWidth = GlobalVariables.c.measureText(text).width;
    const textX = pixelsX - textWidth / 2;
    const textY = pixelsY + pixelsRadius / 2;
    GlobalVariables.c.fillText(text, textX, textY);
    GlobalVariables.c.fill();
    GlobalVariables.c.closePath();
  }

  createInputParams(setInputChangedCallback) {
    let inputParams = {};
    inputParams[this.uniqueID + "name"] = {
      type: "string",
      value: this.name,
      label: "Constant Name",
      disabled: false,
      onChange: (value) => {
        const sanitizedName = GlobalVariables.incrementVariableName(
          value,
          this.parent,
          [this]
        );
        if (this.name !== sanitizedName) {
          this.name = sanitizedName;
          setInputChangedCallback();
        } else {
          this.name = sanitizedName;
        }
      },
    };
    inputParams[this.uniqueID + "val"] = {
      type: "string", //forcing string type to evaluate as equation
      value: this.currentEquation ? this.currentEquation : this.value,
      label: this.name,
      disabled: false,
      onChange: (value) => {
        let currentEquation = String(value).trim();
        this.currentEquation = currentEquation;
        try {
          // Ensure inputs exist for variables in the equation before evaluating
          this.ensureInputsForEquation(currentEquation);
          const result = this.evaluateEquation(currentEquation);

          if (Number.isFinite(result)) {
            if (result !== this.value) {
              this.setReady(result);
            }
          }
        } catch (err) {
          console.log("setting value to NaN");
          this.setReady(NaN);
          this.alertingErrorHandler()(err);
        }
      },
    };

    // Add mobile delete button for touchscreen devices
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

  enable() {
    if (this.getState().status == Status.DISABLED) {
      this.setReady(this.value);
      return true;
    }
    return false;
  }

  /**
   * Serialize the value of this.value so that we can store it for next time
   */
  serialize(values) {
    //Save the readme text to the serial stream
    var valuesObj = super.serialize(values);
    // Use safe serialization to prevent large values from bloating the save file
    Atom.safeSerializeValue(
      valuesObj,
      "value",
      this.value,
      this.name || "Constant"
    );

    return valuesObj;
  }
}
