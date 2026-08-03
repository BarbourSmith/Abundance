import { getPairCache, putPairCache } from "./indexeddbUtils";

/**
 * Persistent cache of shape-id pairs with known special
 * boolean outcomes, so a `cut`/`intersect` that previously produced a no-op
 * or empty-shape result doesn't need to be recomputed after a reload.
 *
 * `disjoint` pairs are commutative, ie, `a` disjoint with `b` implies
 * `b` disjoint with `a`
 *
 * `occlusion` pairs are not commutative.
 *
 * Each project's pairs live in memory and are periodically flushed to
 * IndexedDB as a single serialized blob per list (see `_flushPairCache`),
 * rather than one row per pair — see design discussion for the tradeoffs.
 *
 * Calles should be primarily concerned with `isDisjoint`/`recordDisjoint`
 * and `isOccluded`/`recordOccluded`.
 *
 * Some additional cache management utilities are also provided. Namely,
 * `loadProject` which returns fast but starts the async task of loading a
 * new project's cache from long term indexeddb storage. And sweep(idsToRetain)
 * which cleans the in-memory and serialized copies of this cache of any
 * entries which don't concern the specified shape ids.
 */
class BooleanOpCache {
  private pairCaches: Map<
    string,
    { disjoint: Set<string>; occlusion: Set<string>; dirty: boolean }
  > = new Map();
  // Dedupes concurrent lazy-loads of a project's pair cache.
  private pairCacheLoading: Map<string, Promise<void>> = new Map();
  // Tracks the pending throttled flush timer per project (see
  // `_scheduleFlush`), so only one flush is scheduled at a time.
  private pairCacheFlushTimers: Map<string, ReturnType<typeof setTimeout>> =
    new Map();
  private static PAIR_CACHE_FLUSH_THROTTLE_MS = 2000;
  private static DISJOINT_PAIRS_KEY = "__disjointPairs__";
  private static OCCLUSION_PAIRS_KEY = "__occlusionPairs__";

  private _disjointKey(a: string, b: string): string {
    return [a, b].sort().join("\u0000");
  }

  private _occlusionKey(occludedId: string, containerId: string): string {
    return occludedId + "\u0000" + containerId;
  }

  /**
   * Lazily loads a project's persisted disjoint/occlusion pair blobs into
   * memory, at most once per project (concurrent callers share the same
   * load). Safe to call repeatedly; a no-op once loaded.
   */
  private async _ensureLoaded(projectId: string): Promise<void> {
    if (this.pairCaches.has(projectId)) {
      return;
    }
    const existingLoad = this.pairCacheLoading.get(projectId);
    if (existingLoad) {
      return existingLoad;
    }
    const load = (async () => {
      const [disjointRecord, occlusionRecord] = await Promise.all([
        getPairCache(projectId, BooleanOpCache.DISJOINT_PAIRS_KEY),
        getPairCache(projectId, BooleanOpCache.OCCLUSION_PAIRS_KEY),
      ]);
      this.pairCaches.set(projectId, {
        disjoint: new Set(
          disjointRecord ? JSON.parse(disjointRecord.serialized) : [],
        ),
        occlusion: new Set(
          occlusionRecord ? JSON.parse(occlusionRecord.serialized) : [],
        ),
        dirty: false,
      });
    })();
    this.pairCacheLoading.set(projectId, load);
    try {
      await load;
    } finally {
      this.pairCacheLoading.delete(projectId);
    }
  }

  /**
   * Kicks off (without awaiting) a load of the project's persisted pairs if
   * one isn't already loaded or in flight. Used by the read methods so they
   * can stay synchronous: the first call(s) for a project may miss (fail
   * open to `false`) while the load is in flight, but subsequent calls will
   * see the loaded data.
   */
  private _kickOffLoad(projectId: string): void {
    if (
      this.pairCaches.has(projectId) ||
      this.pairCacheLoading.has(projectId)
    ) {
      return;
    }
    void this._ensureLoaded(projectId);
  }

  /**
   * Schedules a throttled (not debounced) flush of a project's pair cache:
   * if a flush isn't already pending for this project, one is scheduled
   * `PAIR_CACHE_FLUSH_THROTTLE_MS` out. Subsequent calls before it fires are
   * no-ops, so continuous pair discovery can't defer persistence forever.
   */
  private _scheduleFlush(projectId: string): void {
    if (this.pairCacheFlushTimers.has(projectId)) {
      return;
    }
    const timer = setTimeout(() => {
      this.pairCacheFlushTimers.delete(projectId);
      void this._flush(projectId);
    }, BooleanOpCache.PAIR_CACHE_FLUSH_THROTTLE_MS);
    this.pairCacheFlushTimers.set(projectId, timer);
  }

