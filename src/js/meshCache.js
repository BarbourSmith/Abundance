/**
 * Rough byte size of a mesh result, used to bound caches by memory rather than
 * only by entry count. Number arrays are counted by length without iterating
 * their contents. An object reached more than once (a mesh shared by several
 * moved copies of a part) is counted once.
 */
export function estimateSize(obj, depth = 0, seen = new Set()) {
  if (obj === null || obj === undefined || depth > 8) return 0;
  if (typeof obj === "object") {
    if (seen.has(obj)) return 0;
    seen.add(obj);
  }
  if (ArrayBuffer.isView(obj)) return obj.byteLength;
  if (Array.isArray(obj)) {
    if (obj.length === 0) return 0;
    if (typeof obj[0] === "number") return obj.length * 8;
    let total = 0;
    for (const item of obj) total += estimateSize(item, depth + 1, seen);
    return total;
  }
  if (typeof obj === "object") {
    let total = 0;
    for (const k in obj) total += estimateSize(obj[k], depth + 1, seen);
    return total;
  }
  if (typeof obj === "string") return obj.length * 2;
  return 8;
}

/** Least-recently-used cache bounded by entry count and estimated bytes. */
export class MeshLruCache {
  constructor({ maxEntries = 24, maxBytes = 256 * 1024 * 1024 } = {}) {
    this.maxEntries = maxEntries;
    this.maxBytes = maxBytes;
    this.bytes = 0;
    /** @type {Map<string, {value: unknown, size: number}>} */
    this.map = new Map();
  }

  has(key) {
    return this.map.has(key);
  }

  get(key) {
    const entry = this.map.get(key);
    if (!entry) return undefined;
    // Refresh recency.
    this.map.delete(key);
    this.map.set(key, entry);
    return entry.value;
  }

  set(key, value) {
    this.delete(key);
    const size = estimateSize(value);
    if (size > this.maxBytes) {
      // Too large to be worth keeping; never evict everything for one entry.
      return;
    }
    this.map.set(key, { value, size });
    this.bytes += size;
    while (
      this.map.size > this.maxEntries ||
      (this.bytes > this.maxBytes && this.map.size > 1)
    ) {
      this.delete(this.map.keys().next().value);
    }
  }

  delete(key) {
    const entry = this.map.get(key);
    if (!entry) return false;
    this.map.delete(key);
    this.bytes -= entry.size;
    return true;
  }

  /** Iterates the keys, oldest first. */
  keys() {
    return this.map.keys();
  }

  clear() {
    this.map.clear();
    this.bytes = 0;
  }

  get size() {
    return this.map.size;
  }
}
