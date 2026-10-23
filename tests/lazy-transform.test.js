// Moves and rotations are lazy: GeometryProvider returns an id naming the base
// shape and the transform, stores nothing, and applies the transform when the
// shape is loaded. These tests check that the result matches replicad's own
// (eager) transforms, and that the cache keeps what lazy ids depend on.

import * as replicad from "replicad";
import * as util from "../src/worker/util.ts";
import { shapeExists } from "../src/worker/indexeddbUtils.ts";
import {
  parseTransformedId,
  rotationXYZ,
  transformId,
  translation,
} from "../src/worker/lazyTransform.ts";

const context = { project: "lazy-transform-test" };

/** Sorted vertex positions, rounded so float noise doesn't matter. */
function vertices(shape) {
  const points = [];
  for (const v of replicad.iterTopo(shape.wrapped, "vertex")) {
    points.push(
      new replicad.Vertex(v)
        .asTuple()
        .map((c) => Math.round(c * 1e6) / 1e6 || 0),
    );
  }
  return points.sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]);
}

/** A shape with no symmetry, so any wrong rotation changes its vertices. */
function lopsided() {
  return replicad
    .makeBaseBox(40, 20, 10)
    .translate(5, 3, 1)
    .fuse(replicad.makeBaseBox(6, 6, 30).translate(20, 9, 0));
}

describe("lazy transform ids", () => {
  it("composes onto one base and collapses to the base when it cancels", () => {
    const moved = transformId("box-1", translation(1, 2, 3));
    const twice = transformId(moved, translation(2, 0, 0));
    expect(parseTransformedId(twice).base).toBe("box-1");
    expect(parseTransformedId(twice).transform.translation).toEqual([3, 2, 3]);
    expect(transformId(twice, translation(-3, -2, -3))).toBe("box-1");

    let turned = "box-1";
    for (let i = 0; i < 4; i++) {
      turned = transformId(turned, rotationXYZ(0, 0, 90));
    }
    expect(turned).toBe("box-1");
  });

  it("gives equivalent chains the same id", () => {
    const a = transformId(
      transformId("box-1", translation(0.1, 0, 0)),
      translation(0.2, 0, 0),
    );
    expect(a).toBe(transformId("box-1", translation(0.3, 0, 0)));
  });

  it("leaves other ids alone", () => {
    expect(parseTransformedId("cut-xf|1,0,0,0|1,0,0|a-b")).toBeUndefined();
  });
});

