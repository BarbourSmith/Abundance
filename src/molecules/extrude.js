import Atom from "../prototypes/atom";
import GlobalVariables from "../js/globalvariables.js";
/**
 * This class creates the Extrude atom.
 */
export default class Extrude extends Atom {
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
    this.name = "Extrude";
    /**
     * This atom's type
     * @type {string}
     */
    this.atomType = "Extrude";
    /**
     * A description of this atom
     * @type {string}
     */
    this.description = "Extrudes a 2D shape. Input can be negative.";

    this.addAllIOs([
      { name: "geometry", valueType: "geometry" },
      { name: "height", valueType: "number", defaultValue: 10.0 },
      { name: "geometry", valueType: "geometry", type: "output" },
    ]);

    this.setValues(values);
  }

  /**
   * Draw the code atom which has a code icon.
   */
  draw() {
    super.draw(); //Super call to draw the rest

    // Draw the bottom rectangle (extrusion indicator), centered horizontally below the atom center
    const centerX = GlobalVariables.widthToPixels(this.x);
    const centerY = GlobalVariables.heightToPixels(this.y);
    const rectWidth = GlobalVariables.widthToPixels(this.radius);
    const rectHeight = GlobalVariables.widthToPixels(this.radius / 3);
    const mainRectHeight = GlobalVariables.widthToPixels(this.radius / 2);

    // Bottom rectangle (extrusion indicator)
    GlobalVariables.c.beginPath();
    GlobalVariables.c.fillStyle = "#949294";
    GlobalVariables.c.rect(
      centerX - rectWidth / 2,
      centerY + mainRectHeight / 2,
      rectWidth,
      rectHeight
    );
    GlobalVariables.c.fill();
    GlobalVariables.c.stroke();
    GlobalVariables.c.closePath();

    // Main rectangle centered on the atom
    GlobalVariables.c.beginPath();
    GlobalVariables.c.fillStyle = "#949294";
    GlobalVariables.c.rect(
      centerX - rectWidth / 2,
      centerY - mainRectHeight / 2,
      rectWidth,
      mainRectHeight
    );
    //GlobalVariables.c.fill();
    GlobalVariables.c.stroke();
    GlobalVariables.c.closePath();
  }

  // order of args dictated by the order in which they're initialized in the constructor.
  compute(argsDict) {
    return GlobalVariables.cad.extrude(argsDict.geometry, argsDict.height, this.getContext());
  }
}
