/**
 * Analytical periods and period-over-period comparison.
 *
 * Everything here is pure and timezone-explicit. Reporting boundaries are a
 * classic source of quiet wrongness: a "this month" that starts at the server's
 * midnight rather than the tenant's puts a shift's worth of rows in the wrong
 * bucket, and the existing `/reports/attendance-summary` does exactly that
 * (`new Date(); setHours(0,0,0,0)` — server-local, not tenant-local).
 *
 * The client proposes a period; the server resolves it. A client-supplied
 * `from`/`to` is still validated and clamped here, because a report definition
 * can be replayed by a scheduler months later with no client present.
 */

export type PeriodPreset =
  | 'today'
  | 'yesterday'
  | 'last_7_days'
  | 'last_30_days'
  | 'this_month'
  | 'previous_month'
  | 'this_quarter'
  | 'previous_quarter'
  | 'year_to_date'
  | 'previous_year'
  | 'custom';

export type ComparisonMode =
  | 'none'
  | 'previous_period'
  | 'previous_month'
  | 'previous_quarter'
  | 'previous_year';

export type Granularity = 'day' | 'week' | 'month' | 'quarter';

export interface ResolvedPeriod {
  /** Inclusive start, `YYYY-MM-DD` in the tenant's timezone. */
  from: string;
  /** Inclusive end, `YYYY-MM-DD` in the tenant's timezone. */
  to: string;
  preset: PeriodPreset;
  timezone: string;
  /** Inclusive day count. */
  days: number;
}

export interface ResolvedComparison {
  mode: ComparisonMode;
  period: ResolvedPeriod | null;
}

export const PERIOD_PRESETS: readonly PeriodPreset[] = [
  'today',
  'yesterday',
  'last_7_days',
  'last_30_days',
  'this_month',
  'previous_month',
  'this_quarter',
  'previous_quarter',
  'year_to_date',
  'previous_year',
  'custom',
];

export const COMPARISON_MODES: readonly ComparisonMode[] = [
  'none',
  'previous_period',
  'previous_month',
  'previous_quarter',
  'previous_year',
];

/** The longest window any single analytics query may span. */
export const MAX_PERIOD_DAYS = 1100;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The calendar date at `instant` as seen in `timeZone`.
 *
 * `Intl` is used rather than arithmetic on the UTC offset because offsets are
 * not constant: a fixed `+05:00` is wrong for half the year in any zone that
 * observes DST, and reporting windows routinely straddle the change.
 */
export function civilDate(instant: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(instant);
  // en-CA yields YYYY-MM-DD.
  return parts;
}

/** Parse `YYYY-MM-DD` into a UTC-midnight Date used only for date arithmetic. */
export function parseCivilDate(value: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new Error(`Invalid date: ${value}`);
  const [, y, m, d] = match;
  const date = new Date(
    Date.UTC(Number(y), Number(m) - 1, Number(d), 0, 0, 0, 0),
  );
  if (
    date.getUTCFullYear() !== Number(y) ||
    date.getUTCMonth() !== Number(m) - 1 ||
    date.getUTCDate() !== Number(d)
  ) {
    throw new Error(`Invalid date: ${value}`);
  }
  return date;
}

export function formatCivilDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDays(value: string, days: number): string {
  return formatCivilDate(new Date(parseCivilDate(value).getTime() + days * DAY_MS));
}

export function addMonths(value: string, months: number): string {
  const date = parseCivilDate(value);
  const targetMonth = date.getUTCMonth() + months;
  const year = date.getUTCFullYear() + Math.floor(targetMonth / 12);
  const month = ((targetMonth % 12) + 12) % 12;
  // Clamp the day: 31 Jan minus one month is 28/29 Feb, not 3 March.
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const day = Math.min(date.getUTCDate(), lastDay);
  return formatCivilDate(new Date(Date.UTC(year, month, day)));
}

export function daysBetweenInclusive(from: string, to: string): number {
  return (
    Math.round(
      (parseCivilDate(to).getTime() - parseCivilDate(from).getTime()) / DAY_MS,
    ) + 1
  );
}

function startOfMonth(value: string): string {
  return `${value.slice(0, 7)}-01`;
}

