import { RateLimitPersistSampler } from './rate-limit-persist-sampler';

describe('RateLimitPersistSampler (BUG-3188)', () => {
  it('persists the first rejection and suppresses repeats inside the window', () => {
    const sampler = new RateLimitPersistSampler(60_000);
    expect(sampler.shouldPersist('k', 0)).toBe(true);
    expect(sampler.shouldPersist('k', 1_000)).toBe(false);
    expect(sampler.shouldPersist('k', 59_999)).toBe(false);
  });

  it('persists again once the window has passed, so the incident stays countable', () => {
    const sampler = new RateLimitPersistSampler(60_000);
    expect(sampler.shouldPersist('k', 0)).toBe(true);
    expect(sampler.shouldPersist('k', 60_000)).toBe(true);
    expect(sampler.shouldPersist('k', 60_001)).toBe(false);
  });

  it('tracks different keys independently', () => {
    const sampler = new RateLimitPersistSampler(60_000);
    expect(sampler.shouldPersist('a', 0)).toBe(true);
    expect(sampler.shouldPersist('b', 1)).toBe(true);
    expect(sampler.shouldPersist('a', 2)).toBe(false);
  });

  it('is bounded: rotating keys cannot grow it past the limit', () => {
    const sampler = new RateLimitPersistSampler(60_000, 100);
    for (let i = 0; i < 10_000; i += 1) sampler.shouldPersist(`k${i}`, i);
    expect(sampler.size).toBeLessThanOrEqual(100);
  });

  it('evicts the oldest when everything is still inside the window', () => {
    const sampler = new RateLimitPersistSampler(60_000, 2);
    sampler.shouldPersist('a', 0);
    sampler.shouldPersist('b', 1);
    sampler.shouldPersist('c', 2);
    // `a` was evicted, so it counts as new again; `c` is still suppressed.
    expect(sampler.shouldPersist('a', 3)).toBe(true);
    expect(sampler.shouldPersist('c', 4)).toBe(false);
  });
});
