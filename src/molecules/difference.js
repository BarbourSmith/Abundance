import Atom from "../prototypes/atom";
import GlobalVariables from "../js/globalvariables.js";

/**
 * This class creates the Difference atom.
 */
export default class Difference extends Atom {
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
    this.name = "Difference";
    /**
     * This atom's type
     * @type {string}
     */
    this.atomType = "Difference";
    /**
     * A description of this atom
     * @type {string}
     */
    this.description = "Subtracts shape two from shape one.";

    this.addAllIOs([
      { name: "geometry1", valueType: "geometry" },
      { name: "geometry2", valueType: "geometry" },
      { name: "geometry", valueType: "geometry", type: "output" },
    ]);

    this.setValues(values);
  }

  /**
   * Draw the code atom which has a code icon.
   */
  draw() {
    super.draw(); //Super call to draw the rest

    GlobalVariables.c.beginPath();
    GlobalVariables.c.fillStyle = "#949294";
    GlobalVariables.c.arc(
      GlobalVariables.widthToPixels(this.x),
      GlobalVariables.heightToPixels(this.y),
      GlobalVariables.widthToPixels(this.radius / 3),
      0,
      Math.PI * 2,
      false
    );
    GlobalVariables.c.fill();
    GlobalVariables.c.stroke();
    GlobalVariables.c.closePath();

    GlobalVariables.c.beginPath();
    GlobalVariables.c.fillStyle = "#949294";
    GlobalVariables.c.rect(
      GlobalVariables.widthToPixels(this.x - this.radius / 2),
      GlobalVariables.heightToPixels(this.y - this.radius * 2),
      GlobalVariables.widthToPixels(this.radius),
      GlobalVariables.widthToPixels(this.radius)
    );
    //GlobalVariables.c.fill()
    GlobalVariables.c.stroke();
    GlobalVariables.c.closePath();
  }

  /**
   * Compute the difference of two geometries.
   */
  compute(inputs) {
    const input1 = inputs.geometry1;
    const input2 = inputs.geometry2;
    return GlobalVariables.cad.difference(input1, input2);
  }
}
