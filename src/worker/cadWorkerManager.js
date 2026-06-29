import { wrap } from "comlink";

/**
 * Wraps a comlink-based Web Worker with adaptive hang detection.
 *
 * Instead of enforcing a fixed timeout on every call, this manager watches
 * queue starvation patterns and historical runtime per method. If the worker
 * appears unresponsive while work is queued behind an in-flight task far beyond
 * its expected duration, the worker is restarted.
 *
 * Usage:
 *   const cad = new CadWorkerManager(cadWorker, 600_000);
 *   // Then use `cad` exactly like the plain comlink proxy.
 */
export class CadWorkerManager {
  /**
   * @param {new () => Worker} WorkerFactory - The Vite `?worker` import (a constructor).
   * @param {number} [hangDetectionFloorMs=600000] - Lower bound for adaptive hang detection.
   */
  constructor(WorkerFactory, hangDetectionFloorMs = 600_000) {
    this._WorkerFactory = WorkerFactory;
    this._hangDetectionFloorMs = hangDetectionFloorMs;
    /** @type {Array<{reject: Function, timeoutId: ReturnType<typeof setTimeout>}>} */
    this._pendingCalls = [];
    this._methodRuntimeStats = new Map();
    this._lastQueueProgressAt = Date.now();
    this._hangMonitorId = null;
    this._hangMonitorIntervalMs = 5000;
    /**
     * Optional callback invoked when the worker is restarted due to hang detection.
     * Assign this from outside (e.g. from AppContent) to show a UI notification.
     * Signature: (message: string) => void
     * @type {((message: string) => void) | null}
     */
    this.onRestartCallback = null;
    this._debugState = {
      workerCreatedAt: Date.now(),
      lastEventType: null,
      lastEventAt: null,
      activeTaskCount: 0,
      inFlightTaskCount: 0,
      queuedOnlyTaskCount: 0,
      queuedTaskCount: 0,
      finishedTaskCount: 0,
      failedTaskCount: 0,
      cancelledTaskCount: 0,
      timedOutTaskCount: 0,
      restartedCount: 0,
      hangDetectionCount: 0,
      lastTaskLabel: null,
      oldestInFlightMs: null,
      oldestQueuedMs: null,
      inFlightTaskLabels: [],
      queuedTaskLabels: [],
      activeOperation: null,
      queueProgressAgeMs: 0,
      liveness: "idle",
      lastError: null,
    };

    this._createWorker();

    // Return a Proxy so that `cad.anyMethod(args)` transparently goes through
    // `_call`.  Internal properties (prefixed with `_` or defined on this class)
    // are returned directly.
    return new Proxy(this, {
      get(target, prop) {
        if (typeof prop === "symbol" || prop in target) {
          return Reflect.get(target, prop);
        }
        // Every unknown property is treated as a remote CAD method.
        return (...args) => target._call(prop, args);
      },
    });
  }

  // ---------------------------------------------------------------------------
  // Internal helpers (these are enumerable on `this`, so the Proxy passes them
  // through rather than routing them to the worker).
  // ---------------------------------------------------------------------------

  _createWorker() {
    if (this._hangMonitorId) {
      clearInterval(this._hangMonitorId);
      this._hangMonitorId = null;
    }

    this._rawWorker = new this._WorkerFactory();
    this._proxy = wrap(this._rawWorker);
    this._lastQueueProgressAt = Date.now();
    this._hangMonitorId = setInterval(() => {
      this._maybeRecoverHungWorker();
    }, this._hangMonitorIntervalMs);

    this._debugState.workerCreatedAt = Date.now();
    this._debugState.activeTaskCount = this._pendingCalls.length;
    this._publishDebugState();
  }

  _recordMethodDuration(method, durationMs) {
    if (!Number.isFinite(durationMs) || durationMs <= 0) return;
    const key = String(method);
    const prev = this._methodRuntimeStats.get(key) || {
      count: 0,
      emaMs: durationMs,
      maxMs: durationMs,
    };
    const alpha = 0.2;
    const next = {
      count: prev.count + 1,
      emaMs: prev.count > 0 ? prev.emaMs * (1 - alpha) + durationMs * alpha : durationMs,
      maxMs: Math.max(prev.maxMs, durationMs),
    };
    this._methodRuntimeStats.set(key, next);
  }

