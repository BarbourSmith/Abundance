// Bounding boxes only let cuts be skipped, so a box may be too large but
// never too small: a cut skipped because a box missed part of its geometry
// leaves parts overlapping. A branch's box used to be merged from whichever
// children had one, and once set it was trusted without checking deeper.
//
// Run: npx vitest run --config=vitest.headless.config.ts tests/bounding-boxes.test.js
import { beforeAll, describe, expect, it } from "vitest";
import { assembly } from "../src/worker/interaction.ts";
import { rectangle } from "../src/worker/shapes.ts";
import { extrude, move } from "../src/worker/actions.ts";
import * as util from "../src/worker/util.ts";

let projectCount = 0;
const newContext = () => ({ project: `bounds-${Date.now()}-${projectCount++}` });

/** A size x size x size box centered on x and y, from z = 0. */
async function box(size, context) {
  return extrude(await rectangle(size, size, context), size, context);
}

const leaf = (geometry, boundingBox) => ({
  geometry,
  geometryType: "replicad.Shape3D",
  tags: [],
  color: "#000000",
  plane: util.XYPlane,
  bom: [],
  ...(boundingBox ? { boundingBox } : {}),
});
const branch = (children, boundingBox) => ({
  geometry: children,
  tags: [],
  color: "#000000",
  plane: util.XYPlane,
  bom: [],
  ...(boundingBox ? { boundingBox } : {}),
});
const bb = (min, max) => ({ min, max });

beforeAll(async () => {
  await util.init();
});

describe("branch bounds", () => {
  it("are left unset when a child's bounds are unknown, not merged from the rest", () => {
    const result = util.computeAssemblyBounds(
      branch([leaf("a", bb([0, 0, 0], [1, 1, 1])), leaf("b")]),
    );
    expect(result.boundingBox).toBeUndefined();
  });

  it("merge every child's bounds and ignore empty branches", () => {
    const result = util.computeAssemblyBounds(
      branch([
        leaf("a", bb([0, 0, 0], [1, 1, 1])),
        leaf("b", bb([-2, 0, 0], [0, 3, 1])),
        branch([]),
      ]),
    );
    expect(result.boundingBox).toEqual(bb([-2, 0, 0], [1, 3, 1]));
  });

  it("treat empty and null (empty after JSON) boxes as unknown", () => {
    const empty = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
    const stored = JSON.parse(JSON.stringify(empty));
    expect(stored.min).toEqual([null, null, null]);
    expect(util.boundsOverlap(stored, bb([5, 5, 5], [6, 6, 6]))).toBe(true);
    expect(util.boundsOverlap(empty, bb([5, 5, 5], [6, 6, 6]))).toBe(true);
    expect(
      util.computeAssemblyBounds(branch([leaf("a", stored)])).boundingBox,
    ).toBeUndefined();
  });
});

describe("withAssemblyBoundingBoxes", () => {
  it("corrects a nested branch box that misses some of its parts", async () => {
    const context = newContext();
    const a = await box(10, context); // x, y -5..5
    const b = await move(await box(10, context), 30, 0, 0, context); // x 25..35
    const measuredA = await util.withAssemblyBoundingBoxes(a, context);
    const measuredB = await util.withAssemblyBoundingBoxes(b, context);
    // The inner branch's box only covers a, and the outer one copies it,
    // though both hold b too. Every node has a box, so the old check passed.
    const stale = measuredA.boundingBox;
    const tree = branch([branch([measuredA, measuredB], stale)], stale);

    const result = await util.withAssemblyBoundingBoxes(tree, context);

    expect(result.boundingBox.max[0]).toBeCloseTo(35);
    expect(result.geometry[0].boundingBox.max[0]).toBeCloseTo(35);
  });

  it("measures a leaf whose stored box is null", async () => {
    const context = newContext();
    const a = await box(10, context);
    const result = await util.withAssemblyBoundingBoxes(
      { ...a, boundingBox: { min: [null, null, null], max: [null, null, null] } },
      context,
    );
    expect(result.boundingBox.min[0]).toBeCloseTo(-5);
    expect(result.boundingBox.max[2]).toBeCloseTo(10);
  });
});

describe("Assembly", () => {
  it("cuts a part even when the cutter's stored box is too small", async () => {
    const context = newContext();
    const target = await box(10, context); // x -5..5
    const near = await util.withAssemblyBoundingBoxes(
      await move(await box(4, context), 20, 0, 0, context),
      context,
    ); // x 18..22, far from target
    const overlapping = await util.withAssemblyBoundingBoxes(
      await move(await box(4, context), 4, 0, 0, context),
      context,
    ); // x 2..6, overlaps target
    // A cutter branch whose box only covers the far part.
    const cutter = branch([near, overlapping], near.boundingBox);

    const result = await assembly([target, cutter], context);

    expect(result.geometry[0].geometry).toMatch(/^cut-/);
  });
});
