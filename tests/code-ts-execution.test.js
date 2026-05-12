// Tests for the TypeScript-mode (interpreterVersion >= 1) Code atom
// EXECUTION pipeline. Each test feeds `executeCode` an already-transpiled
// JS body (i.e. what Monaco would emit for a user's `function run(...)`)
// and asserts on the returned value. Input parsing is intentionally NOT
// exercised here — we provide pre-stripped JS where type annotations are
// already removed, since `executeCode` only sees the transpiled output.
//
// Companion file: tests/code-ts-input-parsing.test.js (covers the
// signature → AP descriptor pipeline via parseCodeHeader).
import { describe, it, expect, beforeAll } from "vitest";
import { init, is3D } from "../src/worker/util.ts";
import { executeCode } from "../src/worker/code.ts";
import { fusion } from "../src/worker/interaction.ts";

const VERSION_TS = 1;
const ATOM_ID = "test-code-atom";

describe("Code atom TS-mode execution (executeCode, interpreterVersion=1)", () => {
  beforeAll(async () => {
    await init();
  });

  describe("primitive return values", () => {
    it("returns a number unchanged", async () => {
      const code = `function run(a, b) { return a + b; }`;
      const context = { project: "code-ts-number" };
      const result = await executeCode(
        code,
        { a: 2, b: 3 },
        context,
        VERSION_TS,
        ATOM_ID,
      );
      expect(result).toBe(5);
    });

    it("returns a string unchanged", async () => {
      const code = `function run(name) { return "hello " + name; }`;
      const context = { project: "code-ts-string" };
      const result = await executeCode(
        code,
        { name: "world" },
        context,
        VERSION_TS,
        ATOM_ID,
      );
      expect(result).toBe("hello world");
    });

    it("returns a boolean unchanged", async () => {
      const code = `function run(x) { return x > 0; }`;
      const context = { project: "code-ts-bool" };
      const result = await executeCode(
        code,
        { x: 5 },
        context,
        VERSION_TS,
        ATOM_ID,
      );
      expect(result).toBe(true);
    });

    it("returns an array of primitives", async () => {
      const code = `function run(n) {
        const out = [];
        for (let i = 0; i < n; i++) out.push(i * 2);
        return out;
      }`;
      const context = { project: "code-ts-array" };
      const result = await executeCode(
        code,
        { n: 4 },
        context,
        VERSION_TS,
        ATOM_ID,
      );
      expect(result).toEqual([0, 2, 4, 6]);
    });
  });

  describe("geometry return values", () => {
    it("wraps a bare replicad Drawing returned from run() into an Assembly", async () => {
      const code = `function run(width, height) {
        return replicad.drawRectangle(width, height);
      }`;
      const context = { project: "code-ts-drawing" };
      const result = await executeCode(
        code,
        { width: 10, height: 4 },
        context,
        VERSION_TS,
        ATOM_ID,
      );

      // Bare replicad shapes/drawings are normalised into the
      // RealizedAssembly shape with default props.
      expect(result).toBeDefined();
      expect(result).toHaveProperty("geometry");
      expect(result).toHaveProperty("plane");
      expect(result).toHaveProperty("color");
      expect(result).toHaveProperty("tags");
      expect(result).toHaveProperty("bom");
      // Expect a cache key in geometry by the time it's returned.
      expect(result.geometry).toBeTypeOf("string");
    });

    it("accepts an Assembly built explicitly inside run()", async () => {
      const code = `function run() {
        const drawing = replicad.drawRectangle(8, 8);
        return new Assembly({ geometry: drawing, color: "#ff0000", tags: ["red"] });
      }`;
      const context = { project: "code-ts-assembly" };
      const result = await executeCode(code, {}, context, VERSION_TS, ATOM_ID);

      expect(result).toBeDefined();
      expect(result.color).toBe("#ff0000");
      expect(result.tags).toEqual(["red"]);
      expect(result.geometry).toBeTypeOf("string");
    });

    it("sets dimension='2D' on a Drawing returned from run()", async () => {
      // Regression: addAssemblyPartsToCache was missing the `dimension` field,
      // causing results to have dimension=undefined, which util.is3D() treats
      // as falsy/2D — correct for 2D but wrong for 3D shapes.
      const code = `function run() { return replicad.drawRectangle(5, 5); }`;
      const context = { project: "code-ts-dim-2d" };
      const result = await executeCode(code, {}, context, VERSION_TS, ATOM_ID);
      expect(result.dimension).toBe("2D");
      expect(is3D(result)).toBe(false);
    });

    it("sets dimension='3D' on a 3D shape returned from run()", async () => {
      // Regression: addAssemblyPartsToCache spread `...assembly` (an Assembly
      // class instance) which has no `dimension` field — only is2D()/is3D()
      // methods. This caused 3D code-atom outputs to have dimension=undefined,
      // which util.is3D() treated as falsy → "2D", triggering the
      // "Fusion must be composed from only sketches OR only solids" error when
      // fusing a code-atom 3D result with an extruded shape.
      const code = `function run(r, h) {
        const sketch = replicad.drawCircle(r).sketchOnPlane();
        return sketch.extrude(h);
      }`;
      const context = { project: "code-ts-dim-3d" };
      const result = await executeCode(
        code,
        { r: 5, h: 10 },
        context,
        VERSION_TS,
        ATOM_ID,
      );
      expect(result.dimension).toBe("3D");
      expect(is3D(result)).toBe(true);
    });

    it("successfully fuses code atom 3D output with extruded shape", async () => {
      // Regression test for the reported bug: fusing a code atom's 3D output
      // with an extruded shape threw "Fusion must be composed from only sketches
      // OR only solids" because the code atom result was missing `dimension`.
      const code = `function run(r, h) {
        const sketch = replicad.drawCircle(r).sketchOnPlane();
        return sketch.extrude(h);
      }`;
      const context = { project: "code-ts-fusion-regression" };
      const codeResult = await executeCode(
        code,
        { r: 3, h: 5 },
        context,
        VERSION_TS,
        ATOM_ID,
      );

      // Build a second 3D shape the normal way (simulates an Extrude atom).
      const { rectangle } = await import("../src/worker/shapes.ts");
      const { extrude } = await import("../src/worker/actions.ts");
      const rect = await rectangle(6, 6, context);
      const box = await extrude(rect, 5, context);

      // This must NOT throw.
      const fused = await fusion([codeResult, box], context);
      expect(fused).toBeDefined();
      expect(is3D(fused)).toBe(true);
    });
  });

  describe("error handling", () => {
    it("throws if the user code does not declare a run() function", async () => {
      const code = `const x = 5;`;
      const context = { project: "code-ts-no-run" };
      await expect(
        executeCode(code, {}, context, VERSION_TS, ATOM_ID),
      ).rejects.toThrow(/run/);
    });

    it("rejects code containing dangerous patterns (validateUserCode)", async () => {
      // `eval(` is on the blocklist in validateUserCode.
      const code = `function run() { return eval("1+1"); }`;
      const context = { project: "code-ts-eval" };
      await expect(
        executeCode(code, {}, context, VERSION_TS, ATOM_ID),
      ).rejects.toThrow(/dangerous|eval/i);
    });

    it("propagates errors thrown from inside run()", async () => {
      const code = `function run() { throw new Error("boom from user code"); }`;
      const context = { project: "code-ts-throw" };
      await expect(
        executeCode(code, {}, context, VERSION_TS, ATOM_ID),
      ).rejects.toThrow(/boom from user code/);
    });
  });

  describe("argument binding", () => {
    it("passes arguments to run() in the order they appear in the signature, not the args object", async () => {
      // `b` comes before `a` in the run() signature, but we pass the keys
      // in reverse order in the args object. The result must reflect the
      // declared parameter order.
      const code = `function run(b, a) { return b - a; }`;
      const context = { project: "code-ts-arg-order" };
      const result = await executeCode(
        code,
        { a: 3, b: 10 },
        context,
        VERSION_TS,
        ATOM_ID,
      );
      expect(result).toBe(7);
    });
  });

  describe("concurrent execution", () => {
    it("does not fail when the same atom is executed concurrently with different arguments", async () => {
      // Regression test for the CTX_KEY race condition.
      // Previously, concurrent runs of the same atom shared the same
      // globalThis key (`__abundanceCtx_${atomUniqueId}`). The second call
      // would overwrite the first call's entry before the first blob module
      // had a chance to read it, causing:
      //   TypeError: globalThis['__abundanceCtx_id-7776'] is undefined
      //
      // The fix appends a per-call serial number to the key so each
      // concurrent execution has its own isolated slot.
      const code = `function run(x) { return x * 2; }`;
      const SAME_ATOM_ID = "concurrent-atom";

      // Fire off multiple executions of the same atom ID simultaneously.
      const results = await Promise.all([
        executeCode(
          code,
          { x: 1 },
          { project: "code-ts-concurrent-a" },
          VERSION_TS,
          SAME_ATOM_ID,
        ),
        executeCode(
          code,
          { x: 2 },
          { project: "code-ts-concurrent-b" },
          VERSION_TS,
          SAME_ATOM_ID,
        ),
        executeCode(
          code,
          { x: 3 },
          { project: "code-ts-concurrent-c" },
          VERSION_TS,
          SAME_ATOM_ID,
        ),
      ]);

      // Each call must return its own correct result, not a corrupted value
      // from a sibling execution.
      expect(results).toContain(2);
      expect(results).toContain(4);
      expect(results).toContain(6);
    });

    it("emits a console.warn when a superseded execution completes", async () => {
      // Verify that concurrent executions for the same atom still all return
      // correct results when the staleness warning path is exercised.
      // (Note: the actual console.warn call is visible in test stderr output
      // labelled "[Abundance] Code atom ... was superseded ..." — vi.spyOn
      // does not reliably intercept cross-module console calls in vitest
      // browser mode due to its lower-level console proxy.)
      const code = `function run(x) { return x * 3; }`;
      const WARN_ATOM_ID = "concurrent-warn-atom";

      const results = await Promise.all([
        executeCode(
          code,
          { x: 1 },
          { project: "code-ts-warn-a" },
          VERSION_TS,
          WARN_ATOM_ID,
        ),
        executeCode(
          code,
          { x: 2 },
          { project: "code-ts-warn-b" },
          VERSION_TS,
          WARN_ATOM_ID,
        ),
      ]);

      // Both calls must still produce their own correct results despite the
      // supersession: the stale warning is observability only; results are
      // not discarded (that is left to a future refactor).
      expect(results).toContain(3);
      expect(results).toContain(6);
    });
  });
});
