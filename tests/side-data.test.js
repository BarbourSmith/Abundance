/**
 * Side data (src/js/sideData.js): labels and references that ride along with
 * geometry, placed by Move, Rotate and unit conversion but kept out of the
 * CAD worker.
 *
 * Run: npx vitest run --config=vitest.headless.config.ts tests/side-data.test.js
 */
import { describe, expect, it } from "vitest";
import {
  SIDE_DATA_KEY,
  applyMatrix,
  extractSideDataByTags,
  hasGeometry,
  mergeSideData,
  referenceBounds,
  rotateSideData,
  scaleSideData,
  sideDataOf,
  tagSideData,
  translateSideData,
  withSideData,
  withoutSideData,
} from "../src/js/sideData.js";

const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

/** A 20 x 10 image lying on the XY plane, centered on the origin. */
const image = () => ({
  type: "Reference",
  kind: "image",
  asset: "abc",
  name: "plan.png",
  contentBounds: { min: [-10, -5, 0], max: [10, 5, 0] },
  matrix: [...IDENTITY],
  opacity: 1,
  tags: [],
});

const label = () => ({
  type: "Label",
  line: { start: [0, 0, 0], end: [10, 0, 0], color: "#000", linewidth: 1 },
  endSegments: {
    start: { p1: [0, 1, 0], p2: [0, 2, 0] },
    end: { p1: [10, 1, 0], p2: [10, 2, 0] },
  },
  text: { value: "10 mm", position: [5, 0, 0] },
  movement: { x: 0, y: 0, z: 0 },
  rotation: { x: 0, y: 0, z: 0 },
});

const leaf = (id) => ({ geometry: id, tags: [], bom: [], dimension: "3D" });

const close = (a, b) => a.forEach((v, i) => expect(v).toBeCloseTo(b[i], 9));

describe("side data on values", () => {
  it("lives at the root and is stripped from the whole tree for the worker", () => {
    const tree = {
      geometry: [{ ...leaf("a"), [SIDE_DATA_KEY]: [label()] }, leaf("b")],
      tags: [],
      [SIDE_DATA_KEY]: [image()],
    };
    const stripped = withoutSideData(tree);
    expect(SIDE_DATA_KEY in stripped).toBe(false);
    expect(SIDE_DATA_KEY in stripped.geometry[0]).toBe(false);
    // Untouched nodes are shared, not copied
    expect(stripped.geometry[1]).toBe(tree.geometry[1]);
  });

  it("returns a value without side data unchanged", () => {
    const value = { geometry: [leaf("a")], tags: [] };
    expect(withoutSideData(value)).toBe(value);
    expect(withSideData(value, [])).toBe(value);
  });

  it("reads older single-label and empty-object forms", () => {
    expect(sideDataOf({ geometry: [], [SIDE_DATA_KEY]: label() })).toHaveLength(
      1,
    );
    expect(sideDataOf({ geometry: [], [SIDE_DATA_KEY]: {} })).toEqual([]);
    expect(
      sideDataOf({ geometry: [], [SIDE_DATA_KEY]: [{}, image()] }),
    ).toHaveLength(1);
    expect(sideDataOf(42)).toEqual([]);
  });

  it("merges inputs in order", () => {
    const a = withSideData({ geometry: [] }, [image()]);
    const b = withSideData({ geometry: [] }, [label()]);
    expect(mergeSideData([a, 5, b]).map((i) => i.type)).toEqual([
      "Reference",
      "Label",
    ]);
  });

  it("tells values with parts from ones that only carry references", () => {
    expect(hasGeometry({ geometry: [] })).toBe(false);
    expect(hasGeometry({ geometry: [{ geometry: [] }] })).toBe(false);
    expect(hasGeometry({ geometry: [{ geometry: [] }, leaf("a")] })).toBe(true);
    expect(hasGeometry(leaf("a"))).toBe(true);
    expect(hasGeometry(3)).toBe(false);
  });
});

describe("placing side data", () => {
  it("moves references and labels", () => {
    const [ref, lab] = translateSideData([image(), label()], 1, 2, 3);
    expect(referenceBounds(ref)).toEqual({
      min: [-9, -3, 3],
      max: [11, 7, 3],
    });
    expect(lab.line.end).toEqual([11, 2, 3]);
    expect(lab.endSegments.end.p2).toEqual([11, 4, 3]);
    expect(lab.text.position).toEqual([6, 2, 3]);
    expect(lab.movement).toEqual({ x: 1, y: 2, z: 3 });
  });

  it("turns about X, then Y, then Z, as the Rotate atom turns shapes", () => {
    // The order the worker's label rotation used before side data moved to
    // the main thread
    const old = ([px, py, pz], x, y, z) => {
      const r = (d) => (d * Math.PI) / 180;
      let [nx, ny, nz] = [px, py, pz];
      [ny, nz] = [
        ny * Math.cos(r(x)) - nz * Math.sin(r(x)),
        ny * Math.sin(r(x)) + nz * Math.cos(r(x)),
      ];
      [nx, nz] = [
        nx * Math.cos(r(y)) + nz * Math.sin(r(y)),
        -nx * Math.sin(r(y)) + nz * Math.cos(r(y)),
      ];
      [nx, ny] = [
        nx * Math.cos(r(z)) - ny * Math.sin(r(z)),
        nx * Math.sin(r(z)) + ny * Math.cos(r(z)),
      ];
      return [nx, ny, nz];
    };
    const [lab, ref] = rotateSideData([label(), image()], 30, 45, 60);
    close(lab.line.end, old([10, 0, 0], 30, 45, 60));
    close(applyMatrix(ref.matrix, [10, 5, 0]), old([10, 5, 0], 30, 45, 60));
    expect(lab.rotation).toEqual({ x: 30, y: 45, z: 60 });
  });

  it("applies each placement after the ones before", () => {
    // Move then turn a quarter about Z: the move is turned too
    let [ref] = translateSideData([image()], 100, 0, 0);
    [ref] = rotateSideData([ref], 0, 0, 90);
    close(applyMatrix(ref.matrix, [0, 0, 0]), [0, 100, 0]);
  });

  it("scales about the origin for unit conversion", () => {
    const [ref, lab] = scaleSideData([image(), label()], 25.4);
    expect(referenceBounds(ref).max).toEqual([254, 127, 0]);
    expect(lab.line.end).toEqual([254, 0, 0]);
  });

  it("stands an image up with a quarter turn about X", () => {
    const [ref] = rotateSideData([image()], 90, 0, 0);
    const bounds = referenceBounds(ref);
    close(bounds.min, [-10, 0, -5]);
    close(bounds.max, [10, 0, 5]);
  });
});

describe("tags", () => {
  it("tags every item and extracts by tag", () => {
    const [ref, lab] = tagSideData([image(), label()], ["plan"]);
    expect(ref.tags).toEqual(["plan"]);
    expect(lab.tags).toEqual(["plan"]);
    const untagged = image();
    expect(extractSideDataByTags([ref, untagged], ["plan"], false)).toEqual([
      ref,
    ]);
    expect(extractSideDataByTags([ref, untagged], [], true)).toEqual([
      untagged,
    ]);
    // Only "Not Keep Out": side data is never keepout, so all of it stays
    expect(extractSideDataByTags([ref, untagged], [], false)).toHaveLength(2);
  });
});