function endOfMonth(value: string): string {
  const date = parseCivilDate(value);
  return formatCivilDate(
    new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)),
  );
}

function startOfQuarter(value: string): string {
  const date = parseCivilDate(value);
  const quarterMonth = Math.floor(date.getUTCMonth() / 3) * 3;
  return formatCivilDate(
    new Date(Date.UTC(date.getUTCFullYear(), quarterMonth, 1)),
  );
}

function endOfQuarter(value: string): string {
  const start = parseCivilDate(startOfQuarter(value));
  return formatCivilDate(
    new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 3, 0)),
  );
}

export interface ResolvePeriodInput {
  preset: PeriodPreset;
  timezone: string;
  /** Only read when `preset === 'custom'`. */
  from?: string;
  to?: string;
  /** Injectable for tests; defaults to now. */
  now?: Date;
}

export function resolvePeriod(input: ResolvePeriodInput): ResolvedPeriod {
  const timezone = input.timezone || 'UTC';
  const today = civilDate(input.now ?? new Date(), timezone);

  let from: string;
  let to: string;

  switch (input.preset) {
    case 'today':
      from = today;
      to = today;
      break;
    case 'yesterday':
      from = addDays(today, -1);
      to = from;
      break;
    case 'last_7_days':
      // Inclusive of today, so the window is 7 days, not 8.
      from = addDays(today, -6);
      to = today;
      break;
    case 'last_30_days':
      from = addDays(today, -29);
      to = today;
      break;
    case 'this_month':
      from = startOfMonth(today);
      to = today;
      break;
    case 'previous_month': {
      const anchor = addMonths(startOfMonth(today), -1);
      from = startOfMonth(anchor);
      to = endOfMonth(anchor);
      break;
    }
    case 'this_quarter':
      from = startOfQuarter(today);
      to = today;
      break;
    case 'previous_quarter': {
      const anchor = addMonths(startOfQuarter(today), -3);
      from = startOfQuarter(anchor);
      to = endOfQuarter(anchor);
      break;
    }
    case 'year_to_date':
      from = `${today.slice(0, 4)}-01-01`;
      to = today;
      break;
    case 'previous_year': {
      const year = Number(today.slice(0, 4)) - 1;
      from = `${year}-01-01`;
      to = `${year}-12-31`;
      break;
    }
    case 'custom': {
      if (!input.from || !input.to) {
        throw new Error('A custom period requires both from and to.');
      }
      from = formatCivilDate(parseCivilDate(input.from));
      to = formatCivilDate(parseCivilDate(input.to));
      break;
    }
    default: {
      const exhaustive: never = input.preset;
      throw new Error(`Unsupported period preset: ${String(exhaustive)}`);
    }
  }

  if (parseCivilDate(from).getTime() > parseCivilDate(to).getTime()) {
    throw new Error('Period start must not be after period end.');
  }

  const days = daysBetweenInclusive(from, to);
  if (days > MAX_PERIOD_DAYS) {
    throw new Error(
      `Period spans ${days} days, which exceeds the ${MAX_PERIOD_DAYS}-day maximum.`,
    );
  }

  return { from, to, preset: input.preset, timezone, days };
}

/**
 * The period a comparison should be measured against.
 *
 * `previous_period` shifts by the window's own length, so a 31-day window
 * compares against the 31 days before it rather than against "last month" —
 * those are different questions and conflating them is how a 31-day month
 * appears to have grown against a 30-day one.
 */
export function resolveComparison(
  period: ResolvedPeriod,
  mode: ComparisonMode,
): ResolvedComparison {
  if (mode === 'none') return { mode, period: null };

  let from: string;
  let to: string;

  switch (mode) {
    case 'previous_period':
      to = addDays(period.from, -1);
      from = addDays(to, -(period.days - 1));
      break;
    case 'previous_month':
      from = addMonths(period.from, -1);
      to = addMonths(period.to, -1);
      break;
    case 'previous_quarter':
      from = addMonths(period.from, -3);
      to = addMonths(period.to, -3);
      break;
    case 'previous_year':
      from = addMonths(period.from, -12);
      to = addMonths(period.to, -12);
      break;
    default: {
      const exhaustive: never = mode;
      throw new Error(`Unsupported comparison: ${String(exhaustive)}`);
    }
  }

  return {
    mode,
    period: {
      from,
      to,
      preset: 'custom',
      timezone: period.timezone,
      days: daysBetweenInclusive(from, to),
    },
  };
}

