// CadWorkerManager runs one `code` call per atom at a time. A newer call from
// the same atom waits for the running one and replaces any older call still
// waiting, so a burst of input changes runs the code twice at most instead of
// once per change. A worker restart doesn't bring the replaced calls back.

import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("comlink", () => ({
  wrap: (rawWorker) => rawWorker.__proxy,
}));

import { CadWorkerManager } from "../src/worker/cadWorkerManager.js";
import { CAD_BOOLEAN_INFLIGHT_TYPE } from "../src/worker/progress.ts";

/** A fake worker whose calls stay pending until the test settles them. */
class FakeWorker {
  constructor() {
    this.calls = [];
    this.listeners = [];
    this.terminated = false;
    this.__proxy = new Proxy(
      {},
      {
        get:
          (_target, method) =>
          (...args) =>
            new Promise((resolve, reject) => {
              this.calls.push({
                method: String(method),
                args,
                resolve,
                reject,
              });
            }),
      },
    );
  }
  addEventListener(type, fn) {
    if (type === "message") this.listeners.push(fn);
  }
  removeEventListener() {}
  terminate() {
    this.terminated = true;
  }
  postMessage() {}
  emit(data) {
    this.listeners.forEach((fn) => fn({ data }));
  }
  /** First argument of each `code` call this worker received. */
  codeRuns() {
    return this.calls.filter((c) => c.method === "code").map((c) => c.args[0]);
  }
  codeCall(run) {
    return this.calls.find((c) => c.method === "code" && c.args[0] === run);
  }
}

function makeManager(timeoutMs = 60_000) {
  const workers = [];
  const cad = new CadWorkerManager(function () {
    const worker = new FakeWorker();
    workers.push(worker);
    return worker;
  }, timeoutMs);
  return { cad, workers };
}

const meta = (atomId) => ({
  __cadTaskMeta: { atomId, atomType: "Code", displayLabel: atomId },
});