  _expectedDurationMs(method) {
    const stats = this._methodRuntimeStats.get(String(method));
    if (!stats) {
      return this._hangDetectionFloorMs;
    }

    return Math.max(
      this._hangDetectionFloorMs,
      stats.emaMs * 8,
      stats.maxMs * 2,
      120_000,
    );
  }

  _maybeRecoverHungWorker() {
    const inFlight = this._pendingCalls.find((entry) => entry.startTime !== null);
    if (!inFlight || !inFlight.startTime) {
      return;
    }

    // Only recover if the queue is actually starving behind a long-running call.
    if (this._pendingCalls.length <= 1) {
      return;
    }

    const now = Date.now();
    const elapsedMs = now - inFlight.startTime;
    const expectedMs = this._expectedDurationMs(inFlight.method);
    const queueStalledMs = now - this._lastQueueProgressAt;

    if (elapsedMs <= expectedMs || queueStalledMs <= expectedMs / 2) {
      return;
    }

    this._debugState.hangDetectionCount += 1;
    this._restartWorker(
      `adaptive-hang-detection: ${this._formatTaskLabel(inFlight.method, inFlight.taskMeta)} elapsed ${elapsedMs}ms (expected <= ${Math.round(expectedMs)}ms)`,
    );
  }

  _publishDebugState() {
    if (typeof window === "undefined") {
      return;
    }

    const now = Date.now();
    const inFlightEntries = this._pendingCalls.filter((entry) => entry.startTime);
    const queuedOnlyEntries = this._pendingCalls.filter((entry) => !entry.startTime);
    const activeEntry = inFlightEntries[0] || null;
    const oldestInFlight = inFlightEntries.reduce((min, entry) => {
      if (!entry.startTime) return min;
      return min === null ? entry.startTime : Math.min(min, entry.startTime);
    }, null);
    const oldestQueued = queuedOnlyEntries.reduce((min, entry) => {
      return min === null ? entry.queuedAt : Math.min(min, entry.queuedAt);
    }, null);

    const activeOperation = activeEntry
      ? (() => {
          const elapsedMs = activeEntry.startTime ? now - activeEntry.startTime : null;
          const expectedDurationMs = this._expectedDurationMs(activeEntry.method);
          return {
            taskId: activeEntry.taskId,
            method: String(activeEntry.method),
            displayLabel: this._formatTaskLabel(
              activeEntry.method,
              activeEntry.taskMeta,
            ),
            atomId: activeEntry.taskMeta?.atomId || null,
            atomType: activeEntry.taskMeta?.atomType || null,
            moleculeName: activeEntry.taskMeta?.moleculeName || null,
            startedAt: activeEntry.startTime,
            queuedAt: activeEntry.queuedAt,
            elapsedMs,
            expectedDurationMs,
            elapsedOverExpected:
              elapsedMs && expectedDurationMs
                ? Number((elapsedMs / expectedDurationMs).toFixed(2))
                : null,
          };
        })()
      : null;

    const queueProgressAgeMs = now - this._lastQueueProgressAt;
    const liveness = !activeOperation
      ? "idle"
      : activeOperation.elapsedMs > activeOperation.expectedDurationMs &&
          queueProgressAgeMs > activeOperation.expectedDurationMs / 2 &&
          this._pendingCalls.length > 1
        ? "possibly_stuck"
        : "progressing";

    window.__cadWorkerDebug = {
      ...this._debugState,
      activeTaskCount: this._pendingCalls.length,
      inFlightTaskCount: inFlightEntries.length,
      queuedOnlyTaskCount: queuedOnlyEntries.length,
      oldestInFlightMs: oldestInFlight ? now - oldestInFlight : null,
      oldestQueuedMs: oldestQueued ? now - oldestQueued : null,
      inFlightTaskLabels: inFlightEntries
        .slice(0, 5)
        .map((entry) => this._formatTaskLabel(entry.method, entry.taskMeta)),
      queuedTaskLabels: queuedOnlyEntries
        .slice(0, 5)
        .map((entry) => this._formatTaskLabel(entry.method, entry.taskMeta)),
      activeOperation,
      queueProgressAgeMs,
      liveness,
    };
  }

