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
      Default: "#89CFF0", // Sky blue - improved from previous light blue
      Red: "#E63946", // Brighter, more vivid red
      Orange: "#F4A261", // Softer orange with better contrast
      Yellow: "#FFD60A", // More visible yellow
      Olive: "#606C38", // Darker olive green for better contrast
      Teal: "#2A9D8F", // Deeper teal for better visibility
      "Light Blue": "#48CAE4", // Brighter light blue
      Green: "#38B000", // More vibrant green
      "Lavender": "#9F86C0", // Cleaner lavender (removed trailing space)
      Brown: "#A47148", // Richer brown
      Pink: "#FF758F", // More vibrant pink
      Sand: "#E9C46A", // Sand with better contrast
      Clay: "#A98467", // Deeper clay color
      Blue: "#1A759F", // Deeper blue for contrast
      "Light Green": "#80ED99", // Brighter light green
      Purple: "#7B2CBF", // More vibrant purple
      "Light Purple": "#C77DFF", // Brighter light purple
      Tan: "#D4A373", // Warmer tan
      "Mauve": "#B5838D", // Cleaner mauve (removed trailing space)
      Grey: "#6C757D", // Darker grey for better contrast
      Black: "#212529", // Richer black
      White: "#F8F9FA", // Clean white
      "Keep Out": "#D00000", // Brighter red for warnings
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
