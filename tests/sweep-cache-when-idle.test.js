// Saving sweeps the geometry cache down to the ids the atoms hold. Sweeping
// while the model is still computing deleted shapes an in-flight Assembly had
// just written, and its next read failed with "not found in cache". The sweep
// now waits until nothing is computing and takes its snapshot then.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import GlobalVariables from "../src/js/globalvariables.js";
import { Status } from "../src/prototypes/observableEntity.js";
import {
  SWEEP_MAX_WAIT_MS,
  SWEEP_RETRY_MS,
  sweepCacheWhenIdle,
} from "../src/js/modelActivity.js";

describe("sweepCacheWhenIdle", () => {
  let saved;
  let sweepCache;
  let atom;
  let topLevel;

  beforeEach(() => {
    vi.useFakeTimers();
    saved = {
      cad: GlobalVariables.cad,
      topLevelMolecule: GlobalVariables.topLevelMolecule,
    };
    sweepCache = vi.fn().mockResolvedValue(0);
    GlobalVariables.cad = { _pendingCalls: [], sweepCache };
    atom = { status: Status.READY };
    topLevel = {
      nodesOnTheScreen: [atom],
      geomIds: ["a"],
      deepGeomList() {
        return this.geomIds;
      },
      getContext: () => ({ project: "p" }),
      disable() {}, // the topLevelMolecule setter disables the previous one
    };
    GlobalVariables.topLevelMolecule = topLevel;
  });

  afterEach(() => {
    vi.useRealTimers();
    GlobalVariables.cad = saved.cad;
    GlobalVariables.topLevelMolecule = saved.topLevelMolecule;
  });

  it("sweeps right away when nothing is computing", () => {
    sweepCacheWhenIdle(topLevel);
    expect(sweepCache).toHaveBeenCalledWith(["a"], { project: "p" });
  });

  it("waits for computation to finish and sweeps the ids held then", () => {
    atom.status = Status.PROCESSING;
    sweepCacheWhenIdle(topLevel);
    expect(sweepCache).not.toHaveBeenCalled();

    // Still busy, now through a worker call rather than an atom.
    atom.status = Status.READY;
    GlobalVariables.cad._pendingCalls = [{}];
    vi.advanceTimersByTime(SWEEP_RETRY_MS);
    expect(sweepCache).not.toHaveBeenCalled();

    // The in-flight work has handed its new shape to an atom.
    GlobalVariables.cad._pendingCalls = [];
    topLevel.geomIds = ["a", "new-shape"];
    vi.advanceTimersByTime(SWEEP_RETRY_MS);
    expect(sweepCache).toHaveBeenCalledTimes(1);
    expect(sweepCache).toHaveBeenCalledWith(["a", "new-shape"], {
      project: "p",
    });
  });

  it("skips the sweep if another project is opened while waiting", () => {
    atom.status = Status.PROCESSING;
    sweepCacheWhenIdle(topLevel);
    GlobalVariables.topLevelMolecule = { ...topLevel };
    atom.status = Status.READY;
    vi.advanceTimersByTime(SWEEP_RETRY_MS * 3);
    expect(sweepCache).not.toHaveBeenCalled();
  });

  it("gives up if the model never stops computing", () => {
    atom.status = Status.PROCESSING;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    sweepCacheWhenIdle(topLevel);
    vi.advanceTimersByTime(SWEEP_MAX_WAIT_MS + SWEEP_RETRY_MS * 2);
    expect(sweepCache).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(
      "Skipping cache sweep: the model is still computing.",
    );
    expect(vi.getTimerCount()).toBe(0);
    warn.mockRestore();
  });
});
