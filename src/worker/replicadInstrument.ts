/**
 * Counts live replicad `WrappingObj` instances by intercepting the
 * `FinalizationRegistry` that replicad uses internally to clean up
 * OCCT-backed handles.
 *
 * Background: every `Shape`, `Drawing`, `Sketch`, `Wire`, `Vertex`, etc.
 * extends `WrappingObj`, whose constructor registers the underlying OC
 * handle with a module-level `FinalizationRegistry`. When the JS wrapper
 * becomes unreachable the finalizer calls `.delete()` on the OC handle.
 * Explicit `wrapper.delete()` calls `registry.unregister(token)` first to
 * prevent the finalizer from running.
 *
 * Because we cannot reach replicad's `WrappingObj` class from outside the
 * bundle, but we CAN substitute `globalThis.FinalizationRegistry` before
 * replicad's `register.ts` evaluates, we wrap the FR class and observe:
 *   - register(...)      -> liveCount++  (new wrapper created)
 *   - unregister(token)  -> liveCount--  if the token was actually present
 *                           (explicit `.delete()` was called)
 *   - finalizer fires    -> liveCount--  (wrapper was GC'd without delete)
 *
 * IMPORTANT: this module MUST be imported BEFORE `replicad` in any file
 * that imports replicad. The static-import order is what gives us the
 * pre-replicad patching window.
 */

interface Counters {
  registered: number;
  unregistered: number;
  finalized: number;
}

const counters: Counters = {
  registered: 0,
  unregistered: 0,
  finalized: 0,
};

/**
 * Whether creation-stack tracking is active. Off by default because
 * capturing a stack trace on every `register()` call (~40k/run) is
 * measurably expensive. Enable via `enableCreationStackTracking()`.
 */
let _trackCreationStacks = false;

/**
 * Maps held-value (the OC handle object) → the JS stack at creation time.
 * Only populated when `_trackCreationStacks` is true. We key on the held
 * value (not the target/wrapper) because the target is GC'd by the time
 * the finalizer fires, while the held value is still alive at that point.
 */
const _creationStacks = new Map<object, string>();

/**
 * Buckets finalized-object creation stacks by a short fingerprint so the
 * most common un-deleted code paths float to the top.
 * key = truncated stack string, value = count of finalizations from that site.
 */
const _finalizedBySite = new Map<string, number>();

/** How many frames to keep from the raw stack (strips instrument internals). */
const STACK_FRAMES_TO_KEEP = 8;
const STACK_FRAMES_TO_SKIP = 3; // CountingFR.register + Error + this file

function _captureStack(): string {
  const raw = new Error().stack ?? "";
  const lines = raw.split("\n");
  return lines.slice(STACK_FRAMES_TO_SKIP, STACK_FRAMES_TO_SKIP + STACK_FRAMES_TO_KEEP).join("\n");
}

type FRConstructor = typeof globalThis.FinalizationRegistry;

const OriginalFR: FRConstructor | undefined = (globalThis as any)
  .FinalizationRegistry;

if (OriginalFR) {
  class CountingFinalizationRegistry<T> {
    private inner: FinalizationRegistry<T>;

    constructor(cb: (heldValue: T) => void) {
      const wrappedCb = (heldValue: T) => {
        counters.finalized++;
        if (_trackCreationStacks) {
          const stack = _creationStacks.get(heldValue as object);
          if (stack) {
            _creationStacks.delete(heldValue as object);
            _finalizedBySite.set(stack, (_finalizedBySite.get(stack) ?? 0) + 1);
          }
        }
        cb(heldValue);
      };
      this.inner = new OriginalFR!(wrappedCb);
    }

    register(target: object, heldValue: T, token?: object): void {
      counters.registered++;
      if (_trackCreationStacks) {
        _creationStacks.set(heldValue as object, _captureStack());
      }
      if (token !== undefined) {
        this.inner.register(target, heldValue, token);
      } else {
        this.inner.register(target, heldValue);
      }
    }

    unregister(token: object): boolean {
      const removed = this.inner.unregister(token);
      if (removed) counters.unregistered++;
      return removed;
    }
  }

  (globalThis as any).FinalizationRegistry = CountingFinalizationRegistry;
}

/**
 * Enable creation-stack tracking. This captures a stack trace on every
 * replicad shape construction (~40k/run), so enable it only while
 * actively diagnosing leaks, then call disableCreationStackTracking().
 */
export function enableCreationStackTracking(): void {
  _creationStacks.clear();
  _finalizedBySite.clear();
  _trackCreationStacks = true;
  console.warn("[replicadInstrument] creation-stack tracking ENABLED");
}

export function disableCreationStackTracking(): void {
  _trackCreationStacks = false;
  _creationStacks.clear();
  console.warn("[replicadInstrument] creation-stack tracking DISABLED");
}

/**
 * Returns the top N call sites (by finalization count) whose shapes were
 * cleaned up by GC rather than explicit .delete(). Call after a project
 * reload with stack tracking enabled, then trigger GC in DevTools to
 * flush pending finalizers before reading results.
 */
export function getTopFinalizedSites(topN = 20): Array<{ count: number; stack: string }> {
  return [..._finalizedBySite.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([stack, count]) => ({ count, stack }));
}

/**
 * Returns a snapshot of live-wrapper accounting. `live` is constructions
 * minus explicit-delete unregistrations minus finalizer-driven cleanups,
 * i.e. the number of replicad `WrappingObj` instances currently alive
 * (modulo non-replicad code that may also use our patched FR -- in
 * practice within a worker realm, replicad is the only consumer).
 */
export function getReplicadLiveCounts(): Counters & { live: number } {
  return {
    ...counters,
    live: counters.registered - counters.unregistered - counters.finalized,
  };
}
