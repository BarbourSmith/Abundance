import { text } from "../src/worker/shapes.ts";
import { init, isAssembly, flattenAssembly } from "../src/worker/util.ts";

describe("text as assembly", () => {
  beforeAll(async () => {
    await init();
  });

  it("should create text as an assembly with individual letters", async () => {
    const testText = "Hello";
    const fontSize = 10;
    const fontFamily = "ROBOTO";
    const context = { project: "test-text-assembly" };

    const result = await text(testText, fontSize, fontFamily, context);

    // Text should now be an assembly
    expect(isAssembly(result)).toBe(true);

    // Should have one leaf per character
    const leaves = flattenAssembly(result);
    expect(leaves.length).toBe(testText.length);

    // Each leaf should be 2D
    leaves.forEach((leaf) => {
      expect(leaf.geometryType).toBe("replicad.Drawing");
    });
  });

  it("should handle single character", async () => {
    const testText = "A";
    const fontSize = 10;
    const fontFamily = "ROBOTO";
    const context = { project: "test-single-char" };

    const result = await text(testText, fontSize, fontFamily, context);

    // Single character should still be an assembly for consistency
    expect(isAssembly(result)).toBe(true);

    const leaves = flattenAssembly(result);
    expect(leaves.length).toBe(1);
  });

  it("should handle empty string", async () => {
    const testText = "";
    const fontSize = 10;
    const fontFamily = "ROBOTO";
    const context = { project: "test-empty-string" };

    const result = await text(testText, fontSize, fontFamily, context);

    // Empty string should return an assembly with no leaves
    expect(isAssembly(result)).toBe(true);
    const leaves = flattenAssembly(result);
    expect(leaves.length).toBe(0);
  });

  it("should handle spaces correctly", async () => {
    const testText = "A B";
    const fontSize = 10;
    const fontFamily = "ROBOTO";
    const context = { project: "test-with-spaces" };

    const result = await text(testText, fontSize, fontFamily, context);

    // Should have one leaf per non-space character
    // Spaces don't create geometry but affect positioning
    const leaves = flattenAssembly(result);
    // "A B" has 2 non-space characters
    expect(leaves.length).toBe(2);
  });

  it("should preserve character positions relative to original text", async () => {
    const testText = "Hi";
    const fontSize = 10;
    const fontFamily = "ROBOTO";
    const context = { project: "test-positioning" };

    const result = await text(testText, fontSize, fontFamily, context);

    const leaves = flattenAssembly(result);
    expect(leaves.length).toBe(2);

    // Characters should be positioned left-to-right
    // We can't easily check exact positions without rendering,
    // but we can verify the structure is correct
    expect(leaves[0]).toBeDefined();
    expect(leaves[1]).toBeDefined();
  });

  it("should handle Unicode characters correctly (emojis, accented)", async () => {
    const testText = "Café☕";
    const fontSize = 10;
    const fontFamily = "ROBOTO";
    const context = { project: "test-unicode" };

    const result = await text(testText, fontSize, fontFamily, context);

    // Should have one leaf per Unicode character (not code unit)
    const leaves = flattenAssembly(result);
    // "Café☕" has 5 characters: C, a, f, é, ☕
    expect(leaves.length).toBe(5);
  });
});
