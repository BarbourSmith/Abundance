// replicad's booleans can modify the shapes they are given: after the boolean
// it merges faces in the result, and a result that reuses an input's faces
// has them merged in place. Cutting this channel by the keepout that fills it
// changes nothing, and the merge reversed one of the channel's faces, leaving
// an invalid shape with ten times the volume. A cached shape cut this way was
// then saved over the stored one, so a Move further up showed the broken part.
//
// Run: npx vitest run --config=vitest.headless.config.ts tests/boolean-inputs-unchanged.test.js

import * as replicad from "replicad";
import { init, XYPlane } from "../src/worker/util.ts";
import { assembly } from "../src/worker/interaction.ts";
import { getShape, putShape } from "../src/worker/indexeddbUtils.ts";
import { isValidShape } from "../src/worker/geometryDiagnostics.ts";
import channelBrep from "./fixtures/channel-with-seam-face.brep?raw";
import keepoutBrep from "./fixtures/channel-keepout.brep?raw";

const CHANNEL_VOLUME = 4370.26;
const KEEPOUT_VOLUME = 22103.794;

function describe3D(shape) {
  return {
    valid: isValidShape(shape),
    volume: +replicad.measureVolume(shape).toFixed(3),
  };
}

function leaf(id, tags) {
  return {
    geometry: id,
    dimension: "3D",
    plane: XYPlane,
    color: "#aad7f2",
    tags,
    bom: [],
  };
}

describe("booleans leave their inputs unchanged", () => {
  beforeAll(async () => {
    await init();
  });

  it("cutting the channel by its keepout doesn't change either shape", () => {
    const channel = replicad.deserializeShape(channelBrep);
    const keepout = replicad.deserializeShape(keepoutBrep);
    expect(describe3D(channel)).toEqual({
      valid: true,
      volume: CHANNEL_VOLUME,
    });

    const result = channel.cut(keepout);

    expect(describe3D(result)).toEqual({ valid: true, volume: CHANNEL_VOLUME });
    expect(describe3D(channel)).toEqual({
      valid: true,
      volume: CHANNEL_VOLUME,
    });
    expect(describe3D(keepout)).toEqual({
      valid: true,
      volume: KEEPOUT_VOLUME,
    });
  });

  it("a cut through a clone doesn't change the original", () => {
    const channel = replicad.deserializeShape(channelBrep);
    const keepout = replicad.deserializeShape(keepoutBrep);

    channel.clone().cut(keepout.clone());

    expect(describe3D(channel)).toEqual({
      valid: true,
      volume: CHANNEL_VOLUME,
    });
  });

  it("an Assembly doesn't overwrite a stored shape it cut", async () => {
    const context = { project: `boolean-inputs-${Date.now()}` };
    await putShape(context.project, "channel", channelBrep);
    await putShape(context.project, "keepout", keepoutBrep);

    const result = await assembly(
      [leaf("channel", ["2d"]), leaf("keepout", ["keepout"])],
      context,
    );

    // The cut changes nothing, so the channel passes through under its own id
    expect(result.geometry.map((part) => part.geometry)).toContain("channel");
    const stored = await getShape(context.project, "channel");
    expect(describe3D(replicad.deserializeShape(stored.serialized))).toEqual({
      valid: true,
      volume: CHANNEL_VOLUME,
    });
  });
});
