import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { CODE_ATOM_GUIDE_PATH } from "../mcpServer.js";
import { lintCodeAtom, MANY_PRIMITIVES } from "../codeAtomLint.js";

describe("lintCodeAtom", () => {
  it("refuses boxes, cylinders, moves, and booleans", () => {
    const { refuse } = lintCodeAtom(`function run(): Assembly {
      let g = replicad.makeCylinder(46, 90, [0, 0, 55], [0, 0, 1]);
      for (let z = 64; z < 138; z += 9) {
        g = g.fuse(replicad.drawRoundedRectangle(112, 108, 10).sketchOnPlane("XY", z).extrude(3));
      }
      g = g.rotate(25, [0, 0, 0], [0, 1, 0]).translate(0, 0, 106);
      return new Assembly({ geometry: g });
    }`);
    expect(refuse).toMatch(/built-in atoms already do/);
    expect(refuse).toContain("rotate → Rotate");
    expect(refuse).toContain(
      "drawRoundedRectangle → a rounded rectangle library molecule",
    );
    expect(refuse).not.toContain("sketchOnPlane →");
  });

  it("allows code that draws custom outlines, revolves, or fillets", () => {
    for (const code of [
      "const o = replicad.draw([0, 0]).lineTo([5, 0]).threePointArcTo([0, 0], [2, 3]).close();",
      'const k = replicad.draw([0, 0]).lineTo([5, 0]).close().sketchOnPlane("XZ").revolve();',
      "const b = replicad.makeBaseBox(5, 5, 5).fillet(1);",
      "const s = replicad.makeSphere(4).translate(1, 2, 3);",
    ]) {
      expect(lintCodeAtom(code).refuse).toBeNull();
    }
  });

  it("allows code with no geometry, such as calculations", () => {
    const result = lintCodeAtom(
      "function run(a: number = 1): number { return a * 2; }",
    );
    expect(result).toMatchObject({ refuse: null, advice: null });
  });

  it("ignores calls named in comments and strings", () => {
    const code = `// replicad.makeCylinder(1, 2)
      /* translate(1, 2, 3) */
      const label = "cut(";
      const o = replicad.draw([0, 0]).lineTo([1, 0]).close();`;
    expect(lintCodeAtom(code)).toMatchObject({
      refuse: null,
      primitives: {},
    });
  });

  it("doesn't mistake longer names for primitives", () => {
    const code =
      "const o = shortcut(1); rotateAll(); replicad.draw([0,0]).lineTo([1,0]);";
    expect(lintCodeAtom(code).primitives).toEqual({});
  });

  it("advises splitting code that also piles up primitive features", () => {
    const fins = Array.from(
      { length: MANY_PRIMITIVES },
      (_, i) =>
        `s = s.fuse(replicad.makeBaseBox(1, 1, 1).translate(${i}, 0, 0));`,
    ).join("\n");
    const { refuse, advice } = lintCodeAtom(
      `let s = replicad.draw([0, 0]).lineTo([1, 0]).lineTo([0, 1]).close().sketchOnPlane().extrude(1);\n${fins}`,
    );
    expect(refuse).toBeNull();
    expect(advice).toMatch(/built-in atoms in feature molecules/);
  });

  it("passes every complete example in the code atom guide", () => {
    const guide = fs.readFileSync(CODE_ATOM_GUIDE_PATH, "utf8");
    const examples = [...guide.matchAll(/```typescript\n([\s\S]*?)```/g)]
      .map((m) => m[1])
      .filter((code) => code.includes("function run("));
    expect(examples.length).toBeGreaterThan(5);
    for (const example of examples) {
      expect(lintCodeAtom(example).refuse, example).toBeNull();
    }
  });
});
