// Regression tests for CadWorkerManager timeout -> restart behavior.
//
// Verifies that when the worker hangs and the inactivity watchdog fires, ONLY
// the offending (head) call is rejected, while the remaining queued calls are
// automatically re-dispatched onto the fresh worker and resolve normally —
// instead of the whole queue being rejected as collateral damage.

import { describe, it, expect, vi } from "vitest";

// Mock comlink so `wrap(rawWorker)` returns a controllable per-worker proxy.
// Each fake worker exposes its own `__proxy`, letting us make worker #1 hang
// and worker #2 (the restarted one) resolve.
vi.mock("comlink", () => ({
  wrap: (rawWorker) => rawWorker.__proxy,
}));

import { CadWorkerManager } from "../src/worker/cadWorkerManager.js";

class FakeWorker {
  constructor(behavior) {
    this.behavior = behavior;
    this.terminated = false;
    this.__proxy = new Proxy(
      {},
      {
        get: (_target, method) => (...args) => this.behavior(method, args, this),
      },
    );
  }
  addEventListener() {}
  removeEventListener() {}
  terminate() {
    this.terminated = true;
  }
  postMessage() {}
}

/**
 * Build a WorkerFactory that hands out fake workers from `behaviors` in order,
 * reusing the last behavior once exhausted.
 */
function makeFactory(behaviors) {
  const created = [];
  function WorkerFactory() {
    const behavior = behaviors[Math.min(created.length, behaviors.length - 1)];
    const worker = new FakeWorker(behavior);
    created.push(worker);
    return worker;
  }
  return { WorkerFactory, created };
}

describe("CadWorkerManager timeout re-dispatch", () => {
  it("drops only the hung head call and re-runs survivors on the fresh worker", async () => {
    const neverResolves = () => new Promise(() => {});
    const { WorkerFactory, created } = makeFactory([
      // Worker #1: every call hangs forever (simulates the stalled OCCT op).
      neverResolves,
      // Worker #2 (after restart): resolves immediately with a marker.
      (method) => Promise.resolve(`done:${method}`),
    ]);

    const cad = new CadWorkerManager(WorkerFactory, 40);

    const headPromise = cad.hang("head-arg");
    const survivor1 = cad.alpha("s1-arg");
    const survivor2 = cad.beta("s2-arg");

    // The head call goes silent and the watchdog fires.
    await expect(headPromise).rejects.toThrow(/stalled/i);

    // Survivors are re-dispatched onto the restarted worker and resolve.
    await expect(survivor1).resolves.toBe("done:alpha");
    await expect(survivor2).resolves.toBe("done:beta");

    // The original worker was terminated and exactly one replacement spawned.
    expect(created).toHaveLength(2);
    expect(created[0].terminated).toBe(true);
    expect(created[1].terminated).toBe(false);
  });

  it("does not reject survivors when the head times out", async () => {
    const neverResolves = () => new Promise(() => {});
    const { WorkerFactory } = makeFactory([
      neverResolves,
      (method) => Promise.resolve(`ok:${method}`),
    ]);

    const cad = new CadWorkerManager(WorkerFactory, 40);

    const headPromise = cad.hang();
    const survivor = cad.keep();

    const survivorRejected = vi.fn();
    survivor.catch(survivorRejected);

    await expect(headPromise).rejects.toThrow();
    await expect(survivor).resolves.toBe("ok:keep");
    expect(survivorRejected).not.toHaveBeenCalled();
  });

  it("ignores stale settlements from the terminated worker after re-dispatch", async () => {
    const neverResolves = () => new Promise(() => {});
    let resolveStaleKeep;
    const staleKeep = new Promise((resolve) => {
      resolveStaleKeep = resolve;
    });
    let resolveFreshKeep;
    const freshKeep = new Promise((resolve) => {
      resolveFreshKeep = resolve;
    });

    const { WorkerFactory } = makeFactory([
      (method) => (method === "hang" ? neverResolves() : staleKeep),
      (method) => (method === "keep" ? freshKeep : Promise.resolve(`ok:${method}`)),
    ]);

    const cad = new CadWorkerManager(WorkerFactory, 40);

    const headPromise = cad.hang();
    const survivor = cad.keep();
    const survivorResolved = vi.fn();
    survivor.then(survivorResolved);

    await expect(headPromise).rejects.toThrow(/stalled/i);

    resolveStaleKeep("stale:keep");
    await Promise.resolve();
    expect(survivorResolved).not.toHaveBeenCalled();

    resolveFreshKeep("fresh:keep");
    await expect(survivor).resolves.toBe("fresh:keep");
  });

  it("applies timeout updates at runtime", async () => {
    const neverResolves = () => new Promise(() => {});
    const { WorkerFactory } = makeFactory([neverResolves, neverResolves]);

    const cad = new CadWorkerManager(WorkerFactory, 5_000);

    expect(cad.getTimeoutMs()).toBe(5_000);
    expect(cad.getQueueSnapshot().timeoutMs).toBe(5_000);

    cad.setTimeoutMs(40);

    expect(cad.getTimeoutMs()).toBe(40);
    expect(cad.getQueueSnapshot().timeoutMs).toBe(40);

    await expect(cad.hang("runtime-timeout")).rejects.toThrow(/stalled/i);
  });
});
