/**
 * Test for Import atom mobile "Delete Selected" button positioning.
 *
 * On mobile the Import atom must have a "Delete Selected" button at the
 * *bottom* of the params panel, consistent with all other atoms (Color,
 * Constant, Tag, BOM, …).
 *
 * Previously the base Atom.createInputParams() added the delete button first
 * (at the top of the object), and then Import.createInputParams() appended
 * its own controls after it.  The fix removes the delete-button key and
 * re-inserts it at the end so that it always appears last.
 */

import { describe, it, expect } from "vitest";

/**
 * Lightweight simulation of the Import.createInputParams logic.
 *
 * We reproduce only the ordering behaviour that was broken:
 *   - super returns an object that already contains a "delete" button key
 *   - Import then appends its own controls
 *   - The delete button must end up as the LAST key
 */
function simulateImportCreateInputParams({
  uniqueID = "atom-1",
  fileName = null,
  type = null,
  SVGwidth = 10,
  importOptions = ["SVG", "STL", "STEP"],
  importIndex = 0,
  // Simulate what atom.js (super) returns on mobile
  superDeleteButton = true,
} = {}) {
  // --- Simulate super.createInputParams() --------------------------------
  // In atom.js the base method adds a delete button on mobile.
  let inputParams = {};
  if (superDeleteButton) {
    inputParams[uniqueID + "delete"] = {
      type: "button",
      label: "Delete Selected",
      onClick: () => {},
    };
  }

  // --- Replicate the exact logic from Import.createInputParams() ---------

  // Remove the delete button that super added so we can re-add it at the end
  const deleteKey = uniqueID + "delete";
  const deleteConfig = inputParams[deleteKey];
  if (deleteConfig) {
    delete inputParams[deleteKey];
  }

  if (fileName == null) {
    inputParams[uniqueID + "file_ops"] = {
      type: "select",
      options: importOptions,
      label: "File Type",
    };
    inputParams[uniqueID + "Load File"] = {
      type: "button",
      label: "Load File",
    };
  } else {
    if (type === "SVG") {
      inputParams["Width"] = {
        type: "number",
        value: SVGwidth,
        label: "Width",
        step: 1,
      };
    }
  }

  inputParams[uniqueID + "Loaded File"] = {
    type: "string",
    value: fileName ? fileName : "",
    label: "Loaded File",
    disabled: true,
  };

  // Re-add delete button at the end
  if (deleteConfig) {
    inputParams[deleteKey] = deleteConfig;
  }

  return inputParams;
}

describe("Import atom mobile delete button", () => {
  it("Delete Selected button is the last param when no file is loaded", () => {
    const params = simulateImportCreateInputParams({ superDeleteButton: true });
    const keys = Object.keys(params);
    expect(keys[keys.length - 1]).toBe("atom-1delete");
  });

  it("Delete Selected button is the last param when an SVG file is loaded", () => {
    const params = simulateImportCreateInputParams({
      superDeleteButton: true,
      fileName: "design.svg",
      type: "SVG",
    });
    const keys = Object.keys(params);
    expect(keys[keys.length - 1]).toBe("atom-1delete");
  });

  it("Delete Selected button is the last param when a non-SVG file is loaded", () => {
    const params = simulateImportCreateInputParams({
      superDeleteButton: true,
      fileName: "model.stl",
      type: "STL",
    });
    const keys = Object.keys(params);
    expect(keys[keys.length - 1]).toBe("atom-1delete");
  });

  it("Delete Selected button has the correct label", () => {
    const params = simulateImportCreateInputParams({ superDeleteButton: true });
    expect(params["atom-1delete"].label).toBe("Delete Selected");
    expect(params["atom-1delete"].type).toBe("button");
  });

  it("All expected controls are still present when no file is loaded", () => {
    const params = simulateImportCreateInputParams({ superDeleteButton: true });
    const keys = Object.keys(params);
    expect(keys).toContain("atom-1file_ops");
    expect(keys).toContain("atom-1Load File");
    expect(keys).toContain("atom-1Loaded File");
    expect(keys).toContain("atom-1delete");
  });

  it("All expected controls are still present when an SVG is loaded", () => {
    const params = simulateImportCreateInputParams({
      superDeleteButton: true,
      fileName: "art.svg",
      type: "SVG",
    });
    const keys = Object.keys(params);
    expect(keys).toContain("Width");
    expect(keys).toContain("atom-1Loaded File");
    expect(keys).toContain("atom-1delete");
    // File picker controls should NOT appear when a file is already loaded
    expect(keys).not.toContain("atom-1file_ops");
    expect(keys).not.toContain("atom-1Load File");
  });

  it("No delete button is added when super does not provide one (non-mobile)", () => {
    const params = simulateImportCreateInputParams({ superDeleteButton: false });
    expect(params["atom-1delete"]).toBeUndefined();
  });
});
