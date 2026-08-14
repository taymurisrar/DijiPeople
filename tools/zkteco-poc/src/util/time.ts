/**
 * Wall-clock helpers.
 *
 * The ZKTeco SDK reports timestamps as separate local date/time parts with no
 * timezone information. The worker composes them into `YYYY-MM-DDTHH:mm:ss` and
 * this module keeps them in that form.
 *
 * So: never call `toISOString()` on a device timestamp — that would shift it by
 * the host's UTC offset and silently invent a timezone the device never stated.
 */

function pad(value: number, width = 2): string {
  return String(value).padStart(width, '0');
}

/** `YYYY-MM-DDTHH:mm:ss` from the *local* parts of a Date. No offset suffix. */
export function toLocalWallClock(date: Date): string {
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
  );
}

const LOCAL_TIMESTAMP = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})$/;

/**
 * Parses `YYYY-MM-DDTHH:mm:ss` as a *local* Date, so it can be compared against
 * this host's clock. Returns null for anything that is not exactly that shape —
 * `new Date(string)` is avoided because it would silently treat some inputs as UTC.
 */
export function parseLocalWallClock(value: string | undefined): Date | null {
  if (!value) return null;
  const match = LOCAL_TIMESTAMP.exec(value);
  if (!match) return null;

  const [, year, month, day, hour, minute, second] = match;
  const parsed = new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second),
  );
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

export function formatCount(value: number): string {
  return value.toLocaleString('en-US');
}

/** Signed drift in whole seconds between the device clock and this host. */
export function driftSeconds(deviceTime: Date, systemTime: Date): number {
  return Math.round((deviceTime.getTime() - systemTime.getTime()) / 1000);
}
