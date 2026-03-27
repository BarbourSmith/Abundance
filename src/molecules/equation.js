import Atom from "../prototypes/atom";
import GlobalVariables from "../js/globalvariables.js";
import { parse } from "mathjs";
import { Status } from "../prototypes/observableEntity.js";

/**
 * This class creates the Equation atom.
 */
export default class Equation extends Atom {
  /**
   * Built-in mathematical constants that should not be treated as variables.
   * These are recognized by mathjs and should not create input attachment points.
   * @type {Set<string>}
   */
  static BUILTIN_CONSTS = new Set(["pi", "e", "tau", "Infinity", "NaN"]);

  /**
   * The constructor function.
   * @param {object} values An array of values passed in which will be assigned to the class as this.x
   */
  constructor(values) {
    super(values);

    this.addIO("result", "any", 0, "output");

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
      "Defines a mathematical equation or string concatenation. " +
      "Use quotes (single or double) for string values. " +
      "Examples: x + y * 2, thickness + 'mm plywood'. " +
      "Edit the output field to add or remove inputs.";

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
    this.name = this.currentEquation; // Set name to match the current equation for display
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
   * Only true variables (not function names or built-in constants) are returned.
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
      // Remove duplicates and built-in constants
      variables = [...new Set(variables)].filter(
        (v) => !Equation.BUILTIN_CONSTS.has(v),
      );
    } catch (e) {
      // Fallback for string expressions that mathjs can't parse
      // Need to extract variables while respecting quote boundaries
      variables = this._extractVariablesRespectingQuotes(this.currentEquation);
    }
    return variables;
  }

  /**
   * Extract variables from an expression while respecting quote boundaries.
   * Variables inside quoted strings are not extracted.
   * @param {string} equation - The equation string to parse
   * @returns {string[]} Array of variable names
   */
  _extractVariablesRespectingQuotes(equation) {
    const variables = [];
    let current = "";
    let inQuotes = false;
    let quoteChar = "";

    // Parse the expression, only extracting from non-quoted sections
    for (let i = 0; i < equation.length; i++) {
      const char = equation[i];

      if ((char === '"' || char === "'") && !inQuotes) {
        inQuotes = true;
        quoteChar = char;
        // Process accumulated non-quoted content
        if (current.trim()) {
          this._extractVariablesFromPart(current, variables);
        }
        current = "";
      } else if (char === quoteChar && inQuotes) {
        inQuotes = false;
        quoteChar = "";
        // Skip the content inside quotes
        current = "";
      } else if (!inQuotes) {
        current += char;
      }
      // Skip characters inside quotes
    }

    // Process any remaining content
    if (current.trim() && !inQuotes) {
      this._extractVariablesFromPart(current, variables);
    }

    return [...new Set(variables)];
  }

  /**
   * Extract identifiers from a non-quoted part of an expression
   * @param {string} part - The part of the expression to extract from
   * @param {string[]} variables - Array to add extracted variables to
   */
  _extractVariablesFromPart(part, variables) {
    // Extract identifiers from non-quoted parts
    const matches = part.match(/\b[a-zA-Z_][a-zA-Z0-9_]*\b/g) || [];
    // Filter out built-in constants
    const filtered = matches.filter((m) => !Equation.BUILTIN_CONSTS.has(m));
    variables.push(...filtered);
  }

  /**
   * Add and remove inputs as needed from the atom
   */
  addAndRemoveInputs() {
    // Use AST-based variable extraction
    let variables = this._extractVariablesFromEquation();
    // Only add inputs for variables NOT present in any ancestor molecule's inputs
    const ancestorInputs = this.getInputsFromAncestors();
    let moleculeInputs = ancestorInputs.map((input) => input.name);

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

  rerenderInputs() {
    if (this.setInputChanged) {
      const representativeHash =
        this.currentEquation +
        this.inputs.map((input) => input.getValue()).join(",");
      this.setInputChanged(representativeHash);
    }
  }

  createInputParams(setInputChanged) {
    this.setInputChanged = setInputChanged;
    // Create input parameters for the atom

    let inputParams = super.createInputParams(setInputChanged);

    /* Make an input for the equation itself */
    inputParams[this.uniqueID + "currentequation"] = {
      value: this.currentEquation,
      label: "Current Equation",
      disabled: false,
      type: "string",
      onChange: async (value) => {
        if (this.currentEquation !== value) {
          this.setEquation(value);
          this.rerenderInputs();
        }
      },
      order: -3,
    };

    inputParams[`${this.uniqueID} result`] = {
      type: "string",
      value: this.getState().value, // Possibly undefined if computation is in progress.
      label: "Result",
      disabled: true,
    };

    return inputParams;
  }

  inputsAreReady() {
    return (
      this.currentEquation &&
      this.inputs.every((input) => input.getState().status == Status.READY)
    );
  }

  compute(_) {
    return new Promise((resolve, reject) => {
      // Use Atom's evaluateEquation method
      this.value = super.evaluateEquation(this.currentEquation);
      resolve(this.value);
      this.rerenderInputs();
    });
  }

  /**
   * Add the equation choice to the object which is saved for this molecule
   */
  serialize(offset = { x: 0, y: 0 }) {
    var superSerialObject = super.serialize(offset);

    //Write the current equation to the serialized object
    // Use safe serialization to prevent large equations from bloating the save file
    Atom.safeSerializeValue(
      superSerialObject,
      "currentEquation",
      this.currentEquation,
      this.name || "Equation",
    );

    return superSerialObject;
  }

  /**
   * Set the current equation to be a new value.
   */
  setEquation(newEquation) {
    let equation = String(newEquation).trim(); //convert to string first, then remove leading and trailing whitespace

    // Normalize smart/curly quotes to standard ASCII quotes
    // This handles copy-paste from Word, Google Docs, etc.
    equation = equation
      .replace(/[\u201C\u201D\u201E\u201F\u2033\u2036]/g, '"') // Various double quote styles
      .replace(/[\u2018\u2019\u201A\u201B\u2032\u2035]/g, "'"); // Various single quote styles

    this.currentEquation = equation;
    this.name = this.currentEquation; // Update the displayed name to match the current equation
    this.addAndRemoveInputs();

    // When all equation variables are molecule-level inputs, no atom inputs exist and
    // _subscribeToInputs() won't trigger onUpstreamChange(). Force a recompute so
    // the result reflects the new equation rather than the previous stale value.
    if (this.isEnabled() && this.inputs.length === 0) {
      console.log(
        "forcing recompute of Equation atom with molecule-level inputs",
      );
      this.onUpstreamChange();
    }
  }

  /**
   * Send the value of this atom to the 3D display. Used to display the number
   */
  sendToRender() {
    // No rendering for this atom
  }
}
