/**
 * Lightweight worker -> main-thread progress channel.
 *
 * Long-running CAD operations (e.g. `assembly`, which internally cuts many
 * parts) appear as a single opaque comlink call from the UI's perspective. To
 * surface what is happening *inside* such an operation, the worker posts a
 * custom message which CadWorkerManager forwards to the UI as a
 * `cad-worker-task-progress` CustomEvent.
 *
 * The message shape (`{ type: "cad-worker-progress", label }`) does not match
 * comlink's request/response protocol, so comlink ignores it and only our
 * dedicated listener in CadWorkerManager reacts to it.
 */

export const CAD_PROGRESS_MESSAGE_TYPE = "cad-worker-progress";

/**
 * Report intra-operation progress from inside the CAD worker.
 *
 * Safe to call from any context: it is a no-op when not running inside a
 * DedicatedWorkerGlobalScope (e.g. unit tests on the main thread).
 *
 * @param label Short human-readable description of the current sub-step,
 *   e.g. "cutting part 3/5".
 */
export function reportCadProgress(label: string): void {
  if (
    typeof self !== "undefined" &&
    typeof (self as any).postMessage === "function" &&
    typeof (self as any).document === "undefined"
  ) {
    try {
      (self as any).postMessage({ type: CAD_PROGRESS_MESSAGE_TYPE, label });
    } catch {
      // Posting progress is best-effort; never let it break the operation.
    }
  }
}

/**
 * Message type posted by the worker immediately before and after each OCCT
 * boolean `.cut()` call, carrying the two input geometry ids.
 *
 * A synchronous `.cut()` can hang indefinitely and freeze the worker thread; it
 * can only be stopped by terminating the worker. This beacon lets the main
 * thread know *which* cut is executing at any instant, so when the inactivity
 * watchdog fires it can record that exact `(toCut, cutter)` pair as a
 * known-hanging cut (see CadWorkerManager).
 */
export const CAD_BOOLEAN_INFLIGHT_TYPE = "cad-boolean-inflight";

/**
 * Announce that a boolean `.cut(toCut, cutter)` is about to run (`active=true`)
 * or has just finished (`active=false`). If the cut hangs, the `active=false`
 * message never sends (the thread is frozen), so the main thread still sees the
 * cut as in-flight — exactly what we want for pinpointing the hang.
 */
export function reportBooleanInflight(
  toCut: string,
  cutter: string,
  active: boolean,
): void {
  if (
    typeof self !== "undefined" &&
    typeof (self as any).postMessage === "function" &&
    typeof (self as any).document === "undefined"
  ) {
    try {
      (self as any).postMessage({
        type: CAD_BOOLEAN_INFLIGHT_TYPE,
        toCut,
        cutter,
        active,
      });
    } catch {
      // Best-effort; never let it break the operation.
    }
  }
}
