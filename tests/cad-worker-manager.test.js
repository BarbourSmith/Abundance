import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("comlink", () => ({
  wrap: vi.fn((worker) => worker.__proxy),
}));

import { CadWorkerManager } from "../src/worker/cadWorkerManager.js";

const CAD_WORKER_HEARTBEAT_TYPE = "__abundanceCadWorkerHeartbeat";

class FakeWorker {
  constructor(proxyFactory) {
    this.__proxy = proxyFactory(this);
    this._listeners = new Set();
    this.terminated = false;
  }

  addEventListener(type, listener) {
    if (type === "message") {
      this._listeners.add(listener);
    }
  }

  emitMessage(data) {
    for (const listener of this._listeners) {
      listener({ data });
    }
  }

  terminate() {
    this.terminated = true;
  }
}

describe("CadWorkerManager", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("times out assembly calls after a period of inactivity", async () => {
    vi.useFakeTimers();

    const WorkerFactory = class {
      constructor() {
        return new FakeWorker(() => ({
          assembly: () => new Promise(() => {}),
        }));
      }
    };

    const cad = new CadWorkerManager(WorkerFactory, 100);
    const pending = cad.assembly([], {});

    await vi.advanceTimersByTimeAsync(101);

    await expect(pending).rejects.toThrow(
      'CAD worker timed out on "assembly" after 100ms of inactivity',
    );
  });

  it("keeps an assembly call alive while heartbeats continue arriving", async () => {
    vi.useFakeTimers();

    let resolveAssembly;
    let requestId;
    let workerRef;
    const WorkerFactory = class {
      constructor() {
        workerRef = new FakeWorker(() => ({
          assembly: (...args) => {
            const requestMeta = args[args.length - 1];
            requestId = requestMeta.__cadWorkerRequestId;
            return new Promise((resolve) => {
              resolveAssembly = () => {
                workerRef.emitMessage({
                  type: CAD_WORKER_HEARTBEAT_TYPE,
                  requestId,
                });
                resolve("done");
              };
            });
          },
        }));
        return workerRef;
      }
    };

    const cad = new CadWorkerManager(WorkerFactory, 100);
    const pending = cad.assembly(["shape"], { operationId: "ctx" });

    await vi.advanceTimersByTimeAsync(90);
    workerRef.emitMessage({
      type: CAD_WORKER_HEARTBEAT_TYPE,
      requestId,
    });
    await vi.advanceTimersByTimeAsync(90);
    workerRef.emitMessage({
      type: CAD_WORKER_HEARTBEAT_TYPE,
      requestId,
    });
    await vi.advanceTimersByTimeAsync(90);

    resolveAssembly();

    await expect(pending).resolves.toBe("done");
  });
});