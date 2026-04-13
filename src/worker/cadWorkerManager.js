import { wrap } from "comlink";

/**
 * Wraps a comlink-based Web Worker with a per-call timeout watchdog.
 *
 * If any call to the CAD worker takes longer than `timeoutMs`, the worker is
 * considered hung: the call (and every other in-flight call) is rejected with a
 * descriptive error, the underlying Worker is terminated, and a fresh Worker is
 * spawned so subsequent calls continue to work.
 *
 * Usage:
 *   const cad = new CadWorkerManager(cadWorker, 60_000);
 *   // Then use `cad` exactly like the plain comlink proxy.
 *
 * The constructor returns a JS Proxy, so every property access that is not an
 * internal manager method is transparently forwarded to the live comlink proxy
 * with a timeout guard.
 */
export class CadWorkerManager {
  /**
   * @param {new () => Worker} WorkerFactory - The Vite `?worker` import (a constructor).
   * @param {number} [timeoutMs=60000] - Milliseconds before a call is considered hung.
   */
  constructor(WorkerFactory, timeoutMs = 60_000) {
    this._WorkerFactory = WorkerFactory;
    this._timeoutMs = timeoutMs;
    /** @type {Array<{reject: Function, timeoutId: ReturnType<typeof setTimeout>}>} */
    this._pendingCalls = [];
    /**
     * Optional callback invoked when the worker is restarted due to a timeout.
     * Assign this from outside (e.g. from AppContent) to show a UI notification.
     * Signature: (message: string) => void
     * @type {((message: string) => void) | null}
     */
    this.onRestartCallback = null;

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
    this._rawWorker = new this._WorkerFactory();
    this._proxy = wrap(this._rawWorker);
  }

  /**
   * Dispatch a call to the live comlink proxy, racing against the timeout.
   * @param {string|symbol} method
   * @param {unknown[]} args
   * @returns {Promise<unknown>}
   */
  _call(method, args) {
    return new Promise((resolve, reject) => {
      const entry = { reject, timeoutId: null, progressIntervalId: null };
      const startTime = Date.now();

      // Log progress every 5 seconds so it's visible in the console.
      entry.progressIntervalId = setInterval(() => {
        const elapsed = Math.round((Date.now() - startTime) / 1000);
        const remaining = Math.round(
          (this._timeoutMs - (Date.now() - startTime)) / 1000,
        );
        console.log(
          `[CadWorkerManager] ⏳ "${String(method)}" still running — ${elapsed}s elapsed, ${remaining}s until timeout`,
        );
      }, 5000);

      const cleanup = () => {
        clearInterval(entry.progressIntervalId);
        entry.progressIntervalId = null;
      };

      const timeoutId = setTimeout(() => {
        cleanup();
        const elapsed = Math.round((Date.now() - startTime) / 1000);
        console.log(
          `[CadWorkerManager] ⏱ TIMEOUT fired for "${String(method)}" after ${elapsed}s — restarting worker`,
        );
        this._pendingCalls = this._pendingCalls.filter((c) => c !== entry);
        reject(
          new Error(
            `CAD worker timed out on "${String(method)}" after ${this._timeoutMs}ms`,
          ),
        );
        this._restartWorker();
      }, this._timeoutMs);

      entry.timeoutId = timeoutId;
      this._pendingCalls.push(entry);

      this._proxy[method](...args).then(
        (result) => {
          cleanup();
          clearTimeout(timeoutId);
          this._pendingCalls = this._pendingCalls.filter((c) => c !== entry);
          resolve(result);
        },
        (err) => {
          cleanup();
          clearTimeout(timeoutId);
          this._pendingCalls = this._pendingCalls.filter((c) => c !== entry);
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
    console.log(
      `[CadWorkerManager] cancelAll — clearing ${this._pendingCalls.length} in-flight call(s)`,
    );
    const pending = [...this._pendingCalls];
    this._pendingCalls = [];
    pending.forEach((entry) => {
      clearInterval(entry.progressIntervalId);
      clearTimeout(entry.timeoutId);
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
  _restartWorker() {
    console.warn(
      "[CadWorkerManager] CAD worker appears hung — terminating and restarting.",
    );

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
      clearInterval(entry.progressIntervalId);
      clearTimeout(entry.timeoutId);
      entry.reject(
        new Error("CAD worker was restarted because another call timed out"),
      );
    });

    this._createWorker();
    console.log("[CadWorkerManager] Fresh CAD worker is ready.");

    if (this.onRestartCallback) {
      this.onRestartCallback(
        "The geometry worker timed out and was restarted. Please re-run any affected atoms.",
      );
    }
  }
}
