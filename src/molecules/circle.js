import Atom from "../prototypes/atom";
import GlobalVariables from "../js/globalvariables.js";

/**
 * This class creates the circle atom.
 */
export default class Circle extends Atom {
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
    this.name = "Circle";
    /**
     * This atom's type
     * @type {string}
     */
    this.atomType = "Circle";
    /**
     * A description of this atom
     * @type {string}
     */
    this.description = "Creates a new circle.";

    this.addAllIOs([
      { name: "diameter", valueType: "number", defaultValue: 10.0 },
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
    GlobalVariables.c.arc(
      GlobalVariables.widthToPixels(this.x),
      GlobalVariables.heightToPixels(this.y),
      GlobalVariables.widthToPixels(this.radius / 2),
      0,
      Math.PI * 2,
      false
    );
    //GlobalVariables.c.fill()
    GlobalVariables.c.stroke();
    GlobalVariables.c.closePath();
  }

  /**
   * Compute the circle geometry.
   */
  async compute(inputs) {
    return GlobalVariables.cad.circle(inputs.diameter, this.getContext());
  }
}
