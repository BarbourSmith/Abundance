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
    this.addIO("input", "text", this, "string", "Label");
    this.addIO("input", "length", this, "number", 10);
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
    this.description = "Adds a label with text and a line to geometry.";

    /** Label properties */
    this.text = "Label";
    this.length = 10;
    this.position = [0, 0, 0];
    this.rotation = [0, 0, 0];

    this.setValues(values);
  }

  /**
   * Draw the label icon on the canvas.
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

    // Draw a small line to represent the label line
    const xCenter = GlobalVariables.widthToPixels(this.x - this.radius / 1.5);
    const yCenter = GlobalVariables.heightToPixels(this.y) + this.height / 3;
    const lineLength = pixelsRadius * 0.8;

    GlobalVariables.c.beginPath();
    GlobalVariables.c.strokeStyle = "#484848";
    GlobalVariables.c.lineWidth = 2;
    GlobalVariables.c.moveTo(xCenter - lineLength / 2, yCenter);
    GlobalVariables.c.lineTo(xCenter + lineLength / 2, yCenter);
    GlobalVariables.c.stroke();
    GlobalVariables.c.closePath();
  }

  createLevaInputs(setInputChanged) {
    let inputParams = super.createLevaInputs();

    inputParams[this.uniqueID + "text"] = {
      value: this.text,
      label: "Text",
      onChange: (value) => {
        if (this.text !== value) {
          this.text = value;
          // Update the corresponding input's value
          const textInput = this.inputs.find(input => input.name === "text");
          if (textInput) {
            textInput.value = value;
            textInput.ready = true;
          }
          this.updateValue();
        }
      },
    };

    inputParams[this.uniqueID + "length"] = {
      value: this.length,
      label: "Length",
      min: 1,
      step: 1,
      onChange: (value) => {
        if (this.length !== value) {
          this.length = value;
          // Update the corresponding input's value
          const lengthInput = this.inputs.find(input => input.name === "length");
          if (lengthInput) {
            lengthInput.value = value;
            lengthInput.ready = true;
          }
          this.updateValue();
        }
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
      
      // Get the text input and update it if needed
      const textInput = this.inputs.find(input => input.name === "text");
      if (textInput) {
        if (!textInput.connectors.length) {  // If not connected to another atom
          textInput.value = this.text;  // Update the input with our latest text value
        }
      }
      
      // Get the length input and update it if needed
      const lengthInput = this.inputs.find(input => input.name === "length");
      if (lengthInput) {
        if (!lengthInput.connectors.length) {  // If not connected to another atom
          lengthInput.value = this.length;  // Update the input with our latest length value
        }
      }
      
      // Now use findIOValue to get the current values
      var text = this.findIOValue("text");
      var length = this.findIOValue("length");
      
      var labelObject = {
        text: text,
        length: length,
        position: this.position,
        rotation: this.rotation
      };

      GlobalVariables.cad
        .addLabel(this.uniqueID, inputID, labelObject)
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
    // This is handled by extractLabels in App.jsx
    console.log("Label will be rendered with the object");
  }

  /**
   * Serialize the label atom for saving
   */
  serialize(offset = { x: 0, y: 0 }) {
    var superSerialObject = super.serialize(offset);
    superSerialObject.text = this.text;
    superSerialObject.length = this.length;
    superSerialObject.position = this.position;
    superSerialObject.rotation = this.rotation;

    return superSerialObject;
  }
}