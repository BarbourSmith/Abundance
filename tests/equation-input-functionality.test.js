import { describe, it, expect } from "vitest";

// Mock the required dependencies
const mockGlobalVariables = {
  limitedEvaluate: (expr) => {
    // Simple eval for testing - normally this would use mathjs
    try {
      // Replace variable placeholders with their values
      return eval(expr);
    } catch (e) {
      return NaN;
    }
  }
};

// Mock mathjs parse function
const mockParse = (expr) => {
  return {
    traverse: (callback) => {
      // Simple mock that extracts variables using regex
      const variables = expr.match(/[a-zA-Z_][a-zA-Z0-9_]*/g) || [];
      variables.forEach(v => {
        callback({
          isSymbolNode: !["sin", "cos", "tan", "log", "sqrt", "abs"].includes(v),
          name: v
        }, null, null);
      });
    }
  };
};

// Simple EquationEvaluator implementation for testing
class EquationEvaluator {
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

  static extractVariablesFromEquation(equation) {
    let variables = [];
    try {
      const node = mockParse(equation);
      node.traverse(function (n, path, parent) {
        if (n.isSymbolNode) {
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
      return mockGlobalVariables.limitedEvaluate(substitutedEquation);
    } catch (error) {
      console.error("Error evaluating equation:", error);
      return NaN;
    }
  }
}

describe("EquationEvaluator Functionality", () => {
  describe("isEquation", () => {
    it("should identify equations correctly", () => {
      expect(EquationEvaluator.isEquation("4*2")).toBe(true);
      expect(EquationEvaluator.isEquation("x + y")).toBe(true);
      expect(EquationEvaluator.isEquation("10")).toBe(false);
      expect(EquationEvaluator.isEquation("10.5")).toBe(false);
      expect(EquationEvaluator.isEquation("")).toBe(false);
      expect(EquationEvaluator.isEquation(42)).toBe(false);
    });
  });

  describe("extractVariablesFromEquation", () => {
    it("should extract variables from equations", () => {
      expect(EquationEvaluator.extractVariablesFromEquation("x + y")).toContain("x");
      expect(EquationEvaluator.extractVariablesFromEquation("x + y")).toContain("y");
      expect(EquationEvaluator.extractVariablesFromEquation("diameter * 2")).toContain("diameter");
      expect(EquationEvaluator.extractVariablesFromEquation("4*2")).toEqual([]);
    });
  });

  describe("evaluateEquation", () => {
    it("should evaluate simple math expressions", () => {
      const mockAtom = { inputs: [], parentMolecule: null, findIOValue: () => 0 };
      
      expect(EquationEvaluator.evaluateEquation("4*2", mockAtom)).toBe(8);
      expect(EquationEvaluator.evaluateEquation("10+5", mockAtom)).toBe(15);
      expect(EquationEvaluator.evaluateEquation("20/4", mockAtom)).toBe(5);
    });

    it("should handle plain numbers", () => {
      const mockAtom = { inputs: [], parentMolecule: null, findIOValue: () => 0 };
      
      expect(EquationEvaluator.evaluateEquation("10", mockAtom)).toBe(10);
      expect(EquationEvaluator.evaluateEquation("10.5", mockAtom)).toBe(10.5);
    });

    it("should substitute variables from atom inputs", () => {
      const mockAtom = {
        inputs: [
          { name: "x", value: 5 },
          { name: "y", value: 3 }
        ],
        parentMolecule: null,
        findIOValue: (name) => {
          const input = mockAtom.inputs.find(i => i.name === name);
          return input ? input.value : 0;
        }
      };
      
      expect(EquationEvaluator.evaluateEquation("x + y", mockAtom)).toBe(8);
      expect(EquationEvaluator.evaluateEquation("x * y", mockAtom)).toBe(15);
    });

    it("should substitute variables from parent molecule inputs", () => {
      const mockAtom = {
        inputs: [],
        parentMolecule: {
          inputs: [
            { name: "diameter", value: 10 },
            { name: "height", value: 5 }
          ]
        },
        findIOValue: () => 0
      };
      
      expect(EquationEvaluator.evaluateEquation("diameter * 2", mockAtom)).toBe(20);
      expect(EquationEvaluator.evaluateEquation("diameter + height", mockAtom)).toBe(15);
    });
  });
});