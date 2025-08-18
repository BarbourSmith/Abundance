import { parse } from "mathjs";
import GlobalVariables from "./globalvariables.js";

/**
 * Utility class for evaluating mathematical expressions in atom inputs
 * Extracted from equation.js to be reusable across all atoms
 * 
 * This enables any numeric input in any atom to accept and evaluate
 * mathematical expressions like "4*2" or use variables like "diameter*2"
 */
export class EquationEvaluator {
  /**
   * Determines if a value looks like an equation that should be evaluated
   * @param {any} value - The input value to check
   * @returns {boolean} - True if it looks like an equation
   */
  static isEquation(value) {
    if (typeof value !== "string") return false;
    if (value.trim() === "") return false;
    
    // Check if it's just a plain number
    if (!isNaN(parseFloat(value)) && isFinite(value) && !/[+\-*/()a-zA-Z_]/.test(value)) {
      return false;
    }
    
    // If it contains operators, variables, or functions, treat as equation
    return /[+\-*/()a-zA-Z_]/.test(value);
  }

  /**
   * Extracts variable names from an equation using mathjs AST parsing.
   * Only true variables (not function names) are returned.
   * @param {string} equation - The equation string
   * @returns {string[]} Array of variable names
   */
  static extractVariablesFromEquation(equation) {
    let variables = [];
    try {
      const node = parse(equation);
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
   * Evaluates an equation by substituting variables and computing the result
   * @param {string} equation - The equation to evaluate
   * @param {object} atom - The atom context for finding variable values
   * @returns {number} The evaluated result
   */
  static evaluateEquation(equation, atom) {
    try {
      // If it's not an equation, try to parse as number
      if (!this.isEquation(equation)) {
        const num = parseFloat(equation);
        return isNaN(num) ? 0 : num;
      }

      // Substitute numbers into the string
      var substitutedEquation = equation;

      // Extract variables from the equation
      const variables = this.extractVariablesFromEquation(equation);

      if (variables.length > 0) {
        for (var variable of variables) {
          // First, try to find in parent molecule's inputs
          let value = null;
          if (atom.parentMolecule && atom.parentMolecule.inputs) {
            for (var j = 0; j < atom.parentMolecule.inputs.length; j++) {
              if (atom.parentMolecule.inputs[j].name == variable) {
                value = atom.parentMolecule.inputs[j].value;
                break;
              }
            }
          }
          // If not found, try to find in this atom's inputs
          if (value === null && atom.inputs) {
            for (var i = 0; i < atom.inputs.length; i++) {
              if (atom.inputs[i].name == variable) {
                value = atom.findIOValue(atom.inputs[i].name);
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
      return NaN;
    }
  }
}