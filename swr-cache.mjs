/**
 * Stale-While-Revalidate (SWR) Cache
 * Resilient in-memory caching with a fresh window, stale window (with background revalidation),
 * and LRU capacity eviction.
 *
 * - Within freshTTL: returns data as fresh ({ data, stale: false })
 * - Between freshTTL and staleTTL: returns data as stale ({ data, stale: true })
 *   and triggers background revalidation if a revalidate function is provided.
 * - Beyond staleTTL: entry is evicted and returns null.
 * - Deduplicates concurrent background revalidations for the same key.
 */
export class SWRCache {
  constructor({ freshTTL, staleTTL, maxEntries = Infinity }) {
    this.freshTTL = freshTTL;
    this.staleTTL = staleTTL;
    this.maxEntries = maxEntries;
    this._store = new Map(); // key → { data, ts, lastAccess }
    this._revalidations = new Map(); // key → Promise
    this._seq = 0;
  }

  /**
   * Returns { data, stale } if within staleTTL, null if evicted or missing.
   * If the data is stale and revalidateFn is supplied, triggers background revalidation.
   */
  get(key, revalidateFn = null) {
    const entry = this._store.get(key);
    if (!entry) return null;
    const age = Date.now() - entry.ts;
    if (age > this.staleTTL) {
      this._store.delete(key);
      return null;
    }
    entry.lastAccess = ++this._seq;
    const isStale = age > this.freshTTL;
    if (isStale && revalidateFn) {
      this.revalidate(key, revalidateFn);
    }
    return { data: entry.data, stale: isStale };
  }

  /**
   * Triggers background revalidation for a key using the provided fetch function.
   * Deduplicates concurrent revalidations for the same key.
   */
  revalidate(key, revalidateFn) {
    if (!revalidateFn || this._revalidations.has(key)) {
      return this._revalidations.get(key) || Promise.resolve();
    }
    const p = (async () => {
      try {
        const fresh = await revalidateFn();
        if (fresh !== undefined && fresh !== null) {
          this.set(key, fresh);
        }
        return fresh;
      } catch (err) {
        // Silently maintain stale entry if background revalidation fails
        return null;
      } finally {
        this._revalidations.delete(key);
      }
    })();
    this._revalidations.set(key, p);
    return p;
  }

  /**
   * Returns data even if stale (for fallback during outages).
   * Returns null only if the entry was truly evicted or never existed.
   */
  getStaleOrNull(key) {
    const entry = this._store.get(key);
    if (!entry) return null;
    entry.lastAccess = ++this._seq;
    return entry.data;
  }

  /**
   * Store a value. If at capacity, evicts the least-recently-accessed entry.
   */
  set(key, data) {
    // LRU eviction if at capacity
    if (this._store.size >= this.maxEntries && !this._store.has(key)) {
      let oldestKey = null;
      let oldestAccess = Infinity;
      for (const [k, v] of this._store) {
        if (v.lastAccess < oldestAccess) {
          oldestAccess = v.lastAccess;
          oldestKey = k;
        }
      }
      if (oldestKey) this._store.delete(oldestKey);
    }
    this._store.set(key, { data, ts: Date.now(), lastAccess: ++this._seq });
  }

  /** Number of entries currently stored. */
  get size() {
    return this._store.size;
  }

  clear() {
    this._store.clear();
    this._revalidations.clear();
  }
}

export default SWRCache;
