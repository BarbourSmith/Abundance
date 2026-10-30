// OpenCascade 8 boolean builders keep their intersection data after delete()
// unless Clear() is called first, and replicad never calls it. Each boolean
// leaked a few hundred KB of WASM memory, so large projects ran the CAD worker
// out of memory in one build ("index out of bounds" in Firefox). The boolean
// workaround in src/worker/occtWorkarounds.ts frees them. Deleting a
// BRepCheck_Analyzer leaked the same way, so validity checks share one.
//
// Run: npx vitest run --config=vitest.headless.config.ts tests/boolean-memory.test.js

import { beforeAll, describe, expect, it } from "vitest";
import * as replicad from "replicad";
import * as util from "../src/worker/util.ts";
import { isValidShape } from "../src/worker/geometryDiagnostics.ts";

const MB = 1024 * 1024;

beforeAll(async () => {
  await util.init(false);
});

const plate = () =>
  replicad
    .makeBaseBox(200, 200, 20)
    .cut(replicad.makeCylinder(30, 100, [0, 0, -50]))
    .fillet(2);
const peg = () => replicad.makeCylinder(40, 100, [50, 50, -50]);

describe("3D booleans", () => {
  it("don't grow the WASM heap when repeated", () => {
    const a = plate();
    const b = peg();
    const repeat = (op, n) => {
      for (let i = 0; i < n; i++) op(a, b).delete();
    };
    const ops = [
      (x, y) => x.cut(y),
      (x, y) => x.fuse(y),
      (x, y) => x.intersect(y),
    ];
    // Let the heap reach its working size first.
    ops.forEach((op) => repeat(op, 20));
    const before = util.wasmHeapBytes();
    ops.forEach((op) => repeat(op, 150));
    const grownMB = (util.wasmHeapBytes() - before) / MB;
    // Leaking, 450 booleans of these shapes grew the heap by over 100 MB.
    expect(grownMB).toBeLessThan(30);
    a.delete();
    b.delete();
  }, 300_000);

  it("give the expected volumes", () => {
    const box = () => replicad.makeBaseBox(10, 10, 10);
    const shifted = () => replicad.makeBaseBox(10, 10, 10).translate([5, 0, 0]);
    expect(replicad.measureVolume(box().cut(shifted()))).toBeCloseTo(500, 3);
    expect(replicad.measureVolume(box().fuse(shifted()))).toBeCloseTo(1500, 3);
    expect(replicad.measureVolume(box().intersect(shifted()))).toBeCloseTo(
      500,
      3,
    );
    const glued = box().fuse(shifted(), { optimisation: "commonFace" });
    expect(replicad.measureVolume(glued)).toBeCloseTo(1500, 3);
  });

  it("merge faces that share a surface only when asked", () => {
    const fuse = (options) =>
      replicad
        .makeBaseBox(10, 10, 10)
        .fuse(replicad.makeBaseBox(10, 10, 10).translate([10, 0, 0]), options);
    expect(fuse().faces.length).toBeGreaterThan(6);
    expect(fuse({ simplify: true }).faces.length).toBe(6);
  });
});

describe("validity checks", () => {
  it("don't grow the WASM heap when repeated", () => {
    const shape = plate();
    for (let i = 0; i < 20; i++) isValidShape(shape);
    const before = util.wasmHeapBytes();
    for (let i = 0; i < 500; i++) isValidShape(shape);
    const grownMB = (util.wasmHeapBytes() - before) / MB;
    // Leaking, each check of a shape like this kept over 100 KB.
    expect(grownMB).toBeLessThan(10);
    shape.delete();
  }, 300_000);
});
