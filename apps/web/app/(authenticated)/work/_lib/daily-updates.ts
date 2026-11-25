/*
 * DP-MASTER WP-03.S4. The pure rules behind the daily update screens: the
 * sections and their order, how an update's lines are grouped and sent back (the
 * API replaces the whole list on every save), and the policy payload. No I/O; the
 * API is the authority on status, lateness and who may acknowledge.
 */

export const DAILY_UPDATE_SECTIONS = [
  "COMPLETED",
  "IN_PROGRESS",
  "NEXT",
  "BLOCKER",
  "UNPLANNED",
  "ACHIEVEMENT",
] as const;
export type DailyUpdateSection = (typeof DAILY_UPDATE_SECTIONS)[number];

export type DailyUpdateStatus = "DRAFT" | "SUBMITTED" | "ACKNOWLEDGED";

export type DailyUpdateItem = {
  id?: string;
  section: DailyUpdateSection;
  text: string;
  origin?: "DRAFTED" | "MANUAL";
  contributionEntryId?: string | null;
  workItemId?: string | null;
};

export type DailyUpdate = {
  id: string;
  employeeId?: string;
  forDate: string;
  status: DailyUpdateStatus;
  summary: string | null;
  late: boolean;
  submittedAt?: string | null;
  acknowledgedAt?: string | null;
  version: number;
  items: DailyUpdateItem[];
  employee?: { firstName: string; lastName: string };
};

export type DailyUpdatePage = { items: DailyUpdate[]; total: number };

export type DailyUpdatePolicy = {
  enabled: boolean;
  workingDays: number[];
  deadlineMinutes: number;
  timezone: string;
  requireAcknowledgement: boolean;
};

export type MissingUpdates = {
  date: string;
  due: boolean;
  people: { employeeId: string; name: string }[];
};

export const SECTION_LABELS: Record<DailyUpdateSection, string> = {
  COMPLETED: "Completed",
  IN_PROGRESS: "In progress",
  NEXT: "Next",
  BLOCKER: "Blockers",
  UNPLANNED: "Unplanned work",
  ACHIEVEMENT: "Achievements",
};

export const STATUS_LABELS: Record<DailyUpdateStatus, string> = {
  DRAFT: "Draft",
  SUBMITTED: "Submitted",
  ACKNOWLEDGED: "Acknowledged",
};

export function statusTone(
  status: DailyUpdateStatus,
): "muted" | "info" | "good" {
  return status === "ACKNOWLEDGED" ? "good" : status === "SUBMITTED" ? "info" : "muted";
}

/** A draft can be saved freely; a submitted or acknowledged one is a correction. */
export function isCorrection(status: DailyUpdateStatus): boolean {
  return status !== "DRAFT";
}

/** Lines per section, in section order, keeping each line's position. */
export function groupBySection(
  items: readonly DailyUpdateItem[],
): Record<DailyUpdateSection, DailyUpdateItem[]> {
  const grouped = Object.fromEntries(
    DAILY_UPDATE_SECTIONS.map((section) => [section, [] as DailyUpdateItem[]]),
  ) as Record<DailyUpdateSection, DailyUpdateItem[]>;
  for (const item of items) {
    if (grouped[item.section]) grouped[item.section].push(item);
  }
  return grouped;
}

/** A line the person's own records produced, so it is evidence-backed. */
export function isEvidenceBacked(item: DailyUpdateItem): boolean {
  return Boolean(item.contributionEntryId || item.workItemId);
}

/** Section groups flattened back into the one ordered list the API stores. */
export function flattenSections(
  grouped: Record<DailyUpdateSection, DailyUpdateItem[]>,
): DailyUpdateItem[] {
  return DAILY_UPDATE_SECTIONS.flatMap((section) => grouped[section]);
}

export const MAX_ITEM_LENGTH = 500;
export const MAX_SUMMARY_LENGTH = 2000;
export const MAX_ITEMS = 100;

