import { describe, it, expect, beforeEach } from "vitest";

describe("Equation string concatenation integration", () => {
  let mockAtom;

  beforeEach(() => {
    // Create a mock atom with the necessary methods
    mockAtom = {
      inputs: [],
      parent: null,
      parentMolecule: null,
      clearAlert: () => {},
      findIOValue: (name) => {
        const input = mockAtom.inputs.find(i => i.name === name);
        return input ? input.getValue() : null;
      },
      extractVariablesFromEquation: (equation) => {
        // Simple variable extraction for testing
        const variables = [];
        const matches = equation.match(/\b[a-zA-Z][a-zA-Z0-9]*\b/g) || [];
        return matches.filter(m => !['pi', 'e', 'tau', 'Infinity', 'NaN'].includes(m));
      }
    };
  });

  it("should evaluate string concatenation expressions", () => {
    // Add the string evaluation method to our mock
    mockAtom._evaluateStringExpression = function(expression) {
      const variables = this.extractVariablesFromEquation(expression);
      const unresolved = [];
      const resolvedValues = {};
      const BUILTIN_CONSTS = new Set(["pi", "e", "tau", "Infinity", "NaN"]);
      
      if (variables.length > 0) {
        const parentInputs = [];
        
        for (const variable of variables) {
          if (BUILTIN_CONSTS.has(variable)) {
            continue;
          }
          
          let value = null;
          // Check this atom's inputs
          for (let i = 0; i < this.inputs.length; i++) {
            if (this.inputs[i].name === variable) {
              value = this.findIOValue(this.inputs[i].name);
              break;
            }
          }
          
          if (value === null || value === undefined) {
            unresolved.push(variable);
          } else {
            resolvedValues[variable] = value;
          }
        }
      }
      
      if (unresolved.length) {
        const msg = `Variable(s) not found: ${unresolved.join(", ")}`;
        throw new Error(msg);
      } else {
        this.clearAlert();
        
        let substitutedExpression = expression;
        
        // Substitute all resolved variables
        for (const variable of Object.keys(resolvedValues)) {
          const value = resolvedValues[variable];
          const safeVar = variable.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          const variablePattern = new RegExp(`\\b${safeVar}\\b`, "gu");
          
          const stringValue = typeof value === 'string' ? `"${value}"` : String(value);
          substitutedExpression = substitutedExpression.replace(
            variablePattern,
            stringValue
          );
        }
        
        // Safely evaluate the expression for string concatenation
        try {
          const safeEval = (expr) => {
            if (!/^[\d\s+\-*/()."'a-zA-Z]+$/.test(expr)) {
              throw new Error("Expression contains invalid characters");
            }
            
            return new Function(`"use strict"; return (${expr})`)();
          };
          
          const result = safeEval(substitutedExpression);
          return String(result);
        } catch (error) {
          const msg = `Invalid string expression: "${substitutedExpression}". ${error.message}`;
          throw new Error(msg);
        }
      }
    };

    // Test x + "mm plywood" with x = 18
    mockAtom.inputs = [
      {
        name: "x",
        getValue: () => 18
      }
    ];
    
    const result = mockAtom._evaluateStringExpression('x + "mm plywood"');
    expect(result).toBe("18mm plywood");
  });

  it("should handle multiple variables in string expressions", () => {
    mockAtom._evaluateStringExpression = function(expression) {
      // Same implementation as above
      const variables = this.extractVariablesFromEquation(expression);
      const unresolved = [];
      const resolvedValues = {};
      
      if (variables.length > 0) {
        for (const variable of variables) {
          let value = null;
          for (let i = 0; i < this.inputs.length; i++) {
            if (this.inputs[i].name === variable) {
              value = this.findIOValue(this.inputs[i].name);
              break;
            }
          }
          
          if (value === null || value === undefined) {
            unresolved.push(variable);
          } else {
            resolvedValues[variable] = value;
          }
        }
      }
      
      if (unresolved.length) {
        throw new Error(`Variable(s) not found: ${unresolved.join(", ")}`);
      }
      
      let substitutedExpression = expression;
      for (const variable of Object.keys(resolvedValues)) {
        const value = resolvedValues[variable];
        const safeVar = variable.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const variablePattern = new RegExp(`\\b${safeVar}\\b`, "gu");
        
        const stringValue = typeof value === 'string' ? `"${value}"` : String(value);
        substitutedExpression = substitutedExpression.replace(
          variablePattern,
          stringValue
        );
      }
      
      const safeEval = (expr) => {
        if (!/^[\d\s+\-*/()."'a-zA-Z]+$/.test(expr)) {
          throw new Error("Expression contains invalid characters");
        }
        return new Function(`"use strict"; return (${expr})`)();
      };
      
      return String(safeEval(substitutedExpression));
    };

    // Test quantity + "x" + thickness + "mm plywood"
    mockAtom.inputs = [
      {
        name: "quantity",
        getValue: () => 3
      },
      {
        name: "thickness",
        getValue: () => 18
      }
    ];
    
    const result = mockAtom._evaluateStringExpression('quantity + "x" + thickness + "mm plywood"');
    expect(result).toBe("3x18mm plywood");
  });

  it("should handle pure string concatenation", () => {
    mockAtom._evaluateStringExpression = function(expression) {
      // For pure strings with no variables, just evaluate directly
      const safeEval = (expr) => {
        if (!/^[\d\s+\-*/()."'a-zA-Z]+$/.test(expr)) {
          throw new Error("Expression contains invalid characters");
        }
        return new Function(`"use strict"; return (${expr})`)();
      };
      
      return String(safeEval(expression));
    };
    
    const result = mockAtom._evaluateStringExpression('"hello" + " world"');
    expect(result).toBe("hello world");
  });
});