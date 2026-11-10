// Booleans no longer merge faces that share a surface (#1934, #1956), so a
// fused part keeps seam edges where its pieces met. A large fillet on the
// vertical edges where a tab joins a ring fails across those seams with
// StdFail_NotDone, while the same fillet works once the faces are merged.
// Other fillets only work unmerged (the tubes from #1934), so a fillet or
// chamfer that fails is tried again on a merged copy of its shape
// (src/worker/occtWorkarounds.ts).
//
// Run: npx vitest run --config=vitest.headless.config.ts tests/fillet-merged-retry.test.js

import { beforeAll, describe, expect, it } from "vitest";
import * as replicad from "replicad";
import { init } from "../src/worker/util.ts";
import { isValidShape } from "../src/worker/geometryDiagnostics.ts";

beforeAll(async () => {
  await init(false);
});

const extrude = (drawing, height) =>
  drawing.sketchOnPlane("XY").extrude(height);

/** A flat ring with a rounded tab fused onto its outside. */
const ringWithTab = () =>
  extrude(replicad.drawCircle(100).cut(replicad.drawCircle(67.25)), 3).fuse(
    extrude(replicad.drawRoundedRectangle(50, 45, 12).translate(96, 0), 3),
  );

// The vertical edges where the tab meets the ring
const TAB_MIN = [73, -250, -1];
const TAB_MAX = [103, 250, 9];

const describeShape = (shape) => ({
  valid: isValidShape(shape),
  volume: +replicad.measureVolume(shape).toFixed(3),
  faces: shape.faces.length,
});

describe("fillets across boolean seams", () => {
  it("fillet the edges where a tab meets a ring", () => {
    const part = ringWithTab();
    const filleted = part.fillet(25, (e) =>
      e.inDirection("Z").inBox(TAB_MIN, TAB_MAX),
    );
    expect(isValidShape(filleted)).toBe(true);
    // The fillets fill the corners, adding material
    expect(replicad.measureVolume(filleted)).toBeGreaterThan(
      replicad.measureVolume(part),
    );
  });

  it("work with a finder passed as the config", () => {
    const filleted = ringWithTab().fillet({
      radius: 25,
      filter: new replicad.EdgeFinder()
        .inDirection("Z")
        .inBox(TAB_MIN, TAB_MAX),
    });
    expect(isValidShape(filleted)).toBe(true);
  });

  it("leave the shape they fillet unchanged", () => {
    const part = ringWithTab();
    const before = describeShape(part);
    part.fillet(25, (e) => e.inDirection("Z").inBox(TAB_MIN, TAB_MAX));
    expect(describeShape(part)).toEqual(before);
  });

  it("still fillet the tubes from #1934", () => {
    const tube = (d, h) => extrude(replicad.drawCircle(d / 2), h);
    const D = 1.51;
    const fused = tube(D, 3.01)
      .translate([0, 0, -D / 2])
      .fillet(0.5, (e) => e.inBox([-1, -1, -2], [1, 1, 0]))
      .fuse(tube(D, -1.75).rotate(90, [0, 0, 0], [0, 1, 0]))
      .fuse(tube(D, -1.75).rotate(90, [0, 0, 0], [1, 0, 0]));
    const filleted = fused.fillet(0.1, (e) => e.inBox([-1, -1, -2], [1, 1, 1]));
    expect(isValidShape(filleted)).toBe(true);
  });
});
