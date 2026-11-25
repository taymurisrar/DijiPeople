import {
  mergeIntervals,
  subtractIntervals,
  summarizeLedger,
  validateMeasure,
  type LedgerRow,
} from './contribution-math';

const at = (hhmm: string) => new Date(`2026-11-02T${hhmm}:00.000Z`);
const period = { from: at('00:00'), to: new Date('2026-11-03T00:00:00.000Z') };

function interval(
  from: string,
  to: string,
  over: Partial<LedgerRow> = {},
): LedgerRow {
  return {
    measure: 'INTERVAL',
    state: 'ACTIVE',
    verification: 'VERIFIED',
    category: 'PLANNED',
    startsAt: at(from),
    endsAt: at(to),
    quantity: null,
    unitKey: null,
    capturedOffline: false,
    retrospective: false,
    ...over,
  };
}

function quantity(
  amount: string,
  unitKey: string,
  over: Partial<LedgerRow> = {},
): LedgerRow {
  return {
    measure: 'QUANTITY',
    state: 'ACTIVE',
    verification: 'VERIFIED',
    category: 'PLANNED',
    startsAt: null,
    endsAt: null,
    quantity: amount,
    unitKey,
    capturedOffline: false,
    retrospective: false,
    ...over,
  };
}

describe('mergeIntervals / subtractIntervals', () => {
  it('merges overlapping and touching intervals', () => {
    expect(
      mergeIntervals([
        { start: 5, end: 8 },
        { start: 1, end: 3 },
        { start: 2, end: 4 },
        { start: 4, end: 5 },
      ]),
    ).toEqual([{ start: 1, end: 8 }]);
  });

  it('ignores empty and inverted intervals', () => {
    expect(
      mergeIntervals([
        { start: 3, end: 3 },
        { start: 5, end: 2 },
      ]),
    ).toEqual([]);
  });

  it('subtracts what is already covered', () => {
    expect(
      subtractIntervals(
        [{ start: 0, end: 10 }],
        [
          { start: 2, end: 4 },
          { start: 8, end: 12 },
        ],
      ),
    ).toEqual([
      { start: 0, end: 2 },
      { start: 4, end: 8 },
    ]);
  });
});

