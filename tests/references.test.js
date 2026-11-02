/**
 * Geometry ids of references (images, PDFs, 3D models): the stored file, a
 * scale, and the lazy Move/Rotate transform shapes use. See
 * src/worker/references.ts.
 *
 * Run: npx vitest run --config=vitest.headless.config.ts tests/references.test.js
 */
import { describe, expect, it } from "vitest";
import {
  isReferenceId,
  parseReferenceId,
  referenceBaseId,
  referenceBounds,
  referenceMatrix,
  scaleReferenceId,
  storedKey,
} from "../src/worker/references.ts";
import {
  rotationXYZ,
  transformId,
  translation,
} from "../src/worker/lazyTransform.ts";

const leaf = (geometry) => ({
  geometry,
  metadata: {
    reference: { contentBounds: { min: [-20, -10, 0], max: [20, 10, 0] } },
  },
});
const round = ({ min, max }) => ({
  min: min.map((v) => Math.round(v * 1e6) / 1e6 + 0),
  max: max.map((v) => Math.round(v * 1e6) / 1e6 + 0),
});

describe("reference ids", () => {
  const base = referenceBaseId("file-abc", 2.5);

  it("name the stored file and its scale", () => {
    expect(base).toBe("ref|2.5|file-abc");
    expect(parseReferenceId(base)).toEqual({
      fileKey: "file-abc",
      scale: 2.5,
      transform: { rotation: [1, 0, 0, 0], translation: [0, 0, 0] },
    });
    expect(isReferenceId(base)).toBe(true);
    expect(isReferenceId("rect-1-2")).toBe(false);
    expect(parseReferenceId("rect-1-2")).toBeUndefined();
  });

  it("are moved like shapes, keeping the stored file", () => {
    const moved = transformId(base, translation(10, 0, 5));
    expect(isReferenceId(moved)).toBe(true);
    expect(storedKey(moved)).toBe("file-abc");
    expect(storedKey("xf|1,0,0,0|1,0,0|rect-1-2")).toBe("rect-1-2");
    // 40 x 20 content scaled 2.5x is 100 x 50, then moved
    expect(round(referenceBounds(leaf(moved)))).toEqual({
      min: [-40, -25, 5],
      max: [60, 25, 5],
    });
  });

  it("place by scale, then rotation, then translation", () => {
    const placed = transformId(
      transformId(base, rotationXYZ(0, 0, 90)),
      translation(100, 0, 0),
    );
    const m = referenceMatrix(placed);
    // The content's +X axis ends up along +Y, 2.5 long
    expect(m.slice(0, 3).map((v) => Math.round(v * 1e9) / 1e9 + 0)).toEqual([
      0, 2.5, 0,
    ]);
    expect(m.slice(12, 15)).toEqual([100, 0, 0]);
    expect(round(referenceBounds(leaf(placed)))).toEqual({
      min: [75, -50, 0],
      max: [125, 50, 0],
    });
  });

  it("scale about the origin, there and back to the same id", () => {
    const moved = transformId(base, translation(10, 20, 30));
    const scaled = scaleReferenceId(moved, 25.4);
    expect(parseReferenceId(scaled).scale).toBeCloseTo(63.5);
    expect(parseReferenceId(scaled).transform.translation).toEqual([
      254, 508, 762,
    ]);
    expect(scaleReferenceId(scaled, 1 / 25.4)).toBe(moved);
  });
});
