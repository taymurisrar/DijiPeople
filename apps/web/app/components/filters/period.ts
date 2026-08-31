import {
  formatDate,
  type ResolvedFormattingContext,
} from "@/lib/formatting-context";

/*
 * Reporting periods, resolved.
 *
 * Everything here is pure and node-testable, for the same reason the chart
 * geometry is: jest in `apps/web` runs `testEnvironment: "node"` and matches
 * `*.spec.ts` only, so this is the last place a date bug can be caught. And
 * date bugs are the ones worth catching — they are invisible in development,
 * where the developer's machine, the server and the tenant are all in the same
 * timezone and the current month happens to have 31 days.
 *
 * Three decisions run through the whole file.
 *
 * 1. **"Today" is the tenant's today, not the server's.** A period is resolved
 *    from an instant plus a timezone, and the very first thing that happens is
 *    the conversion of that instant to a *civil* date in the tenant's zone. A
 *    report run at 02:00 in Doha on the 1st must not be dated the 31st because
 *    the Render instance is on UTC.
 *
 * 2. **After that conversion there are no instants at all.** Every subsequent
 *    calculation is calendar arithmetic on year/month/day triples. This is not
 *    a shortcut — it is the only way to be right. Adding "30 days" as
 *    30 × 86,400,000 milliseconds crosses a DST boundary and lands on the wrong
 *    day; adding it as a calendar step cannot. `Date.UTC` is used purely as a
 *    calendar calculator, never as a moment in time.
 *
 * 3. **No `Intl` call and no `toLocaleDateString`.** The tenant-local date is
 *    obtained through `formatDate` from `lib/formatting-context.ts` with an
 *    explicit `yyyy-MM-dd` format — the same helper every screen uses, per the
 *    rule BUG-2010 produced. There is exactly one such call, in `tenantToday`.
 */

/** Inclusive, `yyyy-MM-dd` at both ends. */
export type DateRange = { from: string; to: string };

export type PeriodPreset =
  | "today"
  | "yesterday"
  | "last_7_days"
  | "last_30_days"
  | "this_month"
  | "previous_month"
  | "this_quarter"
  | "previous_quarter"
  | "year_to_date"
  | "previous_year"
  | "custom";

export type ComparisonMode =
  | "none"
  | "previous_period"
  | "previous_month"
  | "previous_quarter"
  | "previous_year";

export const PERIOD_PRESETS: readonly PeriodPreset[] = [
  "today",
  "yesterday",
  "last_7_days",
  "last_30_days",
  "this_month",
  "previous_month",
  "this_quarter",
  "previous_quarter",
  "year_to_date",
  "previous_year",
  "custom",
] as const;

export const COMPARISON_MODES: readonly ComparisonMode[] = [
  "none",
  "previous_period",
  "previous_month",
  "previous_quarter",
  "previous_year",
] as const;

/**
 * Labels for the preset dropdown.
 *
 * "This month", "This quarter" and "Year to date" are *to date* — they end
 * today, not at the end of the calendar period. A month-to-date figure compared
 * against a full previous month is the single most common way a dashboard lies
 * about a trend, and the labels say which one the reader is getting.
 */
export const PERIOD_PRESET_OPTIONS: readonly {
  value: PeriodPreset;
  label: string;
}[] = [
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "last_7_days", label: "Last 7 days" },
  { value: "last_30_days", label: "Last 30 days" },
  { value: "this_month", label: "This month to date" },
  { value: "previous_month", label: "Previous month" },
  { value: "this_quarter", label: "This quarter to date" },
  { value: "previous_quarter", label: "Previous quarter" },
  { value: "year_to_date", label: "Year to date" },
  { value: "previous_year", label: "Previous year" },
  { value: "custom", label: "Custom range" },
];

export const COMPARISON_MODE_OPTIONS: readonly {
  value: ComparisonMode;
  label: string;
}[] = [
  { value: "none", label: "No comparison" },
  { value: "previous_period", label: "Previous period" },
  { value: "previous_month", label: "Same range, previous month" },
  { value: "previous_quarter", label: "Same range, previous quarter" },
  { value: "previous_year", label: "Same range, previous year" },
];

