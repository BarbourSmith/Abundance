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
      "Keep Out": "#D9544D",
    };

    this.addIO("input", "geometry", this, "geometry", null, false, true);
    this.addIO("output", "geometry", this, "geometry", null);

    this.selectedValueColor;

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
   * Applies a color tag to the object in a worker thread.
   */
  updateValue() {
    super.updateValue();

    if (this.inputs.every((x) => x.ready)) {
      this.processing = true;
      var inputID = this.findIOValue("geometry");
      var color = Object.values(this.colorOptions)[this.selectedColorIndex];
      this.selectedValueColor = Object.keys(this.colorOptions)[
        this.selectedColorIndex
      ];
      GlobalVariables.cad
        .color(this.uniqueID, inputID, color)
        .then(() => {
          this.basicThreadValueProcessing();
        })
        .catch(this.alertingErrorHandler());
    }
  }

  /**
   * Updates the value of the selected color and then the value.
   */
  changeColor(index) {
    this.selectedColorIndex = index;
    this.updateValue();
  }

  /**
   * Create Leva Menu Inputs - returns to ParameterEditor
   */
  createLevaInputs() {
    let inputParams = {};
    /** Runs through active atom inputs and adds IO parameters to default param*/
    if (this.inputs) {
      this.inputs.map((input) => {
        const checkConnector = () => {
          return input.connectors.length > 0;
        };

        inputParams[this.uniqueID + "color"] = {
          value: Object.keys(this.colorOptions)[this.selectedColorIndex],
          label: "Color",
          options: Object.keys(this.colorOptions),
          onChange: (value) => {
            this.changeColor(Object.keys(this.colorOptions).indexOf(value));
            this.sendToRender();
          },
        };

        /* Makes inputs for Io's other than geometry */
        if (input.valueType !== "geometry") {
          inputParams[this.uniqueID + input.name] = {
            value: input.value,
            label: input.name,
            disabled: checkConnector(),
            step: 0.01,
            onChange: (value) => {
              if (input.value !== value) {
                input.setValue(value);
                //this.sendToRender();
              }
            },
          };
        }
      });
      return inputParams;
    }
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
