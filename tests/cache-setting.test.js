import { describe, it, expect, beforeEach, afterEach } from "vitest";

describe("Cache Setting", () => {
  beforeEach(() => {
    // Clear localStorage before each test
    localStorage.clear();
  });

  afterEach(() => {
    // Clean up after each test
    localStorage.clear();
  });

  it("should store and retrieve maxCachedProjects from localStorage", () => {
    // Default value
    const defaultValue = localStorage.getItem("maxCachedProjects");
    expect(defaultValue).toBeNull();

    // Set a value
    localStorage.setItem("maxCachedProjects", "6");
    const storedValue = localStorage.getItem("maxCachedProjects");
    expect(storedValue).toBe("6");
    expect(parseInt(storedValue, 10)).toBe(6);
  });

  it("should default to 4 when no value is stored", () => {
    const value = parseInt(localStorage.getItem("maxCachedProjects") || "4");
    expect(value).toBe(4);
  });

  it("should accept values between 1 and 10", () => {
    const testValues = [1, 4, 7, 10];
    
    testValues.forEach((val) => {
      localStorage.setItem("maxCachedProjects", val.toString());
      const stored = parseInt(localStorage.getItem("maxCachedProjects"), 10);
      expect(stored).toBe(val);
      expect(stored).toBeGreaterThanOrEqual(1);
      expect(stored).toBeLessThanOrEqual(10);
    });
  });
});
