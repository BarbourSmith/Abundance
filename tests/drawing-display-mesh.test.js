// The 3D view shows a drawing by filling it, but a drawing can't always be
// filled as a whole. An SVG Export's projection of a part from below can come
// back as open fragments, down to a lone straight edge, which no face can be
// built on. The fill threw and the Export showed nothing. Such a drawing is
// now shown piece by piece, closed outlines filled and open ones as lines
// (src/worker/meshWorker.ts).
//
// Run: npx vitest run --config=vitest.headless.config.ts tests/drawing-display-mesh.test.js

import { describe, expect, it } from "vitest";
import * as replicad from "replicad";
import * as workerpool from "workerpool";
import MeshWorkerURL from "../src/worker/meshWorker.ts?url&worker";
import * as util from "../src/worker/util.ts";

const leaf2D = (id) => ({
  geometry: id,
  dimension: "2D",
  plane: util.XYPlane,
  color: "#fefffa",
  tags: [],
  bom: [],
});

describe("the mesh worker shows a drawing", () => {
  it("piece by piece when it can't be filled as a whole", async () => {
    await util.init(false);
    const context = { project: `drawing-mesh-${Date.now()}` };
    const closed = replicad.drawRectangle(20, 10);
    // A projection piece can be a lone straight edge, which no face can fill
    const open = replicad.draw([0, 20]).lineTo([30, 20]).done();
    const drawing = new replicad.Drawing(
      new replicad.Blueprints([closed.blueprint, open.blueprint]),
    );
    expect(() => drawing.sketchOnPlane("XY").extrude(0.0001)).toThrow();
    const id = await util.geometryProvider.addSingularToCache(
      drawing,
      context,
      "drawing-mesh-test",
      [],
    );

    const pool = workerpool.pool(MeshWorkerURL, {
      maxWorkers: 1,
      workerOpts: { type: "module" },
    });
    try {
      const { mesh } = await pool.exec("generateDisplayMesh", [
        leaf2D(id),
        context,
      ]);
      const filled = mesh.filter((m) => m.faces?.triangles.length);
      const linesOnly = mesh.filter((m) => !m.faces && m.edges?.lines.length);
      expect(filled).toHaveLength(1);
      expect(linesOnly).toHaveLength(1);
    } finally {
      await pool.terminate();
    }
  }, 60000);
});
