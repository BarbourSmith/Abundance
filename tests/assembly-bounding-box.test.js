import { describe, it, expect, beforeAll } from "vitest";
import { rectangle } from "../src/worker/shapes.ts";
import { extrude, move } from "../src/worker/actions.ts";
import { assembly } from "../src/worker/interaction.ts";
import { init } from "../src/worker/util.ts";

describe("assembly bounding-box metadata", () => {
  const context = { project: "test" };

  beforeAll(async () => {
    await init();
  });

  it("stores bounding boxes on assemblies and sub-assemblies", async () => {
    const base = await extrude(await rectangle(10, 10, context), 5, context);
    const moved = await move(
      await extrude(await rectangle(10, 10, context), 5, context),
      50,
      0,
      0,
      context,
    );
    const grouped = await assembly([base, moved], context);

    expect(grouped.boundingBox).toBeDefined();
    expect(grouped.boundingBox.min[0]).toBeLessThan(grouped.boundingBox.max[0]);
    expect(grouped.geometry[0].boundingBox).toBeDefined();
    expect(grouped.geometry[1].boundingBox).toBeDefined();
  });

  it("updates assembly bounding box after moving the assembly", async () => {
    const base = await extrude(await rectangle(10, 10, context), 5, context);
    const moved = await move(
      await extrude(await rectangle(10, 10, context), 5, context),
      20,
      0,
      0,
      context,
    );
    const grouped = await assembly([base, moved], context);
    const shifted = await move(grouped, 15, 0, 0, context);

    expect(shifted.boundingBox).toBeDefined();
    expect(shifted.boundingBox.min[0]).toBeCloseTo(
      grouped.boundingBox.min[0] + 15,
      4,
    );
    expect(shifted.boundingBox.max[0]).toBeCloseTo(
      grouped.boundingBox.max[0] + 15,
      4,
    );
  });
});
