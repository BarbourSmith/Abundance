// Fusion, Difference and Assembly hand OpenCascade every shape of a boolean
// in one call instead of one pair at a time. These check the results match
// one-pair-at-a-time booleans, including when the cutters or the fused parts
// overlap each other.
import * as replicad from "replicad";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { extrude, move } from "../src/worker/actions";
import {
  FailedCutError,
  assembly,
  difference,
  fusion,
} from "../src/worker/interaction";
import { circle, rectangle } from "../src/worker/shapes";
import * as util from "../src/worker/util";
import { RequestContext } from "../src/worker/geometryProvider";

type AbundanceObject = util.AbundanceObject;
type AbundanceLeaf = util.AbundanceLeaf;

const context: RequestContext = { project: "list-booleans-test" };

async function box(
  width: number,
  depth: number,
  height: number,
  at: [number, number, number] = [0, 0, 0],
): Promise<AbundanceObject> {
  const solid = await extrude(
    await rectangle(width, depth, context),
    height,
    context,
  );
  return move(solid, at[0], at[1], at[2], context);
}

async function shapeOf(part: AbundanceObject): Promise<replicad.Shape3D> {
  const leaves = util.flattenAssembly(part);
  expect(leaves).toHaveLength(1);
  return (await util.geometryProvider!.get(
    leaves[0].geometry,
    context,
  )) as replicad.Shape3D;
}

async function volumeOf(part: AbundanceObject): Promise<number> {
  let total = 0;
  for (const leaf of util.flattenAssembly(part)) {
    total += replicad.measureVolume(
      (await util.geometryProvider!.get(
        leaf.geometry,
        context,
      )) as replicad.Shape3D,
    );
  }
  return total;
}

/** Posts that cross a 200 x 60 x 10 plate; neighbours overlap each other. */
async function overlappingPosts(count: number): Promise<AbundanceObject[]> {
  const posts = [];
  for (let i = 0; i < count; i++) {
    posts.push(await box(14, 20, 30, [-80 + i * 10, (i % 3) * 8 - 8, -10]));
  }
  return posts;
}

