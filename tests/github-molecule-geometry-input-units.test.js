/**
 * Geometry wired into a GitHub molecule made in other units is converted into
 * the molecule's units when it scales its output, so a shape passing through
 * keeps its real size. Numbers aren't converted: they may not be lengths.
 *
 * Run: npx vitest run --config=vitest.headless.config.ts tests/github-molecule-geometry-input-units.test.js
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import "../src/prototypes/attachmentpoint.js";
import Input from "../src/molecules/input.js";
import GlobalVariables from "../src/js/globalvariables.js";
import { Status } from "../src/prototypes/observableEntity.js";

const shape = { geometry: "a-shape", tags: [], bom: [] };

/** An MM GitHub molecule inside an Inches project. */
function mmMoleculeInInches(scaleToProjectUnits) {
  return {
    unitsKey: "MM",
    getHostUnits: () => "Inches",
    getOutputScaleFactor: () => (scaleToProjectUnits ? 1 / 25.4 : null),
    getContext: () => ({ project: "test" }),
    getAtomPath: () => "molecule",
    // The molecule's port for the input, fed whatever is wired to it
    addIO: () => ({ subscribe: () => {}, getState: () => ({}) }),
  };
}

function inputFed(parent, value) {
  const input = new Input({
    x: 0.1,
    y: 0.1,
    name: "Shape",
    uniqueID: GlobalVariables.generateUniqueID(),
    parent,
  });
  input.getContext = () => ({ project: "test" });
  input.parentAP.getState = () => ({ status: Status.READY, value });
  input.status = Status.WAITING; // as once its molecule enables it
  return input;
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  GlobalVariables.cad = {
    scale: vi.fn(async (value, factor) => ({ ...value, scaledBy: factor })),
  };
});

describe("Geometry wired into a GitHub molecule", () => {
  it("is converted into the molecule's units when it scales its output", async () => {
    const input = inputFed(mmMoleculeInInches(true), shape);
    input.onUpstreamChange();
    await settle();

    const [scaled, factor] = GlobalVariables.cad.scale.mock.calls[0];
    expect(scaled).toBe(shape);
    expect(factor).toBeCloseTo(25.4);
    expect(input.status).toBe(Status.READY);
    expect(input.value.scaledBy).toBeCloseTo(25.4);
  });

  it("passes through unchanged when the molecule doesn't scale", async () => {
    const input = inputFed(mmMoleculeInInches(false), shape);
    input.onUpstreamChange();
    await settle();

    expect(GlobalVariables.cad.scale).not.toHaveBeenCalled();
    expect(input.value).toBe(shape);
  });

  it("leaves numbers alone", async () => {
    const input = inputFed(mmMoleculeInInches(true), 4);
    input.onUpstreamChange();
    await settle();

    expect(GlobalVariables.cad.scale).not.toHaveBeenCalled();
    expect(input.value).toBe(4);
  });

  it("drops a conversion that finishes after a newer value arrived", async () => {
    let finishFirst;
    GlobalVariables.cad.scale = vi
      .fn()
      .mockImplementationOnce(
        () => new Promise((resolve) => (finishFirst = resolve)),
      )
      .mockImplementation(async (value, factor) => ({ ...value, scaledBy: factor }));
    const input = inputFed(mmMoleculeInInches(true), shape);
    input.onUpstreamChange();
    const newer = { ...shape, geometry: "newer" };
    input.parentAP.getState = () => ({ status: Status.READY, value: newer });
    input.onUpstreamChange();
    await settle();
    finishFirst({ ...shape, scaledBy: "stale" });
    await settle();

    expect(input.value.geometry).toBe("newer");
  });
});
