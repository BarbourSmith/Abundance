import Atom from "../prototypes/atom";
import GlobalVariables from "../js/globalvariables.js";

/**
 * This class creates the rotate atom.
 */
export default class Rotate extends Atom {
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
    this.name = "Rotate";
    /**
     * This atom's type
     * @type {string}
     */
    this.atomType = "Rotate";
    /**
     * A description of this atom
     * @type {string}
     */
    this.description =
      "Rotates the input geometry around the X, Y, or Z axis. Inputs are degrees.";

    this.addAllIOs([
      { name: "geometry", valueType: "geometry" },
      { name: "x-axis degrees", valueType: "number", defaultValue: 0.0 },
      { name: "y-axis degrees", valueType: "number", defaultValue: 0.0 },
      { name: "z-axis degrees", valueType: "number", defaultValue: 0.0 },
      { name: "geometry", valueType: "geometry", type: "output" },
    ]);

    this.setValues(values);
  }

  /**
   * Draw the circle atom & icon.
   */
  draw() {
    super.draw(); //Super call to draw the rest

    GlobalVariables.c.beginPath();
    GlobalVariables.c.fillStyle = "#949294";
    GlobalVariables.c.ellipse(
      GlobalVariables.widthToPixels(this.x),
      GlobalVariables.heightToPixels(this.y),
      GlobalVariables.widthToPixels(this.radius / 1.5),
      GlobalVariables.widthToPixels(this.radius / 2.3),
      Math.PI / 4,
      0,
      Math.PI * 2
    );
    GlobalVariables.c.stroke();
    GlobalVariables.c.closePath();
  }

  /**
   * Create Leva Menu Inputs - returns to ParameterEditor
   */
  createLevaInputs() {
    let inputParams = {};

    // Merge the returned value from super.createLevaInputs into inputParams
    Object.assign(inputParams, super.createLevaInputs(inputParams));

    return inputParams;
  }

  /**
   * Compute the rotated geometry.
   */
  compute(inputs) {
    const inputID = inputs.geometry;
    const x = inputs["x-axis degrees"];
    const y = inputs["y-axis degrees"];
    const z = inputs["z-axis degrees"];
    return GlobalVariables.cad.rotate(inputID, x, y, z, this.uniqueID);
  }
}
