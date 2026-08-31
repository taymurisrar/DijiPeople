import {
  addDays,
  addMonths,
  buildBuckets,
  civilDate,
  civilStartInstant,
  daysBetweenInclusive,
  MAX_PERIOD_DAYS,
  resolveComparison,
  resolvePeriod,
  suggestGranularity,
  toInstantRange,
} from './period.engine';

// A fixed instant so every assertion is deterministic: 2026-08-31T02:30:00Z.
// Chosen because it is *already 31 August* in UTC but still 30 August in
// UTC-08:00 — the case a server-local implementation gets wrong.
const NOW = new Date('2026-08-31T02:30:00.000Z');

describe('civilDate', () => {
  it('reads the calendar date in the given zone, not the server zone', () => {
    expect(civilDate(NOW, 'UTC')).toBe('2026-08-31');
    expect(civilDate(NOW, 'America/Los_Angeles')).toBe('2026-08-30');
    expect(civilDate(NOW, 'Asia/Riyadh')).toBe('2026-08-31');
    expect(civilDate(NOW, 'Pacific/Kiritimati')).toBe('2026-08-31');
  });
});

describe('addMonths', () => {
  it('clamps to the last day rather than overflowing into the next month', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2026-03-31', -1)).toBe('2026-02-28');
  });

  it('handles a leap year', () => {
    expect(addMonths('2028-01-31', 1)).toBe('2028-02-29');
    expect(addMonths('2028-02-29', 12)).toBe('2029-02-28');
  });

  it('crosses a year boundary in both directions', () => {
    expect(addMonths('2026-01-15', -1)).toBe('2025-12-15');
    expect(addMonths('2026-12-15', 1)).toBe('2027-01-15');
  });
});

describe('daysBetweenInclusive', () => {
  it('counts both endpoints', () => {
    expect(daysBetweenInclusive('2026-08-31', '2026-08-31')).toBe(1);
    expect(daysBetweenInclusive('2026-08-01', '2026-08-31')).toBe(31);
  });

  it('is unaffected by a DST transition inside the range', () => {
    // Europe/London springs forward on 2026-03-29.
    expect(daysBetweenInclusive('2026-03-25', '2026-04-02')).toBe(9);
  });
});

