import Atom from "../prototypes/atom";
import GlobalVariables from "../js/globalvariables.js";

/**
 * This class creates the regular polygon atom.
 */
export default class RegularPolygon extends Atom {
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
    this.name = "RegularPolygon";
    /**
     * This atom's type
     * @type {string}
     */
    this.atomType = "RegularPolygon";
    /**
     * A description of this atom
     * @type {string}
     */
    this.description =
      "Creates a new regular polygon. Corners are on the diameter.";

    this.addAllIOs([
      { name: "number of sides", valueType: "number", defaultValue: 6 },
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

    let xInPixels = GlobalVariables.widthToPixels(this.x);
    let yInPixels = GlobalVariables.heightToPixels(this.y);
    let radiusInPixels = GlobalVariables.widthToPixels(this.radius);

    // polygon in progress - replace numbers with variables
    GlobalVariables.c.beginPath();
    GlobalVariables.c.fillStyle = "#949294";
    GlobalVariables.c.moveTo(
      xInPixels - radiusInPixels / 3,
      yInPixels + radiusInPixels / 1.7
    );
    GlobalVariables.c.lineTo(
      xInPixels + radiusInPixels / 3,
      yInPixels + radiusInPixels / 1.7
    );
    GlobalVariables.c.lineTo(xInPixels + radiusInPixels / 1.5, yInPixels);
    GlobalVariables.c.lineTo(
      xInPixels + radiusInPixels / 2.5,
      yInPixels - radiusInPixels / 1.7
    );
    GlobalVariables.c.lineTo(
      xInPixels - radiusInPixels / 2.5,
      yInPixels - radiusInPixels / 1.7
    );
    GlobalVariables.c.lineTo(xInPixels - radiusInPixels / 1.5, yInPixels);
    GlobalVariables.c.lineTo(
      xInPixels - radiusInPixels / 3,
      yInPixels + radiusInPixels / 1.7
    );
    GlobalVariables.c.stroke();
    GlobalVariables.c.closePath();
  }

  /**
   * Computes the geometry of the regular polygon.
   * @param {*} argsDict - dictionary of arguments keyed by their names (as set by addIO in constructor)
   * @property {number} argsDict.diameter - the diameter of the regular polygon
   * @property {number} argsDict["number of sides"] - the number of sides
   * @returns promise containing the ID of the created geometry
   */
  compute(argsDict) {
    return GlobalVariables.cad.regularPolygon(
      this.uniqueID,
      argsDict.diameter / 2,
      argsDict["number of sides"]
    );
  }
}
