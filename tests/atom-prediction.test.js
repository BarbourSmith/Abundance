// Test file for atomPrediction.js
import { describe, it, expect } from "vitest";
import { getPredictedAtoms } from "../src/js/atomPrediction.js";

describe("Atom Predictions", () => {
  it("should return empty array for Readme atom", () => {
    const predictions = getPredictedAtoms("Readme");
    expect(predictions).toEqual([]);
    expect(predictions.length).toBe(0);
  });

  it("should return predictions for atoms with outputs", () => {
    // Circle has geometry output, should have predictions
    const circlePredictions = getPredictedAtoms("Circle");
    expect(circlePredictions.length).toBeGreaterThan(0);
    expect(circlePredictions).toContain("Extrude");

    // Extrude has geometry output, should have predictions
    const extrudePredictions = getPredictedAtoms("Extrude");
    expect(extrudePredictions.length).toBeGreaterThan(0);
    expect(extrudePredictions).toContain("Move");
  });

  it("should return empty array for atoms without predictions defined", () => {
    const predictions = getPredictedAtoms("NonExistentAtom");
    expect(predictions).toEqual([]);
  });

  it("should return Extrude, Move, and Rotate for GitHubMolecule", () => {
    const predictions = getPredictedAtoms("GitHubMolecule");
    expect(predictions).toEqual(["Extrude", "Move", "Rotate"]);
  });

  it("should handle Add-BOM-Tag predictions", () => {
    // Add-BOM-Tag should still have predictions
    const bomPredictions = getPredictedAtoms("Add-BOM-Tag");
    expect(bomPredictions.length).toBeGreaterThan(0);
  });

  it("should validate all prediction arrays are arrays", () => {
    const atomTypes = [
      "Circle",
      "Rectangle",
      "Extrude",
      "Move",
      "Readme",
      "Tag",
      "Assembly",
    ];

    atomTypes.forEach((atomType) => {
      const predictions = getPredictedAtoms(atomType);
      expect(Array.isArray(predictions)).toBe(true);
    });
  });
});
