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
    const textHeight = pixelsRadius / 1.5;
    const textWidth = GlobalVariables.c.measureText(text).width;
    const textX = pixelsX - textWidth / 2;
    const textY = pixelsY + this.height / 2 - textHeight / 2;
    GlobalVariables.c.fillText(text, textX, textY);

    GlobalVariables.c.fill();
    GlobalVariables.c.closePath();
  }
  /**
   * Create Leva Menu Input - returns to ParameterEditor
   */
  createLevaInputs() {
    // Create the Leva input for the constant name
    let outputParams = {};
    outputParams["constant number"] = {
      value: this.name,
      label: "Constant Name",
      disabled: false,
      onChange: (value) => {
        this.name = value;
      },
    };
    // Create the Leva input for the constant value
    outputParams[this.uniqueID + this.name] = {
      value: this.value,
      label: this.name,
      disabled: false,
      step: 0.01,
      onChange: (value) => {
        if (this.value !== value) {
          // Update to a new value with READY status
          this.setReady(value);
        }
      },
    };
    return outputParams;
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
    valuesObj.value = this.value;

    return valuesObj;
  }
}
