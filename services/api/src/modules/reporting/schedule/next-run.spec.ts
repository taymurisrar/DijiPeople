import { computeNextRun, isSupportedTimeZone } from './next-run';

/**
 * These tests are the specification for schedule timing.
 *
 * Every assertion is written as a UTC instant next to the wall-clock time it is
 * supposed to be, because that pairing is the thing that goes wrong: the code
 * looks right in every reading where the offset is assumed constant, and the
 * only way to catch a constant-offset assumption is to assert across a
 * transition.
 */

/** `2026-08-31T09:00:00.000Z` etc., asserted as an exact instant. */
function iso(value: Date): string {
  return value.toISOString();
}

/** The wall clock a zone reads at an instant, for readable failures. */
function wallClock(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
    .format(instant)
    .replace(',', '');
}

describe('isSupportedTimeZone', () => {
  it.each([
    'UTC',
    'Europe/London',
    'America/New_York',
    'Asia/Riyadh',
    'Asia/Qatar',
    'Asia/Kathmandu',
  ])('accepts %s', (zone) => {
    expect(isSupportedTimeZone(zone)).toBe(true);
  });

  it.each([
    ['an invented zone', 'Mars/Olympus_Mons'],
    ['an empty string', ''],
    ['whitespace', '   '],
    ['a number', 5],
    ['null', null],
    ['undefined', undefined],
    ['an offset string, which is not a zone', '+03:00'],
  ])('rejects %s', (_label, value) => {
    expect(isSupportedTimeZone(value)).toBe(false);
  });
});

describe('computeNextRun — daily', () => {
  it('fires later today when the wall-clock time has not passed', () => {
    const next = computeNextRun({
      frequency: 'DAILY',
      hour: 9,
      minute: 30,
      timezone: 'UTC',
      after: new Date('2026-08-31T06:00:00.000Z'),
    });

    expect(iso(next)).toBe('2026-08-31T09:30:00.000Z');
  });

  it('rolls to tomorrow when the wall-clock time has already passed today', () => {
    const next = computeNextRun({
      frequency: 'DAILY',
      hour: 9,
      minute: 30,
      timezone: 'UTC',
      after: new Date('2026-08-31T09:31:00.000Z'),
    });

    expect(iso(next)).toBe('2026-09-01T09:30:00.000Z');
  });

  it('is strictly after "after", never equal to it', () => {
    // The worker recomputes from `now` at the moment it claims a due schedule.
    // If the boundary were inclusive the same slot would come straight back and
    // the recipients would get the report again inside the same minute.
    const exactly = new Date('2026-08-31T09:30:00.000Z');
    const next = computeNextRun({
      frequency: 'DAILY',
      hour: 9,
      minute: 30,
      timezone: 'UTC',
      after: exactly,
    });

    expect(next.getTime()).toBeGreaterThan(exactly.getTime());
    expect(iso(next)).toBe('2026-09-01T09:30:00.000Z');
  });

  it('crosses the year boundary', () => {
    const next = computeNextRun({
      frequency: 'DAILY',
      hour: 8,
      minute: 0,
      timezone: 'UTC',
      after: new Date('2026-12-31T08:00:01.000Z'),
    });

    expect(iso(next)).toBe('2027-01-01T08:00:00.000Z');
  });

  it('resolves the wall clock in the schedule timezone, not the server one', () => {
    // 09:00 in Asia/Riyadh (UTC+3, no DST ever) is 06:00Z, all year.
    const next = computeNextRun({
      frequency: 'DAILY',
      hour: 9,
      minute: 0,
      timezone: 'Asia/Riyadh',
      after: new Date('2026-08-31T00:00:00.000Z'),
    });

    expect(iso(next)).toBe('2026-08-31T06:00:00.000Z');
    expect(wallClock(next, 'Asia/Riyadh')).toBe('2026-08-31 09:00');
  });

  it('handles a zone with a 45-minute offset', () => {
    // Asia/Kathmandu is UTC+05:45. A whole-hour offset assumption lands 45
    // minutes out and still looks plausible in a log.
    const next = computeNextRun({
      frequency: 'DAILY',
      hour: 7,
      minute: 0,
      timezone: 'Asia/Kathmandu',
      after: new Date('2026-08-31T00:00:00.000Z'),
    });

    expect(iso(next)).toBe('2026-08-31T01:15:00.000Z');
  });
});

