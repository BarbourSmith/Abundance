/**
 * A geometry input with nothing wired to it waits (shown blue) when its
 * molecule enables it, rather than becoming ready with the "__GEOMETRY_INPUT__"
 * placeholder a save stores and running the molecule on nothing.
 *
 * Run: npx vitest run --config=vitest.headless.config.ts tests/input-unwired-geometry-waits.test.js
 */
import { describe, expect, it } from "vitest";
import "../src/prototypes/attachmentpoint.js";
import Input from "../src/molecules/input.js";
import GlobalVariables from "../src/js/globalvariables.js";
import { Status } from "../src/prototypes/observableEntity.js";

function disabledInputWhosePortHolds(value) {
  const port = { subscribe: () => {}, connectors: [], getState: () => ({ value }) };
  const input = new Input({
    x: 0.1,
    y: 0.1,
    name: "Shape",
    uniqueID: GlobalVariables.generateUniqueID(),
    parent: { addIO: () => port },
  });
  input.status = Status.DISABLED;
  return input;
}

describe("Enabling an input inside a molecule", () => {
  it("waits when its geometry port only holds the save placeholder", () => {
    const input = disabledInputWhosePortHolds("__GEOMETRY_INPUT__");
    input.enable();
    expect(input.status).toBe(Status.WAITING);
  });

  it("is ready with a real value", () => {
    const input = disabledInputWhosePortHolds(7);
    input.enable();
    expect(input.status).toBe(Status.READY);
    expect(input.value).toBe(7);
  });
});
