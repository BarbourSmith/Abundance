/**
 * Legacy (JavaScript) Code atoms see geometry types as they were when they
 * were written: a `dimension` field named "2D", "3D", "Wire", "Point3D" or
 * "Face". Everywhere else the field is `geometryType`, named for the
 * representation ("replicad.Drawing", "replicad.Shape3D", ...). The legacy
 * executor converts between the two where values enter and leave user code.
 *
 * Run: npx vitest run --config=vitest.headless.config.ts tests/legacy-code-geometry-types.test.js
 */
import { beforeAll, describe, expect, it } from "vitest";
import { flattenAssembly, init } from "../src/worker/util.ts";
import { executeCode } from "../src/worker/code.ts";
import { rectangle } from "../src/worker/shapes.ts";
import { extrude } from "../src/worker/actions.ts";

const LEGACY = 0;
const PROJECT = "legacy-types";

/** Run legacy code. Geometry inputs are library ids, as in the editor. */
const run = (code, args) =>
  executeCode(code, args, { project: PROJECT }, LEGACY, "MM", "legacy-types");

describe("legacy Code atoms and geometry types", () => {
  let sketch;
  let solid;

  beforeAll(async () => {
    await init();
    const context = { project: PROJECT };
    sketch = await rectangle(6, 4, context);
    solid = await extrude(sketch, 3, context);
  });

  it("see inputs, and helper results, with the old dimension names", async () => {
    const seen = await run(
      `const moved = await Move(Shape, 1, 0, 0);
       return [library[Shape].dimension, library[Shape].geometryType === undefined,
               library[Sketch].dimension, moved.dimension].join(",");`,
      { Shape: solid, Sketch: sketch },
    );
    expect(seen).toBe("3D,true,2D,3D");
  });

  it("branch on the old names, and their results get the current names", async () => {
    const result = await run(
      `const input = library[Shape];
       if (input.dimension !== "3D") throw new Error("expected 3D, got " + input.dimension);
       return input;`,
      { Shape: solid },
    );
    expect(flattenAssembly(result).map((leaf) => leaf.geometryType)).toEqual([
      "replicad.Shape3D",
    ]);
    expect(JSON.stringify(result)).not.toContain('"dimension"');
  });

  it("can set dimension by its old name on what they build", async () => {
    const result = await run(
      `return {
         geometry: [replicad.drawRectangle(5, 5)],
         plane: library[Sketch].plane,
         dimension: "2D",
         color: "#ff0000",
         tags: [],
         bom: [],
       };`,
      { Sketch: sketch },
    );
    expect(result.geometryType).toBe("replicad.Drawing");
    expect(result).not.toHaveProperty("dimension");
  });

  it("see old names in AssemblyMap callbacks", async () => {
    const seen = await run(
      `const names = [];
       await AssemblyMap(library[Shape], (leaf) => { names.push(leaf.dimension); return leaf; });
       return names.join(",");`,
      { Shape: solid },
    );
    expect(seen).toBe("3D");
  });
});
