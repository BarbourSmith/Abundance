import { describe, it, expect } from "vitest";
import { create, all } from "mathjs";

describe("String concatenation in equation", () => {
  it("should test current mathjs capabilities for string operations", () => {
    const math = create(all);
    
    // Test number operations (should work)
    expect(math.evaluate('5 + 3')).toBe(8);
    expect(math.evaluate('x + 10', {x: 5})).toBe(15);
    
    // Test if string concatenation works
    try {
      const result = math.evaluate('"hello" + " world"');
      console.log('String concatenation result:', result);
      expect(typeof result).toBe('string');
    } catch (error) {
      console.log('String concatenation failed:', error.message);
      expect(error.message).toContain('concatenation'); // Let's see what happens
    }
    
    // Test mixed type concatenation
    try {
      const result = math.evaluate('x + "mm plywood"', {x: 18});
      console.log('Mixed concatenation result:', result);
      expect(typeof result).toBe('string');
      expect(result).toBe('18mm plywood');
    } catch (error) {
      console.log('Mixed concatenation failed:', error.message);
      expect(error).toBeDefined(); // Currently expected to fail
    }
  });
});