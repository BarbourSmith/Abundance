import Atom from "../prototypes/atom";
import GlobalVariables from "../js/globalvariables.js";
import { button } from "leva";
import { or } from "mathjs";

/**
 * This class creates the Equation atom.
 */
export default class Equation extends Atom {
  /**
   * The constructor function.
   * @param {object} values An array of values passed in which will be assigned to the class as this.x
   */
  constructor(values) {
    super(values);

    this.addIO("result", "number", 0, "output");

    /**
     * This atom's name
     * @type {string}
     */
    this.name = "Equation";

    /**
     * This atom's type
     * @type {string}
     */
    this.atomType = "Equation";

    /**
     * Evaluate the equation adding and removing inputs as needed
     */
    this.value = 0;
    /**
     * A description of this atom
     * @type {string}
     */
    this.description =
      "Defines a mathematical equation. Edit the output field to add or remove inputs.";

    /**
     * This atom's height as drawn on the screen
     */
    this.height;
    /**
     * The index number of the currently selected option
     * @type {number}
     */
    this.currentEquation = "x + y";

    this.setValues(values);
    this.addAndRemoveInputs();
    this.setValues(values); //Set values again to load input values which were saved
  }

  /**
   * Draw the Bill of material atom which has a BOM icon.
   */
  draw() {
    super.draw("rect");

    let pixelsX = GlobalVariables.widthToPixels(this.x);
    let pixelsY = GlobalVariables.heightToPixels(this.y);
    let pixelsRadius = GlobalVariables.widthToPixels(this.radius);
    /**
     * Relates height to radius
     * @type {number}
     */
    this.height = pixelsRadius;

    GlobalVariables.c.beginPath();
    GlobalVariables.c.fillStyle = "#484848";
    GlobalVariables.c.font = `${pixelsRadius / 1.3}px Work Sans Bold`;

    const text = "\u221A" + "(+)";
    const textHeight = pixelsRadius / 1.5;
    const textWidth = GlobalVariables.c.measureText(text).width;
    const textX = pixelsX - textWidth / 2;
    const textY = pixelsY + this.height / 2 - textHeight / 2;
    GlobalVariables.c.fillText(text, textX, textY);

    GlobalVariables.c.fill();
    GlobalVariables.c.closePath();
  }

  /**
   * Add and remove inputs as needed from the atom
   */
  addAndRemoveInputs() {
    //Find all the variables in this equation using word boundaries to avoid function names
    var re = /\b[a-zA-Z]+\b/g;
    const allMatches = this.currentEquation.match(re);

    // Filter out common math function names to avoid treating them as variables
    const mathFunctions = new Set([
      "sin",
      "cos",
      "tan",
      "asin",
      "acos",
      "atan",
      "atan2",
      "sinh",
      "cosh",
      "tanh",
      "asinh",
      "acosh",
      "atanh",
      "sqrt",
      "cbrt",
      "exp",
      "log",
      "log10",
      "log2",
      "abs",
      "sign",
      "ceil",
      "floor",
      "round",
      "trunc",
      "min",
      "max",
      "mean",
      "median",
      "mode",
      "std",
      "var",
      "pi",
      "e",
      "i",
      "true",
      "false",
      "null",
      "undefined",
    ]);

    const variables = allMatches
      ? allMatches.filter((match) => !mathFunctions.has(match.toLowerCase()))
      : [];

    //Remove any inputs which are not needed
    const deleteExtraInputs = () => {
      this.inputs.forEach((input) => {
        if (!variables.includes(input.name)) {
          this.removeIO("input", input.name, this);
          deleteExtraInputs(); //This needs to be called recursively to make sure all the inputs are deleted
        }
      });
    };
    deleteExtraInputs();

    //Add any inputs which are needed
    if (variables.length > 0) {
      const inputArgs = [];
      for (var variable in variables) {
        if (!this.inputs.some((input) => input.name === variables[variable])) {
          inputArgs.push({
            name: variables[variable],
            valueType: "number",
            defaultValue: 1,
          });
        }
      }
      // Batch add so that compute only gets called back once all inputs are
      // constructed.
      this.addAllIOs(inputArgs);
    }
  }