describe('computeNextRun — DST', () => {
  /*
   * Europe/London: BST (UTC+1) from 29 March 2026 to 25 October 2026.
   * America/New_York: EDT (UTC-4) from 8 March 2026 to 1 November 2026.
   *
   * The UTC instant of an 09:00 local schedule MOVES across these dates. A
   * fixed offset added to UTC midnight cannot express that, which is the whole
   * reason `civilStartInstant` is used instead.
   */

  it('keeps the wall clock across the London spring-forward', () => {
    const before = computeNextRun({
      frequency: 'DAILY',
      hour: 9,
      minute: 0,
      timezone: 'Europe/London',
      after: new Date('2026-03-27T12:00:00.000Z'),
    });
    const after = computeNextRun({
      frequency: 'DAILY',
      hour: 9,
      minute: 0,
      timezone: 'Europe/London',
      after: new Date('2026-03-30T00:00:00.000Z'),
    });

    // GMT: 09:00 local === 09:00Z. BST: 09:00 local === 08:00Z.
    expect(iso(before)).toBe('2026-03-28T09:00:00.000Z');
    expect(iso(after)).toBe('2026-03-30T08:00:00.000Z');
    expect(wallClock(before, 'Europe/London')).toBe('2026-03-28 09:00');
    expect(wallClock(after, 'Europe/London')).toBe('2026-03-30 09:00');
  });

  it('keeps the wall clock across the London fall-back', () => {
    const before = computeNextRun({
      frequency: 'DAILY',
      hour: 9,
      minute: 0,
      timezone: 'Europe/London',
      after: new Date('2026-10-23T12:00:00.000Z'),
    });
    const after = computeNextRun({
      frequency: 'DAILY',
      hour: 9,
      minute: 0,
      timezone: 'Europe/London',
      after: new Date('2026-10-26T00:00:00.000Z'),
    });

    expect(iso(before)).toBe('2026-10-24T08:00:00.000Z');
    expect(iso(after)).toBe('2026-10-26T09:00:00.000Z');
    expect(wallClock(before, 'Europe/London')).toBe('2026-10-24 09:00');
    expect(wallClock(after, 'Europe/London')).toBe('2026-10-26 09:00');
  });

  it('keeps the wall clock across the New York spring-forward', () => {
    const before = computeNextRun({
      frequency: 'DAILY',
      hour: 6,
      minute: 30,
      timezone: 'America/New_York',
      after: new Date('2026-03-06T18:00:00.000Z'),
    });
    const after = computeNextRun({
      frequency: 'DAILY',
      hour: 6,
      minute: 30,
      timezone: 'America/New_York',
      after: new Date('2026-03-09T00:00:00.000Z'),
    });

    // EST is UTC-5, EDT is UTC-4.
    expect(iso(before)).toBe('2026-03-07T11:30:00.000Z');
    expect(iso(after)).toBe('2026-03-09T10:30:00.000Z');
  });

  it('runs at the first existing moment when the wall time is skipped', () => {
    // 02:30 does not exist on 8 March 2026 in New York: 02:00 becomes 03:00.
    // The rule is to keep the elapsed time from local midnight, which lands on
    // 03:30 local — at or after the requested slot, never before it.
    const next = computeNextRun({
      frequency: 'DAILY',
      hour: 2,
      minute: 30,
      timezone: 'America/New_York',
      after: new Date('2026-03-08T00:00:00.000Z'),
    });

    expect(iso(next)).toBe('2026-03-08T07:30:00.000Z');
    expect(wallClock(next, 'America/New_York')).toBe('2026-03-08 03:30');
  });

  it('takes the first occurrence when the wall time happens twice', () => {
    // 01:30 occurs twice on 1 November 2026 in New York. The first is EDT
    // (05:30Z); the second is EST (06:30Z). One run, not two.
    const next = computeNextRun({
      frequency: 'DAILY',
      hour: 1,
      minute: 30,
      timezone: 'America/New_York',
      after: new Date('2026-11-01T00:00:00.000Z'),
    });

    expect(iso(next)).toBe('2026-11-01T05:30:00.000Z');
    expect(wallClock(next, 'America/New_York')).toBe('2026-11-01 01:30');
  });

  it('does not move in a zone that observes no DST', () => {
    const march = computeNextRun({
      frequency: 'DAILY',
      hour: 9,
      minute: 0,
      timezone: 'Asia/Riyadh',
      after: new Date('2026-03-27T00:00:00.000Z'),
    });
    const october = computeNextRun({
      frequency: 'DAILY',
      hour: 9,
      minute: 0,
      timezone: 'Asia/Riyadh',
      after: new Date('2026-10-27T00:00:00.000Z'),
    });

    expect(iso(march)).toBe('2026-03-27T06:00:00.000Z');
    expect(iso(october)).toBe('2026-10-27T06:00:00.000Z');
  });
});

