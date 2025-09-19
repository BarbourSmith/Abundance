import { describe, it, expect } from "vitest";
import Equation from "../src/molecules/equation.js";

describe("String concatenation in equation", () => {
  it("should support string concatenation with variables", async () => {
    const equation = new Equation({});
    
    // Test x + "mm plywood" type expressions
    equation.setEquation('x + "mm plywood"');
    
    // Mock inputs for the equation
    equation.inputs = [
      {
        name: "x",
        getValue: () => 18,
        getState: () => ({ status: "READY" })
      }
    ];
    
    // Test the computation
    const result = await equation.compute();
    expect(result).toBe("18mm plywood");
  });

  it("should support simple string concatenation", async () => {
    const equation = new Equation({});
    
    equation.setEquation('"hello" + " world"');
    
    const result = await equation.compute();
    expect(result).toBe("hello world");
  });

  it("should support multiple variable concatenation", async () => {
    const equation = new Equation({});
    
    equation.setEquation('quantity + "x" + thickness + "mm plywood"');
    
    // Mock inputs for the equation
    equation.inputs = [
      {
        name: "quantity",
        getValue: () => 3,
        getState: () => ({ status: "READY" })
      },
      {
        name: "thickness", 
        getValue: () => 18,
        getState: () => ({ status: "READY" })
      }
    ];
    
    const result = await equation.compute();
    expect(result).toBe("3x18mm plywood");
  });

  it("should still work with numeric expressions", async () => {
    const equation = new Equation({});
    
    equation.setEquation('x + y * 2');
    
    // Mock inputs for the equation
    equation.inputs = [
      {
        name: "x",
        getValue: () => 5,
        getState: () => ({ status: "READY" })
      },
      {
        name: "y",
        getValue: () => 3,
        getState: () => ({ status: "READY" })
      }
    ];
    
    const result = await equation.compute();
    expect(result).toBe(11); // Should still be a number for numeric expressions
  });
});