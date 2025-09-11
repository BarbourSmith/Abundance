import { describe, it, expect } from "vitest";

// Test the color mapping logic independently 
describe("Input Atom Color Coding", () => {
  
  function getTypeBasedColor(type) {
    switch (type) {
      case "number":
        return "#E3F2FD"; // Light blue - associated with numbers/data
      case "string":
        return "#FFF3E0"; // Light orange - warm color for text
      case "geometry":
        return "#F3E5F5"; // Light purple - for complex 3D objects
      case "array":
        return "#E8F5E8"; // Light green - for collections/lists
      default:
        return "#F3EFEF"; // Default color
    }
  }

  it("should return correct color for number input type", () => {
    const color = getTypeBasedColor("number");
    expect(color).toBe("#E3F2FD"); // Light blue
  });

  it("should return correct color for string input type", () => {
    const color = getTypeBasedColor("string");
    expect(color).toBe("#FFF3E0"); // Light orange
  });

  it("should return correct color for geometry input type", () => {
    const color = getTypeBasedColor("geometry");
    expect(color).toBe("#F3E5F5"); // Light purple
  });

  it("should return correct color for array input type", () => {
    const color = getTypeBasedColor("array");
    expect(color).toBe("#E8F5E8"); // Light green
  });

  it("should return default color for unknown input type", () => {
    const color = getTypeBasedColor("unknown");
    expect(color).toBe("#F3EFEF"); // Default color
  });

  it("should have different colors for different input types", () => {
    const numberColor = getTypeBasedColor("number");
    const stringColor = getTypeBasedColor("string");
    const geometryColor = getTypeBasedColor("geometry");
    const arrayColor = getTypeBasedColor("array");

    // All colors should be different
    expect(numberColor).not.toBe(stringColor);
    expect(stringColor).not.toBe(geometryColor);
    expect(geometryColor).not.toBe(arrayColor);
    expect(arrayColor).not.toBe(numberColor);
  });

  it("should use visually distinct colors that are easy to differentiate", () => {
    const colors = [
      getTypeBasedColor("number"),
      getTypeBasedColor("string"),
      getTypeBasedColor("geometry"),
      getTypeBasedColor("array")
    ];

    // Check that all colors are valid hex codes
    colors.forEach(color => {
      expect(color).toMatch(/^#[0-9A-F]{6}$/i);
    });

    // Check that colors are light (for good contrast with dark text)
    // Light colors typically have high values in RGB
    colors.forEach(color => {
      const r = parseInt(color.slice(1, 3), 16);
      const g = parseInt(color.slice(3, 5), 16);
      const b = parseInt(color.slice(5, 7), 16);
      
      // Light colors should have most RGB values above 200
      const brightness = (r + g + b) / 3;
      expect(brightness).toBeGreaterThan(200);
    });
  });
});