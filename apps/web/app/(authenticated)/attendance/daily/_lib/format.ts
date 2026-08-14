/**
 * How a reconciled day is worded for a reader.
 *
 * Separate from the components so it can be asserted directly. Two things here
 * are requirements rather than presentation:
 *
 *  - No enum name reaches a reader. `LOCKED_PERIOD_EVENT` and `OFF_DAY` mean
 *    something to this codebase and nothing to a manager.
 *  - A day whose reconciliation is outstanding must not be worded as a result.
 *    `dayStatusLabel` is never called for those; `PENDING` maps to "Processing"
 *    as a backstop in case it ever is.
 */

export type StatusTone = "good" | "warning" | "danger" | "muted" | "neutral";

const DAY_STATUS_LABELS: Record<string, string> = {
  PRESENT: "Present",
  PARTIAL: "Partly worked",
  ABSENT: "Absent",
  ON_LEAVE: "On leave",
  HOLIDAY: "Holiday",
  WEEKEND: "Non-working day",
  OFF_DAY: "Off day",
  NEEDS_REVIEW: "Needs review",
  PENDING: "Processing",
};

const DAY_STATUS_TONES: Record<string, StatusTone> = {
  PRESENT: "good",
  PARTIAL: "warning",
  NEEDS_REVIEW: "warning",
  ABSENT: "danger",
  PENDING: "muted",
  ON_LEAVE: "neutral",
  HOLIDAY: "neutral",
  WEEKEND: "neutral",
  OFF_DAY: "neutral",
};

const WORK_MODE_LABELS: Record<string, string> = {
  OFFICE: "Office",
  REMOTE: "Remote",
  FIELD: "Field",
  HYBRID: "Hybrid",
};

export function dayStatusLabel(status: string): string {
  // An unknown status from a newer API is described honestly rather than
  // printed raw or guessed at.
  return DAY_STATUS_LABELS[status] ?? "Processing";
}

export function dayStatusTone(status: string): StatusTone {
  return DAY_STATUS_TONES[status] ?? "muted";
}

/**
 * HYBRID appears here because it is a legitimate derived RESULT of a day. It is
 * deliberately absent from the modes an employee may request.
 */
export function workModeLabel(mode: string | null): string {
  if (!mode) return "—";
  return WORK_MODE_LABELS[mode] ?? "—";
}

export function formatDuration(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes <= 0) return "0m";
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest}m`;
  if (rest === 0) return `${hours}h`;
  return `${hours}h ${rest}m`;
}

/** Zero reads better as a dash than as "0m" in a grid of thirteen columns. */
export function formatMinutesOrDash(minutes: number): string {
  return minutes > 0 ? formatDuration(minutes) : "—";
}

/**
 * The worked total, or a dash while reconciliation is outstanding.
 *
 * This is the whole point of the `reconciliationPending` flag: an unreconciled
 * day may hold minutes from a previous run, and showing them beside "Processing"
 * would present a superseded number as the answer.
 */
export function formatWorkedMinutes(
  minutes: number,
  reconciliationPending: boolean,
): string {
  return reconciliationPending ? "—" : formatDuration(minutes);
}

export function formatClockTime(value: string | null): string {
  if (!value) return "—";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? "—"
    : parsed.toLocaleTimeString(undefined, {
        hour: "2-digit",
        minute: "2-digit",
      });
}

export function formatDayDate(dateKey: string): string {
  const parsed = new Date(`${dateKey}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime())
    ? dateKey
    : parsed.toLocaleDateString(undefined, {
        day: "2-digit",
        month: "short",
        timeZone: "UTC",
        weekday: "short",
      });
}

/** YYYY-MM-DD, `days` from `dateKey`. Used for the default fortnight window. */
export function shiftDateKey(dateKey: string, days: number): string {
  const parsed = new Date(`${dateKey}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return dateKey;
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}
