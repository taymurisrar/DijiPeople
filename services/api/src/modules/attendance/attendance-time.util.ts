import { WorkWeekday } from '@prisma/client';

/**
 * Timezone and shift-window arithmetic shared by the attendance module and the
 * reconciliation engine.
 *
 * EXTRACTED, NOT COPIED. These functions previously lived as module-private
 * helpers inside attendance.service.ts. The engine needs exactly the same
 * answers — which calendar day a punch belongs to, when an overnight shift's
 * window starts and ends — and two implementations of that would drift silently
 * until one of them put a night-shift punch on the wrong day.
 *
 * NO FIXED OFFSETS ANYWHERE. Everything goes through Intl with a named
 * timezone, so a tenant in a zone that observes DST gets a 23- or 25-hour day on
 * the transition and the shift window lands where the wall clock says it does.
 */

/**
 * Builds the UTC instant for a wall-clock time on a business date, in a zone.
 *
 * Converges by measuring what the candidate instant actually reads as in the
 * target zone and correcting. Two iterations are enough for every real zone
 * including DST transitions, where the first correction can itself land inside
 * the shifted hour.
 */
export function combineDateAndTimeInTimezone(
  businessDate: Date,
  time: string,
  timezone: string,
): Date {
  const [year, month, day] = businessDate
    .toISOString()
    .slice(0, 10)
    .split('-')
    .map(Number);
  const [hours, minutes] = time.split(':').map(Number);
  const intendedUtc = Date.UTC(year, month - 1, day, hours, minutes);
  let candidate = new Date(intendedUtc);

  for (let iteration = 0; iteration < 2; iteration += 1) {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(candidate);
    const read = (type: Intl.DateTimeFormatPartTypes) =>
      Number(parts.find((part) => part.type === type)?.value);
    const representedUtc = Date.UTC(
      read('year'),
      read('month') - 1,
      read('day'),
      read('hour'),
      read('minute'),
    );
    candidate = new Date(candidate.getTime() + intendedUtc - representedUtc);
  }

  return candidate;
}

/**
 * The UTC window a shift occupies on a given business date.
 *
 * An end at or before the start means the shift runs past midnight, so the end
 * moves to the following day: 21:00 -> 06:00 is one nine-hour window, not a
 * negative fifteen-hour one.
 */
export function resolveShiftWindow(
  businessDate: Date,
  shift: { startTime: string; endTime: string },
  timezone: string,
): { startAt: Date; endAt: Date } {
  const startAt = combineDateAndTimeInTimezone(
    businessDate,
    shift.startTime,
    timezone,
  );
  let endAt = combineDateAndTimeInTimezone(
    businessDate,
    shift.endTime,
    timezone,
  );

  if (endAt <= startAt) {
    endAt = addUtcDays(endAt, 1);
  }

  return { startAt, endAt };
}

/**
 * Whether an instant still belongs to the previous business date's night shift.
 *
 * The twelve-hour tail past the scheduled end is what lets a 06:03 checkout
 * close a shift that started at 20:55 the evening before, and it also absorbs
 * ordinary overrun. It is bounded rather than open-ended so that a punch at
 * 20:55 the NEXT evening starts a new day rather than reopening yesterday's.
 */
export function isWithinOvernightShiftCarryover(
  value: Date,
  businessDate: Date,
  shift: { startTime: string; endTime: string; isNightShift?: boolean },
  timezone: string,
): boolean {
  if (!isOvernightShift(shift)) return false;

  const { startAt, endAt } = resolveShiftWindow(businessDate, shift, timezone);
  const carryoverEnd = new Date(endAt.getTime() + 12 * 60 * 60 * 1000);

  return value >= startAt && value <= carryoverEnd;
}

/**
 * Whether a shift crosses midnight.
 *
 * The explicit `isNightShift` flag wins when set; otherwise an end time at or
 * before the start time is the only evidence available and means the same thing.
 */
export function isOvernightShift(shift: {
  startTime: string;
  endTime: string;
  isNightShift?: boolean;
}): boolean {
  if (shift.isNightShift) return true;

  return minutesFromTime(shift.endTime) <= minutesFromTime(shift.startTime);
}

export function minutesFromTime(value: string): number {
  const [hours, minutes] = value.split(':').map(Number);
  return hours * 60 + minutes;
}

export function addUtcDays(value: Date, days: number): Date {
  const next = new Date(value);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

export function differenceInMinutes(later: Date, earlier: Date): number {
  return Math.round((later.getTime() - earlier.getTime()) / 60_000);
}

/**
 * The business date an instant falls on, as UTC midnight.
 *
 * The zone decides the date, not the server: 23:30 in Doha and 20:30 UTC are the
 * same instant on different calendar days, and attendance belongs to the day the
 * employee experienced.
 */
export function businessDateAtUtcMidnight(value: Date, timezone: string): Date {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(value);
  const year = Number(parts.find((part) => part.type === 'year')?.value);
  const month = Number(parts.find((part) => part.type === 'month')?.value);
  const day = Number(parts.find((part) => part.type === 'day')?.value);

  return new Date(Date.UTC(year, month - 1, day));
}

export function formatBusinessDateKey(value: Date): string {
  return value.toISOString().slice(0, 10);
}

/**
 * The weekday of a business date.
 *
 * Reads the UTC day deliberately: business dates are stored as UTC midnight, so
 * using the local getter would return the previous weekday for any server west
 * of Greenwich.
 */
export function toWeekday(date: Date): WorkWeekday {
  const days: WorkWeekday[] = [
    WorkWeekday.SUNDAY,
    WorkWeekday.MONDAY,
    WorkWeekday.TUESDAY,
    WorkWeekday.WEDNESDAY,
    WorkWeekday.THURSDAY,
    WorkWeekday.FRIDAY,
    WorkWeekday.SATURDAY,
  ];

  return days[date.getUTCDay()];
}
