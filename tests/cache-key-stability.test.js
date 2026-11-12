// Results found in the cache must equal the results computed the first time.
// Assemblies and Code atoms find their cached results by hashing their
// inputs, so if a value differs between being computed and being found,
// everything downstream recomputes on the next load. On Maslow_Mini this made
// the first reload after any computation take ~90s instead of ~5s.
//
// Run: npx vitest run --config=vitest.headless.config.ts tests/cache-key-stability.test.js
import { beforeAll, describe, expect, it, vi } from "vitest";
import "../src/prototypes/attachmentpoint.js";
import { assembly, difference } from "../src/worker/interaction.ts";
import { rectangle } from "../src/worker/shapes.ts";
import { extrude, move } from "../src/worker/actions.ts";
import * as util from "../src/worker/util.ts";
import Color from "../src/molecules/color.js";

let projectCount = 0;
const newContext = () => ({ project: `cache-key-${Date.now()}-${projectCount++}` });

async function box(size, context) {
  return extrude(await rectangle(size, size, context), size, context);
}

beforeAll(async () => {
  await util.init();
});

describe("Assembly cache keys", () => {
  it("returns the same value from the cache as when it computed it", async () => {
    const context = newContext();
    // A Difference of an assembly is a branch built by actOnLeafs, the case
    // that used to add an empty {} to the assembly's label list.
    const pair = await assembly(
      [await box(10, context), await move(await box(10, context), 5, 0, 0, context)],
      context,
    );
    // Branches from other atoms (and older saves) often have no label list.
    delete pair.nonReplicadSerialized;
    const cut = await difference(pair, await box(4, context), context);
    const inputs = [cut, await move(await box(6, context), 0, 3, 0, context)];

    const computed = await assembly(structuredClone(inputs), context);
    const cached = await assembly(structuredClone(inputs), context);

    expect(JSON.stringify(cached)).toBe(JSON.stringify(computed));
    expect(computed.nonReplicadSerialized).toEqual([]);
  });

  it("finds its cached result when an input's bounding box differs", async () => {
    const context = newContext();
    const inputs = [await box(10, context), await move(await box(10, context), 5, 0, 0, context)];
    const first = await assembly(structuredClone(inputs), context);

    const cut = vi.spyOn(util.geometryProvider, "cut");
    try {
      const shifted = structuredClone(inputs);
      shifted[0].boundingBox = { min: [0, 0, 0], max: [0, 0, 0] };
      const second = await assembly(shifted, context);
      expect(cut).not.toHaveBeenCalled();
      expect(second.geometry.map((g) => g.geometry)).toEqual(
        first.geometry.map((g) => g.geometry),
      );
    } finally {
      cut.mockRestore();
    }
  });
});

describe("collectNonReplicadSerialized", () => {
  it("drops empty entries and keeps single items", () => {
    const label = { type: "Label", text: "a" };
    expect(
      util.collectNonReplicadSerialized([
        { nonReplicadSerialized: [{}, label] },
        { nonReplicadSerialized: {} },
        { nonReplicadSerialized: label },
        {},
      ]),
    ).toEqual([label, label]);
  });
});

describe("Color", () => {
  it("adds the keepout tag without changing its input", async () => {
    const leaf = {
      geometry: "some-shape",
      tags: ["part"],
      color: "#aad7f2",
      plane: util.XYPlane,
    };
    const input = { geometry: [leaf], tags: [], plane: util.XYPlane };
    const atom = { colorOptions: { Red: "#D9544D" }, selectedColorIndex: 0 };

    const result = await Color.prototype.compute.call(atom, { geometry: input });

    expect(result.geometry[0].tags).toEqual(["part", "keepout"]);
    expect(leaf.tags).toEqual(["part"]);
  });
});
