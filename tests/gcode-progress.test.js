import { expect, test, describe, beforeEach, vi } from "vitest";
import GlobalVariables from "../src/js/globalvariables.js";

describe("G-code progress bar functionality", () => {
  let progressCallback;
  let visibilityCallback;
  let progressUpdates;
  let visibilityUpdates;

  beforeEach(() => {
    // Reset tracking arrays
    progressUpdates = [];
    visibilityUpdates = [];

    // Mock the progress callbacks
    progressCallback = vi.fn((progress, label) => {
      progressUpdates.push({ progress, label });
    });
    visibilityCallback = vi.fn((visible) => {
      visibilityUpdates.push(visible);
    });

    // Set up the callbacks in GlobalVariables
    GlobalVariables.setGcodeProgressCallback = progressCallback;
    GlobalVariables.setGcodeBarVisibleCallback = visibilityCallback;
  });

  test("should have progress callback methods available", () => {
    expect(typeof GlobalVariables.setGcodeProgress).toBe("function");
    expect(typeof GlobalVariables.setGcodeBarVisible).toBe("function");
  });

  test("should call progress callback when setGcodeProgress is called", () => {
    GlobalVariables.setGcodeProgress(0.5, "Loading STL");
    
    expect(progressCallback).toHaveBeenCalledTimes(1);
    expect(progressCallback).toHaveBeenCalledWith(0.5, "Loading STL");
    expect(progressUpdates).toHaveLength(1);
    expect(progressUpdates[0]).toEqual({ progress: 0.5, label: "Loading STL" });
  });

  test("should call visibility callback when setGcodeBarVisible is called", () => {
    GlobalVariables.setGcodeBarVisible(true);
    
    expect(visibilityCallback).toHaveBeenCalledTimes(1);
    expect(visibilityCallback).toHaveBeenCalledWith(true);
    expect(visibilityUpdates).toHaveLength(1);
    expect(visibilityUpdates[0]).toBe(true);
  });

  test("should handle multiple progress updates", () => {
    const stages = [
      { progress: 0.0, label: "Initializing" },
      { progress: 0.25, label: "Loading STL" },
      { progress: 0.5, label: "Configuring Toolpaths" },
      { progress: 0.8, label: "Slicing Model" },
      { progress: 0.95, label: "Preparing Export" },
      { progress: 1.0, label: "Generating GCode" },
    ];

    stages.forEach(({ progress, label }) => {
      GlobalVariables.setGcodeProgress(progress, label);
    });

    expect(progressCallback).toHaveBeenCalledTimes(stages.length);
    expect(progressUpdates).toHaveLength(stages.length);
    
    // Verify all stages were recorded in order
    stages.forEach((stage, index) => {
      expect(progressUpdates[index]).toEqual(stage);
    });
  });

  test("should handle visibility toggle during generation lifecycle", () => {
    // Simulate typical generation lifecycle
    GlobalVariables.setGcodeBarVisible(true); // Start generation
    GlobalVariables.setGcodeProgress(0.5, "Slicing Model");
    GlobalVariables.setGcodeProgress(1.0, "Generating GCode");
    GlobalVariables.setGcodeBarVisible(false); // Complete generation

    expect(visibilityCallback).toHaveBeenCalledTimes(2);
    expect(visibilityUpdates).toEqual([true, false]);
  });

  test("should handle progress updates without labels", () => {
    GlobalVariables.setGcodeProgress(0.5);
    
    expect(progressCallback).toHaveBeenCalledTimes(1);
    expect(progressCallback).toHaveBeenCalledWith(0.5, undefined);
  });

  test("should not throw error if callbacks are not set", () => {
    // Clear the callbacks
    GlobalVariables.setGcodeProgressCallback = null;
    GlobalVariables.setGcodeBarVisibleCallback = null;

    // Should not throw
    expect(() => {
      GlobalVariables.setGcodeProgress(0.5, "Test");
      GlobalVariables.setGcodeBarVisible(true);
    }).not.toThrow();
  });

  test("should handle boundary progress values", () => {
    // Test 0% progress
    GlobalVariables.setGcodeProgress(0.0, "Start");
    expect(progressUpdates[0].progress).toBe(0.0);

    // Test 100% progress
    GlobalVariables.setGcodeProgress(1.0, "Complete");
    expect(progressUpdates[1].progress).toBe(1.0);
  });

  test("should support assembly progress with multiple parts", () => {
    const totalParts = 3;
    
    for (let i = 0; i < totalParts; i++) {
      const partProgress = i / totalParts;
      const label = `Generating Part ${i + 1} of ${totalParts}`;
      GlobalVariables.setGcodeProgress(partProgress, label);
    }

    expect(progressCallback).toHaveBeenCalledTimes(totalParts);
    expect(progressUpdates[0].label).toContain("Part 1 of 3");
    expect(progressUpdates[1].label).toContain("Part 2 of 3");
    expect(progressUpdates[2].label).toContain("Part 3 of 3");
  });
});
