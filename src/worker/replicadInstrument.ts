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

type FRConstructor = typeof globalThis.FinalizationRegistry;

const OriginalFR: FRConstructor | undefined = (globalThis as any)
  .FinalizationRegistry;

if (OriginalFR) {
  class CountingFinalizationRegistry<T> {
    private inner: FinalizationRegistry<T>;

    constructor(cb: (heldValue: T) => void) {
      const wrappedCb = (heldValue: T) => {
        counters.finalized++;
        cb(heldValue);
      };
      this.inner = new OriginalFR!(wrappedCb);
    }

    register(target: object, heldValue: T, token?: object): void {
      counters.registered++;
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
