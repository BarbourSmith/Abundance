import { wrap } from "comlink";
import { CAD_PROGRESS_MESSAGE_TYPE } from "./progress";

/**
 * Wraps a comlink-based Web Worker with a per-call timeout watchdog.
 *
 * If any call to the CAD worker takes longer than `timeoutMs`, the worker is
 * considered hung: the call (and every other in-flight call) is rejected with a
 * descriptive error, the underlying Worker is terminated, and a fresh Worker is
 * spawned so subsequent calls continue to work.
 *
 * The timeout is an *inactivity* watchdog: it is reset every time the worker
 * reports mid-computation progress (see src/worker/progress.ts), so a genuinely
 * long-running operation that keeps emitting progress will not be killed — only
 * one that goes silent for `timeoutMs` is treated as stalled.
 *
 * Usage:
 *   const cad = new CadWorkerManager(cadWorker, 120_000);
 *   // Then use `cad` exactly like the plain comlink proxy.
 *
 * The constructor returns a JS Proxy, so every property access that is not an
 * internal manager method is transparently forwarded to the live comlink proxy
 * with a timeout guard.
 */
export class CadWorkerManager {
  /**
   * @param {new () => Worker} WorkerFactory - The Vite `?worker` import (a constructor).
   * @param {number} [timeoutMs=120000] - Milliseconds before a call is considered hung.
   */
  constructor(WorkerFactory, timeoutMs = 120_000) {
    this._WorkerFactory = WorkerFactory;
    this._timeoutMs = timeoutMs;
    /** @type {Array<{reject: Function, timeoutId: ReturnType<typeof setTimeout>}>} */
    this._pendingCalls = [];
    /**
     * Monotonic counter identifying the live worker. It is bumped every time a
     * fresh worker is created (initial spawn and every restart). Each dispatched
     * call records the epoch it was issued under; when its comlink promise
     * settles we ignore the result if the epoch no longer matches, because that
     * settlement came from a worker that has since been terminated.
     */
    this._workerEpoch = 0;
    /**
     * Optional callback invoked when the worker is restarted due to a timeout.
     * Assign this from outside (e.g. from AppContent) to show a UI notification.
     * Signature: (message: string) => void
     * @type {((message: string) => void) | null}
     */
    this.onRestartCallback = null;

    /**
     * Ring buffer of the most recent log lines forwarded from the worker
     * thread (console.error/warn + uncaught errors/rejections). Worker-thread
     * logs are otherwise invisible to the main-thread console interceptor, so
     * this is the only way batch-leak warnings and OCCT failures show up in a
     * System State Report. Persists across worker restarts.
     * @type {Array<{level: string, message: string, timestamp: string}>}
     */
    this._workerLogs = [];

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
    this._workerEpoch += 1;
    this._rawWorker = new this._WorkerFactory();
    this._proxy = wrap(this._rawWorker);
    // Listen for intra-operation progress messages posted by the worker
    // (see src/worker/progress.ts). These are forwarded to the UI as
    // `cad-worker-task-progress` CustomEvents. Comlink ignores them because
    // they do not match its request/response protocol.
    this._rawWorker.addEventListener("message", this._onWorkerMessage);
  }

  _onWorkerMessage = (event) => {
    const data = event?.data;
    if (!data) {
      return;
    }
    // Worker-thread log forwarding (see src/worker/worker.ts). Captured into a
    // ring buffer so it can be included in diagnostics. Comlink ignores these
    // because they do not match its request/response protocol.
    if (data.__abundanceWorkerLog) {
      const log = data.__abundanceWorkerLog;
      this._workerLogs.push({
        level: log.level || "log",
        message: String(log.message ?? ""),
        timestamp: log.timestamp || new Date().toISOString(),
      });
      // Bound memory: keep only the most recent 100 lines.
      if (this._workerLogs.length > 100) {
        this._workerLogs.splice(0, this._workerLogs.length - 100);
      }
      return;
    }
    if (data.type !== CAD_PROGRESS_MESSAGE_TYPE) {
      return;
    }
    // Attribute the progress to the task the worker is actively processing
    // (the first call in the queue, whose timers are running).
    const activeEntry =
      this._pendingCalls.find((entry) => entry.startTime) ||
      this._pendingCalls[0];
    if (!activeEntry) {
      return;
    }    // The operation is demonstrably making progress, so reset the inactivity
    // watchdog. A long-running operation only times out if it goes silent for
    // `_timeoutMs` (truly stalled), not merely because it takes a long time.
    if (activeEntry.timeoutId) {
      this._armTimeout(activeEntry);
    }    this._emitCadWorkerEvent("cad-worker-task-progress", {
      taskId: activeEntry.taskId,
      label: data.label || null,
    });
  };

