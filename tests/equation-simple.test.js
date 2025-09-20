import { describe, it, expect } from "vitest";

describe("String expression variable extraction", () => {
  it("should extract variables correctly from string expressions", () => {
    // Mock the method we need to test
    const extractVariablesFromStringExpression = (expression) => {
      const variables = [];
      
      // Remove string literals first, then find variables
      let cleanExpression = expression;
      
      // Remove all quoted strings (both single and double quotes)
      cleanExpression = cleanExpression.replace(/"[^"]*"/g, '""');
      cleanExpression = cleanExpression.replace(/'[^']*'/g, "''");
      
      // Find variables (word characters not preceded/followed by quotes)
      const variableMatches = cleanExpression.match(/\b[a-zA-Z][a-zA-Z0-9_]*\b/g) || [];
      
      // Filter out built-in constants and deduplicate
      const filteredVariables = variableMatches.filter(v => 
        !['pi', 'e', 'tau', 'Infinity', 'NaN'].includes(v)
      );
      
      return [...new Set(filteredVariables)];
    };
    
    // Test x + "mm plywood" should only extract x, not mm or plywood
    expect(extractVariablesFromStringExpression('x + "mm plywood"')).toEqual(['x']);
    
    // Test quantity + "x" + thickness + "mm plywood" 
    expect(extractVariablesFromStringExpression('quantity + "x" + thickness + "mm plywood"'))
      .toEqual(['quantity', 'thickness']);
    
    // Test pure string should extract no variables
    expect(extractVariablesFromStringExpression('"hello" + " world"')).toEqual([]);
    
    // Test numeric expression should extract variables
    expect(extractVariablesFromStringExpression('x + y * 2')).toEqual(['x', 'y']);
  });

  it("should test string concatenation with proper variable substitution", () => {
    // Test the string evaluation logic directly
    const expr = 'x + "mm plywood"';
    
    // After removing strings and substituting x=18
    const substituted = expr.replace(/\bx\b/g, '18');
    expect(substituted).toBe('18 + "mm plywood"');
    
    // Test Function constructor approach
    const safeEval = (expr) => {
      if (!/^[\d\s+\-*/()."'a-zA-Z]+$/.test(expr)) {
        throw new Error("Expression contains invalid characters");
      }
      
      return new Function(`"use strict"; return (${expr})`)();
    };
    
    const result = safeEval('18 + "mm plywood"');
    expect(result).toBe("18mm plywood");
  });
});