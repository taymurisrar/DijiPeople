/**
 * When a schedule fires next.
 *
 * Pure, dependency-free and timezone-explicit, so it can be unit-tested to
 * death and reused by the backfill script without loading the Nest container.
 *
 * THE WHOLE POINT IS THAT A WALL CLOCK IS NOT AN OFFSET. A schedule says
 * "09:00 in Europe/London", and the UTC instant that means is 08:00Z in winter
 * and 09:00Z... no, 08:00Z in summer — which is exactly why nobody should be
 * doing this arithmetic in their head. Adding a fixed offset to a UTC midnight
 * is wrong for half the year in every zone that observes DST, and a report that
 * is an hour early for six months is the kind of defect nobody files and
 * everybody stops trusting the product over. So every instant here is resolved
 * by asking `Intl` what the zone actually says, through the same
 * `civilStartInstant` probe the period engine uses.
 */

import {
  addDays,
  civilDate,
  civilStartInstant,
  formatCivilDate,
  parseCivilDate,
} from '../engine/period.engine';

/**
 * Mirrors `ReportScheduleFrequency` from the Prisma client as a literal union.
 *
 * Declared rather than imported so this module stays free of `@prisma/client`:
 * the value is structurally identical, and a script that only wants the date
 * maths should not have to load a generated database client to get it.
 */
export type ScheduleFrequency = 'DAILY' | 'WEEKLY' | 'MONTHLY';

export interface NextRunInput {
  frequency: ScheduleFrequency;
  /** 0-23, in `timezone`. */
  hour: number;
  /** 0-59, in `timezone`. */
  minute: number;
  /** 0 (Sunday) - 6 (Saturday). Required for WEEKLY, ignored otherwise. */
  dayOfWeek?: number | null;
  /** 1-31. Required for MONTHLY, ignored otherwise. See the clamping rule. */
  dayOfMonth?: number | null;
  /** IANA zone. The wall-clock time above is read in this zone. */
  timezone: string;
  /** The result is always strictly after this instant. */
  after: Date;
}

/** How far ahead the search may look before giving up, per frequency. */
const MAX_DAY_PROBES = 3;
const MAX_WEEK_PROBES = 9;
const MAX_MONTH_PROBES = 14;

/**
 * Is `value` a zone this runtime knows?
 *
 * `Intl.supportedValuesOf('timeZone')` exists on Node 22 but is a large array
 * to scan and does not include every alias the ICU database accepts
 * (`Asia/Calcutta`, `US/Eastern`). Constructing a formatter is the check the
 * runtime itself applies, so it accepts exactly what `civilStartInstant` will
 * later accept — which is the property that matters.
 *
 * OFFSET STRINGS ARE REJECTED even though the runtime accepts them. Node 22
 * takes `+03:00` as a valid fixed-offset zone, and a schedule stored that way
 * looks correct and quietly stops following DST: it drifts an hour twice a year
 * with nothing in the record saying why. A schedule names a place, not an
 * offset.
 */
