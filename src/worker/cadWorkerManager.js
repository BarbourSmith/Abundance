import { wrap } from "comlink";
import {
  CAD_PROGRESS_MESSAGE_TYPE,
  CAD_BOOLEAN_INFLIGHT_TYPE,
  CAD_WASM_CRASHED_TYPE,
} from "./progress";
import { withoutSideData } from "../js/sideData.js";

/**
 * How many worker crashes a call can be caught in before it is failed instead
 * of replayed. A call that crashes every fresh worker would otherwise restart
 * it forever.
 */
const MAX_CRASH_REPLAYS = 2;

/**
 * Worker methods whose calls from the same atom supersede one another. A Code
 * atom makes one `code` call per compute and ignores the result of all but its
 * newest compute, so these calls run one at a time per atom, and a call still
 * waiting to be sent when a newer one arrives for the same atom is dropped.
 */
const SUPERSEDABLE_METHODS = new Set(["code"]);

/** localStorage key for the user's stall timeout in seconds (Settings > Advanced). */
export const CAD_TIMEOUT_STORAGE_KEY = "cadWorkerTimeoutSeconds";
export const DEFAULT_CAD_TIMEOUT_SECONDS = 90;

/** The user's stall timeout in seconds, or the default if unset or invalid. */
export function savedCadTimeoutSeconds() {
  try {
    const seconds = Number(localStorage.getItem(CAD_TIMEOUT_STORAGE_KEY));
    if (Number.isFinite(seconds) && seconds > 0) return seconds;
  } catch {
    // Storage can be unavailable (private mode, tests); use the default.
  }
  return DEFAULT_CAD_TIMEOUT_SECONDS;
}

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
 * Calls in SUPERSEDABLE_METHODS that carry an atomId are coalesced per atom:
 * while one is running in the worker, the newest later call waits and older
 * waiting calls are dropped. A dropped call's promise rejects with an error
 * marked `superseded: true`, meaning a newer call for the same atom replaced
 * it; callers should not treat that as a failure.
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
     * Per-atom coalescing for SUPERSEDABLE_METHODS, keyed by `method:atomId`
     * (see `_supersedeKey`): the call currently sent to the worker, and the
     * newest call waiting for it to finish. Both entries are also in
     * `_pendingCalls`, the running one ahead of the waiting one.
     * @type {Map<string, object>}
     */
    this._runningByKey = new Map();
    /** @type {Map<string, object>} */
    this._waitingByKey = new Map();
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

    /**
     * The most recent worker "activity" line (an operation begin- or
     * phase-marker forwarded from the worker thread). Unlike the bounded ring
     * buffer, this single value is never scrolled away by a burst of fast ops,
     * so it still identifies the exact sub-operation that was in flight when the
     * inactivity watchdog fires — the key to pinpointing a >90s synchronous
     * OCCT stall.
     * @type {{message: string, timestamp: string} | null}
     */
    this._lastWorkerActivity = null;

    /**
     * The `(toCut, cutter)` ids of the boolean `.cut()` currently executing in
     * the worker, or null when no cut is in flight. Set/cleared by the
     * `cad-boolean-inflight` beacons the worker posts around each `.cut()`. If a
     * cut hangs, the "clear" beacon never arrives (the worker thread is frozen),
     * so this stays populated — telling the watchdog exactly which cut hung.
     * @type {{toCut: string, cutter: string} | null}
     */
    this._lastBooleanInflight = null;

    /**
     * Boolean cuts known to hang the worker, keyed by `toCut\u0000cutter`. When
     * a `.cut()` times out it is recorded here (and persisted), then injected
     * into every worker so it is skipped on future runs — the assembly surfaces
     * the two offending parts in red instead of hanging again.
     * @type {Map<string, {toCut: string, cutter: string}>}
     */
    this._badCuts = new Map();
    this._loadBadCuts();

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
    // Seed the fresh worker with the known-hanging cuts so it skips them
    // (surfacing the two parts in red) instead of hanging again.
    this._injectBadCuts();
  }

  /** localStorage key holding the persisted known-hanging cuts. */
  static _BAD_CUTS_STORAGE_KEY = "abundance-known-hanging-cuts";

  /** Load persisted known-hanging cuts (best-effort; safe outside a browser). */
  _loadBadCuts() {
    try {
      if (typeof localStorage === "undefined") return;
      const raw = localStorage.getItem(CadWorkerManager._BAD_CUTS_STORAGE_KEY);
      if (!raw) return;
      const pairs = JSON.parse(raw);
      if (!Array.isArray(pairs)) return;
      for (const p of pairs) {
        if (p && p.toCut && p.cutter) {
          this._badCuts.set(`${p.toCut}\u0000${p.cutter}`, {
            toCut: p.toCut,
            cutter: p.cutter,
          });
        }
      }
    } catch (e) {
      console.warn("[CadWorkerManager] Failed to load known-hanging cuts:", e);
    }
  }

  /** Persist the current known-hanging cuts (best-effort). */
  _saveBadCuts() {
    try {
      if (typeof localStorage === "undefined") return;
      localStorage.setItem(
        CadWorkerManager._BAD_CUTS_STORAGE_KEY,
        JSON.stringify([...this._badCuts.values()]),
      );
    } catch (e) {
      console.warn("[CadWorkerManager] Failed to persist known-hanging cuts:", e);
    }
  }

  /** Push the known-hanging cuts to the (current) worker so it skips them. */
  _injectBadCuts() {
    if (this._badCuts.size === 0) return;
    try {
      // Fire-and-forget; ordering vs. subsequent calls is preserved because
      // comlink delivers messages in submission order and every handler is
      // gated on the same `started` init promise in the worker.
      this._proxy.setBadCuts([...this._badCuts.values()]);
    } catch (e) {
      console.warn("[CadWorkerManager] Failed to inject known-hanging cuts:", e);
    }
  }

  /** Record a boolean cut that hung the worker, persist it, and remember it. */
  _recordBadCut(pair) {
    const key = `${pair.toCut}\u0000${pair.cutter}`;
    if (this._badCuts.has(key)) return;
    this._badCuts.set(key, { toCut: pair.toCut, cutter: pair.cutter });
    this._saveBadCuts();
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
      const message = String(log.message ?? "");
      const timestamp = log.timestamp || new Date().toISOString();
      this._workerLogs.push({
        level: log.level || "log",
        message,
        timestamp,
      });
      // Remember the most recent operation begin-/phase-marker so the stalled
      // sub-operation is still known even after a burst of fast ops scrolls the
      // ring buffer past it.
      if (message.includes(" starting") || message.includes(" phase:")) {
        this._lastWorkerActivity = { message, timestamp };
      }
      // Bound memory: keep only the most recent 1000 lines.
      if (this._workerLogs.length > 1000) {
        this._workerLogs.splice(0, this._workerLogs.length - 1000);
      }
      return;
    }
    // Boolean `.cut()` in-flight beacon (see src/worker/progress.ts). Tracks the
    // exact cut executing right now so a hang can be attributed to it precisely.
    if (data.type === CAD_BOOLEAN_INFLIGHT_TYPE) {
      this._lastBooleanInflight = data.active
        ? { toCut: data.toCut, cutter: data.cutter }
        : null;
      return;
    }
    // OpenCascade crashed in the worker (a WebAssembly trap or out of memory),
    // so its memory may be corrupt and every later call in it can fail.
    // Replace it and replay the pending calls, including the one that crashed.
    if (data.type === CAD_WASM_CRASHED_TYPE) {
      this._restartWorker("crash", String(data.message ?? ""));
      return;
    }
    if (data.type !== CAD_PROGRESS_MESSAGE_TYPE) {
      return;
    }
    // The entry whose watchdog is running (the first call in the queue).
    const activeEntry =
      this._pendingCalls.find((entry) => entry.startTime) ||
      this._pendingCalls[0];
    if (!activeEntry) {
      return;
    }
    // The worker is demonstrably making progress, so reset the inactivity
    // watchdog. A long-running operation only times out if it goes silent for
    // `_timeoutMs` (truly stalled), not merely because it takes a long time.
    if (activeEntry.timeoutId) {
      this._armTimeout(activeEntry);
    }
    // The worker runs several calls concurrently, so the queue head is not
    // necessarily the call that reported. Prefer the call from the reporting
    // atom when the message says which one it was.
    const reportingEntry =
      (data.atomId &&
        this._pendingCalls.find(
          (entry) => entry.taskMeta?.atomId === data.atomId,
        )) ||
      activeEntry;
    if (reportingEntry !== activeEntry && reportingEntry.timeoutId) {
      this._armTimeout(reportingEntry);
    }
    // A call behind the queue head that reports progress is demonstrably
    // running (possibly holding the worker thread while the head waits), so
    // tell the UI it has started even though its watchdog isn't armed yet.
    if (reportingEntry.startTime === null && !reportingEntry.announcedAt) {
      reportingEntry.announcedAt = Date.now();
      this._emitTaskStart(reportingEntry, reportingEntry.announcedAt);
    }
    reportingEntry.lastProgressAt = Date.now();
    this._emitCadWorkerEvent("cad-worker-task-progress", {
      taskId: reportingEntry.taskId,
      label: data.label || null,
      at: reportingEntry.lastProgressAt,
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
    this._emitTaskStart(entry, entry.announcedAt || entry.startTime);

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

  /** Tell the UI a call is now running in the worker. */
  _emitTaskStart(entry, startedAt) {
    this._emitCadWorkerEvent("cad-worker-task-start", {
      taskId: entry.taskId,
      method: String(entry.method),
      queuedAt: entry.queuedAt,
      startedAt,
      queueWaitMs: startedAt - entry.queuedAt,
      queueDepth: Math.max(this._pendingCalls.indexOf(entry), 0),
      atomId: entry.taskMeta?.atomId || null,
      atomType: entry.taskMeta?.atomType || null,
      moleculeName: entry.taskMeta?.moleculeName || null,
      displayLabel: this._formatTaskLabel(entry.method, entry.taskMeta),
    });
  }

  /**
   * (Re)arm the inactivity watchdog for an actively-processing entry. Any
   * previously-scheduled timeout is cleared first, so calling this on each
   * progress report effectively keeps a making-progress operation alive.
   */
  _armTimeout(entry, delayMs = this._timeoutMs) {
    if (entry.timeoutId) {
      clearTimeout(entry.timeoutId);
    }
    // A shorter delay means the entry has already been silent for the rest.
    entry.lastActivityAt = Date.now() - (this._timeoutMs - delayMs);
    entry.timeoutId = setTimeout(() => {
      clearInterval(entry.progressIntervalId);
      entry.progressIntervalId = null;

      // If a specific boolean `.cut()` was in flight when the worker went
      // silent, that cut is the hang. Record it as known-hanging (persisted +
      // injected into the restarted worker) and re-dispatch this same call
      // rather than rejecting it: on the re-run the worker skips the cut and the
      // assembly resolves to the two offending parts in red, so the atom
      // succeeds (loudly) in this session instead of erroring.
      const inflightCut = this._lastBooleanInflight;
      if (inflightCut && inflightCut.toCut && inflightCut.cutter) {
        this._recordBadCut(inflightCut);
        this._lastBooleanInflight = null;
        const degradedMessage = `CAD worker cut timed out; marking as hanging and retrying (parts will show red): ${inflightCut.toCut} cut by ${inflightCut.cutter}`;
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
          badCut: inflightCut,
          degraded: true,
          error: degradedMessage,
        });
        // Keep `entry` in `_pendingCalls` so `_restartWorker` re-dispatches it
        // onto the fresh worker (which now knows the cut is bad and skips it).
        this._restartWorker();
        return;
      }

      this._pendingCalls = this._pendingCalls.filter((c) => c !== entry);
      // Fold in the last known worker activity so the stall message pinpoints the
      // exact sub-operation that hung (e.g. "[op] rotate#... starting"), which is
      // otherwise invisible once the ring buffer scrolls.
      const activity = this._lastWorkerActivity;
      const activitySuffix = activity
        ? ` — last worker activity: ${activity.message}`
        : "";
      const message = `CAD worker stalled on "${String(entry.method)}" — no progress for ${this._timeoutMs}ms${activitySuffix}`;
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
        lastWorkerActivity: activity || null,
        error: message,
      });
      entry.reject(new Error(message));
      this._restartWorker();
    }, delayMs);
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
      const { callArgs: rawArgs, taskMeta } = this._stripTaskMeta(args);
      // The worker only handles geometry. Labels, reference images and other
      // side data stay on the main thread (see src/js/sideData.js), which
      // also keeps them out of the worker's cache keys.
      const callArgs = rawArgs.map((arg) =>
        Array.isArray(arg) ? arg.map(withoutSideData) : withoutSideData(arg),
      );

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
        supersedeKey: this._supersedeKey(method, taskMeta),
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
      // (no other call ahead of it in the queue). A call that has to wait for
      // an older one is never the head, since that older call is ahead of it.
      if (this._pendingCalls[0] === entry) {
        this._startTimers(entry);
      }

      this._dispatchOrWait(entry);
    });
  }

  /**
   * The key under which a call supersedes older calls, or null if it never
   * does: only SUPERSEDABLE_METHODS calls that say which atom made them.
   * @param {string|symbol} method
   * @param {object|null} taskMeta
   * @returns {string|null}
   */
  _supersedeKey(method, taskMeta) {
    const atomId = taskMeta?.atomId;
    if (atomId == null || !SUPERSEDABLE_METHODS.has(String(method))) {
      return null;
    }
    return `${String(method)}:${atomId}`;
  }

  /**
   * Send a new call to the worker, unless an older call from the same atom is
   * still running there. Then it waits behind that call, replacing any call
   * already waiting, and is sent when the running call finishes.
   * @param {object} entry
   */
  _dispatchOrWait(entry) {
    const key = entry.supersedeKey;
    if (key) {
      const waiting = this._waitingByKey.get(key);
      if (waiting) {
        this._supersede(waiting, entry);
      }
      if (this._runningByKey.has(key)) {
        this._waitingByKey.set(key, entry);
        return;
      }
      this._runningByKey.set(key, entry);
    }
    this._dispatch(entry);
  }

  /**
   * After a running call has settled and left `_pendingCalls`, send the call
   * waiting behind it, if there is one.
   * @param {object} entry
   */
  _sendWaitingCall(entry) {
    const key = entry.supersedeKey;
    // After cancelAll() a newer call may already hold the slot.
    if (!key || this._runningByKey.get(key) !== entry) {
      return;
    }
    this._runningByKey.delete(key);
    const next = this._waitingByKey.get(key);
    if (next) {
      this._waitingByKey.delete(key);
      this._runningByKey.set(key, next);
      this._dispatch(next);
    }
  }

  /**
   * Drop a call that a newer call from the same atom replaces, without running
   * it (or, on a restart, without running it again). Its promise rejects with
   * `superseded: true`.
   * @param {object} entry - The call being dropped.
   * @param {object} newer - The call replacing it.
   */
  _supersede(entry, newer) {
    clearInterval(entry.progressIntervalId);
    entry.progressIntervalId = null;
    clearTimeout(entry.timeoutId);
    entry.timeoutId = null;
    this._pendingCalls = this._pendingCalls.filter((c) => c !== entry);
    const key = entry.supersedeKey;
    if (this._waitingByKey.get(key) === entry) {
      this._waitingByKey.delete(key);
    }
    if (this._runningByKey.get(key) === entry) {
      this._runningByKey.delete(key);
    }
    this._emitCadWorkerEvent("cad-worker-task-cancelled", {
      taskId: entry.taskId,
      method: String(entry.method),
      queuedAt: entry.queuedAt,
      cancelledAt: Date.now(),
      reason: "superseded",
      supersededBy: newer.taskId,
      atomId: entry.taskMeta?.atomId || null,
      atomType: entry.taskMeta?.atomType || null,
      moleculeName: entry.taskMeta?.moleculeName || null,
      displayLabel: this._formatTaskLabel(entry.method, entry.taskMeta),
    });
    entry.reject(
      Object.assign(
        new Error(
          `CAD call superseded by a newer "${String(entry.method)}" call from the same atom`,
        ),
        { superseded: true },
      ),
    );
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
        this._sendWaitingCall(entry);
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
        this._sendWaitingCall(entry);
        this._activateNextCall();
        entry.reject(err);
      },
    );
  }

  /**
   * Change the stall timeout (Settings > Advanced). Running calls keep the time
   * they have already been silent, so lowering it can time one out at once.
   * @param {number} timeoutMs
   */
  setTimeoutMs(timeoutMs) {
    this._timeoutMs = timeoutMs;
    for (const entry of this._pendingCalls) {
      if (!entry.timeoutId) continue;
      const silentMs = Date.now() - entry.lastActivityAt;
      this._armTimeout(entry, Math.max(0, timeoutMs - silentMs));
    }
  }

  /**
   * Snapshot of the current worker queue for diagnostics (System State Report).
   * The entry with a `startTime` is the queue head, whose watchdog is armed.
   * The worker runs calls concurrently, though, so a call further back may be
   * the one actually holding the worker thread; `lastProgressAt` shows which
   * calls have recently reported progress.
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
      // False while the call waits for an older call from the same atom.
      sentToWorker: entry.epoch !== null,
      queuedAt: entry.queuedAt,
      startedAt: entry.startTime,
      queueWaitMs: entry.startTime ? entry.startTime - entry.queuedAt : null,
      runningMs: entry.startTime ? now - entry.startTime : null,
      lastProgressAt: entry.lastProgressAt || null,
    });

    const activeEntry =
      this._pendingCalls.find((entry) => entry.startTime) || null;

    return {
      timeoutMs: this._timeoutMs,
      workerEpoch: this._workerEpoch,
      pendingCount: this._pendingCalls.length,
      lastWorkerActivity: this._lastWorkerActivity,
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
    this._runningByKey.clear();
    this._waitingByKey.clear();
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
   * Terminate the hung or crashed worker and create a fresh one so the app can
   * continue without a page reload.
   *
   * After a timeout, the hung call has already been removed from
   * `_pendingCalls` and rejected by the inactivity watchdog (`_armTimeout`)
   * before this runs. The remaining entries are therefore innocent
   * queued/in-flight calls: rather than rejecting them (which errored valid
   * atoms as collateral damage), they are re-dispatched to the fresh worker so
   * the rest of the queue resumes automatically. The exception is a call that
   * a newer call from the same atom supersedes: it is dropped and only the
   * newer call runs.
   *
   * After a crash, no call has been rejected: the crash usually means the
   * worker ran out of memory, which any call could have tipped over, so all of
   * them are replayed. A call caught in more than `MAX_CRASH_REPLAYS` crashes
   * is failed instead.
   * @param {"timeout" | "crash"} [reason]
   * @param {string} [crashMessage] - What the crash reported, for "crash".
   */
  _restartWorker(reason = "timeout", crashMessage = "") {
    console.warn(
      reason === "crash"
        ? `[CadWorkerManager] CAD worker crashed (${crashMessage}) — terminating and restarting.`
        : "[CadWorkerManager] CAD worker appears hung — terminating and restarting.",
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
    let survivors = [...this._pendingCalls];
    survivors.forEach((entry) => {
      clearInterval(entry.progressIntervalId);
      entry.progressIntervalId = null;
      clearTimeout(entry.timeoutId);
      entry.timeoutId = null;
      entry.startTime = null;
      entry.announcedAt = null;
      entry.lastProgressAt = null;
    });

    if (reason === "crash") {
      survivors = survivors.filter((entry) => {
        entry.crashReplays = (entry.crashReplays || 0) + 1;
        if (entry.crashReplays <= MAX_CRASH_REPLAYS) return true;
        this._failCrashedCall(entry, crashMessage);
        return false;
      });
    }

    // Spawn the fresh worker (bumps `_workerEpoch`).
    this._createWorker();

    // Where an atom has a running call and a newer one waiting, run only the
    // newer one: the atom would discard the older result, and re-running it
    // could hang the fresh worker the same way (e.g. a Code atom run with a
    // missing input).
    const newestByKey = new Map();
    survivors.forEach((entry) => {
      if (entry.supersedeKey) newestByKey.set(entry.supersedeKey, entry);
    });
    this._runningByKey.clear();
    this._waitingByKey.clear();
    const replayed = survivors.filter((entry) => {
      if (!entry.supersedeKey) return true;
      const newest = newestByKey.get(entry.supersedeKey);
      if (newest !== entry) {
        this._supersede(entry, newest);
        return false;
      }
      this._runningByKey.set(entry.supersedeKey, entry);
      return true;
    });

    // Re-issue the remaining survivors onto the new worker. Re-emit
    // `cad-worker-task-queued` so the UI's queue depth reflects the replayed work.
    replayed.forEach((entry) => {
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
      reason,
    });

    if (this.onRestartCallback) {
      this.onRestartCallback(
        reason === "crash"
          ? "The geometry worker crashed, probably by running out of memory. It was restarted and the unfinished work resumed automatically."
          : "The geometry worker timed out. The offending operation was dropped and the remaining work resumed automatically.",
      );
    }
  }

  /**
   * Fail a call that has been caught in too many worker crashes, instead of
   * replaying it on yet another worker.
   * @param {object} entry
   * @param {string} crashMessage
   */
  _failCrashedCall(entry, crashMessage) {
    this._pendingCalls = this._pendingCalls.filter((c) => c !== entry);
    const failedAt = Date.now();
    const message = `The CAD worker crashed ${entry.crashReplays} times while running this operation: ${crashMessage}`;
    this._emitCadWorkerEvent("cad-worker-task-error", {
      taskId: entry.taskId,
      method: String(entry.method),
      queuedAt: entry.queuedAt,
      startedAt: entry.startTime,
      failedAt,
      durationMs: null,
      queueWaitMs: null,
      queueDepth: this._pendingCalls.length,
      atomId: entry.taskMeta?.atomId || null,
      atomType: entry.taskMeta?.atomType || null,
      moleculeName: entry.taskMeta?.moleculeName || null,
      displayLabel: this._formatTaskLabel(entry.method, entry.taskMeta),
      error: message,
    });
    entry.reject(new Error(message));
  }
}
