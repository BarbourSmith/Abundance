// Tests for the TypeScript-mode (interpreterVersion >= 1) Code atom input
// parsing. Verifies that when user code declares a `function run(...)`
// signature, the correct attachment-point descriptors (name, type,
// defaultValue, isOptional) are produced by parseCodeHeader.
//
// These tests target the pure parser (`parseCodeHeader`) directly rather
// than the molecule-level `Code.parseTsRunSignature()` wrapper so we don't
// need to wire up the full Atom / GlobalVariables environment. The wrapper
// just iterates over the parser's output and calls `_addIOWithoutSubscribing`
// per arg, so verifying the parser output is sufficient.
import { describe, it, expect } from "vitest";
import { parseCodeHeader } from "../src/molecules/utils/code-header-parser.js";

describe("Code atom TS input parsing (parseCodeHeader)", () => {
  describe("primitive parameter types", () => {
    it("maps `number` to a numeric input with the declared default", () => {
      const code = `function run(width: number = 25) { return width; }`;
      const args = parseCodeHeader(code);

      expect(args).toHaveLength(1);
      expect(args[0]).toEqual({
        name: "width",
        type: "number",
        isOptional: true,
        defaultValue: 25,
      });
    });

    it("maps `string` to a string input and unquotes the default literal", () => {
      const code = `function run(label: string = "hello") { return label; }`;
      const args = parseCodeHeader(code);

      expect(args).toHaveLength(1);
      expect(args[0]).toEqual({
        name: "label",
        type: "string",
        isOptional: true,
        defaultValue: "hello",
      });
    });

    it("maps `boolean` to a boolean input", () => {
      const code = `function run(flag: boolean = false) { return flag; }`;
      const args = parseCodeHeader(code);

      expect(args[0]).toEqual({
        name: "flag",
        type: "boolean",
        isOptional: true,
        defaultValue: false,
      });
    });

    it("treats a parameter with no default as required (isOptional=false)", () => {
      const code = `function run(width: number) { return width; }`;
      const args = parseCodeHeader(code);

      expect(args[0]).toMatchObject({
        name: "width",
        type: "number",
        isOptional: false,
        defaultValue: undefined,
      });
    });

    it("treats a `name?: T` parameter as optional", () => {
      const code = `function run(width?: number) { return width; }`;
      const args = parseCodeHeader(code);

      expect(args[0]).toMatchObject({
        name: "width",
        type: "number",
        isOptional: true,
      });
    });
  });

  describe("geometry parameter type", () => {
    it("maps `Assembly` to a geometry input with null default when no default given", () => {
      const code = `function run(shape: Assembly) { return shape; }`;
      const args = parseCodeHeader(code);

      expect(args).toHaveLength(1);
      expect(args[0]).toEqual({
        name: "shape",
        type: "geometry",
        // No default declared, but geometry inputs default to null
        // (= no upstream connection required).
        isOptional: false,
        defaultValue: null,
      });
    });
  });

  describe("multiple parameters", () => {
    it("parses ordered, mixed-type parameter lists", () => {
      const code = `
        function run(
          shape: Assembly,
          count: number = 3,
          spacing: number = 12,
          label: string = "row",
        ) { return shape; }
      `;
      const args = parseCodeHeader(code);

      expect(args.map((a) => a.name)).toEqual([
        "shape",
        "count",
        "spacing",
        "label",
      ]);
      expect(args.map((a) => a.type)).toEqual([
        "geometry",
        "number",
        "number",
        "string",
      ]);
      expect(args.map((a) => a.defaultValue)).toEqual([null, 3, 12, "row"]);
    });

    it("returns an empty array when run() has no parameters", () => {
      const code = `function run() { return 42; }`;
      expect(parseCodeHeader(code)).toEqual([]);
    });
  });

  describe("comments in the signature", () => {
    it("ignores a trailing line comment after a parameter's comma", () => {
      const code = `
        function run(
          seatHeight: number = 430, // slat tops in the middle
          rimHeight: number = 790,
        ): Assembly { return seatHeight; }
      `;
      const args = parseCodeHeader(code);

      expect(args).toEqual([
        {
          name: "seatHeight",
          type: "number",
          isOptional: true,
          defaultValue: 430,
        },
        {
          name: "rimHeight",
          type: "number",
          isOptional: true,
          defaultValue: 790,
        },
      ]);
    });

    it("ignores a line comment on its own line between parameters", () => {
      const code = `
        function run(
          width: number = 300,
          // Front to back, in mm. Don't exceed 600.
          depth: number = 200,
        ) { return width; }
      `;
      const args = parseCodeHeader(code);

      expect(args.map((a) => [a.name, a.defaultValue])).toEqual([
        ["width", 300],
        ["depth", 200],
      ]);
    });

    it("ignores block comments, including multi-line ones", () => {
      const code = `
        function run(
          /**
           * Overall width, in mm.
           */
          width: number = 300,
          height: number /* mm */ = 50,
        ) { return width; }
      `;
      const args = parseCodeHeader(code);

      expect(args.map((a) => [a.name, a.type, a.defaultValue])).toEqual([
        ["width", "number", 300],
        ["height", "number", 50],
      ]);
    });

    it("ignores brackets and commas inside comments", () => {
      // An unmatched `>` or `)` in a comment must not end the signature
      // early or late.
      const code = `
        function run(
          count: number = 3, // must be > 0
          shelves: number = 2, // 1) bottom, 2) top
        ) { return count; }
      `;
      const args = parseCodeHeader(code);

      expect(args.map((a) => [a.name, a.defaultValue])).toEqual([
        ["count", 3],
        ["shelves", 2],
      ]);
    });

    it("keeps // and /* inside string defaults", () => {
      const code = `
        function run(
          url: string = "https://example.com/parts", // where parts live
          pattern: string = 'src/*.ts',
        ) { return url; }
      `;
      const args = parseCodeHeader(code);

      expect(args.map((a) => [a.name, a.defaultValue])).toEqual([
        ["url", "https://example.com/parts"],
        ["pattern", "src/*.ts"],
      ]);
    });
  });

  describe("commas and brackets inside default values", () => {
    it("keeps commas and brackets inside string defaults", () => {
      const code = `
        function run(
          label: string = "a, b",
          open: string = "(",
          close: string = ")",
          arrow: string = '->',
          count: number = 3,
        ) { return label; }
      `;
      const args = parseCodeHeader(code);

      expect(args.map((a) => [a.name, a.defaultValue])).toEqual([
        ["label", "a, b"],
        ["open", "("],
        ["close", ")"],
        ["arrow", "->"],
        ["count", 3],
      ]);
    });

    it("keeps multi-element array defaults whole, even with brackets in strings", () => {
      const code = `
        function run(
          points: number[] = [1, 2, 3],
          tags: string[] = ["x]", "y, z"],
          count: number = 1,
        ) { return points; }
      `;
      const args = parseCodeHeader(code);

      expect(args).toEqual([
        {
          name: "points",
          type: "array",
          elementType: "number",
          isOptional: true,
          defaultValue: [1, 2, 3],
        },
        {
          name: "tags",
          type: "array",
          elementType: "string",
          isOptional: true,
          defaultValue: ["x]", "y, z"],
        },
        {
          name: "count",
          type: "number",
          isOptional: true,
          defaultValue: 1,
        },
      ]);
    });
  });

  describe("error handling", () => {
    it("throws if no run() function is declared", () => {
      expect(() => parseCodeHeader(`function foo(x: number) {}`)).toThrow(
        /run/,
      );
    });

    it("throws on an unsupported / missing type annotation", () => {
      // No annotation at all is unsupported in TS mode.
      expect(() => parseCodeHeader(`function run(x = 1) {}`)).toThrow(
        /type annotation/i,
      );
    });

    it("throws on an invalid numeric default literal", () => {
      expect(() =>
        parseCodeHeader(`function run(x: number = "oops") {}`),
      ).toThrow(/invalid number/i);
    });
  });
});