export const DEFAULT_PERIOD_PRESET: PeriodPreset = "last_30_days";
export const DEFAULT_COMPARISON_MODE: ComparisonMode = "none";

/**
 * Sunday.
 *
 * This product's default weekend is **Friday/Saturday**, so the working week
 * begins on Sunday and not on Monday. It is a parameter everywhere it is used
 * rather than a constant, because a tenant may configure something else again —
 * but the *default* being Monday, which is the reflex, would silently
 * mis-bucket every weekly chart in the shipped configuration.
 */
export const DEFAULT_WEEK_STARTS_ON = 0;

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

type CivilDate = { year: number; month: number; day: number };

export function isValidIsoDate(value: unknown): value is string {
  return typeof value === "string" && parseCivil(value) !== null;
}

function parseCivil(value: string | null | undefined): CivilDate | null {
  if (typeof value !== "string") return null;

  const match = ISO_DATE.exec(value.trim());
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  /* Rejects 2026-02-30: the round trip through the calendar moves the day. */
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() !== month - 1 ||
    probe.getUTCDate() !== day
  ) {
    return null;
  }

  return { year, month, day };
}

function toIso(date: CivilDate): string {
  const year = String(date.year).padStart(4, "0");
  const month = String(date.month).padStart(2, "0");
  const day = String(date.day).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function daysInMonth(year: number, month: number): number {
  /* Day 0 of the next month is the last day of this one. */
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function addDays(date: CivilDate, days: number): CivilDate {
  const shifted = new Date(Date.UTC(date.year, date.month - 1, date.day + days));
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  };
}

/**
 * Shift by whole calendar months, clamping the day to the target month's
 * length.
 *
 * The clamp is the entire difficulty of month arithmetic. 31 March minus one
 * month has no correct answer — there is no 31 February — and the JavaScript
 * `Date` default of rolling forward into 3 March is the wrong one for a
 * reporting period, because it silently moves the comparison window into a
 * month the reader did not ask for. Clamping to 28/29 February keeps the
 * comparison inside the month it names.
 */
function addMonths(date: CivilDate, months: number): CivilDate {
  const monthIndex = date.month - 1 + months;
  const year = date.year + Math.floor(monthIndex / 12);
  const month = (((monthIndex % 12) + 12) % 12) + 1;

  return { year, month, day: Math.min(date.day, daysInMonth(year, month)) };
}

function startOfMonth(date: CivilDate): CivilDate {
  return { year: date.year, month: date.month, day: 1 };
}

function endOfMonth(date: CivilDate): CivilDate {
  return {
    year: date.year,
    month: date.month,
    day: daysInMonth(date.year, date.month),
  };
}

function startOfQuarter(date: CivilDate): CivilDate {
  return {
    year: date.year,
    month: Math.floor((date.month - 1) / 3) * 3 + 1,
    day: 1,
  };
}

function differenceInDays(from: CivilDate, to: CivilDate): number {
  const start = Date.UTC(from.year, from.month - 1, from.day);
  const end = Date.UTC(to.year, to.month - 1, to.day);
  return Math.round((end - start) / 86_400_000);
}

/**
 * The calendar date it is *right now, where the tenant is*.
 *
 * The one place in this module that touches an instant. Everything downstream
 * is calendar arithmetic on the civil date this returns.
 */
export function tenantToday(
  options: {
    timezone?: string | null;
    referenceDate?: Date | string | null;
  } = {},
): string {
  const reference =
    options.referenceDate instanceof Date
      ? options.referenceDate
      : options.referenceDate
        ? new Date(options.referenceDate)
        : new Date();

  const instant = Number.isNaN(reference.getTime()) ? new Date() : reference;

  /*
   * `formatDate` with an explicit `yyyy-MM-dd` and an explicit timezone is the
   * repo-sanctioned way to ask "what is the date there" — it is the same helper
   * the rest of the product formats through, so there is no second, ad-hoc
   * date path here for BUG-2010 to reappear in. The locale is pinned to en-US
   * because this output is a machine-readable key, not something a person
   * reads.
   */
  const formatted = formatDate(instant, {
    dateFormat: "yyyy-MM-dd",
    timezone: options.timezone || "UTC",
    locale: "en-US",
  });

  return isValidIsoDate(formatted) ? formatted : toIso(civilFromUtc(instant));
}

function civilFromUtc(date: Date): CivilDate {
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  };
}

