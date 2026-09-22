/**
 * Stale-While-Revalidate (SWR) Cache
 * Ported from nyanime/server.js — provides resilient in-memory caching with
 * a fresh window, a stale window (for outage fallback), and optional LRU eviction.
 *
 * - Within freshTTL: returns data as fresh
 * - Between freshTTL and staleTTL: returns data marked as stale (usable during outages)
 * - Beyond staleTTL: entry is evicted
 * - Optional maxEntries for LRU eviction (used by search cache)
 */
export class SWRCache {
  constructor({ freshTTL, staleTTL, maxEntries = Infinity }) {
    this.freshTTL = freshTTL;
    this.staleTTL = staleTTL;
    this.maxEntries = maxEntries;
    this._store = new Map(); // key → { data, ts, lastAccess }
  }

  /**
   * Returns { data, stale } if within staleTTL, null if evicted or missing.
   */
  get(key) {
    const entry = this._store.get(key);
    if (!entry) return null;
    const age = Date.now() - entry.ts;
    if (age > this.staleTTL) {
      this._store.delete(key);
      return null;
    }
    entry.lastAccess = Date.now();
    return { data: entry.data, stale: age > this.freshTTL };
  }

  /**
   * Returns data even if stale (for fallback during outages).
   * Returns null only if the entry was truly evicted or never existed.
   */
  getStaleOrNull(key) {
    const entry = this._store.get(key);
    if (!entry) return null;
    entry.lastAccess = Date.now();
    return entry.data;
  }

  /**
   * Store a value. If at capacity, evicts the least-recently-accessed entry.
   */
  set(key, data) {
    // LRU eviction if at capacity
    if (this._store.size >= this.maxEntries && !this._store.has(key)) {
      let oldestKey = null, oldestAccess = Infinity;
      for (const [k, v] of this._store) {
        if (v.lastAccess < oldestAccess) {
          oldestAccess = v.lastAccess;
          oldestKey = k;
        }
      }
      if (oldestKey) this._store.delete(oldestKey);
    }
    this._store.set(key, { data, ts: Date.now(), lastAccess: Date.now() });
  }

  /** Number of entries currently stored. */
  get size() {
    return this._store.size;
  }
}
