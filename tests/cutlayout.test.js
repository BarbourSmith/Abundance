// Test file for cutlayout.js - default placement functionality
import { createDefaultPlacements } from "../src/worker/cutlayout.js";

describe("cutlayout.js", () => {
  describe("createDefaultPlacements", () => {
    it("should create default placements at origin with zero rotation", () => {
      const shapesForLayout = [
        { id: 'shape1' },
        { id: 'shape2' },
        { id: 'shape3' }
      ];

      const result = createDefaultPlacements(shapesForLayout);

      // Should return an array with one sheet
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(1);

      const sheet = result[0];
      expect(Array.isArray(sheet)).toBe(true);
      expect(sheet.length).toBe(3);

      // Each placement should have the correct structure and default values
      sheet.forEach((placement, index) => {
        expect(placement).toHaveProperty('id');
        expect(placement).toHaveProperty('rotate');
        expect(placement).toHaveProperty('translate');
        
        expect(placement.id).toBe(shapesForLayout[index].id);
        expect(placement.rotate).toBe(0);
        expect(placement.translate.x).toBe(0);
        expect(placement.translate.y).toBe(0);
      });
    });

    it("should handle empty shapes array", () => {
      const shapesForLayout = [];
      const result = createDefaultPlacements(shapesForLayout);

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(1);
      expect(result[0].length).toBe(0);
    });

    it("should handle single shape", () => {
      const shapesForLayout = [{ id: 'single-shape' }];
      const result = createDefaultPlacements(shapesForLayout);

      expect(result.length).toBe(1);
      expect(result[0].length).toBe(1);
      expect(result[0][0].id).toBe('single-shape');
      expect(result[0][0].rotate).toBe(0);
      expect(result[0][0].translate.x).toBe(0);
      expect(result[0][0].translate.y).toBe(0);
    });
  });
});