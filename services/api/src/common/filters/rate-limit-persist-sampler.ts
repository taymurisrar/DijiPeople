/**
 * BUG-3188. A rate-limited request used to cost the API more to refuse than to
 * serve: the exception filter wrote an error-log row (a transaction with a find,
 * an update or insert, and an occurrence upsert) for every 429, on the request
 * path, so a flood turned the limiter into a database write amplifier and filled
 * the error log with identical rows.
 *
 * The structured warn log still records every rejection. What is sampled is the
 * database row: the first rejection per error code, address and path in a window
 * is persisted so the incident is visible and countable, and the repeats inside
 * the window are not. Only 429 goes through this. A 401, 404 or 400 row is
 * deliberately kept in full, because the monitoring queue and support's trace-id
 * lookup rely on them (BUG-1742, BUG-1754, BUG-2465).
 *
 * In-process on purpose: this API is a single instance, and a second instance
 * would at worst persist one extra row per window.
 */
export class RateLimitPersistSampler {
  private readonly seen = new Map<string, number>();

  constructor(
    private readonly windowMs = 60_000,
    /** Bound on tracked keys; an attacker rotating addresses cannot grow it. */
    private readonly maxKeys = 5_000,
  ) {}

  /** True the first time `key` is seen in the current window, false for repeats. */
  shouldPersist(key: string, now: number = Date.now()): boolean {
    const last = this.seen.get(key);
    if (last !== undefined && now - last < this.windowMs) {
      return false;
    }
    // Refresh insertion order so the oldest entry is the first one in the map.
    this.seen.delete(key);
    this.seen.set(key, now);
    if (this.seen.size > this.maxKeys) {
      this.evictExpiredThenOldest(now);
    }
    return true;
  }

  private evictExpiredThenOldest(now: number) {
    for (const [key, at] of this.seen) {
      if (now - at >= this.windowMs) this.seen.delete(key);
    }
    while (this.seen.size > this.maxKeys) {
      const oldest = this.seen.keys().next();
      if (oldest.done) break;
      this.seen.delete(oldest.value);
    }
  }

  /** For tests. */
  get size() {
    return this.seen.size;
  }
}
