import Atom from "../prototypes/atom.js";
import GlobalVariables from "../js/globalvariables.js";
import Fonts from "../js/fonts.js";
import { LevaInputs } from "leva";

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

  createLevaInputs() {
    let inputParams = {};

    /** Runs through active atom inputs and adds IO parameters to default param*/
    if (this.inputs) {
      this.inputs.map((input) => {
        const checkConnector = () => {
          return input.connectors.length > 0;
        };

        /* Makes inputs for Io's other than geometry */
        if (input.valueType !== "geometry" && input.name !== "Text") {
          inputParams[this.uniqueID + input.name] = {
            value: input.currentEquation ? input.currentEquation : input.value,
            label: input.name,
            step: 0.25,
            type: LevaInputs.STRING,
            disabled: checkConnector(),
            onChange: async (value) => {
              let currentEquation = String(value).trim();
              input.currentEquation = currentEquation;
              try {
                const result = await this.evaluateEquation(
                  currentEquation,
                  input.name
                );
                if (Number.isFinite(result)) {
                  if (result !== input.value) {
                    input.setValue(result);
                  }
                }
              } catch (err) {
                input.setValue(NaN);
                this.alertingErrorHandler()(err);
              }
            },
          };
        }
        if (input.name === "Text") {
          inputParams[this.uniqueID + "Text"] = {
            value: input.currentEquation ? input.currentEquation : input.value,
            label: input.name,
            type: LevaInputs.STRING,
            disabled: checkConnector(),
            onChange: async (value) => {
              if (input.value !== value) {
                input.setValue(value);
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
    return GlobalVariables.cad.text(this.uniqueID, text, fontSize, fontFamily);
  }

  serialize(offset = { x: 0, y: 0 }) {
    var thisAsObject = super.serialize(offset);

    thisAsObject.fontFamily = this.fontFamily;
    thisAsObject.selectedFontIndex = this.selectedFontIndex;

    return thisAsObject;
  }
}
