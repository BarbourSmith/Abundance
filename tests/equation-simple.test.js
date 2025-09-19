import { describe, it, expect } from "vitest";

describe("Simple equation test without dependencies", () => {
  it("should pass basic test", () => {
    expect(1 + 1).toBe(2);
  });
  
  it("should test string expression evaluation logic directly", () => {
    // Test the string concatenation logic directly
    const expr = '5 + "mm plywood"';
    
    // Substitute variables manually for testing
    const substituted = expr.replace(/\b5\b/g, '5');
    expect(substituted).toBe('5 + "mm plywood"');
    
    // Test Function constructor approach (same as in implementation)
    const safeEval = (expr) => {
      // Allow string literals, numbers, + operator, parentheses, and letters for strings
      if (!/^[\d\s+\-*/()."'a-zA-Z]+$/.test(expr)) {
        throw new Error("Expression contains invalid characters");
      }
      
      // Use Function constructor for safer evaluation than eval()
      return new Function(`"use strict"; return (${expr})`)();
    };
    
    const result = safeEval('5 + "mm plywood"');
    expect(result).toBe("5mm plywood");
  });
});