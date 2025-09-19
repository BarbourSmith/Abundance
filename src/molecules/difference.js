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

    // Draw filled circle at the atom's center
    const centerX = GlobalVariables.widthToPixels(this.x);
    const centerY = GlobalVariables.heightToPixels(this.y);
    const circleRadius = GlobalVariables.widthToPixels(this.radius / 3);

    GlobalVariables.c.beginPath();
    GlobalVariables.c.fillStyle = "#949294";
    GlobalVariables.c.arc(
      centerX,
      centerY,
      circleRadius,
      0,
      Math.PI * 2,
      false
    );
    GlobalVariables.c.fill();
    GlobalVariables.c.stroke();
    GlobalVariables.c.closePath();

    // Draw rectangle centered on the circle
    const rectSize = GlobalVariables.widthToPixels(this.radius); // width and height in px
    const rectX = centerX - rectSize / 2;
    const rectY = centerY - rectSize / 2;

    GlobalVariables.c.beginPath();
    GlobalVariables.c.fillStyle = "#949294";
    GlobalVariables.c.rect(rectX, rectY, rectSize, rectSize);
    //GlobalVariables.c.fill();
    GlobalVariables.c.stroke();
    GlobalVariables.c.closePath();
  }

  /**
   * Compute the difference of two geometries.
   */
  compute(inputs) {
    const input1 = inputs.geometry1;
    const input2 = inputs.geometry2;
    return GlobalVariables.cad.difference(input1, input2, this.getContext());
  }
}
