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
    this.addAllIOs([
      { name: "Font Size", valueType: "number", defaultValue: 10.0 },
      { name: "Text", valueType: "string", defaultValue: "Lorem Ipsum" },
      { name: "geometry", valueType: "geometry", type: "output" },
    ]);

    this.setValues(values);
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

  createInputParams() {
    let inputParams = { ...super.createInputParams() };

    if (this.inputs) {
      this.inputs.forEach((input) => {
        if (input.name !== "Text") return;
        const checkConnector = () => {
          return input.connectors.length > 0;
        };

        inputParams[this.uniqueID + "Text"] = {
          type: "string",
          value: input.value,
          label: input.name,
          disabled: checkConnector(),
          onChange: async (value) => {
            if (input.value !== value) {
              input.setValue(value);
            }
          },
        };
      });
    }
    const fontOptions = Fonts;

    inputParams[this.uniqueID + "FontFamily"] = {
      type: "select",
      value: Object.keys(fontOptions)[this.selectedFontIndex],
      label: "Font Family",
      options: Object.keys(fontOptions),
      onChange: (value) => {
        if (value != this.fontFamily) {
          this.selectedFontIndex = Object.keys(fontOptions).indexOf(value);
          this.fontFamily = Object.keys(fontOptions)[this.selectedFontIndex];
          this.onUpstreamChange();
        }
      },
    };

    return inputParams;
  }

  /**
   * Compute the text geometry.
   */
  compute(inputs) {
    const fontSize = inputs["Font Size"];
    const text = inputs.Text;
    const fontFamily = this.fontFamily;
    return GlobalVariables.cad.text(
      text,
      fontSize,
      fontFamily,
      this.getContext()
    );
  }

  serialize(offset = { x: 0, y: 0 }) {
    var thisAsObject = super.serialize(offset);

    thisAsObject.fontFamily = this.fontFamily;
    thisAsObject.selectedFontIndex = this.selectedFontIndex;

    return thisAsObject;
  }
}
