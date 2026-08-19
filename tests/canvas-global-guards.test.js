/**
 * The canvas is a React ref held in a global that whichever view mounted last
 * owns, so `.current` goes null as soon as that view unmounts.  Everything
 * that measures the canvas has to survive that, otherwise a single frame
 * drawn during teardown throws and takes the render loop with it.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import GlobalVariables from "../src/js/globalvariables.js";

const originalCanvas = GlobalVariables.canvas;

afterEach(() => {
  GlobalVariables.canvas = originalCanvas;
});

describe("canvas measurement helpers with no mounted canvas", () => {
  beforeEach(() => {
    GlobalVariables.canvas = null;
  });

  it("reports no canvas element", () => {
    expect(GlobalVariables.canvasElement).toBe(null);

    GlobalVariables.canvas = { current: null };
    expect(GlobalVariables.canvasElement).toBe(null);
  });

  it("does not throw when converting between pixels and fractions", () => {
    expect(GlobalVariables.widthToPixels(0.5)).toBe(0);
    expect(GlobalVariables.heightToPixels(0.5)).toBe(0);
    expect(GlobalVariables.pixelsToWidth(100)).toBe(0);
    expect(GlobalVariables.pixelsToHeight(100)).toBe(0);
  });

  it("does not throw when constraining pixel coordinates", () => {
    expect(GlobalVariables.constrainToCanvasBordersPixels(-10, 40)).toEqual([
      0, 40,
    ]);
  });
});

describe("canvas measurement helpers with a mounted canvas", () => {
  beforeEach(() => {
    GlobalVariables.canvas = { current: { width: 800, height: 400 } };
  });

  it("measures against the mounted canvas", () => {
    expect(GlobalVariables.widthToPixels(0.5)).toBe(400);
    expect(GlobalVariables.heightToPixels(0.5)).toBe(200);
    expect(GlobalVariables.pixelsToWidth(400)).toBe(0.5);
    expect(GlobalVariables.pixelsToHeight(200)).toBe(0.5);
    expect(GlobalVariables.constrainToCanvasBordersPixels(-10, 900)).toEqual([
      0, 400,
    ]);
  });
});