  /**
   * Evaluate the equation
   */
  evaluateEquation() {
    try {
      // Substitute numbers into the string
      var substitutedEquation = this.currentEquation;
      this.name = this.currentEquation;

      // Find all the variables in this equation using word boundaries to avoid function names
      var re = /\b[a-zA-Z]+\b/g;
      const allMatches = this.currentEquation.match(re);

      // Filter out common math function names to avoid treating them as variables
      const mathFunctions = new Set([
        "sin",
        "cos",
        "tan",
        "asin",
        "acos",
        "atan",
        "atan2",
        "sinh",
        "cosh",
        "tanh",
        "asinh",
        "acosh",
        "atanh",
        "sqrt",
        "cbrt",
        "exp",
        "log",
        "log10",
        "log2",
        "abs",
        "sign",
        "ceil",
        "floor",
        "round",
        "trunc",
        "min",
        "max",
        "mean",
        "median",
        "mode",
        "std",
        "var",
        "pi",
        "e",
        "i",
        "true",
        "false",
        "null",
        "undefined",
      ]);

      const variables = allMatches
        ? allMatches.filter((match) => !mathFunctions.has(match.toLowerCase()))
        : [];

      if (variables.length > 0) {
        for (var variable in variables) {
          for (var i = 0; i < this.inputs.length; i++) {
            if (this.inputs[i].name == variables[variable]) {
              // Use word boundaries in replacement to avoid partial matches
              const variablePattern = new RegExp(
                `\\b${this.inputs[i].name}\\b`,
                "g"
              );
              substitutedEquation = substitutedEquation.replace(
                variablePattern,
                this.findIOValue(this.inputs[i].name)
              );
            }
          }
        }
      }

      // Evaluate the substituted equation
      return GlobalVariables.limitedEvaluate(substitutedEquation);
    } catch (error) {
      console.error("Error evaluating equation:", error);
      this.setError(error);
      return NaN;
    }
  }

  rerenderLevaInputs() {
    if (this.setInputChanged) {
      const representativeHash =
        this.currentEquation +
        this.inputs.map((input) => input.getValue()).join(",");
      this.setInputChanged(representativeHash);
    }
  }

  /**
   * Create Leva Menu Inputs - returns to ParameterEditor
   */
  createLevaInputs(setInputChanged) {
    this.setInputChanged = setInputChanged;
    // recreate inputs
    let inputParams = {};
    /** Runs through active atom inputs and adds IO parameters to default param*/
    if (this.inputs) {
      console.log("recreating inputs for equation atom: ");
      console.log(this.inputs);
      this.inputs.map((input) => {
        const checkConnector = () => {
          return input.connectors.length > 0;
        };

        /* Makes inputs for Io's other than geometry */
        if (input.valueType !== "geometry") {
          inputParams[input.name] = {
            value: input.getValue(),
            disabled: checkConnector(),
            step: 0.01,
            onChange: (value) => {
              input.setReady(value);
              this.rerenderLevaInputs();
            },
            order: -2,
          };
        }
      });

      inputParams[`${this.uniqueID}currentEquation`] = {
        value: this.currentEquation,
        label: "Current Equation",
        disabled: false,
        onChange: (value) => {
          if (this.currentEquation !== value) {
            this.setEquation(value);
          }
        },
        order: -3,
      };

      inputParams[`${this.uniqueID}result`] = {
        value: this.getState().value, // Possibly undefined if computation is in progress.
        label: "Result",
        disabled: true,
      };

      console.log(inputParams);
      return inputParams;
    }
  }

  compute(inputs) {
    return new Promise((resolve, reject) => {
      this.value = this.evaluateEquation();
      this.rerenderLevaInputs(); // Update the result in the leva panel
      resolve(this.value);
    });
  }

  /**
   * Add the equation choice to the object which is saved for this molecule
   */
  serialize(offset = { x: 0, y: 0 }) {
    var superSerialObject = super.serialize(offset);

    //Write the current equation to the serialized object
    superSerialObject.currentEquation = this.currentEquation;

    return superSerialObject;
  }

  /**
   * Set the current equation to be a new value.
   */
  setEquation(newEquation) {
    this.currentEquation = String(newEquation).trim(); //convert to string first, then remove leading and trailing whitespace
    this.addAndRemoveInputs();
    this.rerenderLevaInputs();
  }

  /**
   * Send the value of this atom to the 3D display. Used to display the number
   */
  sendToRender() {
    //Send code to jotcad to render
    //GlobalVariables.writeToDisplay(this.uniqueID);
    console.log("equation");
  }
}
