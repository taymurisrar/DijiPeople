import { Prisma } from '@prisma/client';

/*
 * DP-MASTER WP-30.S1 (M01, M02). The pure arithmetic of the contribution ledger.
 *
 * Three rules this file exists to enforce, each tested directly:
 *   1. Overlapping evidence counts once. Two sources corroborating the same hour
 *      are one hour; an unverified entry inside a verified one adds nothing.
 *   2. A quantity is never converted into time. Output is summed per unit and
 *      reported beside time, never inside it.
 *   3. Verified, unverified and disputed evidence are separate figures, and
 *      rejected evidence is excluded and counted, not silently dropped.
 */

export type Interval = { start: number; end: number };

export type LedgerRow = {
  measure: 'INTERVAL' | 'QUANTITY' | 'OCCURRENCE';
  state: 'ACTIVE' | 'SUPERSEDED' | 'WITHDRAWN';
  verification: 'UNVERIFIED' | 'VERIFIED' | 'DISPUTED' | 'REJECTED';
  category: string;
  startsAt: Date | null;
  endsAt: Date | null;
  quantity: Prisma.Decimal | string | number | null;
  unitKey: string | null;
  capturedOffline: boolean;
  retrospective: boolean;
};

const MINUTE = 60_000;

/** The union of intervals: sorted, overlapping and touching ones merged. */
export function mergeIntervals(intervals: Interval[]): Interval[] {
  const sorted = intervals
    .filter((i) => i.end > i.start)
    .map((i) => ({ ...i }))
    .sort((a, b) => a.start - b.start);
  const merged: Interval[] = [];
  for (const interval of sorted) {
    const last = merged[merged.length - 1];
    if (last && interval.start <= last.end) {
      last.end = Math.max(last.end, interval.end);
    } else {
      merged.push(interval);
    }
  }
  return merged;
}

/** `from` minus `taken`, both already merged. */
export function subtractIntervals(
  from: Interval[],
  taken: Interval[],
): Interval[] {
  const result: Interval[] = [];
  for (const interval of from) {
    let cursor = interval.start;
    for (const cut of taken) {
      if (cut.end <= cursor) continue;
      if (cut.start >= interval.end) break;
      if (cut.start > cursor) result.push({ start: cursor, end: cut.start });
      cursor = Math.max(cursor, cut.end);
      if (cursor >= interval.end) break;
    }
    if (cursor < interval.end)
      result.push({ start: cursor, end: interval.end });
  }
  return result;
}

export function clipInterval(interval: Interval, from: number, to: number) {
  const start = Math.max(interval.start, from);
  const end = Math.min(interval.end, to);
  return end > start ? { start, end } : null;
}

export function totalMinutes(intervals: Interval[]): number {
  return Math.round(
    intervals.reduce((sum, i) => sum + (i.end - i.start), 0) / MINUTE,
  );
}

const WORK_CATEGORIES_EXCLUDED = new Set(['DOWNTIME', 'BLOCKED']);

export type LedgerSummary = {
  period: { from: string; to: string };
  time: {
    /** Union of verified work intervals: the figure that may be recognised. */
    verifiedMinutes: number;
    /** Unverified work that no verified evidence already covers. */
    unverifiedMinutes: number;
    /** Disputed work that nothing else already covers. */
    disputedMinutes: number;
    /** Minutes removed because the same time was evidenced more than once. */
    overlapRemovedMinutes: number;
    /** Not work: shown so a gap is explained, never added to work. */
    downtimeMinutes: number;
    blockedMinutes: number;
  };
  /** Output per unit. Never folded into `time`. */
  quantities: Array<{
    unitKey: string;
    verified: string;
    unverified: string;
    disputed: string;
  }>;
  occurrences: { verified: number; unverified: number; disputed: number };
  entries: {
    counted: number;
    rejectedExcluded: number;
    offline: number;
    retrospective: number;
  };
};

