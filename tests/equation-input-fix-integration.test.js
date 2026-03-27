import { describe, it, expect, beforeEach, vi } from "vitest";
import { parse } from "mathjs";

describe("Equation Input Fix Integration Test", () => {
  let MockAtom;
  let mockAtom;

  beforeEach(() => {
    // Mock GlobalVariables and other dependencies
    const GlobalVariables = {
      generateUniqueID: () => `test-id-${Math.random()}`,
      limitedEvaluate: (expr) => {
        // Simple eval for testing with built-in constants
        try {
          // Replace common math constants
          const mathExpr = expr
            .replace(/\bpi\b/g, String(Math.PI))
            .replace(/\be\b/g, String(Math.E))
            .replace(/\btau\b/g, String(2 * Math.PI));
          
          return eval(mathExpr);
        } catch (error) {
          throw new Error(`Expression evaluation failed: ${error.message}`);
        }
      }
    };

    // Create a simplified Atom class for testing the specific functionality
    MockAtom = class {
      constructor() {
        this.inputs = [];
        this.uniqueID = GlobalVariables.generateUniqueID();
        this.parentMolecule = null;
        this.parent = null;
      }

      // Include the fixed methods from atom.js
      extractVariablesFromEquation(equation) {
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
          variables = [...new Set(variables)];
        } catch (e) {
          variables = [];
        }
        return variables;
      }

      ensureInputsForEquation(equation) {
        const variables = this.extractVariablesFromEquation(equation);
        const BUILTIN_CONSTS = new Set(["pi", "e", "tau", "Infinity", "NaN"]);
        const parentInputs =
          (this.parent && this.parent.inputs) ||
          (this.parentMolecule && this.parentMolecule.inputs) ||
          [];
        
        const parentInputNames = parentInputs.map(input => input.name);
        const inputsToAdd = [];
        
        for (const variable of variables) {
          if (BUILTIN_CONSTS.has(variable)) {
            continue;
          }
          
          const existsAsInput = this.inputs.some(input => input.name === variable);
          const existsAsParentInput = parentInputNames.includes(variable);
          
          if (!existsAsInput && !existsAsParentInput) {
            inputsToAdd.push({
              name: variable,
              valueType: "number",
              defaultValue: 1,
            });
          }
        }
        
        // Simulate adding inputs
        for (const inputDef of inputsToAdd) {
          this.inputs.push({
            name: inputDef.name,
            value: inputDef.defaultValue,
            getValue: function() { return this.value; }
          });
        }
      }

      evaluateEquation(equation) {
        let substitutedEquation = String(equation ?? "").trim();

        if (!substitutedEquation) {
          substitutedEquation = "0";
        }

        const variables = this.extractVariablesFromEquation(substitutedEquation);
        const unresolved = [];
        const resolvedValues = {};
        const BUILTIN_CONSTS = new Set(["pi", "e", "tau", "Infinity", "NaN"]);
        
        if (variables.length > 0) {
          const parentInputs =
            (this.parent && this.parent.inputs) ||
            (this.parentMolecule && this.parentMolecule.inputs) ||
            [];
          for (const variable of variables) {
            if (BUILTIN_CONSTS.has(variable)) {
              continue;
            }
            let value = null;
            
            // Try parent inputs first
            for (let j = 0; j < parentInputs.length; j++) {
              if (parentInputs[j].name === variable) {
                value =
                  typeof parentInputs[j].getValue === "function"
                    ? parentInputs[j].getValue()
                    : parentInputs[j].value;
                break;
              }
            }
            // Then this atom's inputs
            if (value === null || value === undefined) {
              for (let i = 0; i < this.inputs.length; i++) {
                if (this.inputs[i].name === variable) {
                  value = this.inputs[i].getValue();
                  break;
                }
              }
            }
            let num = Number(value);
            if (
              value === null ||
              value === undefined ||
              (typeof value === "string" && value.trim() === "") ||
              !Number.isFinite(num)
            ) {
              unresolved.push(variable);
            } else {
              resolvedValues[variable] = num;
            }
          }
        }
        
        if (unresolved.length) {
          const msg = `Variable(s) not found: ${unresolved.join(
            ", "
          )}. Make sure the variables you are using exist as inputs`;
          throw new Error(msg);
        }
        
        // Substitute all resolved variables
        for (const variable of Object.keys(resolvedValues)) {
          const safeVar = variable.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          const variablePattern = new RegExp(`\\b${safeVar}\\b`, "gu");
          substitutedEquation = substitutedEquation.replace(
            variablePattern,
            String(resolvedValues[variable])
          );
        }

        try {
          const result = GlobalVariables.limitedEvaluate(substitutedEquation);
          return result;
        } catch (error) {
          const msg = `Invalid mathematical expression: "${substitutedEquation}". ${error.message}`;
          throw new Error(msg);
        }
      }

      // Simulate the onChange handler that was problematic
      simulateInputChange(equation) {
        let currentEquation = String(equation).trim();
        
        // This is the fix - ensure inputs exist before evaluating
        this.ensureInputsForEquation(currentEquation);
        const result = this.evaluateEquation(currentEquation);
        
        return result;
      }
    };

    mockAtom = new MockAtom();
  });

  it("should handle the original issue: changing from 'x + y' to 'L*25.4'", () => {
    // Start with inputs for x and y
    mockAtom.inputs = [
      { name: "x", value: 10, getValue: function() { return this.value; } },
      { name: "y", value: 20, getValue: function() { return this.value; } }
    ];

    // This should work without throwing
    expect(() => mockAtom.simulateInputChange("L*25.4")).not.toThrow();

    // Verify that L input was added
    expect(mockAtom.inputs.some(input => input.name === "L")).toBe(true);

    // Verify the calculation is correct (L defaults to 1, so 1 * 25.4 = 25.4)
    const result = mockAtom.simulateInputChange("L*25.4");
    expect(result).toBe(25.4);
  });

  it("should handle complex equations with multiple new variables", () => {
    // Start with no inputs
    mockAtom.inputs = [];

    // Use an equation with multiple variables
    expect(() => mockAtom.simulateInputChange("W*H*T")).not.toThrow();

    // Verify all variables were added as inputs
    expect(mockAtom.inputs.some(input => input.name === "W")).toBe(true);
    expect(mockAtom.inputs.some(input => input.name === "H")).toBe(true);
    expect(mockAtom.inputs.some(input => input.name === "T")).toBe(true);

    // Result should be 1*1*1 = 1
    const result = mockAtom.simulateInputChange("W*H*T");
    expect(result).toBe(1);
  });

  it("should not duplicate existing inputs", () => {
    // Start with L input already existing
    mockAtom.inputs = [
      { name: "L", value: 5, getValue: function() { return this.value; } }
    ];

    // Use equation that references L
    expect(() => mockAtom.simulateInputChange("L*2")).not.toThrow();

    // Should still have only one L input
    const lInputs = mockAtom.inputs.filter(input => input.name === "L");
    expect(lInputs.length).toBe(1);
    expect(lInputs[0].value).toBe(5); // Original value preserved

    const result = mockAtom.simulateInputChange("L*2");
    expect(result).toBe(10); // 5 * 2 = 10
  });

  it("should handle equations with built-in constants", () => {
    mockAtom.inputs = [];

    // Should work with pi and not try to create input for it
    expect(() => mockAtom.simulateInputChange("pi*2")).not.toThrow();

    // Should not have created input for pi
    expect(mockAtom.inputs.some(input => input.name === "pi")).toBe(false);

    const result = mockAtom.simulateInputChange("pi*2");
    expect(result).toBeCloseTo(Math.PI * 2, 10);
  });

  it("should work with parent inputs", () => {
    // Set up parent with inputs
    mockAtom.parent = {
      inputs: [
        { name: "ParentVar", value: 10, getValue: function() { return this.value; } }
      ]
    };

    // Should not add ParentVar as local input since it exists in parent
    expect(() => mockAtom.simulateInputChange("ParentVar*3")).not.toThrow();

    // Should not have created local input for ParentVar
    expect(mockAtom.inputs.some(input => input.name === "ParentVar")).toBe(false);

    const result = mockAtom.simulateInputChange("ParentVar*3");
    expect(result).toBe(30); // 10 * 3 = 30
  });

  it("should correctly evaluate equation using two of several molecule-level inputs", () => {
    // Simulate the reported bug: TableWidth / 2 - EdgeLip where both are molecule inputs.
    // The parent has 6 inputs total, but only TableWidth and EdgeLip are used in the equation.
    mockAtom.parent = {
      inputs: [
        { name: "WoodThick", value: 19.05, getValue: function() { return this.value; } },
        { name: "TableLength", value: 10000, getValue: function() { return this.value; } },
        { name: "TableWidth", value: 5000, getValue: function() { return this.value; } },
        { name: "TopHeight", value: 3000, getValue: function() { return this.value; } },
        { name: "EdgeLip", value: 40, getValue: function() { return this.value; } },
        { name: "LegWidth", value: 10, getValue: function() { return this.value; } },
      ]
    };

    // Result should correctly use both molecule input values: 5000/2 - 40 = 2460
    const result = mockAtom.simulateInputChange("TableWidth / 2 - EdgeLip");

    // Neither TableWidth nor EdgeLip should have been created as local atom inputs
    expect(mockAtom.inputs.some(input => input.name === "TableWidth")).toBe(false);
    expect(mockAtom.inputs.some(input => input.name === "EdgeLip")).toBe(false);
    expect(result).toBe(2460);
  });

  it("should compute the correct result even after switching from default equation to molecule-input-only equation", () => {
    // This tests the specific bug: default equation x+y gives result=2, then after
    // switching to molecule inputs only, the result should update (not stay at 2).
    mockAtom.parent = {
      inputs: [
        { name: "TableWidth", value: 5000, getValue: function() { return this.value; } },
        { name: "EdgeLip", value: 40, getValue: function() { return this.value; } },
      ]
    };

    // Simulate default state with atom inputs x=1, y=1 -> result=2
    mockAtom.inputs = [
      { name: "x", value: 1, getValue: function() { return this.value; } },
      { name: "y", value: 1, getValue: function() { return this.value; } },
    ];
    const defaultResult = mockAtom.evaluateEquation("x + y");
    expect(defaultResult).toBe(2);

    // Now switch to equation using molecule inputs
    const newResult = mockAtom.simulateInputChange("TableWidth / 2 - EdgeLip");

    // Result should be 2460, not the stale value of 2
    expect(newResult).toBe(2460);
    expect(newResult).not.toBe(2);
  });
});