describe("lazy move and rotate in GeometryProvider", () => {
  let gp;
  let baseId;

  beforeAll(async () => {
    await util.init(false);
    gp = util.geometryProvider;
    await gp.clearCache(context);
    baseId = await gp.addSingularToCache(lopsided(), context, "lopsided", [1]);
  });

  it("stores nothing for a move or rotate", async () => {
    const id = await gp.rotate(
      await gp.move(baseId, 5, -7, 2, context),
      30,
      45,
      60,
      context,
    );
    expect(parseTransformedId(id).base).toBe(baseId);
    expect(await shapeExists(context.project, id)).toBe(false);
  });

  it("matches replicad's eager move and rotate in any order", async () => {
    let id = baseId;
    let eager = lopsided();
    const steps = [
      ["move", 5, -7, 2],
      ["rotate", 30, 45, 60],
      ["move", -12.5, 0, 100],
      ["rotate", 0, -90, 15],
      ["rotate", 170, 0, 0],
    ];
    for (const [op, x, y, z] of steps) {
      if (op === "move") {
        id = await gp.move(id, x, y, z, context);
        eager = eager.translate(x, y, z);
      } else {
        id = await gp.rotate(id, x, y, z, context);
        eager = eager
          .rotate(x, [0, 0, 0], [1, 0, 0])
          .rotate(y, [0, 0, 0], [0, 1, 0])
          .rotate(z, [0, 0, 0], [0, 0, 1]);
      }
      expect(vertices(await gp.get(id, context))).toEqual(vertices(eager));
    }
  });

  it("produces shapes that booleans, measuring, meshing and serializing see moved", async () => {
    const moved = await gp.move(baseId, 100, 0, 0, context);
    const shape = await gp.get(moved, context);
    // lopsided() starts at x = -15
    expect(shape.boundingBox.bounds[0][0]).toBeCloseTo(85, 6);
    expect(replicad.measureVolume(shape)).toBeCloseTo(
      replicad.measureVolume(lopsided()),
      6,
    );

    const mesh = shape.mesh({ tolerance: 0.1, angularTolerance: 0.5 });
    const xs = mesh.vertices.filter((_, i) => i % 3 === 0);
    expect(Math.min(...xs)).toBeCloseTo(85, 6);

    const reloaded = replicad.deserializeShape(shape.serialize());
    expect(vertices(reloaded)).toEqual(vertices(shape));

    // Cutting the shape by itself moved away changes nothing; by itself in
    // place, it leaves nothing.
    expect(await gp.cut(baseId, moved, context)).toBe(baseId);
    expect(await gp.cut(moved, moved, context)).toBe(gp.EMPTY_SHAPE_SENTINEL);
  });

  it("moves and rotates sketches within their plane", async () => {
    const sketchId = await gp.drawRectangle(30, 10, context);
    const id = await gp.move(
      await gp.rotate(sketchId, 0, 0, 90, context),
      4,
      6,
      0,
      context,
    );
    const sketch = await gp.get(id, context);
    const eager = replicad
      .drawRectangle(30, 10)
      .rotate(90, [0, 0])
      .translate(4, 6);
    expect(sketch).toBeInstanceOf(replicad.Drawing);
    const [[x0, y0], [x1, y1]] = sketch.boundingBox.bounds;
    const [[ex0, ey0], [ex1, ey1]] = eager.boundingBox.bounds;
    expect([x0, y0, x1, y1].map((c) => +c.toFixed(6))).toEqual(
      [ex0, ey0, ex1, ey1].map((c) => +c.toFixed(6)),
    );

    const tilted = await gp.rotate(sketchId, 10, 0, 0, context);
    await expect(gp.get(tilted, context)).rejects.toThrow(/Z axis/);
  });

  it("expands a moved compound into moved parts of the stored compound", async () => {
    const compound = replicad.makeCompound([
      replicad.makeBaseBox(5, 5, 5),
      replicad.makeBaseBox(5, 5, 5).translate(20, 0, 0),
    ]);
    const compoundId = await gp.addSingularToCache(
      compound,
      context,
      "pair",
      [1],
    );
    const moved = await gp.move(compoundId, 0, 0, 50, context);
    const parts = await gp.expandCompoundShape(moved, context);
    const storedParts = await gp.expandCompoundShape(compoundId, context);
    expect(parts).toEqual(
      storedParts.map((p) => transformId(p, translation(0, 0, 50))),
    );
    for (const part of parts) {
      const shape = await gp.get(part, context);
      expect(shape.boundingBox.bounds[0][2]).toBeCloseTo(50, 6);
    }
  });

  it("saves the base shape of a moved batch result", async () => {
    const batch = await gp.startBatchOperation(context, "lazy-batch-test");
    const madeId = await gp.addSingularToCache(
      replicad.makeBaseBox(3, 3, 3),
      batch,
      "batchBox",
      [1],
    );
    const movedId = await gp.move(madeId, 1, 1, 1, batch);
    expect(await shapeExists(context.project, madeId)).toBe(false);

    await gp.endBatchOperation(batch, {
      geometry: [{ geometry: movedId, dimension: "3D", tags: [] }],
      tags: [],
    });

    expect(await shapeExists(context.project, madeId)).toBe(true);
    const shape = await gp.get(movedId, context);
    // The box starts at (-1.5, -1.5, 0)
    expect(shape.boundingBox.bounds[0]).toEqual([-0.5, -0.5, 1]);
  });

  it("leaves the batch's cached base shape usable after loading a moved copy", async () => {
    const batch = await gp.startBatchOperation(context, "lazy-batch-reuse");
    const moved = await gp.move(baseId, 0, 0, 5, batch);
    await gp.get(moved, batch);
    // The base is now in the batch's warm cache; loading it again must work.
    const again = await gp.get(moved, batch);
    expect(vertices(again)).toEqual(vertices(lopsided().translate(0, 0, 5)));
    expect(await gp.expandCompoundShape(moved, batch)).toHaveLength(1);
    gp.cleanupBatchWithoutCaching(batch);
  });

  it("keeps the base shape of a retained moved shape when sweeping", async () => {
    const otherId = await gp.addSingularToCache(
      replicad.makeBaseBox(2, 2, 2),
      context,
      "sweepMe",
      [1],
    );
    const moved = await gp.rotate(baseId, 0, 0, 45, context);
    await gp.sweepCache(new Set([moved]), context);

    expect(await shapeExists(context.project, baseId)).toBe(true);
    expect(await shapeExists(context.project, otherId)).toBe(false);
    await expect(gp.get(moved, context)).resolves.toBeDefined();
  });
});
