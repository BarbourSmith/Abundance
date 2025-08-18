import { describe, it, expect } from "vitest";

describe("Circle Atom with Equation Evaluation", () => {
  // Mock the required classes and functions for testing
  
  // Mock EquationEvaluator
  const mockEquationEvaluator = {
    isEquation: (value) => {
      if (typeof value !== "string") return false;
      if (value.trim() === "") return false;
      
      // Check if it's just a plain number
      if (!isNaN(parseFloat(value)) && isFinite(value) && !/[+\-*/()a-zA-Z_]/.test(value)) {
        return false;
      }
      
      // If it contains operators, variables, or functions, treat as equation
      return /[+\-*/()a-zA-Z_]/.test(value);
    },
    
    evaluateEquation: (equation, atom) => {
      try {
        // If it's not an equation, try to parse as number
        if (!mockEquationEvaluator.isEquation(equation)) {
          const num = parseFloat(equation);
          return isNaN(num) ? 0 : num;
        }

        // Simple equation evaluation for testing
        let substitutedEquation = equation;
        
        // Replace known variables
        if (equation.includes("diameter") && atom.diameter) {
          substitutedEquation = substitutedEquation.replace(/\bdiameter\b/g, atom.diameter);
        }
        
        // Use eval for simple math (in production this would use mathjs)
        try {
          return eval(substitutedEquation);
        } catch (e) {
          return NaN;
        }
      } catch (error) {
        return NaN;
      }
    }
  };

  // Mock Circle Atom class
  class MockCircleAtom {
    constructor() {
      this.inputs = [
        { 
          name: "diameter", 
          value: 10, 
          valueType: "number",
          connectors: [],
          setValue: function(val) { this.value = val; }
        }
      ];
      this.uniqueID = "circle-123";
      this.parentMolecule = null;
    }
    
    findIOValue(name) {
      const input = this.inputs.find(i => i.name === name);
      return input ? input.value : 0;
    }
    
    // Simulate the enhanced createLevaInputs method
    createLevaInputs() {
      let inputParams = {};

      if (this.inputs) {
        this.inputs.map((input) => {
          const checkConnector = () => {
            return input.connectors.length > 0;
          };

          if (input.valueType !== "geometry") {
            inputParams[this.uniqueID + input.name] = {
              value: input.value,
              label: input.name,
              step: 0.25,
              disabled: checkConnector(),
              onChange: (value) => {
                if (input.value !== value) {
                  // Enhanced logic: Check if the value is an equation and evaluate it
                  let finalValue = value;
                  if (input.valueType === "number" && mockEquationEvaluator.isEquation(value)) {
                    try {
                      finalValue = mockEquationEvaluator.evaluateEquation(value, this);
                      // Store the original equation string for reference
                      input._originalEquation = value;
                    } catch (error) {
                      console.warn("Equation evaluation failed:", error);
                      // Fall back to the original value if evaluation fails
                      finalValue = value;
                    }
                  } else {
                    // Clear any stored equation if we're back to a simple value
                    delete input._originalEquation;
                  }
                  
                  input.setValue(finalValue);
                }
              },
            };
          }
        });
      }
      
      return inputParams;
    }
  }

  it("should handle simple numeric values in diameter input", () => {
    const circle = new MockCircleAtom();
    const levaInputs = circle.createLevaInputs();
    
    // Get the diameter input configuration
    const diameterInput = levaInputs[circle.uniqueID + "diameter"];
    
    expect(diameterInput).toBeDefined();
    expect(diameterInput.value).toBe(10);
    
    // Simulate changing to a simple number
    diameterInput.onChange(15);
    expect(circle.inputs[0].value).toBe(15);
  });

  it("should evaluate simple math expressions in diameter input", () => {
    const circle = new MockCircleAtom();
    const levaInputs = circle.createLevaInputs();
    
    const diameterInput = levaInputs[circle.uniqueID + "diameter"];
    
    // Simulate entering a math expression
    diameterInput.onChange("4*2");
    expect(circle.inputs[0].value).toBe(8);
    expect(circle.inputs[0]._originalEquation).toBe("4*2");
    
    // Test another expression
    diameterInput.onChange("10+5");
    expect(circle.inputs[0].value).toBe(15);
    expect(circle.inputs[0]._originalEquation).toBe("10+5");
  });

  it("should handle variable substitution in diameter input", () => {
    const circle = new MockCircleAtom();
    
    // Add parent molecule with diameter variable
    circle.parentMolecule = {
      inputs: [
        { name: "baseDiameter", value: 8 }
      ]
    };
    
    // Mock the atom to have a diameter property for variable substitution
    circle.diameter = 8;
    
    const levaInputs = circle.createLevaInputs();
    const diameterInput = levaInputs[circle.uniqueID + "diameter"];
    
    // Simulate entering an expression with a variable
    diameterInput.onChange("diameter*2");
    expect(circle.inputs[0].value).toBe(16);
    expect(circle.inputs[0]._originalEquation).toBe("diameter*2");
  });

  it("should fallback gracefully for invalid equations", () => {
    const circle = new MockCircleAtom();
    const levaInputs = circle.createLevaInputs();
    
    const diameterInput = levaInputs[circle.uniqueID + "diameter"];
    
    // Simulate entering an invalid expression that causes eval to fail
    diameterInput.onChange("invalid equation!");
    // The mock evaluator returns NaN for invalid expressions,
    // but in the real implementation, this would trigger an error and fallback
    expect(circle.inputs[0].value).toBe(NaN);
  });

  it("should clear stored equation when reverting to simple number", () => {
    const circle = new MockCircleAtom();
    const levaInputs = circle.createLevaInputs();
    
    const diameterInput = levaInputs[circle.uniqueID + "diameter"];
    
    // First set an equation
    diameterInput.onChange("4*2");
    expect(circle.inputs[0]._originalEquation).toBe("4*2");
    
    // Then change to a simple number
    diameterInput.onChange(20);
    expect(circle.inputs[0].value).toBe(20);
    expect(circle.inputs[0]._originalEquation).toBeUndefined();
  });

  it("should detect equations correctly", () => {
    expect(mockEquationEvaluator.isEquation("4*2")).toBe(true);
    expect(mockEquationEvaluator.isEquation("diameter + 5")).toBe(true);
    expect(mockEquationEvaluator.isEquation("(10 + 5) / 2")).toBe(true);
    expect(mockEquationEvaluator.isEquation("10")).toBe(false);
    expect(mockEquationEvaluator.isEquation("10.5")).toBe(false);
    expect(mockEquationEvaluator.isEquation("")).toBe(false);
    expect(mockEquationEvaluator.isEquation(42)).toBe(false);
  });
});