describe('summarizeLedger', () => {
  it('counts the same hour once however many sources corroborate it', () => {
    const summary = summarizeLedger(
      [
        interval('09:00', '11:00'),
        interval('10:00', '12:00'),
        interval('09:30', '10:30', { verification: 'UNVERIFIED' }),
      ],
      period,
    );
    // 09:00-12:00 is 180 minutes of verified time; the unverified entry lies
    // wholly inside it and adds nothing. Raw 120+120+60 = 300, so 120 removed.
    expect(summary.time).toMatchObject({
      verifiedMinutes: 180,
      unverifiedMinutes: 0,
      overlapRemovedMinutes: 120,
    });
  });

  it('keeps verified, unverified and disputed apart and never double counts across them', () => {
    const summary = summarizeLedger(
      [
        interval('08:00', '09:00'),
        interval('08:30', '10:00', { verification: 'UNVERIFIED' }),
        interval('09:30', '11:00', { verification: 'DISPUTED' }),
      ],
      period,
    );
    expect(summary.time).toMatchObject({
      verifiedMinutes: 60,
      unverifiedMinutes: 60, // 09:00-10:00
      disputedMinutes: 60, // 10:00-11:00
    });
  });

  it('excludes rejected evidence and says how much it excluded', () => {
    const summary = summarizeLedger(
      [interval('08:00', '10:00', { verification: 'REJECTED' })],
      period,
    );
    expect(summary.time.verifiedMinutes).toBe(0);
    expect(summary.time.unverifiedMinutes).toBe(0);
    expect(summary.entries).toMatchObject({ counted: 0, rejectedExcluded: 1 });
  });

  it('ignores superseded and withdrawn revisions', () => {
    const summary = summarizeLedger(
      [
        interval('08:00', '10:00', { state: 'SUPERSEDED' }),
        interval('08:00', '10:00', { state: 'WITHDRAWN' }),
        interval('08:00', '09:00'),
      ],
      period,
    );
    expect(summary.time.verifiedMinutes).toBe(60);
  });

  it('never converts a quantity into time: output is summed per unit beside time', () => {
    const summary = summarizeLedger(
      [
        interval('08:00', '16:00'),
        quantity('80', 'unit'),
        quantity('60.5', 'unit', { verification: 'UNVERIFIED' }),
        quantity('3', 'visit'),
      ],
      period,
    );
    expect(summary.time.verifiedMinutes).toBe(480);
    expect(summary.quantities).toEqual([
      { unitKey: 'unit', verified: '80', unverified: '60.5', disputed: '0' },
      { unitKey: 'visit', verified: '3', unverified: '0', disputed: '0' },
    ]);
  });

  it('keeps downtime and blocked time out of work time', () => {
    const summary = summarizeLedger(
      [
        interval('08:00', '12:00'),
        interval('12:00', '15:00', { category: 'DOWNTIME' }),
        interval('15:00', '16:00', { category: 'BLOCKED' }),
      ],
      period,
    );
    expect(summary.time).toMatchObject({
      verifiedMinutes: 240,
      downtimeMinutes: 180,
      blockedMinutes: 60,
    });
  });

  it('clips an interval that crosses the period boundary', () => {
    const summary = summarizeLedger(
      [
        {
          ...interval('00:00', '01:00'),
          startsAt: new Date('2026-11-01T23:00:00.000Z'),
          endsAt: new Date('2026-11-02T01:00:00.000Z'),
        },
      ],
      period,
    );
    expect(summary.time.verifiedMinutes).toBe(60);
  });

  it('counts occurrences by verification and reports offline and retrospective entries', () => {
    const summary = summarizeLedger(
      [
        {
          ...interval('08:00', '09:00'),
          measure: 'OCCURRENCE',
          startsAt: null,
          endsAt: null,
          capturedOffline: true,
        },
        {
          ...interval('08:00', '09:00'),
          measure: 'OCCURRENCE',
          startsAt: null,
          endsAt: null,
          verification: 'UNVERIFIED',
          retrospective: true,
        },
      ],
      period,
    );
    expect(summary.occurrences).toEqual({
      verified: 1,
      unverified: 1,
      disputed: 0,
    });
    expect(summary.entries).toMatchObject({ offline: 1, retrospective: 1 });
  });

  it('adds quantities exactly, with no floating point drift', () => {
    const summary = summarizeLedger(
      [quantity('0.1', 'g'), quantity('0.2', 'g')],
      period,
    );
    expect(summary.quantities[0].verified).toBe('0.3');
  });
});

describe('validateMeasure', () => {
  const start = at('08:00');
  it('accepts a well-formed entry of each measure', () => {
    expect(
      validateMeasure({
        measure: 'INTERVAL',
        startsAt: start,
        endsAt: at('09:00'),
      }),
    ).toBeNull();
    expect(
      validateMeasure({ measure: 'QUANTITY', quantity: '4', unitKey: 'visit' }),
    ).toBeNull();
    expect(validateMeasure({ measure: 'OCCURRENCE' })).toBeNull();
  });

  it('refuses an interval that is empty, inverted or longer than a day', () => {
    expect(
      validateMeasure({ measure: 'INTERVAL', startsAt: start, endsAt: start }),
    ).toMatch(/after its start/);
    expect(
      validateMeasure({
        measure: 'INTERVAL',
        startsAt: start,
        endsAt: new Date(start.getTime() + 25 * 3_600_000),
      }),
    ).toMatch(/24 hours/);
  });

  it('refuses to mix time and quantity in one entry', () => {
    expect(
      validateMeasure({
        measure: 'INTERVAL',
        startsAt: start,
        endsAt: at('09:00'),
        quantity: 3,
        unitKey: 'unit',
      }),
    ).toMatch(/no quantity/);
    expect(
      validateMeasure({
        measure: 'QUANTITY',
        quantity: 3,
        unitKey: 'unit',
        startsAt: start,
      }),
    ).toMatch(/not a time range/);
  });

  it('refuses a quantity that is missing, zero, negative or not a number', () => {
    expect(validateMeasure({ measure: 'QUANTITY', unitKey: 'u' })).toMatch(
      /amount and a unit/,
    );
    expect(
      validateMeasure({ measure: 'QUANTITY', quantity: 0, unitKey: 'u' }),
    ).toMatch(/greater than zero/);
    expect(
      validateMeasure({ measure: 'QUANTITY', quantity: -1, unitKey: 'u' }),
    ).toMatch(/greater than zero/);
    expect(
      validateMeasure({ measure: 'QUANTITY', quantity: 'abc', unitKey: 'u' }),
    ).toMatch(/not a number/);
  });
});