describe('computeNextRun — weekly', () => {
  it('fires later today when today is the target weekday and the time has not passed', () => {
    // 2026-08-31 is a Monday.
    const next = computeNextRun({
      frequency: 'WEEKLY',
      hour: 9,
      minute: 0,
      dayOfWeek: 1,
      timezone: 'UTC',
      after: new Date('2026-08-31T06:00:00.000Z'),
    });

    expect(iso(next)).toBe('2026-08-31T09:00:00.000Z');
    expect(next.getUTCDay()).toBe(1);
  });

  it('skips a full week when today is the target weekday and the time has passed', () => {
    const next = computeNextRun({
      frequency: 'WEEKLY',
      hour: 9,
      minute: 0,
      dayOfWeek: 1,
      timezone: 'UTC',
      after: new Date('2026-08-31T09:00:01.000Z'),
    });

    expect(iso(next)).toBe('2026-09-07T09:00:00.000Z');
  });

  it('finds the next occurrence of a later weekday', () => {
    // Monday 2026-08-31 → Friday 2026-09-04.
    const next = computeNextRun({
      frequency: 'WEEKLY',
      hour: 17,
      minute: 45,
      dayOfWeek: 5,
      timezone: 'UTC',
      after: new Date('2026-08-31T06:00:00.000Z'),
    });

    expect(iso(next)).toBe('2026-09-04T17:45:00.000Z');
  });

  it('wraps to the following week for an earlier weekday', () => {
    // Monday 2026-08-31 → Sunday 2026-09-06.
    const next = computeNextRun({
      frequency: 'WEEKLY',
      hour: 8,
      minute: 0,
      dayOfWeek: 0,
      timezone: 'UTC',
      after: new Date('2026-08-31T06:00:00.000Z'),
    });

    expect(iso(next)).toBe('2026-09-06T08:00:00.000Z');
  });

  it('uses the weekday of the schedule timezone, not of UTC', () => {
    // 2026-09-06T22:00Z is Sunday in UTC but already Monday in Asia/Riyadh
    // (01:00 on the 7th), so a Monday schedule fires that same Riyadh Monday.
    const next = computeNextRun({
      frequency: 'WEEKLY',
      hour: 9,
      minute: 0,
      dayOfWeek: 1,
      timezone: 'Asia/Riyadh',
      after: new Date('2026-09-06T22:00:00.000Z'),
    });

    expect(iso(next)).toBe('2026-09-07T06:00:00.000Z');
    expect(wallClock(next, 'Asia/Riyadh')).toBe('2026-09-07 09:00');
  });
});

