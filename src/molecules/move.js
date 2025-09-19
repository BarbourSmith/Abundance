import Atom from "../prototypes/atom";
import GlobalVariables from "../js/globalvariables.js";

/**
 * This class creates the move atom.
 */
export default class Move extends Atom {
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
    this.name = "Move";
    /**
     * This atom's type
     * @type {string}
     */
    this.atomType = "Move";
    /**
     * A description of this atom
     * @type {string}
     */
    this.description = "Moves a shape laterally in X, Y, Z.";

    this.addAllIOs([
      { name: "geometry", valueType: "geometry" },
      { name: "xDist", valueType: "number", defaultValue: 0.0 },
      { name: "yDist", valueType: "number", defaultValue: 0.0 },
      { name: "zDist", valueType: "number", defaultValue: 0.0 },
      { name: "geometry", valueType: "geometry", type: "output" },
    ]);

    this.setValues(values);
  }

  /**
   * Draw the move icon.
   */
  draw() {
    super.draw(); //Super call to draw the rest

    GlobalVariables.c.beginPath();
    GlobalVariables.c.fillStyle = "#949294";
    GlobalVariables.c.arc(
      GlobalVariables.widthToPixels(this.x + this.radius / 5),
      GlobalVariables.heightToPixels(this.y),
      GlobalVariables.widthToPixels(this.radius / 2.5),
      0,
      Math.PI * 2,
      false
    );
    //GlobalVariables.c.fill()
    GlobalVariables.c.stroke();
    GlobalVariables.c.closePath();
    GlobalVariables.c.beginPath();
    GlobalVariables.c.fillStyle = "#949294";
    GlobalVariables.c.arc(
      GlobalVariables.widthToPixels(this.x - this.radius / 5),
      GlobalVariables.heightToPixels(this.y),
      GlobalVariables.widthToPixels(this.radius / 2.5),
      0,
      Math.PI * 2,
      false
    );
    GlobalVariables.c.fill();
    GlobalVariables.c.stroke();
    GlobalVariables.c.closePath();
  }
  /**
   * Compute the moved geometry.
   */
  compute(inputs) {
    const inputID = inputs.geometry;
    const x = inputs.xDist;
    const y = inputs.yDist;
    const z = inputs.zDist;
    return GlobalVariables.cad.move(inputID, x, y, z, this.getContext());
  }
}
