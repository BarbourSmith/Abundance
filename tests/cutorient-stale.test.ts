import { beforeAll, describe, expect, it } from "vitest";

import { extrude } from "../src/worker/actions";
import { displayOrientation, orient } from "../src/worker/cutlayout";
import { RequestContext } from "../src/worker/geometryProvider";
import { circle, rectangle } from "../src/worker/shapes";
import { assemblyOf, init } from "../src/worker/util";

describe("Cut Orient saved orientations", () => {
  beforeAll(async () => {
    await init();
  });

  it("records face counts and rejects them once a part changes shape", async () => {
    const context: RequestContext = { project: `cutorient-${Date.now()}` };
    const board = await extrude(
      await rectangle(200, 100, context),
      19,
      context,
    );
    const disc = await extrude(await circle(80, context), 19, context);
    const config = { units: "MM" as const };

    const [, orientations] = await orient(assemblyOf([board]), config, context);
    expect(orientations).toEqual([expect.objectContaining({ faceCount: 6 })]);

    // Same number of parts, but the part is now a disc with 3 faces.
    await expect(
      displayOrientation(assemblyOf([disc]), orientations, config, context),
    ).rejects.toThrow(/no longer match the parts/);

    // Also when the changed part was displayed before and its result is cached.
    const [, discOrientations] = await orient(
      assemblyOf([disc]),
      config,
      context,
    );
    await displayOrientation(
      assemblyOf([disc]),
      discOrientations,
      config,
      context,
    );
    const staleForDisc = [
      {
        downwardFaceIndex: discOrientations[0].downwardFaceIndex,
        faceCount: 6,
      },
    ];
    await expect(
      displayOrientation(assemblyOf([disc]), staleForDisc, config, context),
    ).rejects.toThrow(/no longer match the parts/);

    // Unchanged parts still reuse their saved orientations.
    await expect(
      displayOrientation(assemblyOf([board]), orientations, config, context),
    ).resolves.toBeDefined();
  }, 90000);
});
