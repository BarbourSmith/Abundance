import Atom from "../prototypes/atom";
import GlobalVariables from "../js/globalvariables.js";

/**
 * This class creates the rectangle atom.
 */
export default class Rectangle extends Atom {
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
    this.name = "Rectangle";
    /**
     * This atom's type
     * @type {string}
     */
    this.atomType = "Rectangle";
    /**
     * A description of this atom
     * @type {string}
     */
    this.description = "Creates a new rectangle.";

    this.addAllIOs([
      { name: "x length", valueType: "number", defaultValue: 10.0 },
      { name: "y length", valueType: "number", defaultValue: 10.0 },
      { name: "geometry", valueType: "geometry", type: "output" },
    ]);

    this.setValues(values);
  }

  /**
   * Draw the rectangle atom & icon.
   */
  draw() {
    super.draw(); //Super call to draw the rest

    GlobalVariables.c.beginPath();
    GlobalVariables.c.fillStyle = "#949294";
    // Draw the rectangle centered within the atom circle
    GlobalVariables.c.rect(
      GlobalVariables.widthToPixels(this.x - this.radius / 2),
      GlobalVariables.heightToPixels(this.y - this.radius / 4),
      GlobalVariables.widthToPixels(this.radius),
      GlobalVariables.widthToPixels(this.radius / 2)
    );
    //GlobalVariables.c.fill()
    GlobalVariables.c.stroke();
    GlobalVariables.c.closePath();
  }

  /**
   * Compute the rectangle geometry.
   */
  compute(inputs) {
    // TODO: TRISTAN this is definitely borked
    //super.updateValue()
    //    var xVal = this.findIOValue("x length");
    //    var yVal = this.findIOValue("y length");

    const xVal = inputs["x length"];
    const yVal = inputs["y length"];
    return GlobalVariables.cad.rectangle(this.uniqueID, xVal, yVal);
  }
}
