// The CAD worker's stall timeout is a user setting (Settings > Advanced). These
// tests check the saved value is read with a 90 s default, and that changing it
// applies to a call that is already running.

import { describe, it, expect, vi, afterEach } from "vitest";

vi.mock("comlink", () => ({
  wrap: (rawWorker) => rawWorker.__proxy,
}));

import {
  CadWorkerManager,
  CAD_TIMEOUT_STORAGE_KEY,
  savedCadTimeoutSeconds,
} from "../src/worker/cadWorkerManager.js";

class FakeWorker {
  constructor(behavior) {
    this.__proxy = new Proxy(
      {},
      {
        get:
          (_target, method) =>
          (...args) =>
            behavior(method, args),
      },
    );
  }
  addEventListener() {}
  removeEventListener() {}
  terminate() {}
  postMessage() {}
}

// The first worker resolves each call after `delayMs`; restarted ones never do.
function makeFactory(delayMs) {
  let count = 0;
  return function WorkerFactory() {
    count++;
    return new FakeWorker(
      count === 1
        ? (method) =>
            new Promise((resolve) =>
              setTimeout(() => resolve(`done:${method}`), delayMs),
            )
        : () => new Promise(() => {}),
    );
  };
}

afterEach(() => {
  localStorage.removeItem(CAD_TIMEOUT_STORAGE_KEY);
});

describe("CAD worker timeout setting", () => {
  it("defaults to 90 seconds", () => {
    localStorage.removeItem(CAD_TIMEOUT_STORAGE_KEY);
    expect(savedCadTimeoutSeconds()).toBe(90);
  });

  it("reads the saved value and ignores invalid ones", () => {
    localStorage.setItem(CAD_TIMEOUT_STORAGE_KEY, "300");
    expect(savedCadTimeoutSeconds()).toBe(300);
    localStorage.setItem(CAD_TIMEOUT_STORAGE_KEY, "-5");
    expect(savedCadTimeoutSeconds()).toBe(90);
    localStorage.setItem(CAD_TIMEOUT_STORAGE_KEY, "abc");
    expect(savedCadTimeoutSeconds()).toBe(90);
  });

  it("raising it lets a running call finish that would have timed out", async () => {
    const cad = new CadWorkerManager(makeFactory(150), 50);
    const call = cad.intersect("a", "b");
    cad.setTimeoutMs(1000);
    await expect(call).resolves.toBe("done:intersect");
    expect(cad.getQueueSnapshot().timeoutMs).toBe(1000);
  });

  it("lowering it times out a running call that has already been silent", async () => {
    const cad = new CadWorkerManager(makeFactory(5000), 5000);
    const call = cad.intersect("a", "b");
    await new Promise((resolve) => setTimeout(resolve, 60));
    const started = Date.now();
    cad.setTimeoutMs(50);
    await expect(call).rejects.toThrow(/stalled/i);
    expect(Date.now() - started).toBeLessThan(500);
  });
});