  _emitCadWorkerEvent(type, detail) {
    this._debugState.lastEventType = type;
    this._debugState.lastEventAt = Date.now();
    this._debugState.activeTaskCount = this._pendingCalls.length;
    this._debugState.lastTaskLabel = detail?.displayLabel || null;
    if (type === "cad-worker-task-error") {
      this._debugState.failedTaskCount += 1;
      this._debugState.lastError = detail?.error || null;
      const isTimeout = String(detail?.error || "").includes("timed out");
      if (isTimeout) {
        this._debugState.timedOutTaskCount += 1;
      }
    }
    if (type === "cad-worker-task-finish") {
      this._debugState.finishedTaskCount += 1;
    }
    if (type === "cad-worker-task-cancelled") {
      this._debugState.cancelledTaskCount += 1;
    }
    if (type === "cad-worker-restarted") {
      this._debugState.restartedCount += 1;
    }
    if (type === "cad-worker-task-queued") {
      this._debugState.queuedTaskCount += 1;
    }
    this._publishDebugState();

    if (typeof window === "undefined") {
      return;
    }
    window.dispatchEvent(new CustomEvent(type, { detail }));
  }

  _stripTaskMeta(args) {
    if (!Array.isArray(args) || args.length === 0) {
      return { callArgs: args, taskMeta: null };
    }

    const lastArg = args[args.length - 1];
    if (
      lastArg &&
      typeof lastArg === "object" &&
      !Array.isArray(lastArg) &&
      Object.prototype.hasOwnProperty.call(lastArg, "__cadTaskMeta")
    ) {
      const callArgs = args.slice(0, -1);
      return { callArgs, taskMeta: lastArg.__cadTaskMeta || null };
    }

    return { callArgs: args, taskMeta: null };
  }

  _formatTaskLabel(method, taskMeta) {
    if (taskMeta?.displayLabel) {
      return taskMeta.displayLabel;
    }

    const atomType = taskMeta?.atomType || String(method);
    const moleculeName = taskMeta?.moleculeName;
    return moleculeName ? `${moleculeName}/${atomType}` : atomType;
  }

  /**
   * Mark an entry as started by the worker.
   * actively being processed by the worker.
   */
  _startTimers(entry) {
    entry.startTime = Date.now();
    this._emitCadWorkerEvent("cad-worker-task-start", {
      taskId: entry.taskId,
      method: String(entry.method),
      queuedAt: entry.queuedAt,
      startedAt: entry.startTime,
      queueWaitMs: entry.startTime - entry.queuedAt,
      queueDepth: Math.max(this._pendingCalls.indexOf(entry), 0),
      atomId: entry.taskMeta?.atomId || null,
      atomType: entry.taskMeta?.atomType || null,
      moleculeName: entry.taskMeta?.moleculeName || null,
      displayLabel: this._formatTaskLabel(entry.method, entry.taskMeta),
    });
  }

  /**
   * If there are queued calls waiting, start timers for the next one
   * (which is now the actively processing call).
   */
  _activateNextCall() {
    if (this._pendingCalls.length > 0) {
      const next = this._pendingCalls[0];
      if (next.startTime === null) {
        this._startTimers(next);
      }
    }
  }

