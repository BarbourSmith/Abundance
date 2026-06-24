import { beforeAll, describe, expect, it, vi } from "vitest";

import { move } from "../src/worker/actions";
import { layout } from "../src/worker/cutlayout";
import { RequestContext } from "../src/worker/geometryProvider";
import { rectangle } from "../src/worker/shapes";
import { assemblyOf, flattenAssembly, init } from "../src/worker/util";

describe("cutlayout integration", () => {
  beforeAll(async () => {
    await init();
  });

  it("runs real layout path for two moved 10x10 drawings", async () => {
    const traceSpy = vi.spyOn(console, "trace").mockImplementation(() => {});

    try {
      const context: RequestContext = {
        project: `cutlayout-integration-${Date.now()}`,
      };

      const rectA = await rectangle(10, 10, context);
      const rectB = await rectangle(10, 10, context);
      const rectBMoved = await move(rectB, 100, 0, 0, context);

      const inputAssembly = assemblyOf([rectA, rectBMoved]);
      const inputLeafIds = flattenAssembly(inputAssembly).map(
        (leaf) => leaf.geometry,
      );

      const [transformedAssembly, placements] = await layout(
        inputAssembly,
        () => {
          // progress callback
        },
        () => {
          // warning callback
        },
        () => {
          // placements callback
        },
        {
          width: 300,
          height: 300,
          partPadding: 1,
          rotations: 4,
        },
        context,
      );

      expect(transformedAssembly).toBeDefined();
      expect(Array.isArray(placements)).toBe(true);
      expect(placements).toHaveLength(1);
      expect(Array.isArray(placements[0])).toBe(true);
      expect(placements[0].length).toBeGreaterThan(0);

      const transformedLeafs = flattenAssembly(transformedAssembly);
      expect(transformedLeafs).toHaveLength(2);
      expect(
        transformedLeafs.some(
          (leaf, index) => leaf.geometry !== inputLeafIds[index],
        ),
      ).toBe(true);

      const traceMessages = traceSpy.mock.calls.map((call) => String(call[0]));
      expect(traceMessages).not.toContain("Error in worker thread");
    } finally {
      traceSpy.mockRestore();
    }
  }, 90000);
});
