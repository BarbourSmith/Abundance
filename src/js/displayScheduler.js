/**
 * Display scheduler for the mesh worker pool.
 *
 * The mesh pool has a single worker, and every display request used to be sent
 * to it immediately. Clicking through several atoms therefore queued one full
 * mesh generation per click, and the viewport only caught up once the whole
 * backlog had drained. Results were also matched back to requests by
 * JSON-stringifying geometry trees, and the background path had no staleness
 * check at all, so a late result could overwrite a newer one.
 *
 * This scheduler fixes that by:
 *  - Keeping one "wanted" request per named slot (foreground, selection,
 *    background, topLevel). A new request for a slot replaces the previous one
 *    before it starts, so bursts collapse to the latest request.
 *  - Running at most one task at a time, always picking the highest-priority
 *    slot first. Background work can never delay the foreground.
 *  - Delivering a finished result to every slot still waiting on the same key,
 *    so the foreground and background never mesh the same geometry twice.
 *  - Caching finished meshes in a size-bounded LRU keyed by content, so
 *    re-selecting a recently displayed atom is instant.
 *  - Running unsupersedable one-shot jobs (thumbnails) at the lowest priority.
 */

import { MeshLruCache } from "./meshCache.js";

/** Slots in priority order, highest first. */
export const DISPLAY_SLOTS = Object.freeze([
  "foreground",
  "selection",
  "background",
  "topLevel",
]);

/**
 * 53-bit string hash (cyrb53). Fast, well distributed, and collision-resistant
 * enough for cache keys when combined with the input length.
 * @param {string} str
 * @returns {string}
 */
