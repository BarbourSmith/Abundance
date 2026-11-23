// Assembly accepts any mix of 2D, 3D, faces, wires and points. Only 2D cuts 2D
// and 3D cuts 3D; everything else passes through unchanged.
import { describe, it, expect, beforeAll } from "vitest";
import { assembly } from "../src/worker/interaction";
import { rectangle, vertex } from "../src/worker/shapes";
import { extrude } from "../src/worker/actions";
import { init, flattenAssembly, getBounds } from "../src/worker/util";
import { RequestContext } from "../src/worker/geometryProvider";

describe("assembly of mixed geometry types", () => {
  const context: RequestContext = { project: "assembly-mixed-types" };
  beforeAll(async () => {
    await init();
  });

  it("assembles 2D and 3D together without cutting between them", async () => {
    const big = await extrude(await rectangle(20, 20, context), 10, context);
    const small = await extrude(await rectangle(10, 10, context), 10, context);
    const sketchA = await rectangle(30, 30, context);
    const sketchB = await rectangle(5, 5, context);
    const point = await vertex(0, 0, 0, context);

    const result = await assembly(
      [sketchA, big, point, sketchB, small],
      context,
    );
    const leaves = flattenAssembly(result);
    const types = leaves.map((leaf) => leaf.geometryType);
    expect(types).toContain("replicad.Drawing");
    expect(types).toContain("replicad.Shape3D");
    expect(types).toContain("replicad.Vertex");

    // The last 3D part cuts the first; the 2D sketches don't touch the solids.
    const solids = leaves.filter((l) => l.geometryType === "replicad.Shape3D");
    expect(solids.map((s) => s.geometry)).not.toContain(big.geometry);
    expect(solids.map((s) => s.geometry)).toContain(small.geometry);

    // The later sketch cuts the earlier one, unaffected by the solids between.
    const sketches = leaves.filter(
      (l) => l.geometryType === "replicad.Drawing",
    );
    expect(sketches.map((s) => s.geometry)).not.toContain(sketchA.geometry);
    expect(sketches.map((s) => s.geometry)).toContain(sketchB.geometry);

    // The point passes through untouched.
    const points = leaves.filter((l) => l.geometryType === "replicad.Vertex");
    expect(points.map((p) => p.geometry)).toEqual([point.geometry]);

    const bounds = await getBounds(result, context);
    expect(bounds.max[0] - bounds.min[0]).toBeCloseTo(30, 3);
  });

  it("leaves a lone sketch uncut when assembled with a solid", async () => {
    const sketch = await rectangle(10, 10, context);
    const solid = await extrude(await rectangle(10, 10, context), 5, context);
    const result = await assembly([sketch, solid], context);
    const geoms = flattenAssembly(result).map((l) => l.geometry);
    expect(geoms).toEqual([sketch.geometry, solid.geometry]);
  });
});