export function isPeriodPreset(value: unknown): value is PeriodPreset {
  return (
    typeof value === "string" &&
    (PERIOD_PRESETS as readonly string[]).includes(value)
  );
}

export function isComparisonMode(value: unknown): value is ComparisonMode {
  return (
    typeof value === "string" &&
    (COMPARISON_MODES as readonly string[]).includes(value)
  );
}

/**
 * Put a pair of dates the right way round.
 *
 * A user who picks the end date first produces `from > to`, which every
 * downstream query reads as an empty result rather than as an error. Swapping
 * is friendlier than an error and cannot be wrong.
 */
export function normalizeRange(
  from: string | null | undefined,
  to: string | null | undefined,
): DateRange | null {
  const start = parseCivil(from);
  const end = parseCivil(to);

  if (!start || !end) return null;

  return differenceInDays(start, end) < 0
    ? { from: toIso(end), to: toIso(start) }
    : { from: toIso(start), to: toIso(end) };
}

export type ResolvePeriodOptions = {
  /** IANA zone. The tenant's, never the server's. Defaults to UTC. */
  timezone?: string | null;
  /** The instant "now" is taken from. Injectable so this is testable. */
  referenceDate?: Date | string | null;
  /** Only read for the `custom` preset. */
  custom?: { from?: string | null; to?: string | null } | null;
};

/**
 * Turn a preset into a concrete inclusive date range.
 *
 * Never throws and never returns an inverted range: an unrecognised preset, or
 * a `custom` selection that is missing or malformed, falls back to the default
 * preset. A reporting screen that renders the wrong 30 days is recoverable; one
 * that throws on a hand-edited query string is not.
 */
export function resolvePeriod(
  preset: PeriodPreset | string | null | undefined,
  options: ResolvePeriodOptions = {},
): DateRange {
  const today = parseCivil(tenantToday(options)) ?? civilFromUtc(new Date());

  const effective: PeriodPreset = isPeriodPreset(preset)
    ? preset
    : DEFAULT_PERIOD_PRESET;

  switch (effective) {
    case "today":
      return { from: toIso(today), to: toIso(today) };

    case "yesterday": {
      const yesterday = addDays(today, -1);
      return { from: toIso(yesterday), to: toIso(yesterday) };
    }

    /*
     * "Last 7 days" includes today, so it is today minus six. Off-by-one here
     * is the classic version of this bug and produces an eight-day week whose
     * totals never reconcile with anything else on the page.
     */
    case "last_7_days":
      return { from: toIso(addDays(today, -6)), to: toIso(today) };

    case "last_30_days":
      return { from: toIso(addDays(today, -29)), to: toIso(today) };

    case "this_month":
      return { from: toIso(startOfMonth(today)), to: toIso(today) };

    case "previous_month": {
      const previous = addMonths(startOfMonth(today), -1);
      return { from: toIso(previous), to: toIso(endOfMonth(previous)) };
    }

    case "this_quarter":
      return { from: toIso(startOfQuarter(today)), to: toIso(today) };

    case "previous_quarter": {
      const previous = addMonths(startOfQuarter(today), -3);
      const lastMonth = addMonths(previous, 2);
      return { from: toIso(previous), to: toIso(endOfMonth(lastMonth)) };
    }

    case "year_to_date":
      return { from: toIso({ year: today.year, month: 1, day: 1 }), to: toIso(today) };

    case "previous_year":
      return {
        from: toIso({ year: today.year - 1, month: 1, day: 1 }),
        to: toIso({ year: today.year - 1, month: 12, day: 31 }),
      };

    case "custom": {
      const normalized = normalizeRange(
        options.custom?.from,
        options.custom?.to,
      );

      /* A half-filled custom range is not yet a range. */
      return (
        normalized ??
        resolvePeriod(DEFAULT_PERIOD_PRESET, { ...options, custom: null })
      );
    }

    default:
      return resolvePeriod(DEFAULT_PERIOD_PRESET, { ...options, custom: null });
  }
}