describe('computeNextRun — monthly', () => {
  it('fires this month when the day has not passed', () => {
    const next = computeNextRun({
      frequency: 'MONTHLY',
      hour: 7,
      minute: 0,
      dayOfMonth: 15,
      timezone: 'UTC',
      after: new Date('2026-08-01T00:00:00.000Z'),
    });

    expect(iso(next)).toBe('2026-08-15T07:00:00.000Z');
  });

  it('rolls to next month when the day has passed', () => {
    const next = computeNextRun({
      frequency: 'MONTHLY',
      hour: 7,
      minute: 0,
      dayOfMonth: 15,
      timezone: 'UTC',
      after: new Date('2026-08-20T00:00:00.000Z'),
    });

    expect(iso(next)).toBe('2026-09-15T07:00:00.000Z');
  });

  it('clamps day 31 to the last day of a 30-day month instead of skipping it', () => {
    // THE RULE: a monthly report never misses a month. September has 30 days,
    // so a 31st-of-the-month schedule runs on the 30th.
    const next = computeNextRun({
      frequency: 'MONTHLY',
      hour: 6,
      minute: 0,
      dayOfMonth: 31,
      timezone: 'UTC',
      after: new Date('2026-09-01T00:00:00.000Z'),
    });

    expect(iso(next)).toBe('2026-09-30T06:00:00.000Z');
  });

  it('clamps day 31 to 28 February in a common year', () => {
    const next = computeNextRun({
      frequency: 'MONTHLY',
      hour: 6,
      minute: 0,
      dayOfMonth: 31,
      timezone: 'UTC',
      after: new Date('2026-02-01T00:00:00.000Z'),
    });

    expect(iso(next)).toBe('2026-02-28T06:00:00.000Z');
  });

  it('clamps day 31 to 29 February in a leap year', () => {
    const next = computeNextRun({
      frequency: 'MONTHLY',
      hour: 6,
      minute: 0,
      dayOfMonth: 31,
      timezone: 'UTC',
      after: new Date('2028-02-01T00:00:00.000Z'),
    });

    expect(iso(next)).toBe('2028-02-29T06:00:00.000Z');
  });

  it('runs on 29 February itself when a leap day is requested and exists', () => {
    const next = computeNextRun({
      frequency: 'MONTHLY',
      hour: 6,
      minute: 0,
      dayOfMonth: 29,
      timezone: 'UTC',
      after: new Date('2028-02-01T00:00:00.000Z'),
    });

    expect(iso(next)).toBe('2028-02-29T06:00:00.000Z');
  });

  it('produces twelve consecutive months for a day-31 schedule, skipping none', () => {
    const fired: string[] = [];
    let cursor = new Date('2026-01-01T00:00:00.000Z');

    for (let index = 0; index < 12; index += 1) {
      cursor = computeNextRun({
        frequency: 'MONTHLY',
        hour: 5,
        minute: 0,
        dayOfMonth: 31,
        timezone: 'UTC',
        after: cursor,
      });
      fired.push(cursor.toISOString().slice(0, 10));
    }

    expect(fired).toEqual([
      '2026-01-31',
      '2026-02-28',
      '2026-03-31',
      '2026-04-30',
      '2026-05-31',
      '2026-06-30',
      '2026-07-31',
      '2026-08-31',
      '2026-09-30',
      '2026-10-31',
      '2026-11-30',
      '2026-12-31',
    ]);
  });

  it('crosses the year boundary', () => {
    const next = computeNextRun({
      frequency: 'MONTHLY',
      hour: 5,
      minute: 0,
      dayOfMonth: 1,
      timezone: 'UTC',
      after: new Date('2026-12-01T05:00:01.000Z'),
    });

    expect(iso(next)).toBe('2027-01-01T05:00:00.000Z');
  });

  it('clamps in the schedule timezone across a DST boundary', () => {
    // 31 October 2026 in London is still BST; 30 November is GMT. Same wall
    // clock, different UTC instants, and the clamp is unaffected by either.
    const october = computeNextRun({
      frequency: 'MONTHLY',
      hour: 9,
      minute: 0,
      dayOfMonth: 31,
      timezone: 'Europe/London',
      after: new Date('2026-10-01T00:00:00.000Z'),
    });
    const november = computeNextRun({
      frequency: 'MONTHLY',
      hour: 9,
      minute: 0,
      dayOfMonth: 31,
      timezone: 'Europe/London',
      after: october,
    });

    expect(iso(october)).toBe('2026-10-31T09:00:00.000Z');
    expect(iso(november)).toBe('2026-11-30T09:00:00.000Z');
    expect(wallClock(october, 'Europe/London')).toBe('2026-10-31 09:00');
    expect(wallClock(november, 'Europe/London')).toBe('2026-11-30 09:00');
  });
});

describe('computeNextRun — rejected input', () => {
  const base = {
    frequency: 'DAILY' as const,
    hour: 9,
    minute: 0,
    timezone: 'UTC',
    after: new Date('2026-08-31T00:00:00.000Z'),
  };

  it('rejects an unknown timezone rather than silently using UTC', () => {
    expect(() =>
      computeNextRun({ ...base, timezone: 'Mars/Olympus_Mons' }),
    ).toThrow(/Unknown timezone/);
  });

  it.each([
    ['hour above range', { hour: 24 }],
    ['hour below range', { hour: -1 }],
    ['fractional hour', { hour: 9.5 }],
    ['minute above range', { minute: 60 }],
  ])('rejects %s', (_label, override) => {
    expect(() => computeNextRun({ ...base, ...override })).toThrow();
  });

  it('rejects a weekly schedule with no weekday', () => {
    expect(() =>
      computeNextRun({ ...base, frequency: 'WEEKLY', dayOfWeek: null }),
    ).toThrow(/dayOfWeek/);
  });

  it('rejects a weekly schedule with an out-of-range weekday', () => {
    expect(() =>
      computeNextRun({ ...base, frequency: 'WEEKLY', dayOfWeek: 7 }),
    ).toThrow(/dayOfWeek/);
  });

  it('rejects a monthly schedule with no day of month', () => {
    expect(() =>
      computeNextRun({ ...base, frequency: 'MONTHLY', dayOfMonth: null }),
    ).toThrow(/dayOfMonth/);
  });

  it('rejects day of month 0 and 32', () => {
    expect(() =>
      computeNextRun({ ...base, frequency: 'MONTHLY', dayOfMonth: 0 }),
    ).toThrow(/dayOfMonth/);
    expect(() =>
      computeNextRun({ ...base, frequency: 'MONTHLY', dayOfMonth: 32 }),
    ).toThrow(/dayOfMonth/);
  });

  it('rejects an invalid "after" instant', () => {
    expect(() =>
      computeNextRun({ ...base, after: new Date('not-a-date') }),
    ).toThrow(/after/);
  });
});
