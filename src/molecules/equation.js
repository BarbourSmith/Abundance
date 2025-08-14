import Atom from "../prototypes/atom";
import GlobalVariables from "../js/globalvariables.js";
import { parse } from "mathjs";
import { Status } from "../prototypes/observableEntity.js";

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
   * Extracts variable names from the current equation using mathjs AST parsing.
   * Only true variables (not function names) are returned.
   * @returns {string[]} Array of variable names
   */
  _extractVariablesFromEquation() {
    let variables = [];
    try {
      const node = parse(this.currentEquation);
      node.traverse(function (n, path, parent) {
        if (
          n.isSymbolNode &&
          !(
            parent &&
            parent.isFunctionNode &&
            parent.fn &&
            parent.fn.name === n.name
          )
        ) {
          variables.push(n.name);
        }
      });
      // Remove duplicates
      variables = [...new Set(variables)];
    } catch (e) {
      variables = [];
    }
    return variables;
  }

  /**
   * Add and remove inputs as needed from the atom
   */
  addAndRemoveInputs() {
    // Use AST-based variable extraction
    let variables = this._extractVariablesFromEquation();
    // Only add inputs for variables NOT present in parent molecule's inputs
    let moleculeInputs = [];
    if (this.parentMolecule && this.parentMolecule.inputs) {
      moleculeInputs = this.parentMolecule.inputs.map((input) => input.name);
    }

    //Remove any inputs which are not needed
    const deleteExtraInputs = () => {
      this.inputs.forEach((input) => {
        // Remove if not in variables OR if now a molecule input
        if (
          !variables.includes(input.name) ||
          moleculeInputs.includes(input.name)
        ) {
          this.removeIO("input", input.name, this);
          deleteExtraInputs(); //This needs to be called recursively to make sure all the inputs are deleted
        }
      });
    };
    deleteExtraInputs();
    //Add any inputs which are needed and NOT molecule inputs
    if (variables.length > 0) {
      let inputArgs = [];
      for (var variable of variables) {
        if (
          !this.inputs.some((input) => input.name === variable) &&
          !moleculeInputs.includes(variable)
        ) {
          inputArgs.push({
            name: variable,
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

      // Use AST-based variable extraction for consistency
      const variables = this._extractVariablesFromEquation();

      if (variables.length > 0) {
        for (var variable of variables) {
          // First, try to find in parent molecule's inputs
          let value = null;
          if (this.parentMolecule && this.parentMolecule.inputs) {
            for (var j = 0; j < this.parentMolecule.inputs.length; j++) {
              if (this.parentMolecule.inputs[j].name == variable) {
                value = this.parentMolecule.inputs[j].value;
                break;
              }
            }
          }
          // If not found, try to find in this atom's inputs
          if (value === null) {
            for (var i = 0; i < this.inputs.length; i++) {
              if (this.inputs[i].name == variable) {
                value = this.findIOValue(this.inputs[i].name);
                break;
              }
            }
          }
          // If still not found, skip substitution (or set to 0)
          if (value === null) value = 0;

          // Use word boundaries in replacement to avoid partial matches
          const variablePattern = new RegExp(`\\b${variable}\\b`, "g");
          substitutedEquation = substitutedEquation.replace(
            variablePattern,
            value
          );
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

      return inputParams;
    }
  }

  inputsAreReady() {
    return (
      this.currentEquation &&
      this.inputs.every((input) => input.getState().status == Status.READY)
    );
  }

  compute(_) {
    return new Promise((resolve, reject) => {
      this.value = this.evaluateEquation();
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
