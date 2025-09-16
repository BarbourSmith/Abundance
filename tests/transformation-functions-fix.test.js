// Test that all transformation functions handle undefined inputs correctly after the fix
import { beforeAll, describe, it, expect, vi } from "vitest";
import { init } from "../src/worker/util.js";
import { move, rotate, scale, fillet, chamfer } from "../src/worker/worker.js";

describe("All transformation functions handle undefined inputs correctly", () => {
  beforeAll(async () => {
    await init();
  });

  const transformationFunctions = [
    { name: "move", fn: move, args: [undefined, 1, 2, 3, "target"] },
    { name: "rotate", fn: rotate, args: [undefined, 45, 0, 0, "target"] },
    { name: "scale", fn: scale, args: [undefined, 2.0, "target"] },
    { name: "fillet", fn: fillet, args: [undefined, 0.5, "target"] },
    { name: "chamfer", fn: chamfer, args: [undefined, 0.5, "target"] },
  ];

  transformationFunctions.forEach(({ name, fn, args }) => {
    it(`should handle undefined input gracefully in ${name} operation`, async () => {
      const consoleSpy = vi.spyOn(console, 'warn');
      consoleSpy.mockImplementation(() => {});

      try {
        await fn(...args);
        expect.fail(`${name} should have thrown an error`);
      } catch (error) {
        // All should now have clear error messages
        expect(error.message).toContain(`Failed to ${name === "fillet" || name === "chamfer" ? `apply ${name}` : `${name} geometry`}`);
        expect(error.message).toContain("value cannot be interpreted as geometry");
        expect(error.message).not.toContain("can't access property");
        expect(error.message).not.toContain("r is undefined");
      }

      consoleSpy.mockRestore();
    });
  });

  it("should handle null inputs for all transformation functions", async () => {
    for (const { name, fn, args } of transformationFunctions) {
      const consoleSpy = vi.spyOn(console, 'warn');
      consoleSpy.mockImplementation(() => {});

      try {
        // Replace undefined with null
        const nullArgs = [...args];
        nullArgs[0] = null;
        await fn(...nullArgs);
        expect.fail(`${name} should have thrown an error for null input`);
      } catch (error) {
        expect(error.message).toContain("value cannot be interpreted as geometry");
        expect(error.message).not.toContain("can't access property");
      }

      consoleSpy.mockRestore();
    }
  });
});