  _emitCadWorkerEvent(type, detail) {
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
   * Start timeout and progress-logging timers for an entry that is now
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

    // Log progress every 5 seconds so it's visible in the console.
    entry.progressIntervalId = setInterval(() => {
      const elapsed = Math.round((Date.now() - entry.startTime) / 1000);
      const remaining = Math.round(
        (this._timeoutMs - (Date.now() - entry.startTime)) / 1000,
      );

    }, 5000);

    // Arm the inactivity watchdog. It is reset every time the worker reports
    // mid-computation progress (see `_onWorkerMessage`), so it only fires when
    // the worker has been silent for `_timeoutMs`.
    this._armTimeout(entry);
  }

  /**
   * (Re)arm the inactivity watchdog for an actively-processing entry. Any
   * previously-scheduled timeout is cleared first, so calling this on each
   * progress report effectively keeps a making-progress operation alive.
   */
  _armTimeout(entry) {
    if (entry.timeoutId) {
      clearTimeout(entry.timeoutId);
    }
    entry.lastActivityAt = Date.now();
    entry.timeoutId = setTimeout(() => {
      clearInterval(entry.progressIntervalId);
      entry.progressIntervalId = null;

      this._pendingCalls = this._pendingCalls.filter((c) => c !== entry);
      const message = `CAD worker stalled on "${String(entry.method)}" — no progress for ${this._timeoutMs}ms`;
      this._emitCadWorkerEvent("cad-worker-task-error", {
        taskId: entry.taskId,
        method: String(entry.method),
        queuedAt: entry.queuedAt,
        startedAt: entry.startTime,
        failedAt: Date.now(),
        durationMs: entry.startTime ? Date.now() - entry.startTime : null,
        queueWaitMs: entry.startTime ? entry.startTime - entry.queuedAt : null,
        queueDepth: this._pendingCalls.length,
        atomId: entry.taskMeta?.atomId || null,
        atomType: entry.taskMeta?.atomType || null,
        moleculeName: entry.taskMeta?.moleculeName || null,
        displayLabel: this._formatTaskLabel(entry.method, entry.taskMeta),
        error: message,
      });
      entry.reject(new Error(message));
      this._restartWorker();
    }, this._timeoutMs);
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

      const entry = {
        resolve,
        reject,
        timeoutId: null,
        progressIntervalId: null,
        method,
        callArgs,
        startTime: null,
        taskId,
        queuedAt,
        taskMeta,
        epoch: null,
      };

      this._pendingCalls.push(entry);
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

      this._dispatch(entry);
    });
  }

  /**
   * Issue (or re-issue) an entry's call to the current comlink proxy and wire up
   * its success/error handling. Used both for the initial dispatch and when a
   * surviving queued entry is replayed on a fresh worker after a restart.
   *
   * The entry is stamped with the live `_workerEpoch`; if its comlink promise
   * settles after the worker has been replaced (epoch mismatch), the settlement
   * is ignored because it originates from a terminated worker.
   * @param {object} entry
   */
  _dispatch(entry) {
    const dispatchEpoch = this._workerEpoch;
    entry.epoch = dispatchEpoch;

    const cleanup = () => {
      clearInterval(entry.progressIntervalId);
      entry.progressIntervalId = null;
      clearTimeout(entry.timeoutId);
      entry.timeoutId = null;
    };

    this._proxy[entry.method](...entry.callArgs).then(
      (result) => {
        // Stale settlement from a worker that was already replaced — the entry
        // has since been re-dispatched (or rejected) on the new worker.
        if (dispatchEpoch !== this._workerEpoch) {
          return;
        }
        cleanup();
        this._pendingCalls = this._pendingCalls.filter((c) => c !== entry);
        const finishedAt = Date.now();
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
        entry.resolve(result);
      },
      (err) => {
        // Stale settlement from a worker that was already replaced.
        if (dispatchEpoch !== this._workerEpoch) {
          return;
        }
        cleanup();
        this._pendingCalls = this._pendingCalls.filter((c) => c !== entry);
        const failedAt = Date.now();
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
        entry.reject(err);
      },
    );
  }

  /**
   * Update the inactivity timeout used for future calls and for the currently
   * active call (if any).
   * @param {number} timeoutMs
   * @returns {number} The normalized timeout currently in use.
   */
  setTimeoutMs(timeoutMs) {
    const parsed = Number(timeoutMs);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return this._timeoutMs;
    }

    this._timeoutMs = Math.round(parsed);

    // Re-arm the active watchdog so a changed timeout takes effect immediately
    // without waiting for the next queued call.
    const activeEntry =
      this._pendingCalls.find((entry) => entry.startTime) || null;
    if (activeEntry && activeEntry.timeoutId) {
      this._armTimeout(activeEntry);
    }

    return this._timeoutMs;
  }

  /**
   * @returns {number}
   */
  getTimeoutMs() {
    return this._timeoutMs;
  }

  /**
   * Snapshot of the current worker queue for diagnostics (System State Report).
   * The worker processes calls serially, so the entry with a `startTime` is the
   * one actively blocking everything behind it.
   * @returns {{
   *   timeoutMs: number,
   *   workerEpoch: number,
   *   pendingCount: number,
   *   activeTask: object | null,
   *   queue: object[]
   * }}
   */
  getQueueSnapshot() {
    const now = Date.now();
    const describe = (entry, index) => ({
      index,
      taskId: entry.taskId,
      method: String(entry.method),
      displayLabel: this._formatTaskLabel(entry.method, entry.taskMeta),
      atomId: entry.taskMeta?.atomId || null,
      atomType: entry.taskMeta?.atomType || null,
      moleculeName: entry.taskMeta?.moleculeName || null,
      isActive: entry.startTime !== null,
      queuedAt: entry.queuedAt,
      startedAt: entry.startTime,
      queueWaitMs: entry.startTime ? entry.startTime - entry.queuedAt : null,
      runningMs: entry.startTime ? now - entry.startTime : null,
    });

    const activeEntry =
      this._pendingCalls.find((entry) => entry.startTime) || null;

    return {
      timeoutMs: this._timeoutMs,
      workerEpoch: this._workerEpoch,
      pendingCount: this._pendingCalls.length,
      activeTask: activeEntry
        ? describe(activeEntry, this._pendingCalls.indexOf(activeEntry))
        : null,
      queue: this._pendingCalls.map(describe),
    };
  }

  /**
   * The most recent log lines forwarded from the worker thread. Useful for
   * spotting batch-operation leaks and OCCT failures that never reach the
   * main-thread console.
   * @param {number} [limit=100]
   * @returns {Array<{level: string, message: string, timestamp: string}>}
   */
  getRecentWorkerLogs(limit = 100) {
    if (limit >= this._workerLogs.length) {
      return [...this._workerLogs];
    }
    return this._workerLogs.slice(-limit);
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
      clearInterval(entry.progressIntervalId);
      clearTimeout(entry.timeoutId);
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
   * Terminate the hung worker and create a fresh one so the app can continue
   * without a page reload.
   *
   * The hung call has already been removed from `_pendingCalls` and rejected by
   * the inactivity watchdog (`_armTimeout`) before this runs. The remaining
   * entries are therefore innocent queued/in-flight calls: rather than rejecting
   * them (which errored valid atoms as collateral damage), they are re-dispatched
   * to the fresh worker so the rest of the queue resumes automatically.
   */
  _restartWorker() {
    console.warn(
      "[CadWorkerManager] CAD worker appears hung — terminating and restarting.",
    );

    try {
      this._rawWorker.removeEventListener("message", this._onWorkerMessage);
      this._rawWorker.terminate();
    } catch (e) {
      console.error("[CadWorkerManager] Error while terminating worker:", e);
    }

    // Snapshot the survivors (everything still queued after the hung call was
    // already removed) and clear their stale timers. Their old comlink promises
    // belong to the now-terminated worker and will never settle; even if one
    // somehow did, the epoch stamp applied below makes `_dispatch` ignore it.
    const survivors = [...this._pendingCalls];
    survivors.forEach((entry) => {
      clearInterval(entry.progressIntervalId);
      entry.progressIntervalId = null;
      clearTimeout(entry.timeoutId);
      entry.timeoutId = null;
      entry.startTime = null;
    });

    // Spawn the fresh worker (bumps `_workerEpoch`).
    this._createWorker();

    // Re-issue every survivor onto the new worker. Re-emit `cad-worker-task-queued`
    // so the UI's queue depth reflects the replayed work.
    survivors.forEach((entry) => {
      this._emitCadWorkerEvent("cad-worker-task-queued", {
        taskId: entry.taskId,
        method: String(entry.method),
        queuedAt: entry.queuedAt,
        queueDepth: Math.max(this._pendingCalls.indexOf(entry), 0),
        atomId: entry.taskMeta?.atomId || null,
        atomType: entry.taskMeta?.atomType || null,
        moleculeName: entry.taskMeta?.moleculeName || null,
        displayLabel: this._formatTaskLabel(entry.method, entry.taskMeta),
      });
      this._dispatch(entry);
    });

    // Start the inactivity watchdog for the new head of the queue.
    this._activateNextCall();

    this._emitCadWorkerEvent("cad-worker-restarted", {
      restartedAt: Date.now(),
      reason: "timeout",
    });

    if (this.onRestartCallback) {
      this.onRestartCallback(
        "The geometry worker timed out. The offending operation was dropped and the remaining work resumed automatically.",
      );
    }
  }
}