export function validateUpdate(input: {
  summary: string;
  items: readonly DailyUpdateItem[];
}): string | null {
  if (input.summary.length > MAX_SUMMARY_LENGTH) {
    return `The summary can be at most ${MAX_SUMMARY_LENGTH} characters.`;
  }
  const lines = input.items.filter((item) => item.text.trim());
  if (lines.length > MAX_ITEMS) return `An update can have at most ${MAX_ITEMS} lines.`;
  if (lines.some((item) => item.text.trim().length > MAX_ITEM_LENGTH)) {
    return `A line can be at most ${MAX_ITEM_LENGTH} characters.`;
  }
  return null;
}

/**
 * The save body: blank lines are dropped, text is trimmed, and the evidence links
 * are kept so a drafted line stays backed by its record.
 */
export function buildSavePayload(input: {
  summary: string;
  items: readonly DailyUpdateItem[];
}): {
  summary?: string;
  items: {
    section: DailyUpdateSection;
    text: string;
    contributionEntryId?: string;
    workItemId?: string;
  }[];
} {
  const summary = input.summary.trim();
  return {
    ...(summary ? { summary } : {}),
    items: input.items
      .filter((item) => item.text.trim())
      .map((item) => ({
        section: item.section,
        text: item.text.trim(),
        ...(item.contributionEntryId
          ? { contributionEntryId: item.contributionEntryId }
          : {}),
        ...(item.workItemId ? { workItemId: item.workItemId } : {}),
      })),
  };
}

export function buildDraftPayload(date: string): { date?: string } {
  return date ? { date } : {};
}

/** YYYY-MM-DD for a date in the browser's zone. */
export function dateInputFor(date: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function buildUpdatesQuery(input: {
  from?: string;
  to?: string;
  status?: DailyUpdateStatus;
  employeeId?: string;
  take?: number;
}): string {
  const params = new URLSearchParams();
  if (input.from) params.set("from", input.from);
  if (input.to) params.set("to", input.to);
  if (input.status) params.set("status", input.status);
  if (input.employeeId) params.set("employeeId", input.employeeId);
  params.set("take", String(input.take ?? 100));
  return params.toString();
}

export function personName(update: DailyUpdate): string {
  return update.employee
    ? `${update.employee.firstName} ${update.employee.lastName}`.trim()
    : "Unknown";
}

/* ---------- policy ---------- */

export const WEEKDAY_LABELS: Record<number, string> = {
  1: "Monday",
  2: "Tuesday",
  3: "Wednesday",
  4: "Thursday",
  5: "Friday",
  6: "Saturday",
  7: "Sunday",
};

export function minutesToTime(minutes: number): string {
  const clamped = Math.min(1439, Math.max(0, Math.round(minutes)));
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(Math.floor(clamped / 60))}:${pad(clamped % 60)}`;
}

export function timeToMinutes(time: string): number | null {
  const match = /^(\d{2}):(\d{2})$/.exec(time);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

export function validatePolicy(input: {
  workingDays: readonly number[];
  deadlineTime: string;
  timezone: string;
}): string | null {
  if (input.workingDays.length === 0) return "Choose at least one working day.";
  if (timeToMinutes(input.deadlineTime) === null) return "Enter the deadline as a time.";
  if (!input.timezone.trim()) return "Enter the time zone the deadline is read in.";
  return null;
}

export function buildPolicyPayload(input: {
  enabled: boolean;
  workingDays: readonly number[];
  deadlineTime: string;
  timezone: string;
  requireAcknowledgement: boolean;
}): DailyUpdatePolicy {
  return {
    enabled: input.enabled,
    workingDays: [...new Set(input.workingDays)].sort((a, b) => a - b),
    deadlineMinutes: timeToMinutes(input.deadlineTime) ?? 0,
    timezone: input.timezone.trim(),
    requireAcknowledgement: input.requireAcknowledgement,
  };
}
