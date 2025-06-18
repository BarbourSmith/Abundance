import Atom from "../prototypes/atom.js";
import GlobalVariables from "../js/globalvariables.js";
import Fonts from "../js/fonts.js";

/**
 * This class creates the circle atom.
 */
export default class Text extends Atom {
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
    this.name = "Text";
    /**
     * This atom's type
     * @type {string}
     */
    this.atomType = "Text";
    /**
     * A description of this atom
     * @type {string}
     */
    this.description = "Creates a new text sketch.";

    this.fontFamily = "ROBOTO";

    /**
     * The index of the currently selected color option.
     * @type {number}
     */
    this.selectedFontIndex = 0;

    this.availableFonts = Fonts;

    this.addIO("input", "Font Size", this, "number", 10.0);
    this.addIO("input", "Text", this, "string", "Lorem Ipsum");
    this.addIO("output", "geometry", this, "geometry", "");

    this.setValues(values);
  }

  /**
   * Starts propagation from this atom if it is not waiting for anything up stream.
   */
  beginPropagation(force = false) {
    //Triggers inputs with nothing connected to begin propagation
    this.inputs.forEach((input) => {
      input.beginPropagation();
    });
  }

  /**
   * Draw the circle atom & icon.
   */
  draw() {
    super.draw(); //Super call to draw the rest

    GlobalVariables.c.beginPath();
    GlobalVariables.c.fillStyle = "#484848";
    GlobalVariables.c.font = `${GlobalVariables.widthToPixels(
      this.radius
    )}px Work Sans Bold`;
    GlobalVariables.c.fillText(
      "T",
      GlobalVariables.widthToPixels(this.x - this.radius / 3),
      GlobalVariables.heightToPixels(this.y) + this.height / 3
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
            step: 0.25,
            disabled: checkConnector(),
            onChange: (value) => {
              if (input.value !== value) {
                input.setValue(value);
                //this.sendToRender();
              }
            },
          };
        }
      });
    }
    const fontOptions = Fonts;

    inputParams[this.uniqueID + "FontFamily"] = {
      value: Object.keys(fontOptions)[this.selectedFontIndex],
      label: "Font Family",
      options: Object.keys(fontOptions),
      onChange: (value) => {
        if (value != this.fontFamily) {
          this.selectedFontIndex = Object.keys(fontOptions).indexOf(value);
          this.fontFamily = Object.keys(fontOptions)[this.selectedFontIndex];
          this.updateValue();
        }
      },
    };

    return inputParams;
  }

  /**
   * Update the value of the circle in worker.
   */
  updateValue() {
    super.updateValue();
    var fontSize = this.findIOValue("Font Size");
    var text = this.findIOValue("Text");
    let fontFamily = this.fontFamily;
    GlobalVariables.cad
      .text(this.uniqueID, text, fontSize, fontFamily)
      .then(() => {
        this.basicThreadValueProcessing();
      })
      .catch(this.alertingErrorHandler());
  }

  serialize(offset = { x: 0, y: 0 }) {
    var thisAsObject = super.serialize(offset);

    thisAsObject.fontFamily = this.fontFamily;
    thisAsObject.selectedFontIndex = this.selectedFontIndex;

    return thisAsObject;
  }
}