export function hashString(str) {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

/**
 * Replacer used when serializing a value for its display key. A mesh override
 * carries full tessellation data; its id already identifies it, so only a
 * summary is included to keep key computation cheap.
 */
function displayKeyReplacer(key, v) {
  if (key === "meshOverride" && v && typeof v === "object") {
    return {
      id: v.id,
      v: v.faces?.vertices?.length ?? 0,
      c: v.vertexColors?.length ?? 0,
    };
  }
  return v;
}

/**
 * Compute a compact key identifying what a value looks like when displayed.
 * Geometry ids are content addressed, so two values with the same key produce
 * the same mesh. The key is computed once per request instead of repeatedly
 * stringifying whole assembly trees for every comparison.
 * @param {unknown} value
 * @returns {string}
 */
export function displayKey(value) {
  if (value === null || value === undefined) {
    return "empty";
  }
  if (typeof value !== "object") {
    return `prim:${typeof value}:${String(value)}`;
  }
  let json;
  try {
    json = JSON.stringify(value, displayKeyReplacer);
  } catch {
    // Unserializable (cyclic) value: fall back to a unique key so it is never
    // confused with anything else and never served from cache.
    return `uncacheable:${Math.random().toString(36).slice(2)}`;
  }
  return `h:${hashString(json)}:${json.length}`;
}

/**
 * Key for a mesh request: the display key scoped to the project context, since
 * geometry ids are looked up per project.
 * @param {unknown} value
 * @param {{project?: string} | null | undefined} context
 */
export function meshKey(value, context) {
  return `${context?.project ?? ""}|${displayKey(value)}`;
}

/**
 * @typedef {object} DisplayRequest
 * @property {string} [method] Worker method, defaults to generateDisplayMesh.
 * @property {unknown[]} args Arguments for the worker method.
 * @property {string | null} [key] Content key. Requests with equal method and
 *   key share one computation and are served from cache. Null disables both.
 * @property {(result: any) => void} [onResult]
 * @property {(error: Error) => void} [onError]
 */

export class DisplayScheduler {
  /**
   * @param {(method: string, args: unknown[]) => PromiseLike<unknown>} exec
   *   Runs one task on the mesh worker (e.g. `(m, a) => pool.exec(m, a)`).
   * @param {{cache?: MeshLruCache, slots?: readonly string[]}} [options]
   */
  constructor(exec, { cache, slots = DISPLAY_SLOTS } = {}) {
    this._exec = exec;
    this.cache = cache || new MeshLruCache();
    /** Wanted request per slot, in priority order. */
    this._slots = new Map(slots.map((s) => [s, null]));
    /** FIFO of one-shot jobs, run after every slot is idle. */
    this._jobs = [];
    /** The single task currently running on the worker, or null. */
    this._running = null;
    this._nextId = 1;
  }

  /**
   * Ask for `slot` to display the result of a request. Replaces any request
   * already waiting in that slot. Served synchronously when cached.
   * @param {string} slot
   * @param {DisplayRequest} request
   * @returns {number} request id
   */
  request(slot, request) {
    if (!this._slots.has(slot)) {
      throw new Error(`Unknown display slot: ${slot}`);
    }
    const req = this._makeRequest(request);
    if (req.cacheKey && this.cache.has(req.cacheKey)) {
      this._slots.set(slot, null);
      this._deliver(req, this.cache.get(req.cacheKey), null);
      return req.id;
    }
    this._slots.set(slot, req);
    this._pump();
    return req.id;
  }

  /**
   * Queue a one-shot job that is never superseded, at the lowest priority.
   * Resolves with the worker result (served from cache when possible).
   * @param {string} method
   * @param {unknown[]} args
   * @param {string | null} [key]
   * @returns {Promise<any>}
   */
  run(method, args, key = null) {
    return new Promise((resolve, reject) => {
      const req = this._makeRequest({
        method,
        args,
        key,
        onResult: resolve,
        onError: reject,
      });
      if (req.cacheKey && this.cache.has(req.cacheKey)) {
        resolve(this.cache.get(req.cacheKey));
        return;
      }
      this._jobs.push(req);
      this._pump();
    });
  }

  /** Drop the request waiting in `slot`. A running task finishes but is not delivered. */
  cancel(slot) {
    if (this._slots.has(slot)) {
      this._slots.set(slot, null);
    }
  }

  /** True while `slot` has a request that has not been delivered yet. */
  isPending(slot) {
    return this._slots.get(slot) != null;
  }

  /** True while any task is running or waiting. */
  isBusy() {
    if (this._running || this._jobs.length > 0) return true;
    for (const req of this._slots.values()) if (req) return true;
    return false;
  }

  _makeRequest({ method = "generateDisplayMesh", args, key = null, onResult, onError }) {
    return {
      id: this._nextId++,
      method,
      args: args || [],
      cacheKey: key == null ? null : `${method}|${key}`,
      onResult,
      onError,
    };
  }

  _pump() {
    if (this._running) return;
    for (const req of this._slots.values()) {
      if (req) {
        this._start(req);
        return;
      }
    }
    const job = this._jobs.shift();
    if (job) {
      this._start(job, true);
    }
  }

  _start(req, isJob = false) {
    // A job leaves the queue when it starts, so the task itself remembers it
    // must be delivered. Slot requests stay in their slot until delivered.
    const task = { req, isJob };
    this._running = task;
    let promise;
    try {
      promise = Promise.resolve(this._exec(req.method, req.args));
    } catch (e) {
      promise = Promise.reject(e);
    }
    promise.then(
      (result) => this._settle(task, result, null),
      (error) => this._settle(task, undefined, error || new Error("Mesh task failed")),
    );
  }

  _matches(task, req) {
    if (req === task.req) return true;
    return Boolean(
      task.req.cacheKey && req.cacheKey && req.cacheKey === task.req.cacheKey,
    );
  }

  _settle(task, result, error) {
    if (this._running === task) {
      this._running = null;
    }
    if (!error && task.req.cacheKey) {
      this.cache.set(task.req.cacheKey, result);
    }

    // Collect every waiter satisfied by this task before invoking callbacks,
    // since callbacks may issue new requests.
    const satisfied = task.isJob ? [task.req] : [];
    for (const [slot, req] of this._slots) {
      if (req && this._matches(task, req)) {
        this._slots.set(slot, null);
        satisfied.push(req);
      }
    }
    this._jobs = this._jobs.filter((job) => {
      if (this._matches(task, job)) {
        satisfied.push(job);
        return false;
      }
      return true;
    });

    satisfied.forEach((req) => this._deliver(req, result, error));
    this._pump();
  }

  _deliver(req, result, error) {
    try {
      if (error) {
        req.onError?.(error);
      } else {
        req.onResult?.(result);
      }
    } catch (e) {
      console.error("[DisplayScheduler] display callback failed:", e);
    }
  }
}
