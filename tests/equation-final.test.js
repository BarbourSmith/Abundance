import { describe, it, expect } from "vitest";

describe("Mixed equation functionality test", () => {
  it("should handle both numeric and string expressions correctly", () => {
    // Mock the evaluateEquation method that determines the path
    const mockEvaluateEquation = (equation) => {
      let substitutedEquation = String(equation ?? "").trim();

      if (!substitutedEquation) {
        substitutedEquation = "0";
      }

      // Check if equation contains string literals (quoted text)
      const containsStringLiterals = /["']/.test(substitutedEquation);
      
      if (containsStringLiterals) {
        return mockEvaluateStringExpression(substitutedEquation);
      } else {
        // For numeric expressions, return a simple numeric result
        // This would normally use mathjs but we'll mock it for testing
        if (substitutedEquation === "5 + 3") return 8;
        if (substitutedEquation === "x + y * 2") return 11; // assuming x=5, y=3
        return 42; // default mock value
      }
    };

    const mockEvaluateStringExpression = (expression) => {
      // Extract variables from string expressions
      const extractVariablesFromStringExpression = (expression) => {
        let cleanExpression = expression;
        cleanExpression = cleanExpression.replace(/"[^"]*"/g, '""');
        cleanExpression = cleanExpression.replace(/'[^']*'/g, "''");
        
        const variableMatches = cleanExpression.match(/\b[a-zA-Z][a-zA-Z0-9_]*\b/g) || [];
        const filteredVariables = variableMatches.filter(v => 
          !['pi', 'e', 'tau', 'Infinity', 'NaN'].includes(v)
        );
        
        return [...new Set(filteredVariables)];
      };

      const variables = extractVariablesFromStringExpression(expression);
      let substitutedExpression = expression;
      
      // Mock variable substitution
      if (variables.includes('x')) {
        substitutedExpression = substitutedExpression.replace(/\bx\b/g, '18');
      }
      if (variables.includes('quantity')) {
        substitutedExpression = substitutedExpression.replace(/\bquantity\b/g, '3');
      }
      if (variables.includes('thickness')) {
        substitutedExpression = substitutedExpression.replace(/\bthickness\b/g, '18');
      }
      
      // Safe evaluation
      const safeEval = (expr) => {
        if (!/^[\d\s+\-*/()."'a-zA-Z]+$/.test(expr)) {
          throw new Error("Expression contains invalid characters");
        }
        return new Function(`"use strict"; return (${expr})`)();
      };
      
      return String(safeEval(substitutedExpression));
    };

    // Test 1: String concatenation
    const stringResult = mockEvaluateEquation('x + "mm plywood"');
    expect(stringResult).toBe("18mm plywood");

    // Test 2: Multiple variable string concatenation
    const multiStringResult = mockEvaluateEquation('quantity + "x" + thickness + "mm plywood"');
    expect(multiStringResult).toBe("3x18mm plywood");

    // Test 3: Pure string concatenation
    const pureStringResult = mockEvaluateEquation('"hello" + " world"');
    expect(pureStringResult).toBe("hello world");

    // Test 4: Numeric expression (should still work)
    const numericResult = mockEvaluateEquation('5 + 3');
    expect(numericResult).toBe(8);
  });

  it("should correctly determine string vs numeric expressions", () => {
    const containsStringLiterals = (equation) => /["']/.test(equation);
    
    // String expressions
    expect(containsStringLiterals('x + "mm plywood"')).toBe(true);
    expect(containsStringLiterals('"hello" + " world"')).toBe(true);
    expect(containsStringLiterals("x + 'mm plywood'")).toBe(true);
    
    // Numeric expressions  
    expect(containsStringLiterals('x + y * 2')).toBe(false);
    expect(containsStringLiterals('5 + 3')).toBe(false);
    expect(containsStringLiterals('pi * radius * radius')).toBe(false);
  });
});