describe("booleans on a list of shapes", () => {
  beforeAll(async () => {
    await util.init();
  });
  afterEach(() => {
    util.geometryProvider!.setBadCuts([]);
  });

  it("cuts a part by many overlapping cutters in one boolean", async () => {
    const plate = await box(200, 60, 10);
    const posts = await overlappingPosts(8);

    const result = await difference(plate, util.assemblyOf(posts), context);

    const leaves = util.flattenAssembly(result);
    expect(leaves).toHaveLength(1);
    expect(leaves[0].geometry.startsWith("cutMany-")).toBe(true);

    let expected = await shapeOf(plate);
    for (const post of posts) {
      expected = expected.cut(await shapeOf(post));
    }
    const volume = await volumeOf(result);
    expect(volume).toBeCloseTo(replicad.measureVolume(expected), 4);
    expect(volume).toBeLessThan(200 * 60 * 10 - 1000);
  });

  it("gives the same result whatever order the cutters come in", async () => {
    const plate = await box(200, 60, 10);
    const posts = await overlappingPosts(5);

    const forward = await difference(plate, util.assemblyOf(posts), context);
    const backward = await difference(
      plate,
      util.assemblyOf([...posts].reverse()),
      context,
    );

    expect(util.flattenAssembly(backward)[0].geometry).toBe(
      util.flattenAssembly(forward)[0].geometry,
    );
  });

  it("leaves a part alone when no cutter in the list touches it", async () => {
    const plate = await box(200, 60, 10);
    // Bounding boxes can't rule these out for a 3D leaf without bounds.
    const far = [
      await box(5, 5, 5, [0, 0, 500]),
      await box(5, 5, 5, [0, 0, 600]),
    ];

    const result = await difference(plate, util.assemblyOf(far), context);

    expect(util.flattenAssembly(result)[0].geometry).toBe(
      util.flattenAssembly(plate)[0].geometry,
    );
  });

  it("cuts a sketch by several sketches", async () => {
    const sheet = await rectangle(100, 40, context);
    const holes = [];
    for (let i = 0; i < 4; i++) {
      holes.push(
        await move(await circle(12, context), -30 + i * 20, 0, 0, context),
      );
    }

    const result = await difference(sheet, util.assemblyOf(holes), context);

    const drawing = (await util.geometryProvider!.get(
      util.flattenAssembly(result)[0].geometry,
      context,
    )) as replicad.Drawing;
    let expected = (await util.geometryProvider!.get(
      (sheet as AbundanceLeaf).geometry,
      context,
    )) as replicad.Drawing;
    for (const hole of holes) {
      expected = expected.cut(
        (await util.geometryProvider!.get(
          (hole as AbundanceLeaf).geometry,
          context,
        )) as replicad.Drawing,
      );
    }
    const area = (d: replicad.Drawing) =>
      replicad.measureArea(d.sketchOnPlane("XY").face());
    expect(area(drawing)).toBeCloseTo(area(expected), 4);
    expect(area(drawing)).toBeLessThan(100 * 40 - 100);
  });

  it("keeps assembly parts from overlapping", async () => {
    // Each box overlaps the next two.
    const boxes = [];
    for (let i = 0; i < 4; i++) {
      boxes.push(await box(30, 30, 30, [i * 10, i * 5, 0]));
    }
    let union = await shapeOf(boxes[0]);
    for (const other of boxes.slice(1)) {
      union = union.fuse(await shapeOf(other));
    }

    const result = await assembly(boxes, context);

    expect(await volumeOf(result)).toBeCloseTo(
      replicad.measureVolume(union),
      4,
    );
  });

  it("fuses many overlapping shapes in one boolean", async () => {
    const boxes = [];
    for (let i = 0; i < 6; i++) {
      boxes.push(await box(30, 30, 30, [i * 20, (i % 2) * 10, (i % 3) * 5]));
    }
    let union = await shapeOf(boxes[0]);
    for (const other of boxes.slice(1)) {
      union = union.fuse(await shapeOf(other));
    }

    const result = await fusion(boxes, false, context);

    expect(result.geometry.startsWith("fuseMany-")).toBe(true);
    expect(await volumeOf(result)).toBeCloseTo(
      replicad.measureVolume(union),
      4,
    );
  });

  it("fuses an assembly whose parts cross each other", async () => {
    // Two bars crossing: 200x40x40 and 40x200x40 raised 10, sharing a
    // 40x40x30 block.
    const crossing = util.assemblyOf([
      await box(200, 40, 40),
      await box(40, 200, 40, [0, 0, 10]),
    ]);

    const result = await fusion([crossing], false, context);

    expect(await volumeOf(result)).toBeCloseTo(
      2 * 200 * 40 * 40 - 40 * 40 * 30,
      4,
    );
  });

  it("cuts one cutter at a time after the list cut has hung", async () => {
    const plate = await box(180, 60, 10);
    const posts = await overlappingPosts(4);
    const provider = util.geometryProvider!;
    const plateId = util.flattenAssembly(plate)[0].geometry;
    const cutterIds = provider.cuttersToApply(
      plateId,
      posts.map((post) => util.flattenAssembly(post)[0].geometry),
      context,
    );
    const together = await difference(plate, util.assemblyOf(posts), context);

    provider.setBadCuts([
      { toCut: plateId, cutter: provider.cutManyId(plateId, cutterIds) },
    ]);
    const oneAtATime = await difference(plate, util.assemblyOf(posts), context);

    const id = util.flattenAssembly(oneAtATime)[0].geometry;
    expect(id.startsWith("cut-")).toBe(true);
    expect(await volumeOf(oneAtATime)).toBeCloseTo(await volumeOf(together), 4);

    // A pair that also hung is reported instead of being run again.
    provider.setBadCuts([
      { toCut: plateId, cutter: provider.cutManyId(plateId, cutterIds) },
      { toCut: plateId, cutter: util.flattenAssembly(posts[0])[0].geometry },
    ]);
    await expect(
      difference(plate, util.assemblyOf(posts), context),
    ).rejects.toBeInstanceOf(FailedCutError);
  });
});