export function summarizeLedger(
  rows: LedgerRow[],
  period: { from: Date; to: Date },
): LedgerSummary {
  const from = period.from.getTime();
  const to = period.to.getTime();
  const active = rows.filter((row) => row.state === 'ACTIVE');
  const rejected = active.filter((row) => row.verification === 'REJECTED');
  const counted = active.filter((row) => row.verification !== 'REJECTED');

  const intervalsFor = (
    verification: LedgerRow['verification'],
    predicate: (row: LedgerRow) => boolean,
  ) =>
    counted
      .filter(
        (row) =>
          row.measure === 'INTERVAL' &&
          row.verification === verification &&
          row.startsAt &&
          row.endsAt &&
          predicate(row),
      )
      .map((row) =>
        clipInterval(
          { start: row.startsAt!.getTime(), end: row.endsAt!.getTime() },
          from,
          to,
        ),
      )
      .filter((i): i is Interval => i !== null);

  const isWork = (row: LedgerRow) =>
    !WORK_CATEGORIES_EXCLUDED.has(row.category);
  const rawWork = (['VERIFIED', 'UNVERIFIED', 'DISPUTED'] as const).flatMap(
    (v) => intervalsFor(v, isWork),
  );

  const verified = mergeIntervals(intervalsFor('VERIFIED', isWork));
  const unverified = subtractIntervals(
    mergeIntervals(intervalsFor('UNVERIFIED', isWork)),
    verified,
  );
  const disputed = subtractIntervals(
    mergeIntervals(intervalsFor('DISPUTED', isWork)),
    mergeIntervals([...verified, ...unverified]),
  );
  const rawMinutes = totalMinutes(rawWork);
  const mergedMinutes =
    totalMinutes(verified) + totalMinutes(unverified) + totalMinutes(disputed);

  const downtime = mergeIntervals(
    (['VERIFIED', 'UNVERIFIED', 'DISPUTED'] as const).flatMap((v) =>
      intervalsFor(v, (row) => row.category === 'DOWNTIME'),
    ),
  );
  const blocked = mergeIntervals(
    (['VERIFIED', 'UNVERIFIED', 'DISPUTED'] as const).flatMap((v) =>
      intervalsFor(v, (row) => row.category === 'BLOCKED'),
    ),
  );

  const perUnit = new Map<
    string,
    {
      verified: Prisma.Decimal;
      unverified: Prisma.Decimal;
      disputed: Prisma.Decimal;
    }
  >();
  for (const row of counted) {
    if (row.measure !== 'QUANTITY' || row.quantity == null || !row.unitKey) {
      continue;
    }
    const bucket = perUnit.get(row.unitKey) ?? {
      verified: new Prisma.Decimal(0),
      unverified: new Prisma.Decimal(0),
      disputed: new Prisma.Decimal(0),
    };
    const key =
      row.verification === 'VERIFIED'
        ? 'verified'
        : row.verification === 'DISPUTED'
          ? 'disputed'
          : 'unverified';
    bucket[key] = bucket[key].plus(new Prisma.Decimal(row.quantity));
    perUnit.set(row.unitKey, bucket);
  }

  const occurrences = { verified: 0, unverified: 0, disputed: 0 };
  for (const row of counted) {
    if (row.measure !== 'OCCURRENCE') continue;
    if (row.verification === 'VERIFIED') occurrences.verified += 1;
    else if (row.verification === 'DISPUTED') occurrences.disputed += 1;
    else occurrences.unverified += 1;
  }

  return {
    period: { from: period.from.toISOString(), to: period.to.toISOString() },
    time: {
      verifiedMinutes: totalMinutes(verified),
      unverifiedMinutes: totalMinutes(unverified),
      disputedMinutes: totalMinutes(disputed),
      overlapRemovedMinutes: Math.max(0, rawMinutes - mergedMinutes),
      downtimeMinutes: totalMinutes(downtime),
      blockedMinutes: totalMinutes(blocked),
    },
    quantities: [...perUnit.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([unitKey, value]) => ({
        unitKey,
        verified: value.verified.toString(),
        unverified: value.unverified.toString(),
        disputed: value.disputed.toString(),
      })),
    occurrences,
    entries: {
      counted: counted.length,
      rejectedExcluded: rejected.length,
      offline: counted.filter((row) => row.capturedOffline).length,
      retrospective: counted.filter((row) => row.retrospective).length,
    },
  };
}

/** The shape every entry must have for its measure, or the first problem. */
export function validateMeasure(input: {
  measure: 'INTERVAL' | 'QUANTITY' | 'OCCURRENCE';
  startsAt?: Date | null;
  endsAt?: Date | null;
  quantity?: number | string | null;
  unitKey?: string | null;
}): string | null {
  const MAX_INTERVAL_MS = 24 * 60 * MINUTE;
  if (input.measure === 'INTERVAL') {
    if (!input.startsAt || !input.endsAt) {
      return 'An interval needs a start and an end.';
    }
    if (input.endsAt <= input.startsAt) {
      return 'The end of an interval must be after its start.';
    }
    if (input.endsAt.getTime() - input.startsAt.getTime() > MAX_INTERVAL_MS) {
      return 'One interval cannot be longer than 24 hours; record it in parts.';
    }
    if (input.quantity != null || input.unitKey) {
      return 'An interval is time and carries no quantity or unit.';
    }
    return null;
  }
  if (input.measure === 'QUANTITY') {
    if (input.quantity == null || input.unitKey == null || !input.unitKey) {
      return 'A quantity needs an amount and a unit.';
    }
    let amount: Prisma.Decimal;
    try {
      amount = new Prisma.Decimal(input.quantity);
    } catch {
      return 'The quantity is not a number.';
    }
    if (!amount.isFinite() || amount.lte(0)) {
      return 'A quantity must be greater than zero.';
    }
    if (input.startsAt || input.endsAt) {
      return 'A quantity is an amount, not a time range; record the time separately.';
    }
    return null;
  }
  if (
    input.startsAt ||
    input.endsAt ||
    input.quantity != null ||
    input.unitKey
  ) {
    return 'An occurrence only says that it happened.';
  }
  return null;
}
