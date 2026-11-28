/*
 * DP-MASTER WP-06.S3 / WP-15 groundwork. Net working days for one person in a
 * period: the Monday-to-Friday days, minus the days they are on approved leave,
 * minus public holidays, each day removed ONCE however many reasons apply (a
 * holiday that falls inside a leave request is one day off, not two).
 *
 * Pure and date-only: every day is a UTC calendar date (YYYY-MM-DD), so the rule
 * is testable without a database or a time zone. It deliberately does not model
 * shifts, part-time contracts or half days: those come with WP-09 schedules, and
 * the response names the basis so nobody mistakes this for a roster.
 */

const DAY = 86_400_000;

export function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Every Monday-to-Friday date in [from, to), as YYYY-MM-DD. */
export function weekdaysBetween(from: Date, to: Date): string[] {
  const days: string[] = [];
  const start = Date.UTC(
    from.getUTCFullYear(),
    from.getUTCMonth(),
    from.getUTCDate(),
  );
  for (let t = start; t < to.getTime(); t += DAY) {
    const weekday = new Date(t).getUTCDay();
    if (weekday !== 0 && weekday !== 6) days.push(dayKey(new Date(t)));
  }
  return days;
}

export type NetDays = {
  /** Weekdays in the period. */
  standardDays: number;
  /** Weekdays removed by approved leave. */
  leaveDays: number;
  /** Weekdays removed by a holiday that leave did not already remove. */
  holidayDays: number;
  /** What remains to be worked. */
  netDays: number;
};

export function netWorkingDays(input: {
  from: Date;
  to: Date;
  /** Approved leave as inclusive date ranges. */
  leave: Array<{ startDate: Date; endDate: Date }>;
  /** Holiday dates. */
  holidays: Date[];
}): NetDays {
  const weekdays = weekdaysBetween(input.from, input.to);
  const inPeriod = new Set(weekdays);

  const leaveSet = new Set<string>();
  for (const range of input.leave) {
    const start = Date.UTC(
      range.startDate.getUTCFullYear(),
      range.startDate.getUTCMonth(),
      range.startDate.getUTCDate(),
    );
    const end = Date.UTC(
      range.endDate.getUTCFullYear(),
      range.endDate.getUTCMonth(),
      range.endDate.getUTCDate(),
    );
    for (let t = start; t <= end; t += DAY) {
      const key = dayKey(new Date(t));
      if (inPeriod.has(key)) leaveSet.add(key);
    }
  }
  const holidaySet = new Set<string>();
  for (const holiday of input.holidays) {
    const key = dayKey(holiday);
    // A holiday inside a leave request is already a day off.
    if (inPeriod.has(key) && !leaveSet.has(key)) holidaySet.add(key);
  }
  const netDays = weekdays.length - leaveSet.size - holidaySet.size;
  return {
    standardDays: weekdays.length,
    leaveDays: leaveSet.size,
    holidayDays: holidaySet.size,
    netDays: Math.max(0, netDays),
  };
}
