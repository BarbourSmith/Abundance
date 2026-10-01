import { beforeAll, describe, expect, it } from "vitest";
import * as replicad from "replicad";
import { init } from "../src/worker/util";
import {
  diagnoseShape,
  measureOverlap,
} from "../src/worker/geometryDiagnostics";

// A seat panel tilted 18.06 degrees and a runner whose top edge sits up to
// 0.16 mm inside its underside: the overlap that made a chair's seat panel
// render see-through.
const ANGLE = 18.06;

function seatPanel() {
  return replicad
    .makeBox([-19.05, 12.5, 0], [483.8, 284.05, 19.05])
    .rotate(ANGLE, [0, 0, 0], [0, 1, 0])
    .translate([0, 0, 380]);
}

function runner(topEndZ: number) {
  return replicad
    .draw([0, 0])
    .lineTo([843, 0])
    .lineTo([460.5, topEndZ])
    .lineTo([0, 380])
    .close()
    .sketchOnPlane("XY")
    .extrude(19.05)
    .rotate(90, [0, 0, 0], [1, 0, 0])
    .translate([0, 284.05, 0]);
}

/** Where the seat's underside is at x = 460.5, so the runner meets it exactly. */
const FLUSH_Z = 380 - 460.5 * Math.tan((ANGLE * Math.PI) / 180);

function slot() {
  return replicad
    .makeBox([380, 100, -50], [399.05, 160, 50])
    .rotate(ANGLE, [0, 0, 0], [0, 1, 0])
    .translate([0, 0, 380]);
}

describe("geometry diagnostics", () => {
  beforeAll(async () => {
    await init(false);
  });

  it("flags the hairline groove a near-miss overlap cuts", () => {
    const cut = seatPanel().cut(runner(230));
    const d = diagnoseShape(cut, 0.25);
    expect(d.kind).toBe("solid");
    expect(d.sliver_faces?.length).toBeGreaterThan(0);
    expect(d.problems.length).toBeGreaterThan(0);
  });

  it("passes a clean through-slot", () => {
    const d = diagnoseShape(seatPanel().cut(slot()), 0.25);
    expect(d.problems).toEqual([]);
    expect(d.valid).toBe(true);
    expect(d.face_count).toBe(10);
  });

  it("measures a near-miss overlap as a thin sliver", () => {
    const overlap = measureOverlap(seatPanel(), runner(230), 1e-3);
    expect(overlap).not.toBeNull();
    expect(overlap!.thickness).toBeLessThan(0.25);
    expect(overlap!.volume).toBeGreaterThan(100);
  });

  it("measures a real joint as thick", () => {
    const overlap = measureOverlap(seatPanel(), slot(), 1e-3);
    expect(overlap!.thickness).toBeGreaterThan(5);
  });

  it("reports no overlap for parts that meet exactly", () => {
    const overlap = measureOverlap(seatPanel(), runner(FLUSH_Z), 1e-3);
    expect(overlap).toBeNull();
  });

  it("reports no overlap for parts that are apart", () => {
    const far = slot().translate([2000, 0, 0]);
    expect(measureOverlap(seatPanel(), far, 1e-3)).toBeNull();
  });

  it("skips sketches", () => {
    const sketch = replicad.drawRectangle(10, 10);
    expect(diagnoseShape(sketch, 0.25)).toEqual({
      kind: "sketch",
      problems: [],
    });
  });
});
