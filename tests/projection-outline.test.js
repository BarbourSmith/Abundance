// An SVG Export draws a part as seen from below. The projection comes back in
// pieces, many of them open, with seams where the part's bottom faces meet as
// lines inside it. outlineProjection (src/worker/projectionOutline.ts) keeps
// the curves with material on one side only and joins them into closed
// outlines with holes. Here a tab fused onto a ring leaves the ring's arc as a
// seam inside the tab.
//
// Run: npx vitest run --config=vitest.headless.config.ts tests/projection-outline.test.js

import { beforeAll, describe, expect, it } from "vitest";
import * as replicad from "replicad";
import { init } from "../src/worker/util.ts";
import { outlineProjection } from "../src/worker/projectionOutline.ts";

beforeAll(async () => {
  await init(false);
});

const extrude = (drawing, height) =>
  drawing.sketchOnPlane("XY").extrude(height);

/** A ring with a tab fused on and a hole through the tab. */
const part = () =>
  extrude(replicad.drawCircle(100).cut(replicad.drawCircle(67.25)), 3)
    .fuse(
      extrude(replicad.drawRoundedRectangle(50, 45, 12).translate(96, 0), 3),
    )
    .cut(extrude(replicad.drawCircle(5).translate(105, 0), 3));

/** The outlines in a drawing, through any nesting of blueprints. */
function outlinesOf(shape, outlines = []) {
  if (shape.curves) outlines.push(shape);
  else (shape.blueprints ?? []).forEach((b) => outlinesOf(b, outlines));
  return outlines;
}

/** Area of a part's lowest faces, its footprint seen from below. */
function footprintArea(shape) {
  const bottom = shape.boundingBox.bounds[0][2];
  return new replicad.FaceFinder()
    .inPlane("XY", bottom)
    .find(shape)
    .reduce((sum, face) => sum + replicad.measureArea(face), 0);
}

describe("outlineProjection", () => {
  // Extruding by 1 makes the volume equal the area
  const area = (drawing) => replicad.measureVolume(extrude(drawing, 1));

  it("gives the part's footprint where the raw projection doesn't", () => {
    const shape = part();
    const projection = replicad.drawProjection(shape, "bottom").visible;
    // The raw projection runs along the seam and loses the tab's hole
    expect(area(projection)).not.toBeCloseTo(footprintArea(shape), 0);

    const outline = outlineProjection(projection, shape);
    expect(area(outline)).toBeCloseTo(footprintArea(shape), 3);
  });

  it("is made of closed outlines: the ring with its two holes", () => {
    const shape = part();
    const outline = outlineProjection(
      replicad.drawProjection(shape, "bottom").visible,
      shape,
    );
    const outlines = outlinesOf(outline.innerShape);
    expect(outlines).toHaveLength(3);
    expect(outlines.every((o) => o.isClosed())).toBe(true);
  });

  it("leaves a projection with no closed loops as it is", () => {
    const line = replicad.draw([0, 0]).lineTo([10, 0]).done();
    expect(outlineProjection(line, part())).toBe(line);
  });
});
