import Atom from "../prototypes/atom.js";
import GlobalVariables from "../js/globalvariables.js";

/**
 * This class creates the linear patter atom. // could be modified to be a circular pattern or have as menu option
 */
export default class Pattern extends Atom {
  /**
   * The constructor function.
   * @param {object} values An array of values passed in which will be assigned to the class as this.x
   */
  constructor(values) {
    super(values);

    this.addIO("input", "geometry", this, "geometry", "", false, true);
    this.addIO("input", "radius", this, "number", 12);
    //this.addIO("input", "yDist", this, "number", 0);
    this.addIO("input", "count", this, "number", 5);
    this.addIO("output", "geometry", this, "geometry", "");

    /**
     * This atom's name
     * @type {string}
     */
    this.name = "Pattern";
    /**
     * This atom's type
     * @type {string}
     */
    this.atomType = "Pattern";
    /**
     * A description of this atom
     * @type {string}
     */
    this.description = "Makes a linear pattern in one axis";

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
   * Pass the input geometry to a worker function to compute the translation.
   */
  updateValue() {
    if (this.inputs.every((x) => x.ready)) {
      try {
        // find if it's circular or linear// add io to check
        if (true) {
          // circular
          var inputID = this.findIOValue("geometry");
          var radius = this.findIOValue("radius");
          var count = this.findIOValue("count");
          //var y = this.findIOValue("yDist");
          //var z = this.findIOValue("zDist");

          GlobalVariables.cad
            .pattern(this.uniqueID, inputID, count, radius)
            .then(() => {
              this.basicThreadValueProcessing();
            });
        } else {
          // linear
        }
      } catch (err) {
        this.setAlert(err);
      }
    }
  }
}
