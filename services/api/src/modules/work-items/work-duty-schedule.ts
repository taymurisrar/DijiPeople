/*
 * DP-MASTER WP-36.S1. The pure date rules of a duty: which calendar days a template
 * recurs on, and the instant a local clock time is in the template's own zone. No
 * I/O, so every rule is unit-tested directly.
 *
 * A duty is read in the template's IANA zone. A calendar date (YYYY-MM-DD) has the
 * same weekday everywhere, but the instant "08:00 on that date" does not, and the
 * local date of an instant differs from its UTC date for part of every day. Both
 * are therefore computed through Intl, never with `getDay()` on a local-time Date.
 */

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isValidTimezone(zone: unknown): zone is string {
  if (typeof zone !== 'string' || zone.trim() === '' || zone.length > 64) {
    return false;
  }
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

/** True for a real calendar date written YYYY-MM-DD ("2026-02-30" is not one). */
export function isValidDateOnly(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const match = DATE_ONLY.exec(value);
  if (!match) return false;
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const at = new Date(Date.UTC(y, m - 1, d));
  return (
    at.getUTCFullYear() === y &&
    at.getUTCMonth() === m - 1 &&
    at.getUTCDate() === d
  );
}

/** The calendar date as a UTC-midnight Date, which is how a `@db.Date` column is written. */
export function dateOnlyToDate(value: string): Date {
  if (!isValidDateOnly(value)) {
    throw new RangeError(`Not a calendar date: ${String(value)}`);
  }
  return new Date(`${value}T00:00:00.000Z`);
}

/** ISO weekday of a calendar date: 1 = Monday ... 7 = Sunday. */
export function isoWeekdayOfDate(value: string): number {
  const day = dateOnlyToDate(value).getUTCDay();
  return day === 0 ? 7 : day;
}

function zoneParts(instantMs: number, zone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(instantMs));
  const out: Record<string, number> = {};
  for (const part of parts) {
    if (part.type !== 'literal') out[part.type] = Number(part.value);
  }
  return out;
}

/** The local calendar date (YYYY-MM-DD) an instant falls on in a zone. */
export function localDateInZone(instant: Date, zone: string): string {
  if (!isValidTimezone(zone))
    throw new RangeError(`Unknown timezone: ${String(zone)}`);
  const p = zoneParts(instant.getTime(), zone);
  return `${String(p.year).padStart(4, '0')}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

/** ISO weekday (1..7) an instant falls on in a zone, which is not its UTC weekday for part of every day. */
export function weekdayInZone(instant: Date, zone: string): number {
  return isoWeekdayOfDate(localDateInZone(instant, zone));
}

function offsetMinutes(instantMs: number, zone: string): number {
  const p = zoneParts(instantMs, zone);
  const asUtc = Date.UTC(
    p.year,
    p.month - 1,
    p.day,
    p.hour,
    p.minute,
    p.second,
  );
  return Math.round((asUtc - Math.floor(instantMs / 1000) * 1000) / 60_000);
}

/**
 * The instant that is `minutes` after local midnight on `date` in `zone`. The offset
 * is looked up twice so a date on which the zone changes its offset still lands on
 * the right wall-clock time.
 */
export function zonedInstant(
  date: string,
  minutes: number,
  zone: string,
): Date {
  if (!isValidTimezone(zone))
    throw new RangeError(`Unknown timezone: ${String(zone)}`);
  if (!Number.isInteger(minutes) || minutes < 0 || minutes > 1439) {
    throw new RangeError(`Minutes must be 0..1439, got ${String(minutes)}`);
  }
  const base = dateOnlyToDate(date).getTime() + minutes * 60_000;
  let guess = base - offsetMinutes(base, zone) * 60_000;
  guess = base - offsetMinutes(guess, zone) * 60_000;
  return new Date(guess);
}

/** Does a template recur on this local calendar date? */
export function recursOn(weekdays: readonly number[], date: string): boolean {
  return weekdays.includes(isoWeekdayOfDate(date));
}

/** Weekdays must be a non-empty set of distinct integers 1..7. */
export function validateWeekdays(weekdays: unknown): weekdays is number[] {
  return (
    Array.isArray(weekdays) &&
    weekdays.length > 0 &&
    weekdays.length <= 7 &&
    weekdays.every((d) => Number.isInteger(d) && d >= 1 && d <= 7) &&
    new Set(weekdays).size === weekdays.length
  );
}

export function validateMinutes(value: unknown): value is number {
  return (
    Number.isInteger(value) &&
    (value as number) >= 0 &&
    (value as number) <= 1439
  );
}
