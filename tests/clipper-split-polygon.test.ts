import { describe, expect, it } from "vitest";

describe("vendored Clipper", () => {
  it("unions polygons that split one output polygon in two without hanging", async () => {
    // Four quads from the no-fit polygon of two identical rounded rectangles.
    // Joining their common edges splits an output polygon in two; the port then
    // compared the new fragment with itself, made it its own FirstLeft, and
    // looped forever walking that chain.
    const quads = [
      [[25350, -65278], [25548, -65476], [25548, -198], [25350, 0]],
      [[25152, -65476], [25350, -65278], [25350, 0], [25152, -198]],
      [[25350, -65674], [25548, -65476], [25350, -65278], [25152, -65476]],
      [[50879, -65674], [51077, -65476], [25548, -65476], [25350, -65674]],
    ];
    const worker = new Worker(
      new URL("./fixtures/clipper-union.worker.ts", import.meta.url),
      { type: "module" },
    );
    try {
      const result = await new Promise<number[][][] | "timeout">((resolve) => {
        const timer = setTimeout(() => resolve("timeout"), 10000);
        worker.onmessage = (event) => {
          clearTimeout(timer);
          resolve(event.data);
        };
        worker.postMessage(quads);
      });
      expect(result).not.toBe("timeout");
      expect((result as number[][][]).length).toBeGreaterThan(0);
    } finally {
      worker.terminate();
    }
  }, 30000);
});
