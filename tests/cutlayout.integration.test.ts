import { beforeAll, describe, expect, it, vi } from "vitest";

import { move } from "../src/worker/actions";
import {
  createAndDisplayDefaultLayout,
  displayLayout,
} from "../src/worker/cutlayout";
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

  it("moves parts for default placements and for hand edited placements", async () => {
    // Regression test: placements are keyed by the index of the part within the
    // assembly. When they were keyed by geometry id instead, applyLayout could
    // never match a placement to a leaf, so "Reset Layout" and typing positions
    // by hand both silently left every part where it was.
    const context: RequestContext = {
      project: `cutlayout-default-placements-${Date.now()}`,
    };
    const layoutConfig = {
      width: 300,
      height: 300,
      partPadding: 1,
      rotations: 4,
    };

    const rectA = await rectangle(10, 10, context);
    const rectB = await rectangle(20, 20, context);
    const inputAssembly = assemblyOf([rectA, rectB]);
    const inputLeafIds = flattenAssembly(inputAssembly).map(
      (leaf) => leaf.geometry,
    );

    const [defaultLayout, placements] = await createAndDisplayDefaultLayout(
      inputAssembly,
      () => {
        // warning callback
      },
      layoutConfig,
      context,
    );

    // One placement per part, keyed by part index.
    expect(placements).toHaveLength(1);
    expect(placements[0].map((placement) => placement.id)).toEqual([0, 1]);

    // Every part actually got transformed, so no leaf keeps its input geometry.
    const defaultLeafIds = flattenAssembly(defaultLayout).map(
      (leaf) => leaf.geometry,
    );
    expect(defaultLeafIds).toHaveLength(2);
    defaultLeafIds.forEach((id, index) => {
      expect(id).not.toEqual(inputLeafIds[index]);
    });

    // Editing a position by hand moves that part and leaves the other alone.
    placements[0][0].translate.x += 25;
    const editedLayout = await displayLayout(
      inputAssembly,
      placements,
      () => {
        // warning callback
      },
      layoutConfig,
      context,
    );
    const editedLeafIds = flattenAssembly(editedLayout).map(
      (leaf) => leaf.geometry,
    );
    expect(editedLeafIds[0]).not.toEqual(defaultLeafIds[0]);
    expect(editedLeafIds[1]).toEqual(defaultLeafIds[1]);
  }, 90000);
  it("reports a failure instead of stacking every part when nothing can be nested", async () => {
    // The nesting engine can fail to place anything (parts larger than the
    // sheet, or simply no result in the time budget). It used to fall back to
    // "every part at the centre of the sheet", which looks like a successful
    // layout and silently overwrites the placements the user already had.
    const context: RequestContext = {
      project: `cutlayout-unplaceable-${Date.now()}`,
    };
    const rectA = await rectangle(100, 200, context);
    const rectB = await rectangle(150, 300, context);
    const inputAssembly = assemblyOf([rectA, rectB]);

    await expect(
      layout(
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
        // A sheet far smaller than either part, so nothing can ever be placed.
        { width: 10, height: 10, partPadding: 1, rotations: 4 },
        context,
      ),
    ).rejects.toThrow(/could not place any parts/);
  }, 180000);
});