/** Record how a promise settles, without leaving a rejection unhandled. */
function track(promise) {
  const state = { status: "pending" };
  promise.then(
    (value) => Object.assign(state, { status: "fulfilled", value }),
    (reason) => Object.assign(state, { status: "rejected", reason }),
  );
  return state;
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

afterEach(() => {
  // The bad-cut test persists a known-hanging cut.
  localStorage.removeItem(CadWorkerManager._BAD_CUTS_STORAGE_KEY);
});

describe("CadWorkerManager per-atom code coalescing", () => {
  it("runs the first call, then only the newest of the calls that waited", async () => {
    const { cad, workers } = makeManager();
    const run1 = track(cad.code("run-1", meta("A")));
    const run2 = track(cad.code("run-2", meta("A")));
    const run3 = track(cad.code("run-3", meta("A")));
    const run4 = track(cad.code("run-4", meta("A")));
    const worker = workers[0];

    expect(worker.codeRuns()).toEqual(["run-1"]);
    await flush();
    expect(run2.status).toBe("rejected");
    expect(run2.reason.superseded).toBe(true);
    expect(run3.status).toBe("rejected");
    expect(run3.reason.superseded).toBe(true);
    // The waiting call still counts as pending work (wait_for_settle reads
    // `_pendingCalls`), so the project isn't reported as settled early.
    expect(cad.getQueueSnapshot().queue.map((e) => e.sentToWorker)).toEqual([
      true,
      false,
    ]);

    worker.codeCall("run-1").resolve("result-1");
    await flush();
    expect(run1).toMatchObject({ status: "fulfilled", value: "result-1" });
    expect(worker.codeRuns()).toEqual(["run-1", "run-4"]);

    worker.codeCall("run-4").resolve("result-4");
    await flush();
    expect(run4).toMatchObject({ status: "fulfilled", value: "result-4" });
    expect(cad.getQueueSnapshot().pendingCount).toBe(0);
  });

  it("sends the waiting call when the running one fails", async () => {
    const { cad, workers } = makeManager();
    const run1 = track(cad.code("run-1", meta("A")));
    const run2 = track(cad.code("run-2", meta("A")));
    expect(workers[0].codeRuns()).toEqual(["run-1"]);

    workers[0].codeCall("run-1").reject(new Error("boom"));
    await flush();
    expect(run1.status).toBe("rejected");
    expect(run1.reason.superseded).toBeUndefined();
    expect(workers[0].codeRuns()).toEqual(["run-1", "run-2"]);

    workers[0].codeCall("run-2").resolve("ok");
    await flush();
    expect(run2).toMatchObject({ status: "fulfilled", value: "ok" });
  });

  it("leaves other atoms, other methods and untagged calls alone", () => {
    const { cad, workers } = makeManager();
    cad.code("a-1", meta("A"));
    cad.code("b-1", meta("B"));
    cad.code("plain-1");
    cad.code("plain-2");
    cad.fusion("fusion-1", meta("A"));
    cad.fusion("fusion-2", meta("A"));

    expect(workers[0].calls.map((c) => c.args[0])).toEqual([
      "a-1",
      "b-1",
      "plain-1",
      "plain-2",
      "fusion-1",
      "fusion-2",
    ]);
  });

  it("reports a replaced call as cancelled, never as started or failed", () => {
    const events = [];
    const types = [
      "cad-worker-task-queued",
      "cad-worker-task-start",
      "cad-worker-task-error",
      "cad-worker-task-cancelled",
    ];
    const record = (e) => events.push({ type: e.type, ...e.detail });
    types.forEach((t) => window.addEventListener(t, record));
    try {
      const { cad } = makeManager();
      track(cad.code("run-1", meta("A")));
      track(cad.code("run-2", meta("A")));
      track(cad.code("run-3", meta("A")));
    } finally {
      types.forEach((t) => window.removeEventListener(t, record));
    }

    const [first, second, third] = events
      .filter((e) => e.type === "cad-worker-task-queued")
      .map((e) => e.taskId);
    expect(
      events.filter((e) => e.type === "cad-worker-task-cancelled"),
    ).toEqual([
      expect.objectContaining({
        taskId: second,
        reason: "superseded",
        supersededBy: third,
        atomId: "A",
      }),
    ]);
    expect(
      events
        .filter((e) => e.type === "cad-worker-task-start")
        .map((e) => e.taskId),
    ).toEqual([first]);
    expect(events.filter((e) => e.type === "cad-worker-task-error")).toEqual(
      [],
    );
  });

  it("forgets running calls on cancelAll, so the next call is sent at once", async () => {
    const { cad, workers } = makeManager();
    const run1 = track(cad.code("run-1", meta("A")));
    const run2 = track(cad.code("run-2", meta("A")));
    cad.cancelAll();
    await flush();
    expect(run1.reason.cancelled).toBe(true);
    expect(run2.reason.cancelled).toBe(true);

    const run3 = track(cad.code("run-3", meta("A")));
    expect(workers[0].codeRuns()).toEqual(["run-1", "run-3"]);

    // The cancelled call finishing late must not send anything else.
    workers[0].codeCall("run-1").resolve("late");
    await flush();
    expect(workers[0].codeRuns()).toEqual(["run-1", "run-3"]);

    workers[0].codeCall("run-3").resolve("result-3");
    await flush();
    expect(run3).toMatchObject({ status: "fulfilled", value: "result-3" });
  });
});

describe("CadWorkerManager restart with coalesced code calls", () => {
  it("doesn't replay a running call that a waiting call replaced", async () => {
    const { cad, workers } = makeManager(40);
    // The head call hangs and trips the watchdog.
    const head = track(cad.hang());
    const a1 = track(cad.code("a-1", meta("A")));
    const a2 = track(cad.code("a-2", meta("A")));
    const b1 = track(cad.code("b-1", meta("B")));
    expect(workers[0].codeRuns()).toEqual(["a-1", "b-1"]);

    await vi.waitFor(() => expect(workers).toHaveLength(2));
    expect(head.reason.message).toMatch(/stalled/i);
    expect(a1.status).toBe("rejected");
    expect(a1.reason.superseded).toBe(true);
    // a-2 takes a-1's place; b-1 had nothing newer, so it is replayed as before.
    expect(workers[1].codeRuns()).toEqual(["a-2", "b-1"]);

    workers[1].codeCall("a-2").resolve("result-a2");
    workers[1].codeCall("b-1").resolve("result-b1");
    await flush();
    expect(a2).toMatchObject({ status: "fulfilled", value: "result-a2" });
    expect(b1).toMatchObject({ status: "fulfilled", value: "result-b1" });
  });

  it("runs the waiting call on the fresh worker when the running one hangs", async () => {
    const { cad, workers } = makeManager(40);
    const a1 = track(cad.code("a-1", meta("A")));
    const a2 = track(cad.code("a-2", meta("A")));

    await vi.waitFor(() => expect(workers).toHaveLength(2));
    expect(a1.reason.message).toMatch(/stalled/i);
    expect(workers[0].codeRuns()).toEqual(["a-1"]);
    expect(workers[1].codeRuns()).toEqual(["a-2"]);

    workers[1].codeCall("a-2").resolve("result-a2");
    await flush();
    expect(a2).toMatchObject({ status: "fulfilled", value: "result-a2" });
  });

  it("doesn't retry a hung-cut call that a waiting call replaced", async () => {
    const { cad, workers } = makeManager(40);
    const a1 = track(cad.code("a-1", meta("A")));
    const a2 = track(cad.code("a-2", meta("A")));
    // a-1 goes silent inside a boolean cut, which normally re-runs a-1 on the
    // fresh worker with the cut skipped. a-2 replaces it instead.
    workers[0].emit({
      type: CAD_BOOLEAN_INFLIGHT_TYPE,
      active: true,
      toCut: "part-1",
      cutter: "part-2",
    });

    await vi.waitFor(() => expect(workers).toHaveLength(2));
    expect(a1.reason.superseded).toBe(true);
    expect(workers[1].codeRuns()).toEqual(["a-2"]);

    workers[1].codeCall("a-2").resolve("result-a2");
    await flush();
    expect(a2).toMatchObject({ status: "fulfilled", value: "result-a2" });
  });
});
