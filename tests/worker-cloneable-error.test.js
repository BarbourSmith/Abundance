// Values thrown in the CAD worker must survive Comlink's trip to the main
// thread. OpenCascade failures arrive as WebAssembly.Exception objects, which
// can't be cloned, so users saw "TypeError: Unserializable return value"
// instead of the failure (a 75 mm fillet on 12.5 mm plywood in Dinosaur_Sign).
import { describe, it, expect, beforeAll } from "vitest";
import * as replicad from "replicad";
import { init, toCloneableError } from "../src/worker/util.ts";

function failedFillet() {
  // A 75 mm fillet on the 12.5 mm edges of a board can't be built.
  const board = replicad.makeBaseBox(12.5, 100, 100);
  try {
    board.fillet(75, (e) => e.inDirection("X"));
  } catch (error) {
    return error;
  }
  throw new Error("expected the fillet to fail");
}

describe("toCloneableError", () => {
  beforeAll(async () => {
    await init();
  });

  it("names the OpenCascade exception behind a failed operation", () => {
    const thrown = failedFillet();
    expect(() => structuredClone(thrown)).toThrow();

    const error = toCloneableError(thrown);

    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe(
      "OpenCascade failed: StdFail_NotDone (BRep_API: command not done)",
    );
    expect(() => structuredClone(error)).not.toThrow();
  });

  it("returns Errors unchanged", () => {
    const error = new Error("Must connect a shape to this atom");
    expect(toCloneableError(error)).toBe(error);
  });

  it("describes raw OpenCascade error codes", () => {
    expect(toCloneableError(1234).message).toBe(
      "OpenCascade kernel error code: 1234",
    );
  });

  it("keeps other values that can already be sent", () => {
    expect(toCloneableError("plain message")).toBe("plain message");
  });

  it("stringifies other values that can't be sent", () => {
    const error = toCloneableError({ toString: () => "odd", fn: () => {} });
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe("odd");
  });
});
