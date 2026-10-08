// A cut whose result happens to have the same volume as the cutter used to
// return an id that was never stored, so the next read of it failed with
// "not found in cache". The cutter can never be the result of a cut, so the
// volume match is a coincidence and the result must be stored like any other.
import { beforeEach, describe, expect, it } from "vitest";
import * as replicad from "replicad";
import * as util from "../src/worker/util";
import { RequestContext } from "../src/worker/geometryProvider";

describe("GeometryProvider.cut volume coincidence", () => {
  const context: RequestContext = { project: "cut-volume-coincidence" };

  beforeEach(async () => {
    await util.init(false);
  });

  it("stores a cut whose volume equals the cutter's", async () => {
    const gp = util.geometryProvider!;
    // A 2x1x1 box and a 1x1x1 box covering half of it: the remaining half has
    // the cutter's volume.
    const longRect = await gp.drawRectangle(2, 1, context);
    const long = await gp.extrude(longRect, util.XYPlane, 1, context);
    const cubeRect = await gp.drawRectangle(1, 1, context);
    const cube = await gp.extrude(cubeRect, util.XYPlane, 1, context);
    const cutter = await gp.move(cube, 0.5, 0, 0, context);

    const resultId = await gp.cut(long, cutter, context);

    expect(resultId).not.toBe(long);
    expect(resultId).not.toBe(cutter);
    const result = (await gp.get(resultId, context)) as replicad.Shape3D;
    expect(replicad.measureVolume(result)).toBeCloseTo(1, 6);
    const bounds = result.boundingBox.bounds;
    expect(bounds[0][0]).toBeCloseTo(-1, 6);
    expect(bounds[1][0]).toBeCloseTo(0, 6);
  });
});
