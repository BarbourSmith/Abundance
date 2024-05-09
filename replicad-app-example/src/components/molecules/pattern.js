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
    this.addIO("input", "count", this, "number", 5);
    this.addIO("input", "xDist", this, "number", 0);
    this.addIO("input", "yDist", this, "number", 0);
    this.addIO("input", "radius", this, "number", 12);
    this.addIO("output", "geometry", this, "geometry", "");

    let patternType = "circular";

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

  createLevaInputs() {
    let inputParams = {};
    inputParams[this.uniqueID + this.name] = {
      options: ["linear", "circular"],
      label: this.name,
      disabled: false,
      onChange: (value) => {
        this.patternType = value;
        this.updateValue();
      },
    };
    /** Runs through active atom inputs and adds IO parameters to default param*/
    if (this.inputs) {
      this.inputs.map((input) => {
        const checkConnector = () => {
          return input.connectors.length > 0;
        };

        /* Makes inputs for Io's other than geometry */
        if (input.valueType !== "geometry") {
          inputParams[this.uniqueID + input.name] = {
            value: input.value,
            label: input.name,
            disabled: checkConnector(),
            onChange: (value) => {
              if (input.value !== value) {
                input.setValue(value);
                this.sendToRender();
              }
            },
          };
        }
      });
      return inputParams;
    }
    return inputParams;
  }

  /**
   * Pass the input geometry to a worker function to compute the translation.
   */
  updateValue() {
    if (this.inputs.every((x) => x.ready)) {
      try {
        // find if it's circular or linear// add io to check
        if (this.patternType == "circular") {
          // circular
          var inputID = this.findIOValue("geometry");
          var radius = this.findIOValue("radius");
          var count = this.findIOValue("count");
          GlobalVariables.cad
            .circularPattern(this.uniqueID, inputID, count, radius)
            .then(() => {
              this.basicThreadValueProcessing();
            });
        } else {
          // linear
          var count = this.findIOValue("count");
          var inputID = this.findIOValue("geometry");
          var x = this.findIOValue("xDist");
          var y = this.findIOValue("yDist");
          GlobalVariables.cad
            .linearPattern(this.uniqueID, inputID, count, x, y)
            .then(() => {
              this.basicThreadValueProcessing();
            });
        }
      } catch (err) {
        this.setAlert(err);
      }
    }
  }
}
