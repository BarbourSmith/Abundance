// Test to verify BOM tag input parameter exposure
import { BOMEntry } from "../src/js/BOM.js";

describe("BOM Tag Input Parameters", () => {
  let bomEntry;

  beforeEach(() => {
    bomEntry = new BOMEntry();
  });

  describe("BOM Entry structure", () => {
    it("should have the correct BOM item fields initialized", () => {
      expect(bomEntry.BOMitemName).toBe("name");
      expect(bomEntry.numberNeeded).toBe(1);
      expect(bomEntry.costUSD).toBe(0.0);
      expect(bomEntry.source).toBe("www.example.com");
    });

    it("should have all expected fields for input parameters", () => {
      const expectedFields = ["BOMitemName", "numberNeeded", "costUSD", "source"];
      
      expectedFields.forEach(field => {
        expect(bomEntry).toHaveProperty(field);
      });
    });
  });
});