/**
 * Half-open UTC instants for a civil date range in `timeZone`.
 *
 * Returned as `[start, end)` so a `DateTime` column filter is
 * `{ gte: start, lt: end }` — using an inclusive `lte` on a timestamp silently
 * drops everything after midnight on the final day.
 */
export function toInstantRange(
  period: Pick<ResolvedPeriod, 'from' | 'to' | 'timezone'>,
): { start: Date; end: Date } {
  return {
    start: civilStartInstant(period.from, period.timezone),
    end: civilStartInstant(addDays(period.to, 1), period.timezone),
  };
}

/**
 * The UTC instant at which `civil` begins in `timeZone`.
 *
 * Resolved by probing rather than by an offset table: guess UTC midnight, ask
 * what civil date that instant maps to in the zone, and correct. Two passes are
 * enough for every real offset, including the 45-minute ones.
 */
export function civilStartInstant(civil: string, timeZone: string): Date {
  let guess = parseCivilDate(civil);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const offsetMinutes = zoneOffsetMinutes(guess, timeZone);
    const corrected = new Date(
      parseCivilDate(civil).getTime() - offsetMinutes * 60_000,
    );
    if (corrected.getTime() === guess.getTime()) return corrected;
    guess = corrected;
  }
  return guess;
}

function zoneOffsetMinutes(instant: Date, timeZone: string): number {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const parts = formatter.formatToParts(instant);
  const lookup = (type: string) =>
    Number(parts.find((part) => part.type === type)?.value ?? '0');
  const asUtc = Date.UTC(
    lookup('year'),
    lookup('month') - 1,
    lookup('day'),
    lookup('hour') % 24,
    lookup('minute'),
    lookup('second'),
  );
  return Math.round((asUtc - instant.getTime()) / 60_000);
}

/** Bucket boundaries covering `period`, for a trend series. */
export function buildBuckets(
  period: ResolvedPeriod,
  granularity: Granularity,
): Array<{ key: string; label: string; from: string; to: string }> {
  const buckets: Array<{ key: string; label: string; from: string; to: string }> =
    [];
  let cursor = period.from;

  while (parseCivilDate(cursor).getTime() <= parseCivilDate(period.to).getTime()) {
    let bucketEnd: string;
    switch (granularity) {
      case 'day':
        bucketEnd = cursor;
        break;
      case 'week':
        bucketEnd = addDays(cursor, 6);
        break;
      case 'month':
        bucketEnd = endOfMonth(cursor);
        break;
      case 'quarter':
        bucketEnd = endOfQuarter(cursor);
        break;
      default: {
        const exhaustive: never = granularity;
        throw new Error(`Unsupported granularity: ${String(exhaustive)}`);
      }
    }
    if (parseCivilDate(bucketEnd).getTime() > parseCivilDate(period.to).getTime()) {
      bucketEnd = period.to;
    }
    buckets.push({
      key: cursor,
      label: bucketLabel(cursor, granularity),
      from: cursor,
      to: bucketEnd,
    });
    cursor = addDays(bucketEnd, 1);
  }

  return buckets;
}

function bucketLabel(from: string, granularity: Granularity): string {
  switch (granularity) {
    case 'day':
    case 'week':
      return from;
    case 'month':
      return from.slice(0, 7);
    case 'quarter': {
      const date = parseCivilDate(from);
      return `${date.getUTCFullYear()}-Q${Math.floor(date.getUTCMonth() / 3) + 1}`;
    }
    default:
      return from;
  }
}

/** Granularity that keeps a trend readable without returning hundreds of points. */
export function suggestGranularity(period: ResolvedPeriod): Granularity {
  if (period.days <= 31) return 'day';
  if (period.days <= 120) return 'week';
  if (period.days <= 800) return 'month';
  return 'quarter';
}
