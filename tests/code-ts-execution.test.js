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
import { init } from "../src/worker/util.ts";
import { executeCode } from "../src/worker/code.ts";

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
});
