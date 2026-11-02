// Test file for verifying keepout geometry exclusion in cutlayout
import { describe, expect, it, beforeAll } from "vitest";
import { extractKeepOut, color } from "../src/worker/tags.ts";

describe("cutlayout keepout exclusion", () => {
  let normalGeometry;
  let keepoutGeometry;
  let mixedAssembly;

  beforeAll(() => {
    // Create a normal geometry object (without keepout tag) - this is a LEAF
    normalGeometry = {
      id: "normal1",
      geometry: "normal_geom_id", // string for leaf node
      tags: [],
      color: "#0000FF",
      bom: [],
      geometryType: "3D",
      plane: "XY", // needed for isAbundanceObject check
    };

    // Create a keepout geometry object (with keepout tag) - this is a LEAF
    keepoutGeometry = {
      id: "keepout1",
      geometry: "keepout_geom_id", // string for leaf node
      tags: ["keepout"],
      color: "#D9544D",
      bom: [],
      geometryType: "3D",
      plane: "XY", // needed for isAbundanceObject check
    };

    // Create a mixed assembly with both normal and keepout geometry - this is a BRANCH
    mixedAssembly = {
      id: "assembly1",
      geometry: [normalGeometry, keepoutGeometry], // array for branch node
      tags: [],
      color: null,
      bom: [],
      geometryType: "3D",
      plane: "XY", // needed for isAbundanceObject check
    };
  });

  describe("extractKeepOut function", () => {
    it("should return false when all geometry has keepout tag", () => {
      const allKeepoutAssembly = {
        id: "all_keepout",
        geometry: [keepoutGeometry],
        tags: [],
        color: null,
        bom: [],
        geometryType: "3D",
        plane: "XY",
      };

      const result = extractKeepOut(allKeepoutAssembly);
      expect(result).toBe(false);
    });

    it("should filter out keepout geometry from mixed assembly", () => {
      const result = extractKeepOut(mixedAssembly);
      
      expect(result).not.toBe(false);
      expect(result.geometry).toHaveLength(1);
      expect(result.geometry[0].id).toBe("normal1");
      expect(result.geometry[0].tags).not.toContain("keepout");
    });

    it("should pass through assembly with only normal geometry", () => {
      const normalAssembly = {
        id: "normal_assembly",
        geometry: [normalGeometry],
        tags: [],
        color: null,
        bom: [],
        geometryType: "3D",
        plane: "XY",
      };

      const result = extractKeepOut(normalAssembly);
      
      expect(result).not.toBe(false);
      expect(result.geometry).toHaveLength(1);
      expect(result.geometry[0].id).toBe("normal1");
    });

    it("should handle nested assemblies with keepout", () => {
      const nestedAssembly = {
        id: "nested",
        geometry: [
          {
            id: "sub_assembly",
            geometry: [normalGeometry, keepoutGeometry],
            tags: [],
            color: null,
            bom: [],
            geometryType: "3D",
            plane: "XY",
          }
        ],
        tags: [],
        color: null,
        bom: [],
        geometryType: "3D",
        plane: "XY",
      };

      const result = extractKeepOut(nestedAssembly);
      
      expect(result).not.toBe(false);
      // Should have filtered out the keepout from the sub-assembly
      expect(result.geometry).toHaveLength(1);
      expect(result.geometry[0].geometry).toHaveLength(1);
      expect(result.geometry[0].geometry[0].id).toBe("normal1");
    });
  });

  describe("keepout color recognition", () => {
    it("should recognize #D9544D color as keepout", () => {
      const geom = {
        id: "test",
        geometry: "test_geom",
        tags: [],
        color: null,
        bom: [],
        geometryType: "3D",
        plane: "XY",
      };

      const coloredGeom = color(geom, "#D9544D");
      
      // Verify that the keepout tag was added
      expect(coloredGeom.tags).toContain("keepout");
      expect(coloredGeom.color).toBe("#D9544D");
    });

    it("should not add keepout tag for other colors", () => {
      const geom = {
        id: "test",
        geometry: "test_geom",
        tags: [],
        color: null,
        bom: [],
        geometryType: "3D",
        plane: "XY",
      };

      const coloredGeom = color(geom, "#0000FF");
      
      // Verify that the keepout tag was NOT added
      expect(coloredGeom.tags).not.toContain("keepout");
      expect(coloredGeom.color).toBe("#0000FF");
    });
  });
});
