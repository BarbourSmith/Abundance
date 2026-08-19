// Test file for cutlayout.js - default placement functionality
import { createDefaultPlacements } from "../src/worker/cutlayout.ts";

describe("cutlayout.js", () => {
  describe("createDefaultPlacements", () => {
    const layoutConfig = { width: 100, height: 60, partPadding: 1, rotations: 4 };

    it("should create default placements centered on the sheet with zero rotation", () => {
      const shapesForLayout = [{ id: 0 }, { id: 1 }, { id: 2 }];

      const result = createDefaultPlacements(shapesForLayout, layoutConfig);

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
        expect(placement.translate.x).toBe(layoutConfig.width / 2);
        expect(placement.translate.y).toBe(layoutConfig.height / 2);
      });
    });

    it("should key placements by the shape's index so applyLayout can match them to leafs", () => {
      // applyLayout looks up placements by the index of the leaf within the
      // assembly. If ids are anything other than that index (a geometry id, for
      // example) no part ever gets moved. See prepShapesForLayout.
      const shapesForLayout = [{ id: 0 }, { id: 1 }, { id: 2 }];

      const result = createDefaultPlacements(shapesForLayout, layoutConfig);

      expect(result[0].map((placement) => placement.id)).toEqual([0, 1, 2]);
    });

    it("should handle empty shapes array", () => {
      const shapesForLayout = [];
      const result = createDefaultPlacements(shapesForLayout, layoutConfig);

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(1);
      expect(result[0].length).toBe(0);
    });

    it("should handle single shape", () => {
      const shapesForLayout = [{ id: 0 }];
      const result = createDefaultPlacements(shapesForLayout, layoutConfig);

      expect(result.length).toBe(1);
      expect(result[0].length).toBe(1);
      expect(result[0][0].id).toBe(0);
      expect(result[0][0].rotate).toBe(0);
      expect(result[0][0].translate.x).toBe(layoutConfig.width / 2);
      expect(result[0][0].translate.y).toBe(layoutConfig.height / 2);
    });
  });
});