  /**
   * Dispatch a call to the live comlink proxy, racing against the timeout.
   * The timeout and progress timers only start when this call is the one
   * actively being processed by the worker (i.e. first in the queue).
   * @param {string|symbol} method
   * @param {unknown[]} args
   * @returns {Promise<unknown>}
   */
  _call(method, args) {
    return new Promise((resolve, reject) => {
      const taskId = `cad-task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const queuedAt = Date.now();
      const { callArgs, taskMeta } = this._stripTaskMeta(args);

      // Coalesce stale queued work for the same atom/method. Keep the latest
      // queued request and drop earlier queued entries that have not started.
      const atomId = taskMeta?.atomId || null;
      if (atomId) {
        const staleQueued = this._pendingCalls.filter(
          (candidate) =>
            candidate.startTime === null &&
            candidate.taskMeta?.atomId === atomId &&
            String(candidate.method) === String(method),
        );

        staleQueued.forEach((staleEntry) => {
          this._pendingCalls = this._pendingCalls.filter((c) => c !== staleEntry);
          this._emitCadWorkerEvent("cad-worker-task-cancelled", {
            taskId: staleEntry.taskId,
            method: String(staleEntry.method),
            queuedAt: staleEntry.queuedAt,
            cancelledAt: Date.now(),
            atomId: staleEntry.taskMeta?.atomId || null,
            atomType: staleEntry.taskMeta?.atomType || null,
            moleculeName: staleEntry.taskMeta?.moleculeName || null,
            displayLabel: this._formatTaskLabel(
              staleEntry.method,
              staleEntry.taskMeta,
            ),
            reason: "Superseded by a newer queued task for the same atom",
          });

          Promise.resolve().then(() =>
            staleEntry.reject(
              Object.assign(new Error("CAD call cancelled: superseded by newer atom task"), {
                cancelled: true,
                stale: true,
              }),
            ),
          );
        });
      }

      const entry = {
        reject,
        method,
        startTime: null,
        taskId,
        queuedAt,
        taskMeta,
      };

      const isInteractive = taskMeta?.priority === "interactive";
      if (isInteractive && this._pendingCalls.length > 0) {
        // Keep the current in-flight task at index 0 and prioritize this
        // interactive task ahead of older queued background tasks.
        const first = this._pendingCalls[0];
        if (first.startTime !== null) {
          this._pendingCalls.splice(1, 0, entry);
        } else {
          this._pendingCalls.unshift(entry);
        }
      } else {
        this._pendingCalls.push(entry);
      }

      this._emitCadWorkerEvent("cad-worker-task-queued", {
        taskId,
        method: String(method),
        queuedAt,
        queueDepth: Math.max(this._pendingCalls.length - 1, 0),
        atomId: taskMeta?.atomId || null,
        atomType: taskMeta?.atomType || null,
        moleculeName: taskMeta?.moleculeName || null,
        displayLabel: this._formatTaskLabel(method, taskMeta),
      });

      // Only start timers if this is the currently processing call
      // (no other call ahead of it in the queue).
      if (this._pendingCalls[0] === entry) {
        this._startTimers(entry);
      }

      const cleanup = () => {
        // No-op: adaptive hang detection does not set per-call timers.
      };

      this._proxy[method](...callArgs).then(
        (result) => {
          cleanup();
          this._pendingCalls = this._pendingCalls.filter((c) => c !== entry);
          const finishedAt = Date.now();
          if (entry.startTime) {
            this._recordMethodDuration(entry.method, finishedAt - entry.startTime);
          }
          this._lastQueueProgressAt = finishedAt;
          this._emitCadWorkerEvent("cad-worker-task-finish", {
            taskId: entry.taskId,
            method: String(entry.method),
            queuedAt: entry.queuedAt,
            startedAt: entry.startTime,
            finishedAt,
            durationMs: entry.startTime ? finishedAt - entry.startTime : null,
            queueWaitMs: entry.startTime ? entry.startTime - entry.queuedAt : null,
            queueDepth: this._pendingCalls.length,
            atomId: entry.taskMeta?.atomId || null,
            atomType: entry.taskMeta?.atomType || null,
            moleculeName: entry.taskMeta?.moleculeName || null,
            displayLabel: this._formatTaskLabel(entry.method, entry.taskMeta),
          });
          this._activateNextCall();
          resolve(result);
        },
        (err) => {
          cleanup();
          this._pendingCalls = this._pendingCalls.filter((c) => c !== entry);
          const failedAt = Date.now();
          if (entry.startTime) {
            this._recordMethodDuration(entry.method, failedAt - entry.startTime);
          }
          this._lastQueueProgressAt = failedAt;
          this._emitCadWorkerEvent("cad-worker-task-error", {
            taskId: entry.taskId,
            method: String(entry.method),
            queuedAt: entry.queuedAt,
            startedAt: entry.startTime,
            failedAt,
            durationMs: entry.startTime ? failedAt - entry.startTime : null,
            queueWaitMs: entry.startTime ? entry.startTime - entry.queuedAt : null,
            queueDepth: this._pendingCalls.length,
            atomId: entry.taskMeta?.atomId || null,
            atomType: entry.taskMeta?.atomType || null,
            moleculeName: entry.taskMeta?.moleculeName || null,
            displayLabel: this._formatTaskLabel(entry.method, entry.taskMeta),
            error: err?.message || String(err),
          });
          this._activateNextCall();
          reject(err);
        },
      );
    });
  }

  /**
   * Cancel all in-flight calls immediately (e.g. on project switch).
   * Clears progress logs, timeouts, and rejects all pending promises.
   */
  cancelAll() {
    if (this._pendingCalls.length === 0) return;
    const pending = [...this._pendingCalls];
    this._pendingCalls = [];
    pending.forEach((entry) => {
      this._emitCadWorkerEvent("cad-worker-task-cancelled", {
        taskId: entry.taskId,
        method: String(entry.method),
        queuedAt: entry.queuedAt,
        cancelledAt: Date.now(),
        atomId: entry.taskMeta?.atomId || null,
        atomType: entry.taskMeta?.atomType || null,
        moleculeName: entry.taskMeta?.moleculeName || null,
        displayLabel: this._formatTaskLabel(entry.method, entry.taskMeta),
      });
      // Suppress the rejection — callers are expected to add .catch() for this
      // case. Using Promise.resolve().then() to defer so any existing .then()
      // handlers have a chance to attach a .catch() before the rejection fires.
      Promise.resolve().then(() =>
        entry.reject(
          Object.assign(new Error("CAD call cancelled due to project switch"), {
            cancelled: true,
          }),
        ),
      );
    });
  }

  /**
   * Terminate the hung worker, reject all in-flight calls, and create a fresh
   * worker so the app can continue without a page reload.
   */
  _restartWorker(reason = "adaptive-hang-detection") {
    console.warn(
      "[CadWorkerManager] CAD worker appears hung — terminating and restarting.",
    );

    if (this._hangMonitorId) {
      clearInterval(this._hangMonitorId);
      this._hangMonitorId = null;
    }

    try {
      this._rawWorker.terminate();
    } catch (e) {
      console.error("[CadWorkerManager] Error while terminating worker:", e);
    }

    // Reject every other pending call so callers get a clear error instead of
    // hanging forever.
    const pending = [...this._pendingCalls];
    this._pendingCalls = [];
    pending.forEach((entry) => {
      this._emitCadWorkerEvent("cad-worker-task-error", {
        taskId: entry.taskId,
        method: String(entry.method),
        queuedAt: entry.queuedAt,
        failedAt: Date.now(),
        atomId: entry.taskMeta?.atomId || null,
        atomType: entry.taskMeta?.atomType || null,
        moleculeName: entry.taskMeta?.moleculeName || null,
        displayLabel: this._formatTaskLabel(entry.method, entry.taskMeta),
        error: `CAD worker restarted (${reason})`,
      });
      entry.reject(
        new Error(`CAD worker was restarted (${reason})`),
      );
    });

    this._createWorker();
    this._lastQueueProgressAt = Date.now();
    this._emitCadWorkerEvent("cad-worker-restarted", {
      restartedAt: Date.now(),
      reason,
    });

    if (this.onRestartCallback) {
      this.onRestartCallback(
        "The geometry worker became unresponsive and was restarted. Please re-run any affected atoms.",
      );
    }
  }
}
