// CadWorkerManager credits worker progress messages to the task that sent
// them. The worker runs several calls concurrently, so a message tagged with
// an atomId must reach that atom's task even when another call heads the queue.

import { describe, it, expect, vi, afterEach } from "vitest";

vi.mock("comlink", () => ({
  wrap: (rawWorker) => rawWorker.__proxy,
}));

import { CadWorkerManager } from "../src/worker/cadWorkerManager.js";
import { CAD_PROGRESS_MESSAGE_TYPE } from "../src/worker/progress.ts";

class FakeWorker {
  constructor() {
    this.listeners = [];
    this.__proxy = new Proxy({}, { get: () => () => new Promise(() => {}) });
  }
  addEventListener(type, fn) {
    if (type === "message") this.listeners.push(fn);
  }
  removeEventListener() {}
  terminate() {}
  postMessage() {}
  emit(data) {
    this.listeners.forEach((fn) => fn({ data }));
  }
}

const meta = (atomId) => ({
  __cadTaskMeta: { atomId, atomType: "Code", displayLabel: atomId },
});

describe("CadWorkerManager progress attribution", () => {
  const events = [];
  const onProgress = (e) => events.push(e.detail);
  afterEach(() => {
    window.removeEventListener("cad-worker-task-progress", onProgress);
    events.length = 0;
  });

  it("routes tagged progress to the reporting atom's task, untagged to the queue head", () => {
    let worker;
    const cad = new CadWorkerManager(function () {
      worker = new FakeWorker();
      return worker;
    }, 60_000);
    const taskIds = {};
    window.addEventListener("cad-worker-task-queued", (e) => {
      taskIds[e.detail.atomId] = e.detail.taskId;
    });
    window.addEventListener("cad-worker-task-progress", onProgress);

    cad.fusion(1, meta("head-atom"));
    cad.code(2, meta("center-atom"));

    worker.emit({
      type: CAD_PROGRESS_MESSAGE_TYPE,
      label: "saving output part 3/10",
      atomId: "center-atom",
    });
    worker.emit({
      type: CAD_PROGRESS_MESSAGE_TYPE,
      label: "boolean cut 1 / 4",
    });

    expect(events).toMatchObject([
      { taskId: taskIds["center-atom"], label: "saving output part 3/10" },
      { taskId: taskIds["head-atom"], label: "boolean cut 1 / 4" },
    ]);
    cad.terminate?.();
  });

  it("announces a call behind the queue head as started once it reports progress", () => {
    let worker;
    const cad = new CadWorkerManager(function () {
      worker = new FakeWorker();
      return worker;
    }, 60_000);
    const starts = [];
    const onStart = (e) => starts.push(e.detail);
    window.addEventListener("cad-worker-task-start", onStart);
    try {
      cad.move(1, meta("move-atom"));
      cad.code(2, meta("code-atom"));
      // Only the queue head has started so far.
      expect(starts.map((s) => s.atomId)).toEqual(["move-atom"]);

      // The code atom is holding the worker thread and reporting progress.
      for (const label of ["running code", "moving part 1/5"]) {
        worker.emit({
          type: CAD_PROGRESS_MESSAGE_TYPE,
          label,
          atomId: "code-atom",
        });
      }

      // Announced exactly once, so the UI can show it instead of the head.
      expect(starts.map((s) => s.atomId)).toEqual(["move-atom", "code-atom"]);
      const snapshot = cad.getQueueSnapshot();
      expect(snapshot.queue[1].lastProgressAt).toBeTypeOf("number");
      expect(snapshot.activeTask.atomId).toBe("move-atom");
    } finally {
      window.removeEventListener("cad-worker-task-start", onStart);
    }
  });
});