export function isSupportedTimeZone(value: unknown): value is string {
  if (typeof value !== 'string' || value.trim() === '') return false;
  if (/^[+-]/.test(value.trim())) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

/**
 * The next instant at which a schedule fires, strictly after `input.after`.
 *
 * Strictly after, never at: a worker that claims a due schedule and recomputes
 * `nextRunAt` from `now` must move the schedule forward. If the same slot could
 * come back, a run that finishes inside its own minute re-fires immediately and
 * the recipients get the same report until the clock ticks over.
 */
export function computeNextRun(input: NextRunInput): Date {
  assertValid(input);

  const { timezone, after } = input;
  const todayCivil = civilDate(after, timezone);

  for (const civil of candidateDates(input, todayCivil)) {
    const instant = instantForWallClock(
      civil,
      input.hour,
      input.minute,
      timezone,
    );
    if (instant.getTime() > after.getTime()) return instant;
  }

  // Unreachable for validated input: the probe windows above are wider than the
  // largest gap any of the three frequencies can produce. Throwing rather than
  // returning a fabricated date, because a silently wrong next-run time is a
  // schedule that fires at the wrong hour forever.
  throw new Error(
    `No next run could be resolved for a ${input.frequency} schedule in ${timezone}.`,
  );
}

/** The civil dates to try, in order, for this frequency. */
function* candidateDates(
  input: NextRunInput,
  todayCivil: string,
): Generator<string> {
  switch (input.frequency) {
    case 'DAILY': {
      for (let offset = 0; offset < MAX_DAY_PROBES; offset += 1) {
        yield addDays(todayCivil, offset);
      }
      return;
    }

    case 'WEEKLY': {
      const target = input.dayOfWeek as number;
      for (let offset = 0; offset < MAX_WEEK_PROBES; offset += 1) {
        const civil = addDays(todayCivil, offset);
        // parseCivilDate yields a UTC-midnight Date, so getUTCDay is the civil
        // weekday of that calendar date and carries no zone of its own.
        if (parseCivilDate(civil).getUTCDay() === target) yield civil;
      }
      return;
    }

    case 'MONTHLY': {
      const requested = input.dayOfMonth as number;
      const anchor = parseCivilDate(todayCivil);
      for (let offset = 0; offset < MAX_MONTH_PROBES; offset += 1) {
        const year = anchor.getUTCFullYear();
        const month = anchor.getUTCMonth() + offset;
        yield clampedDayOfMonth(year, month, requested);
      }
      return;
    }

    default: {
      const exhaustive: never = input.frequency;
      throw new Error(`Unsupported frequency: ${String(exhaustive)}`);
    }
  }
}

/**
 * THE MONTH-END RULE: `dayOfMonth` is clamped to the last day of the month, and
 * a month is never skipped.
 *
 * A schedule set to the 31st runs on 30 April, on 28 February and on 29
 * February in a leap year. The alternative — skip any month that has no such
 * day — means a "monthly" headcount report silently misses February, and the
 * gap is invisible in the schedule screen because the configuration still says
 * 31. Arriving a day early is a thing a reader notices and understands; a
 * missing month is a thing they discover in an audit.
 */
function clampedDayOfMonth(
  year: number,
  monthIndex: number,
  requestedDay: number,
): string {
  // Day 0 of the following month is the last day of this one, and Date.UTC
  // normalises a month index outside 0-11 into the right year for us.
  const lastDay = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  const day = Math.min(requestedDay, lastDay);
  return formatCivilDate(new Date(Date.UTC(year, monthIndex, day)));
}

/**
 * The UTC instant at which `hour:minute` occurs on `civil` in `timeZone`.
 *
 * `civilStartInstant` pins local midnight exactly. Adding the wall-clock offset
 * to it is right on every ordinary day and wrong on the two days a year the
 * offset changes between midnight and the target time, so the candidate is read
 * back through `Intl` and corrected. Two corrections settle every real zone.
 *
 * SPRING-FORWARD GAP. When the wall time does not exist — 02:30 on the morning
 * the clocks jump from 02:00 to 03:00 — no correction can converge, and the
 * readback oscillates between 01:30 and 03:30. The rule is to keep the elapsed
 * time from local midnight, which lands the run at 03:30: the first moment at
 * or after the slot the operator asked for. The other convention (fall back an
 * hour) fires *before* the requested time, which for a report covering
 * "yesterday" can mean covering the wrong day.
 *
 * FALL-BACK AMBIGUITY. When the wall time happens twice, the first occurrence
 * wins — it is the one the first correction finds — so the report arrives at
 * the earlier of the two 01:30s and does not run twice, because the claim in
 * the worker advances `nextRunAt` past both.
 */
function instantForWallClock(
  civil: string,
  hour: number,
  minute: number,
  timeZone: string,
): Date {
  const targetMinutes = hour * 60 + minute;
  const fromLocalMidnight = new Date(
    civilStartInstant(civil, timeZone).getTime() + targetMinutes * 60_000,
  );

  let candidate = fromLocalMidnight;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const actual = wallClockAt(candidate, timeZone);
    if (actual.civil === civil && actual.minutes === targetMinutes) {
      return candidate;
    }

    const dayDriftMinutes =
      (parseCivilDate(actual.civil).getTime() -
        parseCivilDate(civil).getTime()) /
      60_000;
    const driftMinutes = dayDriftMinutes + (actual.minutes - targetMinutes);
    candidate = new Date(candidate.getTime() - driftMinutes * 60_000);
  }

  return fromLocalMidnight;
}

/** What a zone's clock reads at `instant`, as a civil date and minutes past midnight. */
function wallClockAt(
  instant: Date,
  timeZone: string,
): { civil: string; minutes: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(instant);

  const read = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? '0';

  // hourCycle h23 is requested via hour12:false, but some ICU builds still emit
  // "24" for midnight; the modulo makes both readings agree.
  const hour = Number(read('hour')) % 24;

  return {
    civil: `${read('year')}-${read('month')}-${read('day')}`,
    minutes: hour * 60 + Number(read('minute')),
  };
}

function assertValid(input: NextRunInput): void {
  if (!isSupportedTimeZone(input.timezone)) {
    throw new Error(`Unknown timezone: ${String(input.timezone)}`);
  }
  if (!(input.after instanceof Date) || Number.isNaN(input.after.getTime())) {
    throw new Error('A valid "after" instant is required.');
  }
  if (!isWholeNumberInRange(input.hour, 0, 23)) {
    throw new Error(`Hour must be 0-23, received ${String(input.hour)}.`);
  }
  if (!isWholeNumberInRange(input.minute, 0, 59)) {
    throw new Error(`Minute must be 0-59, received ${String(input.minute)}.`);
  }
  if (
    input.frequency === 'WEEKLY' &&
    !isWholeNumberInRange(input.dayOfWeek, 0, 6)
  ) {
    throw new Error(
      `A weekly schedule needs dayOfWeek 0-6, received ${String(input.dayOfWeek)}.`,
    );
  }
  if (
    input.frequency === 'MONTHLY' &&
    !isWholeNumberInRange(input.dayOfMonth, 1, 31)
  ) {
    throw new Error(
      `A monthly schedule needs dayOfMonth 1-31, received ${String(input.dayOfMonth)}.`,
    );
  }
  if (!['DAILY', 'WEEKLY', 'MONTHLY'].includes(input.frequency)) {
    throw new Error(`Unsupported frequency: ${String(input.frequency)}.`);
  }
}

function isWholeNumberInRange(
  value: unknown,
  minimum: number,
  maximum: number,
): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= minimum &&
    value <= maximum
  );
}