describe('resolvePeriod', () => {
  const base = { timezone: 'UTC' as const, now: NOW };

  it('resolves today and yesterday in the tenant zone', () => {
    expect(resolvePeriod({ ...base, preset: 'today' })).toMatchObject({
      from: '2026-08-31',
      to: '2026-08-31',
      days: 1,
    });
    expect(resolvePeriod({ ...base, preset: 'yesterday' })).toMatchObject({
      from: '2026-08-30',
      to: '2026-08-30',
      days: 1,
    });
  });

  it('uses the tenant zone, not the server zone, to decide what "today" is', () => {
    const la = resolvePeriod({
      preset: 'today',
      timezone: 'America/Los_Angeles',
      now: NOW,
    });
    expect(la.from).toBe('2026-08-30');
  });

  it('makes last_7_days a 7-day window inclusive of today', () => {
    const period = resolvePeriod({ ...base, preset: 'last_7_days' });
    expect(period).toMatchObject({ from: '2026-08-25', to: '2026-08-31' });
    expect(period.days).toBe(7);
  });

  it('makes last_30_days a 30-day window', () => {
    expect(resolvePeriod({ ...base, preset: 'last_30_days' }).days).toBe(30);
  });

  it('runs this_month from the 1st to today, not to the month end', () => {
    expect(resolvePeriod({ ...base, preset: 'this_month' })).toMatchObject({
      from: '2026-08-01',
      to: '2026-08-31',
    });
  });

  it('resolves previous_month to the whole previous month', () => {
    expect(resolvePeriod({ ...base, preset: 'previous_month' })).toMatchObject({
      from: '2026-07-01',
      to: '2026-07-31',
      days: 31,
    });
  });

  it('resolves quarters on calendar boundaries', () => {
    expect(resolvePeriod({ ...base, preset: 'this_quarter' })).toMatchObject({
      from: '2026-07-01',
      to: '2026-08-31',
    });
    expect(
      resolvePeriod({ ...base, preset: 'previous_quarter' }),
    ).toMatchObject({
      from: '2026-04-01',
      to: '2026-06-30',
    });
  });

  it('resolves year_to_date and previous_year', () => {
    expect(resolvePeriod({ ...base, preset: 'year_to_date' })).toMatchObject({
      from: '2026-01-01',
      to: '2026-08-31',
    });
    expect(resolvePeriod({ ...base, preset: 'previous_year' })).toMatchObject({
      from: '2025-01-01',
      to: '2025-12-31',
      days: 365,
    });
  });

  it('accepts a custom range', () => {
    expect(
      resolvePeriod({
        ...base,
        preset: 'custom',
        from: '2026-02-01',
        to: '2026-02-28',
      }),
    ).toMatchObject({ from: '2026-02-01', to: '2026-02-28', days: 28 });
  });

  it('accepts 29 February only in a leap year', () => {
    expect(
      resolvePeriod({
        ...base,
        preset: 'custom',
        from: '2028-02-01',
        to: '2028-02-29',
      }),
    ).toMatchObject({ days: 29 });
    // 2026 is not a leap year, so this date does not exist.
    expect(() =>
      resolvePeriod({
        ...base,
        preset: 'custom',
        from: '2026-02-01',
        to: '2026-02-29',
      }),
    ).toThrow(/Invalid date/);
  });

  it('rejects a custom range missing an endpoint', () => {
    expect(() =>
      resolvePeriod({ ...base, preset: 'custom', from: '2026-02-01' }),
    ).toThrow(/requires both/i);
  });

  it('rejects an inverted range', () => {
    expect(() =>
      resolvePeriod({
        ...base,
        preset: 'custom',
        from: '2026-03-01',
        to: '2026-02-01',
      }),
    ).toThrow(/must not be after/i);
  });

  it('rejects a malformed date rather than coercing it', () => {
    expect(() =>
      resolvePeriod({
        ...base,
        preset: 'custom',
        from: '2026-02-30',
        to: '2026-03-01',
      }),
    ).toThrow(/Invalid date/);
    expect(() =>
      resolvePeriod({
        ...base,
        preset: 'custom',
        from: 'yesterday',
        to: '2026-03-01',
      }),
    ).toThrow(/Invalid date/);
  });

  it('refuses a window beyond the maximum', () => {
    expect(() =>
      resolvePeriod({
        ...base,
        preset: 'custom',
        from: '2020-01-01',
        to: '2026-01-01',
      }),
    ).toThrow(new RegExp(String(MAX_PERIOD_DAYS)));
  });
});

describe('resolveComparison', () => {
  const august = resolvePeriod({
    preset: 'custom',
    timezone: 'UTC',
    from: '2026-08-01',
    to: '2026-08-31',
  });

  it('returns nothing for none', () => {
    expect(resolveComparison(august, 'none').period).toBeNull();
  });

  it('shifts previous_period by the window length, not by a calendar month', () => {
    const previous = resolveComparison(august, 'previous_period').period;
    // 31 days immediately before 1 August.
    expect(previous).toMatchObject({ from: '2026-07-01', to: '2026-07-31' });
    expect(previous?.days).toBe(august.days);
  });

  it('keeps previous_period the same length when the prior month is shorter', () => {
    const july = resolvePeriod({
      preset: 'custom',
      timezone: 'UTC',
      from: '2026-07-01',
      to: '2026-07-31',
    });
    const previous = resolveComparison(july, 'previous_period').period;
    expect(previous).toMatchObject({ from: '2026-05-31', to: '2026-06-30' });
    expect(previous?.days).toBe(31);
  });

  it('aligns previous_month on the calendar and may change length', () => {
    const previous = resolveComparison(august, 'previous_month').period;
    expect(previous).toMatchObject({ from: '2026-07-01', to: '2026-07-31' });
  });

  it('clamps previous_month when the target month is shorter', () => {
    const march = resolvePeriod({
      preset: 'custom',
      timezone: 'UTC',
      from: '2026-03-31',
      to: '2026-03-31',
    });
    expect(resolveComparison(march, 'previous_month').period).toMatchObject({
      from: '2026-02-28',
      to: '2026-02-28',
    });
  });

  it('shifts previous_quarter and previous_year', () => {
    expect(resolveComparison(august, 'previous_quarter').period).toMatchObject({
      from: '2026-05-01',
      to: '2026-05-31',
    });
    expect(resolveComparison(august, 'previous_year').period).toMatchObject({
      from: '2025-08-01',
      to: '2025-08-31',
    });
  });
});

