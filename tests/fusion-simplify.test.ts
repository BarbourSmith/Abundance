// The Fusion atom's simplify checkbox merges faces that share a surface after
// the fuse, removing the seam edges booleans leave where their inputs met.
//
// Run: npx vitest run --config=vitest.headless.config.ts tests/fusion-simplify.test.ts

import { describe, it, expect, beforeAll } from "vitest";
import * as util from "../src/worker/util";
import { fusion } from "../src/worker/interaction";
import { rectangle } from "../src/worker/shapes";
import { extrude, move } from "../src/worker/actions";
import type { RequestContext } from "../src/worker/geometryProvider";

const context: RequestContext = { project: "fusion-simplify-test" };

/** Two 10 x 10 x 5 boxes side by side, sharing one face. */
async function adjacentBoxes() {
  const a = await extrude(await rectangle(10, 10, context), 5, context);
  const b = await move(
    await extrude(await rectangle(10, 10, context), 5, context),
    10,
    0,
    0,
    context,
  );
  return [a, b];
}

async function faceCount(leaf: util.AbundanceLeaf): Promise<number> {
  const shape: any = await util.geometryProvider!.get(
    leaf.geometry as unknown as string,
    context,
  );
  return shape.faces.length;
}

describe("fusion simplify", () => {
  beforeAll(async () => {
    await util.init();
  });

  it("keeps seam faces when simplify is off", async () => {
    const fused = await fusion(await adjacentBoxes(), false, context);
    expect(await faceCount(fused)).toBeGreaterThan(6);
  });

  it("merges coplanar faces into a single box when simplify is on", async () => {
    const fused = await fusion(await adjacentBoxes(), true, context);
    expect(await faceCount(fused)).toBe(6);
  });

  it("leaves sketches unchanged when simplify is on", async () => {
    const a = await rectangle(10, 10, context);
    const b = await move(await rectangle(10, 10, context), 5, 0, 0, context);
    const fused = await fusion([a, b], true, context);
    expect(util.is3D(fused)).toBe(false);
  });
});
