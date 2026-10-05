// Tests for the display scheduler that fronts the single-worker mesh pool.
//
// It must collapse bursts of display requests to the latest one, never let a
// stale result reach a view, give the foreground priority over background
// wireframes, share one computation between views wanting the same geometry,
// and serve recently displayed meshes from cache.

import { describe, it, expect, vi } from "vitest";
import {
  DisplayScheduler,
  displayKey,
  meshKey,
} from "../src/js/displayScheduler.js";
import { MeshLruCache } from "../src/js/meshCache.js";

/** Fake worker pool whose tasks settle only when the test says so. */
function makeFakeExec() {
  const calls = [];
  const exec = vi.fn((method, args) => {
    let resolve;
    let reject;
    const promise = new Promise((res, rej) => {
      resolve = res;
      reject = rej;
    });
    calls.push({ method, args, resolve, reject });
    return promise;
  });
  return { exec, calls };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe("DisplayScheduler", () => {
  it("runs one task at a time and collapses a burst to the latest request", async () => {
    const { exec, calls } = makeFakeExec();
    const scheduler = new DisplayScheduler(exec);
    const shown = [];
    const show = (label) => (m) => shown.push(`${label}:${m}`);

    scheduler.request("foreground", { args: ["A"], key: "A", onResult: show("A") });
    scheduler.request("foreground", { args: ["B"], key: "B", onResult: show("B") });
    scheduler.request("foreground", { args: ["C"], key: "C", onResult: show("C") });

    // Only A started; B was replaced by C before it ever ran.
    expect(calls.map((c) => c.args[0])).toEqual(["A"]);

    calls[0].resolve("meshA");
    await flush();
    // A is stale (C is wanted now), so it is not delivered; C starts next.
    expect(shown).toEqual([]);
    expect(calls.map((c) => c.args[0])).toEqual(["A", "C"]);

    calls[1].resolve("meshC");
    await flush();
    expect(shown).toEqual(["C:meshC"]);
    expect(scheduler.isBusy()).toBe(false);
  });

  it("gives the foreground priority over background and top-level slots", async () => {
    const { exec, calls } = makeFakeExec();
    const scheduler = new DisplayScheduler(exec);

    scheduler.request("topLevel", { args: ["T"], key: "T" });
    // T is already running; queue the rest behind it.
    scheduler.request("background", { args: ["BG"], key: "BG" });
    scheduler.request("foreground", { args: ["FG"], key: "FG" });

    calls[0].resolve("t");
    await flush();
    expect(calls[1].args[0]).toBe("FG");
    calls[1].resolve("fg");
    await flush();
    expect(calls[2].args[0]).toBe("BG");
  });

  it("shares one computation between slots that want the same key", async () => {
    const { exec, calls } = makeFakeExec();
    const scheduler = new DisplayScheduler(exec);
    const fg = vi.fn();
    const bg = vi.fn();

    scheduler.request("background", { args: ["X"], key: "X", onResult: bg });
    scheduler.request("foreground", { args: ["X"], key: "X", onResult: fg });

    calls[0].resolve("meshX");
    await flush();
    expect(calls).toHaveLength(1);
    expect(fg).toHaveBeenCalledWith("meshX");
    expect(bg).toHaveBeenCalledWith("meshX");
  });

  it("serves a previously computed mesh from cache synchronously", async () => {
    const { exec, calls } = makeFakeExec();
    const scheduler = new DisplayScheduler(exec);

    scheduler.request("foreground", { args: ["A"], key: "A" });
    calls[0].resolve("meshA");
    await flush();

    const onResult = vi.fn();
    scheduler.request("foreground", { args: ["A"], key: "A", onResult });
    expect(onResult).toHaveBeenCalledWith("meshA");
    expect(calls).toHaveLength(1);
  });

  it("caches results per worker method", async () => {
    const { exec, calls } = makeFakeExec();
    const scheduler = new DisplayScheduler(exec);

    scheduler.request("foreground", { args: ["A"], key: "A" });
    calls[0].resolve("mesh");
    await flush();

    scheduler.request("selection", {
      method: "generatePerFaceMeshes",
      args: ["A"],
      key: "A",
    });
    expect(calls).toHaveLength(2);
    expect(calls[1].method).toBe("generatePerFaceMeshes");
  });

  it("does not deliver a cancelled request and keeps going after errors", async () => {
    const { exec, calls } = makeFakeExec();
    const scheduler = new DisplayScheduler(exec);
    const onResult = vi.fn();
    const onError = vi.fn();

    scheduler.request("foreground", { args: ["A"], key: "A", onResult });
    scheduler.cancel("foreground");
    calls[0].resolve("meshA");
    await flush();
    expect(onResult).not.toHaveBeenCalled();

    scheduler.request("foreground", { args: ["B"], key: "B", onError });
    calls[1].reject(new Error("boom"));
    await flush();
    expect(onError).toHaveBeenCalled();

    // Errors are not cached, so a retry recomputes.
    scheduler.request("foreground", { args: ["B"], key: "B" });
    expect(calls).toHaveLength(3);
  });

  it("runs one-shot jobs after display slots and never supersedes them", async () => {
    const { exec, calls } = makeFakeExec();
    const scheduler = new DisplayScheduler(exec);

    scheduler.request("foreground", { args: ["FG"], key: "FG" });
    const job1 = scheduler.run("generateDisplayMesh", ["J1"], "J1");
    const job2 = scheduler.run("generateDisplayMesh", ["J2"], "J2");
    scheduler.request("background", { args: ["BG"], key: "BG" });

    calls[0].resolve("fg");
    await flush();
    expect(calls[1].args[0]).toBe("BG");
    calls[1].resolve("bg");
    await flush();
    calls[2].resolve("j1");
    await flush();
    calls[3].resolve("j2");
    await expect(job1).resolves.toBe("j1");
    await expect(job2).resolves.toBe("j2");
  });

  it("delivers to a request issued from inside a callback", async () => {
    const { exec, calls } = makeFakeExec();
    const scheduler = new DisplayScheduler(exec);
    const second = vi.fn();

    scheduler.request("foreground", {
      args: ["A"],
      key: "A",
      onResult: () =>
        scheduler.request("foreground", { args: ["B"], key: "B", onResult: second }),
    });
    calls[0].resolve("meshA");
    await flush();
    expect(calls[1].args[0]).toBe("B");
    calls[1].resolve("meshB");
    await flush();
    expect(second).toHaveBeenCalledWith("meshB");
  });
});

describe("MeshLruCache", () => {
  it("evicts least recently used entries by count", () => {
    const cache = new MeshLruCache({ maxEntries: 2 });
    cache.set("a", 1);
    cache.set("b", 2);
    cache.get("a");
    cache.set("c", 3);
    expect(cache.has("a")).toBe(true);
    expect(cache.has("b")).toBe(false);
    expect(cache.has("c")).toBe(true);
  });

  it("evicts by estimated size", () => {
    const cache = new MeshLruCache({ maxEntries: 10, maxBytes: 8 * 150 });
    cache.set("a", { mesh: new Array(100).fill(0) });
    cache.set("b", { mesh: new Array(100).fill(0) });
    expect(cache.has("a")).toBe(false);
    expect(cache.has("b")).toBe(true);
  });
});

describe("displayKey", () => {
  it("is equal for equal content and different for different content", () => {
    const a = { geometry: [{ geometry: "id-1", color: "red" }], plane: null };
    const b = { geometry: [{ geometry: "id-1", color: "red" }], plane: null };
    const c = { geometry: [{ geometry: "id-2", color: "red" }], plane: null };
    expect(displayKey(a)).toBe(displayKey(b));
    expect(displayKey(a)).not.toBe(displayKey(c));
    expect(displayKey(null)).toBe("empty");
  });

  it("summarizes mesh overrides instead of hashing their full data", () => {
    const override = { id: "id-9", faces: { vertices: new Array(10).fill(1) } };
    const a = { geometry: "id-9", plane: null, metadata: { meshOverride: override } };
    const b = {
      geometry: "id-9",
      plane: null,
      metadata: { meshOverride: { ...override, faces: { vertices: new Array(10).fill(2) } } },
    };
    expect(displayKey(a)).toBe(displayKey(b));
  });

  it("scopes mesh keys to the project", () => {
    const v = { geometry: "id-1", plane: null };
    expect(meshKey(v, { project: "p1" })).not.toBe(meshKey(v, { project: "p2" }));
  });
});
