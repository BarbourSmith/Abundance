import Atom from "../prototypes/atom";

import GlobalVariables from "../js/globalvariables.js";

/**
 * This class creates the color atom which can be used to give a part a color.
 */
export default class Color extends Atom {
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
    this.name = "Color";
    /**
     * This atom's type
     * @type {string}
     */
    this.atomType = "Color";
    /**
     * A description of this atom
     * @type {string}
     */
    this.description = "Changes the color of the shape.";

    /**
     * The index of the currently selected color option.
     * @type {number}
     */
    this.selectedColorIndex = 0;

    /**
     * The color options to choose from
     * @type {array}
     */
    this.colorOptions = {
      Default: "#aad7f2",
      Red: "#FF9065",
      Orange: "#FFB458",
      Yellow: "#FFD600",
      Olive: "#C7DF66",
      Teal: "#71D1C2",
      "Light Blue": "#75DBF2",
      Green: "#A3CE5B",
      "Lavender ": "#CCABED",
      Brown: "#CFAB7C",
      Pink: "#FFB09D",
      Sand: "#E2C66C",
      Clay: "#C4D3AC",
      Blue: "#91C8D5",
      "Light Green": "#96E1BB",
      Purple: "#ACAFDD",
      "Light Purple": "#DFB1E8",
      Tan: "#F5D3B6",
      "Mauve ": "#DBADA9",
      Grey: "#BABABA",
      Black: "#3C3C3C",
      White: "#FFFCF7",
      Glass: "#E6F3FF",
      "Keep Out": "#D9544D",
    };
    this.addAllIOs([
      { name: "color", valueType: "string", type: "output" },
      { name: "geometry", valueType: "geometry", type: "input" },
    ]);

    this.setValues(values);
  }

  /**
   * Draw the circle atom & icon.
   */
  draw() {
    super.draw(); //Super call to draw the rest

    GlobalVariables.c.beginPath();
    GlobalVariables.c.fillStyle = Object.values(this.colorOptions)[
      this.selectedColorIndex
    ];

    GlobalVariables.c.arc(
      GlobalVariables.widthToPixels(this.x),
      GlobalVariables.heightToPixels(this.y),
      GlobalVariables.widthToPixels(this.radius / 1.5),
      0,
      Math.PI * 2,
      false
    );
    GlobalVariables.c.fill();
    GlobalVariables.c.closePath();
  }

  /**
   * Compute & return a promise of the colored geometry
   */
  compute(inputs) {
    const color = Object.values(this.colorOptions)[this.selectedColorIndex];
    return GlobalVariables.cad.color(inputs.geometry, color);
  }

  createInputParams() {
    let inputParams = {};
    /** Runs through active atom inputs and adds IO parameters to default param*/

    inputParams[this.uniqueID + "color"] = {
      type: "select",
      value: Object.keys(this.colorOptions)[this.selectedColorIndex],
      label: "Color",
      options: Object.keys(this.colorOptions),
      onChange: (value) => {
        this.selectedColorIndex = Object.keys(this.colorOptions).indexOf(value);
        this.onUpstreamChange();
      },
    };
    /** Runs through active atom inputs and adds IO parameters to default param*/
    if (this.inputs.every((x) => x.ready)) {
      this.inputs.map((input) => {
        const checkConnector = () => {
          return input.connectors.length > 0;
        };
        /* Makes inputs for Io's other than geometry */
        if (input.valueType !== "geometry") {
          inputParams[this.uniqueID + input.name] = {
            type: "number",
            value: input.value,
            label: input.name,
            disabled: checkConnector(),
            step: 0.01,
            onChange: (value) => {
              if (input.value !== value) {
                input.setValue(value);
              }
            },
          };
        }
      });
    }
    return inputParams;
  }

  /**
   * Add the color choice to the object which is saved for this molecule
   */
  serialize(offset = { x: 0, y: 0 }) {
    var superSerialObject = super.serialize(offset);

    //Write the current color selection to the serialized object
    superSerialObject.selectedColorIndex = this.selectedColorIndex;

    return superSerialObject;
  }
}
