// Regression tests for CadWorkerManager crash -> restart behavior.
//
// When OpenCascade crashes in the worker (a WebAssembly trap such as "index out
// of bounds" after running out of memory), the worker posts a crash message.
// Its memory may be corrupt, so the manager replaces it and replays every
// pending call, including the one that crashed, on the fresh worker.

import { describe, it, expect, vi } from "vitest";

vi.mock("comlink", () => ({
  wrap: (rawWorker) => rawWorker.__proxy,
}));

import { CadWorkerManager } from "../src/worker/cadWorkerManager.js";
import { CAD_WASM_CRASHED_TYPE } from "../src/worker/progress";

class FakeWorker {
  constructor(behavior) {
    this.behavior = behavior;
    this.terminated = false;
    this.listeners = new Set();
    this.__proxy = new Proxy(
      {},
      {
        get:
          (_target, method) =>
          (...args) =>
            this.behavior(method, args, this),
      },
    );
  }
  addEventListener(type, listener) {
    if (type === "message") this.listeners.add(listener);
  }
  removeEventListener(type, listener) {
    if (type === "message") this.listeners.delete(listener);
  }
  terminate() {
    this.terminated = true;
  }
  postMessage() {}
  /** Simulate the worker reporting an OpenCascade crash. */
  crash(message = "index out of bounds") {
    for (const listener of [...this.listeners]) {
      listener({ data: { type: CAD_WASM_CRASHED_TYPE, message } });
    }
  }
}

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

describe("CadWorkerManager crash restart", () => {
  it("replays every pending call, including the crashed one, on a fresh worker", async () => {
    const rejectors = [];
    const { WorkerFactory, created } = makeFactory([
      // Worker #1: calls stay in flight until the crash, then fail.
      () => new Promise((_resolve, reject) => rejectors.push(reject)),
      (method) => Promise.resolve(`done:${method}`),
    ]);
    const cad = new CadWorkerManager(WorkerFactory, 60_000);

    const crashed = cad.assembly("a");
    const other = cad.cut("b");

    created[0].crash();
    // The crashed worker's own failures arrive after the crash message and
    // must be ignored, not reported to the atoms.
    rejectors.forEach((reject) => reject(new Error("index out of bounds")));

    await expect(crashed).resolves.toBe("done:assembly");
    await expect(other).resolves.toBe("done:cut");
    expect(created).toHaveLength(2);
    expect(created[0].terminated).toBe(true);
    expect(created[1].terminated).toBe(false);
  });

  it("tells the app the worker crashed", async () => {
    const { WorkerFactory, created } = makeFactory([
      () => new Promise(() => {}),
      (method) => Promise.resolve(`done:${method}`),
    ]);
    const cad = new CadWorkerManager(WorkerFactory, 60_000);
    const messages = [];
    cad.onRestartCallback = (message) => messages.push(message);

    const call = cad.fuse("a");
    created[0].crash();

    await expect(call).resolves.toBe("done:fuse");
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatch(/crashed/);
  });

  it("fails a call that crashes every worker instead of restarting forever", async () => {
    const { WorkerFactory, created } = makeFactory([
      () => new Promise(() => {}),
    ]);
    const cad = new CadWorkerManager(WorkerFactory, 60_000);

    const call = cad.fillet("a");
    created[0].crash("indirect call to null");
    created[1].crash("indirect call to null");
    created[2].crash("indirect call to null");

    await expect(call).rejects.toThrow(
      /crashed 3 times.*indirect call to null/,
    );
    expect(created).toHaveLength(4);
  });
});
