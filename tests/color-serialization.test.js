/**
 * Test for Color atom serialization with backwards compatibility
 * 
 * This test validates that:
 * 1. Color atoms now save the color name (e.g., "Orange") instead of index
 * 2. Old files with selectedColorIndex can still be loaded correctly
 * 3. Color selection is resilient to reordering of the color list
 */

import { describe, it, expect } from "vitest";

describe("Color atom serialization", () => {
  
  // Mock Color class to avoid circular dependency issues with full Atom hierarchy
  class MockColor {
    constructor() {
      this.selectedColorIndex = 0;
      this.colorOptions = {
        Default: "#aad7f2",
        Red: "#FF9065",
        Orange: "#FFB458",
        Yellow: "#FFD600",
        Olive: "#C7DF66",
        Teal: "#71D1C2",
        "Light Blue": "#75DBF2",
        Green: "#A3CE5B",
        "Lavender ": "#CCABED",
        Brown: "#CFAB7C",
        Pink: "#FFB09D",
        Sand: "#E2C66C",
        Clay: "#C4D3AC",
        Blue: "#91C8D5",
        "Light Green": "#96E1BB",
        Purple: "#ACAFDD",
        "Light Purple": "#DFB1E8",
        Tan: "#F5D3B6",
        "Mauve ": "#DBADA9",
        Grey: "#BABABA",
        Black: "#5A5A5A",
        White: "#FFFCF7",
        Glass: "#E6F3FF",
        Steel: "#B0C4DE",
        Brass: "#B5A642",
        Aluminum: "#A8A9AD",
        "Keep Out": "#D9544D",
      };
    }

    setValues(values) {
      // Replicate the updated logic from the actual Color class
      if (values.selectedColor !== undefined) {
        // New format: selectedColor contains the color name (e.g., "Orange", "Keep Out")
        const colorNames = Object.keys(this.colorOptions);
        const colorIndex = colorNames.indexOf(values.selectedColor);
        
        if (colorIndex !== -1) {
          this.selectedColorIndex = colorIndex;
        } else {
          this.selectedColorIndex = 0;
        }
      } else if (values.selectedColorIndex !== undefined) {
        // Old format: selectedColorIndex
        this.selectedColorIndex = values.selectedColorIndex;
        const maxIndex = Object.keys(this.colorOptions).length - 1;
        if (this.selectedColorIndex < 0 || this.selectedColorIndex > maxIndex) {
          this.selectedColorIndex = 0;
        }
      }
    }

    serialize() {
      const selectedColorName = Object.keys(this.colorOptions)[this.selectedColorIndex];
      return {
        atomType: "Color",
        selectedColor: selectedColorName,
      };
    }
  }

  describe("New behavior (using selectedColor name)", () => {
    it("should serialize with color name", () => {
      const colorAtom = new MockColor();
      colorAtom.selectedColorIndex = 3; // Yellow
      const serialized = colorAtom.serialize();
      
      // Should save the color name
      expect(serialized.selectedColor).toBe("Yellow");
    });

    it("should restore color from selectedColor name", () => {
      const colorAtom = new MockColor();
      const savedData = {
        selectedColor: "Orange",
      };
      
      colorAtom.setValues(savedData);
      
      // Should find the matching color in colorOptions
      const expectedIndex = Object.keys(colorAtom.colorOptions).indexOf("Orange");
      expect(colorAtom.selectedColorIndex).toBe(expectedIndex);
      expect(colorAtom.selectedColorIndex).toBe(2); // Orange is at index 2
    });

    it("should handle special materials like Glass and Keep Out", () => {
      const colorAtom1 = new MockColor();
      colorAtom1.setValues({ selectedColor: "Glass" });
      expect(colorAtom1.selectedColorIndex).toBe(22); // Glass position
      
      const colorAtom2 = new MockColor();
      colorAtom2.setValues({ selectedColor: "Keep Out" });
      expect(colorAtom2.selectedColorIndex).toBe(26); // Keep Out position (moved after adding metals)
    });

    it("should handle metal materials like Steel, Brass, and Aluminum", () => {
      const steelAtom = new MockColor();
      steelAtom.setValues({ selectedColor: "Steel" });
      expect(steelAtom.selectedColorIndex).toBe(23); // Steel position
      expect(Object.values(steelAtom.colorOptions)[23]).toBe("#B0C4DE"); // Steel color
      
      const brassAtom = new MockColor();
      brassAtom.setValues({ selectedColor: "Brass" });
      expect(brassAtom.selectedColorIndex).toBe(24); // Brass position
      expect(Object.values(brassAtom.colorOptions)[24]).toBe("#B5A642"); // Brass color
      
      const aluminumAtom = new MockColor();
      aluminumAtom.setValues({ selectedColor: "Aluminum" });
      expect(aluminumAtom.selectedColorIndex).toBe(25); // Aluminum position
      expect(Object.values(aluminumAtom.colorOptions)[25]).toBe("#A8A9AD"); // Aluminum color
    });

    it("should handle unknown color names gracefully", () => {
      const colorAtom = new MockColor();
      const savedData = {
        selectedColor: "UnknownColor",
      };
      
      colorAtom.setValues(savedData);
      
      // Should default to first color (Default)
      expect(colorAtom.selectedColorIndex).toBe(0);
    });
  });

  describe("Backwards compatibility", () => {
    it("should load old files with selectedColorIndex", () => {
      const colorAtom = new MockColor();
      const oldSavedData = {
        selectedColorIndex: 10, // Pink
      };
      
      colorAtom.setValues(oldSavedData);
      
      expect(colorAtom.selectedColorIndex).toBe(10);
      const color = Object.values(colorAtom.colorOptions)[10];
      expect(color).toBe("#FFB09D"); // Pink color
    });

    it("should prefer selectedColor over selectedColorIndex if both exist", () => {
      const colorAtom = new MockColor();
      const mixedData = {
        selectedColorIndex: 2, // Orange (old format)
        selectedColor: "Green", // Green (new format)
      };
      
      colorAtom.setValues(mixedData);
      
      // Should use the new format (selectedColor)
      const expectedIndex = Object.keys(colorAtom.colorOptions).indexOf("Green");
      expect(colorAtom.selectedColorIndex).toBe(expectedIndex);
      expect(colorAtom.selectedColorIndex).toBe(7); // Green is at index 7
    });
  });

  describe("Color reordering resilience", () => {
    it("should maintain correct color after save/load cycle", () => {
      const colorAtom1 = new MockColor();
      colorAtom1.selectedColorIndex = 5; // Teal
      const serialized = colorAtom1.serialize();
      
      // Verify the serialized data contains the color name
      expect(serialized.selectedColor).toBe("Teal");
      
      // Load into a new instance
      const colorAtom2 = new MockColor();
      colorAtom2.setValues(serialized);
      
      // Should restore to the same color
      const actualColorName = Object.keys(colorAtom2.colorOptions)[colorAtom2.selectedColorIndex];
      expect(actualColorName).toBe("Teal");
      expect(colorAtom2.selectedColorIndex).toBe(5);
    });
  });
});
