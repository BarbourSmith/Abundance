import Atom from "../prototypes/atom";
import GlobalVariables from "../js/globalvariables.js";

/**
 * This class creates the label atom.
 */
export default class Label extends Atom {
  /**
   * The constructor function.
   * @param {object} values An array of values passed in which will be assigned to the class as this.x
   */
  constructor(values) {
    super(values);

    this.addIO("input", "geometry", this, "geometry", "", false, true);
    this.addIO("input", "Text", this, "string", "Label Text");
    this.addIO("input", "Size", this, "number", 1.0);
    this.addIO("output", "geometry", this, "geometry", "");

    /**
     * This atom's name
     * @type {string}
     */
    this.name = "Label";
    /**
     * This atom's type
     * @type {string}
     */
    this.atomType = "Label";
    /**
     * This atom's height as drawn on the screen
     */
    this.height;
    /**
     * A description of this atom
     * @type {string}
     */
    this.description = "Adds a label to the geometry in 3D space.";

    /** Position of the label relative to the geometry's origin */
    this.position = { x: 0, y: 0, z: 0 };

    this.setValues(values);
  }

  /**
   * Draw the label atom which is more rectangular than the regular shape.
   */
  draw() {
    super.draw("rect");

    let pixelsRadius = GlobalVariables.widthToPixels(this.radius);
    /**
     * Relates height to radius
     * @type {number}
     */
    this.height = pixelsRadius;

    GlobalVariables.c.beginPath();
    GlobalVariables.c.fillStyle = "#484848";
    GlobalVariables.c.font = `${pixelsRadius * 1.3}px Work Sans Bold`;
    GlobalVariables.c.fillText(
      "L",
      GlobalVariables.widthToPixels(this.x - this.radius / 1.5),
      GlobalVariables.heightToPixels(this.y) + this.height / 1.5
    );
    GlobalVariables.c.fill();
    GlobalVariables.c.closePath();
  }

  createLevaInputs() {
    let inputParams = {};

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
            step: input.valueType === "number" ? 0.1 : undefined,
            disabled: checkConnector(),
            onChange: (value) => {
              if (input.value !== value) {
                input.setValue(value);
                this.updateValue();
              }
            },
          };
        }
      });
    }

    // Position adjustment sliders
    inputParams[this.uniqueID + "PositionX"] = {
      value: this.position.x,
      label: "Position X",
      step: 0.1,
      onChange: (value) => {
        this.position.x = value;
        this.updateValue();
      },
    };

    inputParams[this.uniqueID + "PositionY"] = {
      value: this.position.y,
      label: "Position Y",
      step: 0.1,
      onChange: (value) => {
        this.position.y = value;
        this.updateValue();
      },
    };

    inputParams[this.uniqueID + "PositionZ"] = {
      value: this.position.z,
      label: "Position Z",
      step: 0.1,
      onChange: (value) => {
        this.position.z = value;
        this.updateValue();
      },
    };

    return inputParams;
  }

  /**
   * Add a label to the input geometry.
   */
  updateValue() {
    super.updateValue();

    if (this.inputs.every((x) => x.ready)) {
      this.processing = true;
      var inputID = this.findIOValue("geometry");
      var text = this.findIOValue("Text");
      var size = this.findIOValue("Size");
      var position = this.position;
      
      GlobalVariables.cad
        .label(this.uniqueID, inputID, text, size, position)
        .then(() => {
          this.basicThreadValueProcessing();
        })
        .catch(this.alertingErrorHandler());
    }
  }

  /**
   * Send the value of this atom to the 3D display.
   */
  sendToRender() {
    // No special rendering needed here, handled by the worker
    // The label will be displayed as part of the geometry
  }

  /**
   * Add the label settings to the object which is saved for this molecule
   */
  serialize(offset = { x: 0, y: 0 }) {
    var superSerialObject = super.serialize(offset);
    superSerialObject.position = this.position;

    return superSerialObject;
  }
}