  /** Persists a project's pair cache to IndexedDB if it has unsaved changes. */
  private async _flush(projectId: string): Promise<void> {
    const cache = this.pairCaches.get(projectId);
    if (!cache || !cache.dirty) {
      return;
    }
    cache.dirty = false;
    await Promise.all([
      putPairCache(
        projectId,
        BooleanOpCache.DISJOINT_PAIRS_KEY,
        JSON.stringify([...cache.disjoint]),
      ),
      putPairCache(
        projectId,
        BooleanOpCache.OCCLUSION_PAIRS_KEY,
        JSON.stringify([...cache.occlusion]),
      ),
    ]);
  }

  loadProject(projectId: string): void {
    this._kickOffLoad(projectId);
  }

  /**
   * Dumps a project's in memory cache.
  */
  forgetProject(projectId: string): void {
    this.pairCaches.delete(projectId);
    this.pairCacheLoading.delete(projectId);
    const timer = this.pairCacheFlushTimers.get(projectId);
    if (timer) {
      clearTimeout(timer);
      this.pairCacheFlushTimers.delete(projectId);
    }
  }

  /**
   * True if `a` and `b` are known to be disjoint (a boolean op between them
   * produces an empty intersection / a true no-op cut). Commutative.
   *
   * Returns `false` (a safe cache-miss) if this project's persisted pairs
   * haven't finished loading yet; a load is kicked off in the background if
   * one isn't already underway.
   */
  isDisjoint(a: string, b: string, projectId: string): boolean {
    this._kickOffLoad(projectId);
    return (
      this.pairCaches.get(projectId)?.disjoint.has(this._disjointKey(a, b)) ??
      false
    );
  }

  /** Records that `a` and `b` are disjoint and schedules a persist. */
  recordDisjoint(a: string, b: string, projectId: string): void {
    this._kickOffLoad(projectId);
    const cache = this.pairCaches.get(projectId);
    if (!cache) {
      // Load hasn't landed yet; drop this discovery rather than blocking the
      // caller. It will simply be rediscovered (and recorded) the next time
      // this pair is computed.
      return;
    }
    cache.disjoint.add(this._disjointKey(a, b));
    cache.dirty = true;
    this._scheduleFlush(projectId);
  }

  /**
   * True if `containerId` is known to fully enclose `occludedId` (ie:
   * `cut(occludedId, containerId)` produces an empty shape). Directional.
   *
   * Returns `false` (a safe cache-miss) if this project's persisted pairs
   * haven't finished loading yet; a load is kicked off in the background if
   * one isn't already underway.
   */
  isOccluded(
    occludedId: string,
    containerId: string,
    projectId: string,
  ): boolean {
    this._kickOffLoad(projectId);
    return (
      this.pairCaches
        .get(projectId)
        ?.occlusion.has(this._occlusionKey(occludedId, containerId)) ?? false
    );
  }

  /** Records that `containerId` fully encloses `occludedId` and schedules a persist. */
  recordOcclusion(
    occludedId: string,
    containerId: string,
    projectId: string,
  ): void {
    this._kickOffLoad(projectId);
    const cache = this.pairCaches.get(projectId);
    if (!cache) {
      // Load hasn't landed yet; drop this discovery rather than blocking the
      // caller. It will simply be rediscovered (and recorded) the next time
      // this pair is computed.
      return;
    }
    cache.occlusion.add(this._occlusionKey(occludedId, containerId));
    cache.dirty = true;
    this._scheduleFlush(projectId);
  }

  /**
   * Removes any disjoint/occlusion pairs referencing an id not present in
   * `idsToRetain`, then immediately (not throttled) persists the result if
   * anything changed. Returns the number of pairs pruned.
   */
  async sweep(idsToRetain: Set<string>, projectId: string): Promise<number> {
    await this._ensureLoaded(projectId);
    const cache = this.pairCaches.get(projectId);
    if (!cache) {
      return 0;
    }
    let prunedCount = 0;
    for (const key of cache.disjoint) {
      const [a, b] = key.split("\u0000");
      if (!idsToRetain.has(a) || !idsToRetain.has(b)) {
        cache.disjoint.delete(key);
        prunedCount++;
      }
    }
    for (const key of cache.occlusion) {
      const [occludedId, containerId] = key.split("\u0000");
      if (!idsToRetain.has(occludedId) || !idsToRetain.has(containerId)) {
        cache.occlusion.delete(key);
        prunedCount++;
      }
    }
    if (prunedCount > 0) {
      cache.dirty = true;
      const timer = this.pairCacheFlushTimers.get(projectId);
      if (timer) {
        clearTimeout(timer);
        this.pairCacheFlushTimers.delete(projectId);
      }
      await this._flush(projectId);
    }
    return prunedCount;
  }
}

export { BooleanOpCache };
