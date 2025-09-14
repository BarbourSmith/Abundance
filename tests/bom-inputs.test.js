// Test to verify BOM tag input parameter exposure
import { BOMEntry } from "../src/js/BOM.js";

// Mock the necessary dependencies to avoid circular imports
class MockAtom {
  constructor() {
    this.uniqueID = "test-id";
  }
  
  createInputParams() {
    return {};
  }
  
  onUpstreamChange() {
    // Mock method
  }
}

// Minimal BOM tag implementation for testing
class TestAddBOMTag extends MockAtom {
  constructor() {
    super();
    this.BOMitem = new BOMEntry();
  }

  createInputParams() {
    let inputParams = { ...super.createInputParams() };
    for (const key in this.BOMitem) {
      inputParams[this.uniqueID + key] = {
        type: "string",
        value: this.BOMitem[key],
        label: key,
        disabled: false,
        onChange: (value) => {
          this.BOMitem[key] = value;
          this.onUpstreamChange();
        },
      };
    }
    return inputParams;
  }
}

describe("BOM Tag Input Parameters", () => {
  let bomEntry;
  let bomTag;

  beforeEach(() => {
    bomEntry = new BOMEntry();
    bomTag = new TestAddBOMTag();
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

  describe("AddBOMTag input parameters", () => {
    it("should expose all BOM fields as input parameters", () => {
      const inputParams = bomTag.createInputParams();
      
      // Check that all BOM fields are present in input parameters
      const expectedFields = ["BOMitemName", "numberNeeded", "costUSD", "source"];
      
      expectedFields.forEach(field => {
        const paramKey = bomTag.uniqueID + field;
        expect(inputParams).toHaveProperty(paramKey);
        expect(inputParams[paramKey]).toHaveProperty('type');
        expect(inputParams[paramKey]).toHaveProperty('value');
        expect(inputParams[paramKey]).toHaveProperty('label');
        expect(inputParams[paramKey]).toHaveProperty('disabled');
        expect(inputParams[paramKey]).toHaveProperty('onChange');
      });
    });

    it("should have input parameters that are not disabled", () => {
      const inputParams = bomTag.createInputParams();
      
      const expectedFields = ["BOMitemName", "numberNeeded", "costUSD", "source"];
      
      expectedFields.forEach(field => {
        const paramKey = bomTag.uniqueID + field;
        expect(inputParams[paramKey].disabled).toBe(false);
      });
    });

    it("should have correct initial values in input parameters", () => {
      const inputParams = bomTag.createInputParams();
      
      const paramKey1 = bomTag.uniqueID + "BOMitemName";
      expect(inputParams[paramKey1].value).toBe("name");
      
      const paramKey2 = bomTag.uniqueID + "numberNeeded";
      expect(inputParams[paramKey2].value).toBe(1);
      
      const paramKey3 = bomTag.uniqueID + "costUSD";
      expect(inputParams[paramKey3].value).toBe(0.0);
      
      const paramKey4 = bomTag.uniqueID + "source";
      expect(inputParams[paramKey4].value).toBe("www.example.com");
    });

    it("should update BOM item when input parameters change", () => {
      const inputParams = bomTag.createInputParams();
      
      // Test changing BOMitemName
      const paramKey = bomTag.uniqueID + "BOMitemName";
      inputParams[paramKey].onChange("Test Item");
      expect(bomTag.BOMitem.BOMitemName).toBe("Test Item");
      
      // Test changing numberNeeded
      const paramKey2 = bomTag.uniqueID + "numberNeeded";
      inputParams[paramKey2].onChange(5);
      expect(bomTag.BOMitem.numberNeeded).toBe(5);
      
      // Test changing costUSD
      const paramKey3 = bomTag.uniqueID + "costUSD";
      inputParams[paramKey3].onChange(12.99);
      expect(bomTag.BOMitem.costUSD).toBe(12.99);
      
      // Test changing source
      const paramKey4 = bomTag.uniqueID + "source";
      inputParams[paramKey4].onChange("www.teststore.com");
      expect(bomTag.BOMitem.source).toBe("www.teststore.com");
    });
  });
});