/** Inclusive day count. A single-day period is 1, never 0. */
export function periodLengthInDays(period: DateRange): number {
  const from = parseCivil(period?.from);
  const to = parseCivil(period?.to);

  if (!from || !to) return 0;

  return Math.abs(differenceInDays(from, to)) + 1;
}

/**
 * The window a period should be measured against.
 *
 * `previous_period` slides the *same number of days* back so it ends the day
 * before the period starts — the comparison is like-for-like in length, which
 * is what makes the two totals comparable. The calendar modes instead shift the
 * endpoints by whole months, quarters or years, which keeps the comparison
 * aligned to the calendar and therefore does *not* preserve length: the same
 * 1–31 October compared against the previous month is 1–30 September, because
 * September has thirty days. Both behaviours are correct for their question,
 * and choosing the wrong one is why a "-3.2% vs last month" figure can be
 * entirely an artefact of month length.
 *
 * Returns `null` for `"none"`, so a caller can treat "no comparison" and "no
 * comparable window" identically.
 */
export function resolveComparison(
  period: DateRange,
  mode: ComparisonMode | string | null | undefined,
): DateRange | null {
  const from = parseCivil(period?.from);
  const to = parseCivil(period?.to);

  if (!from || !to) return null;

  const effective: ComparisonMode = isComparisonMode(mode) ? mode : "none";
  if (effective === "none") return null;

  if (effective === "previous_period") {
    const length = Math.abs(differenceInDays(from, to)) + 1;
    const comparisonTo = addDays(from, -1);
    const comparisonFrom = addDays(comparisonTo, -(length - 1));

    return { from: toIso(comparisonFrom), to: toIso(comparisonTo) };
  }

  const months =
    effective === "previous_month"
      ? -1
      : effective === "previous_quarter"
        ? -3
        : -12;

  return {
    from: toIso(addMonths(from, months)),
    to: toIso(addMonths(to, months)),
  };
}

/**
 * Start of the week containing `date`.
 *
 * `weekStartsOn` defaults to Sunday — see `DEFAULT_WEEK_STARTS_ON` — because
 * this product's default weekend is Friday/Saturday.
 */
export function startOfWeek(
  date: string,
  weekStartsOn: number = DEFAULT_WEEK_STARTS_ON,
): string | null {
  const civil = parseCivil(date);
  if (!civil) return null;

  const normalized = ((Math.trunc(weekStartsOn) % 7) + 7) % 7;
  const weekday = new Date(
    Date.UTC(civil.year, civil.month - 1, civil.day),
  ).getUTCDay();

  return toIso(addDays(civil, -((weekday - normalized + 7) % 7)));
}

/**
 * The bucket size a period should be charted at.
 *
 * A 730-day range bucketed by day is 730 unreadable columns; a three-day range
 * bucketed by month is one. The thresholds aim for roughly 7–60 buckets.
 */
export function suggestedGranularity(
  period: DateRange,
): "day" | "week" | "month" | "quarter" {
  const days = periodLengthInDays(period);

  if (days <= 0) return "day";
  if (days <= 62) return "day";
  if (days <= 186) return "week";
  if (days <= 1_100) return "month";
  return "quarter";
}

/**
 * A period, written out for a person, in the tenant's date format.
 *
 * Goes through `formatDate` rather than any local date rendering — the whole
 * point of BUG-2010's fix.
 */
export function formatPeriodLabel(
  period: DateRange,
  context?: ResolvedFormattingContext | null,
): string {
  const from = formatDate(period?.from, context ?? null);
  const to = formatDate(period?.to, context ?? null);

  if (!from || !to) return "";
  if (from === to) return from;

  return `${from} - ${to}`;
}