describe('toInstantRange', () => {
  it('produces a half-open range so the final day is not truncated', () => {
    const { start, end } = toInstantRange({
      from: '2026-08-01',
      to: '2026-08-31',
      timezone: 'UTC',
    });
    expect(start.toISOString()).toBe('2026-08-01T00:00:00.000Z');
    // Exclusive end is midnight on 1 September, so 31 August 23:59 is included.
    expect(end.toISOString()).toBe('2026-09-01T00:00:00.000Z');
  });

  it('offsets the boundary by the tenant zone', () => {
    const { start, end } = toInstantRange({
      from: '2026-08-01',
      to: '2026-08-01',
      timezone: 'Asia/Riyadh',
    });
    // Riyadh is UTC+3 year round.
    expect(start.toISOString()).toBe('2026-07-31T21:00:00.000Z');
    expect(end.toISOString()).toBe('2026-08-01T21:00:00.000Z');
  });

  it('handles a zone whose offset changes inside the window', () => {
    // Europe/London: GMT on 1 March, BST on 1 April.
    const { start, end } = toInstantRange({
      from: '2026-03-01',
      to: '2026-03-31',
      timezone: 'Europe/London',
    });
    expect(start.toISOString()).toBe('2026-03-01T00:00:00.000Z');
    // 1 April 00:00 BST is 31 March 23:00Z — the boundary must follow the shift.
    expect(end.toISOString()).toBe('2026-03-31T23:00:00.000Z');
  });
});

describe('civilStartInstant', () => {
  it('resolves a 45-minute offset zone', () => {
    expect(
      civilStartInstant('2026-08-01', 'Asia/Kathmandu').toISOString(),
    ).toBe('2026-07-31T18:15:00.000Z');
  });
});

describe('buildBuckets', () => {
  const period = (from: string, to: string) =>
    resolvePeriod({ preset: 'custom', timezone: 'UTC', from, to });

  it('produces one bucket per day', () => {
    const buckets = buildBuckets(period('2026-08-01', '2026-08-05'), 'day');
    expect(buckets).toHaveLength(5);
    expect(buckets[0]).toMatchObject({ from: '2026-08-01', to: '2026-08-01' });
  });

  it('clamps the final bucket to the period end', () => {
    const buckets = buildBuckets(period('2026-08-01', '2026-08-10'), 'week');
    expect(buckets).toHaveLength(2);
    expect(buckets[1]).toMatchObject({ from: '2026-08-08', to: '2026-08-10' });
  });

  it('buckets by calendar month, with a partial first and last month', () => {
    const buckets = buildBuckets(period('2026-01-15', '2026-03-10'), 'month');
    expect(buckets.map((bucket) => bucket.label)).toEqual([
      '2026-01',
      '2026-02',
      '2026-03',
    ]);
    expect(buckets[0]).toMatchObject({ from: '2026-01-15', to: '2026-01-31' });
    expect(buckets[2]).toMatchObject({ from: '2026-03-01', to: '2026-03-10' });
  });

  it('labels quarters', () => {
    const buckets = buildBuckets(period('2026-01-01', '2026-12-31'), 'quarter');
    expect(buckets.map((bucket) => bucket.label)).toEqual([
      '2026-Q1',
      '2026-Q2',
      '2026-Q3',
      '2026-Q4',
    ]);
  });

  it('always covers the whole period exactly once', () => {
    const target = period('2026-01-01', '2026-12-31');
    for (const granularity of ['day', 'week', 'month', 'quarter'] as const) {
      const buckets = buildBuckets(target, granularity);
      expect(buckets[0].from).toBe(target.from);
      expect(buckets[buckets.length - 1].to).toBe(target.to);
      for (let i = 1; i < buckets.length; i += 1) {
        expect(buckets[i].from).toBe(addDays(buckets[i - 1].to, 1));
      }
    }
  });

  it('returns a single bucket for a single-day period', () => {
    expect(
      buildBuckets(period('2026-08-31', '2026-08-31'), 'month'),
    ).toHaveLength(1);
  });
});

describe('suggestGranularity', () => {
  const period = (days: number) =>
    resolvePeriod({
      preset: 'custom',
      timezone: 'UTC',
      from: '2026-01-01',
      to: addDays('2026-01-01', days - 1),
    });

  it('keeps a trend readable as the window grows', () => {
    expect(suggestGranularity(period(7))).toBe('day');
    expect(suggestGranularity(period(31))).toBe('day');
    expect(suggestGranularity(period(90))).toBe('week');
    expect(suggestGranularity(period(365))).toBe('month');
    expect(suggestGranularity(period(1000))).toBe('quarter');
  });
});
