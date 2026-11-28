/*
 * DP-MASTER WP-36.S3. The pure rules behind the Duties screen: how a template
 * is turned into the exact body the API accepts (an unknown field is a 400),
 * how a checklist reads, and how a page of results is described. No I/O, so
 * each rule is unit-tested directly. The API stays the authority on every move
 * (who may complete a duty, which checks are required, who may acknowledge).
 */
import type { Tone } from "./blockers";

export const DUTY_PAGE_SIZE = 10;

export const WEEKDAYS = [
  { value: 1, short: "Mon", long: "Monday" },
  { value: 2, short: "Tue", long: "Tuesday" },
  { value: 3, short: "Wed", long: "Wednesday" },
  { value: 4, short: "Thu", long: "Thursday" },
  { value: 5, short: "Fri", long: "Friday" },
  { value: 6, short: "Sat", long: "Saturday" },
  { value: 7, short: "Sun", long: "Sunday" },
] as const;

export type Page<T> = { items: T[]; total: number };

export type DutyChecklistItem = {
  id: string;
  position: number;
  label: string;
  required: boolean;
};

export type DutyTemplate = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  weekdays: number[];
  timezone: string;
  startMinutes: number | null;
  dueMinutes: number | null;
  assigneeEmployeeId: string | null;
  teamId: string | null;
  isActive: boolean;
  checklist: DutyChecklistItem[];
};

export type DutyCheck = {
  id: string;
  position: number;
  label: string;
  required: boolean;
  completedAt: string | null;
  completedById: string | null;
  note: string | null;
};

export type DutyOccurrence = {
  id: string;
  dutyTemplateId: string;
  forDate: string;
  workItemId: string;
  templateKey: string;
  templateName: string;
  status: string | null;
  ownerEmployeeId: string | null;
  dueAt: string | null;
  archivedAt: string | null;
  requiredIncomplete: number;
  checks: DutyCheck[];
};

export type DutyHandover = {
  id: string;
  occurrenceId: string | null;
  fromEmployeeId: string;
  fromName: string | null;
  toEmployeeId: string | null;
  toName: string | null;
  teamId: string | null;
  note: string;
  status: "OPEN" | "ACKNOWLEDGED";
  acknowledgedAt: string | null;
  createdAt: string;
};

export type GenerateResult = {
  created: unknown[];
  existing: unknown[];
  skipped: Array<{ templateId: string; key: string; reason: string }>;
};

export type TeamOption = { id: string; name: string };

export type Built<T> = { ok: true; body: T } | { ok: false; message: string };

/* ----------------------------------------------------------------- time */

/** "08:30" for 510 minutes after midnight; "" for none. */
export function minutesToTime(minutes: number | null | undefined): string {
  if (minutes === null || minutes === undefined) return "";
  if (!Number.isInteger(minutes) || minutes < 0 || minutes > 1439) return "";
  const h = String(Math.floor(minutes / 60)).padStart(2, "0");
  const m = String(minutes % 60).padStart(2, "0");
  return `${h}:${m}`;
}

/** Minutes after midnight for "HH:MM"; null for blank or out of range. */
export function timeToMinutes(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (h > 23 || m > 59) return null;
  return h * 60 + m;
}

/** "Every day", "Mon to Fri" or "Mon, Wed, Sat". */
export function formatWeekdays(weekdays: readonly number[]): string {
  const days = [...new Set(weekdays)]
    .filter((d) => d >= 1 && d <= 7)
    .sort((a, b) => a - b);
  if (days.length === 0) return "No days";
  if (days.length === 7) return "Every day";
  const label = (d: number) => WEEKDAYS[d - 1].short;
  const consecutive = days.every((d, i) => i === 0 || d === days[i - 1] + 1);
  if (days.length >= 3 && consecutive) {
    return `${label(days[0])} to ${label(days[days.length - 1])}`;
  }
  return days.map(label).join(", ");
}

export function toggleWeekday(
  weekdays: readonly number[],
  day: number,
): number[] {
  return weekdays.includes(day)
    ? weekdays.filter((d) => d !== day)
    : [...weekdays, day].sort((a, b) => a - b);
}

export function isValidTimezone(zone: string): boolean {
  if (!zone.trim() || zone.length > 64) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

const COMMON_TIMEZONES = [
  "UTC",
  "Pacific/Auckland",
  "Australia/Sydney",
  "Asia/Tokyo",
  "Asia/Singapore",
  "Asia/Dhaka",
  "Asia/Karachi",
  "Asia/Dubai",
  "Asia/Riyadh",
  "Asia/Qatar",
  "Africa/Cairo",
  "Africa/Johannesburg",
  "Europe/Istanbul",
  "Europe/Moscow",
  "Europe/Berlin",
  "Europe/London",
  "America/Sao_Paulo",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
];

/** A short list of zones, plus the one already in use so it is never lost. */
export function timezoneOptions(
  current?: string,
): { value: string; label: string }[] {
  const zones =
    current && !COMMON_TIMEZONES.includes(current)
      ? [current, ...COMMON_TIMEZONES]
      : COMMON_TIMEZONES;
  return zones.map((zone) => ({ value: zone, label: zone }));
}

/* -------------------------------------------------------------- queries */

function pageParams(skip: number, take = DUTY_PAGE_SIZE) {
  const params = new URLSearchParams();
  params.set("take", String(take));
  params.set("skip", String(Math.max(0, skip)));
  return params;
}

export function buildOccurrencesQuery(input: {
  date?: string;
  templateId?: string;
  skip?: number;
}): string {
  const params = pageParams(input.skip ?? 0);
  if (input.date) params.set("date", input.date);
  if (input.templateId) params.set("templateId", input.templateId);
  return params.toString();
}

export function buildTemplatesQuery(input: {
  active?: boolean | null;
  skip?: number;
}): string {
  const params = pageParams(input.skip ?? 0);
  if (input.active === true) params.set("active", "true");
  if (input.active === false) params.set("active", "false");
  return params.toString();
}

/** A lookup's search over every template of the tenant: the API matches name or key, 20 at a time. */
export function buildTemplateSearchQuery(search: string): string {
  const params = pageParams(0, 20);
  const text = search.trim().slice(0, 100);
  if (text) params.set("search", text);
  return params.toString();
}

/** The template filter's options: the search results plus the template already chosen. */
export function mergeTemplateOptions(
  found: readonly { id: string; name: string; key?: string }[],
  selected?: { id: string; name: string; key?: string } | null,
): { id: string; name: string; key: string | null }[] {
  const rows = selected && !found.some((t) => t.id === selected.id)
    ? [selected, ...found]
    : [...found];
  return rows.map((t) => ({ id: t.id, name: t.name, key: t.key ?? null }));
}

export function buildHandoversQuery(input: {
  status: "OPEN" | "ACKNOWLEDGED";
  skip?: number;
}): string {
  const params = pageParams(input.skip ?? 0);
  params.set("status", input.status);
  return params.toString();
}

/** "1 to 10 of 25", and whether there is a page either side of this one. */
export function describePage(
  skip: number,
  shown: number,
  total: number,
  take = DUTY_PAGE_SIZE,
) {
  if (total === 0 || shown === 0) {
    return { label: "0 of 0", hasPrev: false, hasNext: false };
  }
  return {
    label: `${skip + 1} to ${skip + shown} of ${total}`,
    hasPrev: skip > 0,
    hasNext: skip + take < total,
  };
}

/** The date inputs hold YYYY-MM-DD; this is today in the browser's own zone. */
export function todayInputValue(now: Date = new Date()): string {
  const y = String(now.getFullYear()).padStart(4, "0");
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function isDateInput(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const at = new Date(
    Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])),
  );
  return (
    at.getUTCFullYear() === Number(match[1]) &&
    at.getUTCMonth() === Number(match[2]) - 1 &&
    at.getUTCDate() === Number(match[3])
  );
}

/* ------------------------------------------------------------ checklist */

export function checklistProgress(checks: readonly DutyCheck[]) {
  const done = checks.filter((c) => c.completedAt).length;
  const requiredOpen = checks.filter((c) => c.required && !c.completedAt)
    .length;
  return { done, total: checks.length, requiredOpen };
}

export function isOccurrenceClosed(occurrence: {
  status: string | null;
  archivedAt: string | null;
}): boolean {
  return (
    occurrence.archivedAt !== null ||
    occurrence.status === "DONE" ||
    occurrence.status === "CANCELLED"
  );
}

export function occurrenceTone(status: string | null): Tone {
  switch (status) {
    case "DONE":
      return "good";
    case "CANCELLED":
      return "muted";
    case "BLOCKED":
      return "danger";
    case "IN_PROGRESS":
    case "IN_REVIEW":
      return "info";
    default:
      return "neutral";
  }
}

export function statusLabel(status: string | null): string {
  if (!status) return "Unknown";
  const text = status.toLowerCase().replace(/_/g, " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** What a generate run did, in one line. */
export function describeGenerate(result: GenerateResult): string {
  const parts = [`Created ${result.created.length}`];
  parts.push(`already existing ${result.existing.length}`);
  if (result.skipped.length) parts.push(`skipped ${result.skipped.length}`);
  return parts.join(", ");
}

/* ------------------------------------------------------ template drafts */

export type ChecklistDraft = { label: string; required: boolean };

export type TemplateDraft = {
  key: string;
  name: string;
  description: string;
  weekdays: number[];
  timezone: string;
  startTime: string;
  dueTime: string;
  assigneeEmployeeId: string;
  teamId: string;
  checklist: ChecklistDraft[];
};

export function emptyTemplateDraft(timezone = "UTC"): TemplateDraft {
  return {
    key: "",
    name: "",
    description: "",
    weekdays: [1, 2, 3, 4, 5],
    timezone,
    startTime: "",
    dueTime: "",
    assigneeEmployeeId: "",
    teamId: "",
    checklist: [],
  };
}

export function draftFromTemplate(template: DutyTemplate): TemplateDraft {
  return {
    key: template.key,
    name: template.name,
    description: template.description ?? "",
    weekdays: [...template.weekdays].sort((a, b) => a - b),
    timezone: template.timezone,
    startTime: minutesToTime(template.startMinutes),
    dueTime: minutesToTime(template.dueMinutes),
    assigneeEmployeeId: template.assigneeEmployeeId ?? "",
    teamId: template.teamId ?? "",
    checklist: template.checklist.map((c) => ({
      label: c.label,
      required: c.required,
    })),
  };
}

/** Mirrors the key pattern in the API's `dto/work-duty.dto.ts`. */
export const TEMPLATE_KEY_PATTERN = /^[a-z0-9][a-z0-9._-]{1,62}$/;

/** A suggested key from a name: lowercase, dashes, never empty-looking. */
export function templateKeyFromName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 63);
}

type TemplateBody = {
  key?: string;
  name: string;
  description?: string | null;
  weekdays: number[];
  timezone: string;
  startMinutes?: number | null;
  dueMinutes?: number | null;
  assigneeEmployeeId?: string | null;
  teamId?: string | null;
  checklist: Array<{ label: string; required: boolean }>;
};

/**
 * The body for create (`mode: "create"`, the key is sent, blanks are left out)
 * or update (`"update"`, the key is never sent and a cleared optional is null,
 * which is how the API clears it).
 */
export function buildTemplatePayload(
  draft: TemplateDraft,
  mode: "create" | "update",
): Built<TemplateBody> {
  const name = draft.name.trim();
  if (!name) return { ok: false, message: "Enter a name." };
  const key = draft.key.trim();
  if (mode === "create" && !TEMPLATE_KEY_PATTERN.test(key)) {
    return {
      ok: false,
      message:
        "Key must be 2 to 63 lowercase letters, digits, dots, dashes or underscores.",
    };
  }
  if (draft.weekdays.length === 0) {
    return { ok: false, message: "Choose at least one weekday." };
  }
  if (!isValidTimezone(draft.timezone)) {
    return { ok: false, message: "Choose a timezone." };
  }
  const start = draft.startTime ? timeToMinutes(draft.startTime) : null;
  const due = draft.dueTime ? timeToMinutes(draft.dueTime) : null;
  if (draft.startTime && start === null) {
    return { ok: false, message: "Start time must be a valid time." };
  }
  if (draft.dueTime && due === null) {
    return { ok: false, message: "Due time must be a valid time." };
  }
  if (start !== null && due !== null && due <= start) {
    return { ok: false, message: "Due time must be after the start time." };
  }
  const checklist: Array<{ label: string; required: boolean }> = [];
  for (const item of draft.checklist) {
    const label = item.label.trim();
    if (!label) {
      return { ok: false, message: "Every checklist item needs a label." };
    }
    if (label.length > 300) {
      return {
        ok: false,
        message: "A checklist label is at most 300 characters.",
      };
    }
    checklist.push({ label, required: item.required });
  }
  if (checklist.length > 50) {
    return { ok: false, message: "A checklist holds at most 50 items." };
  }
  const description = draft.description.trim();
  if (mode === "create") {
    return {
      ok: true,
      body: {
        key,
        name,
        ...(description ? { description } : {}),
        weekdays: [...draft.weekdays].sort((a, b) => a - b),
        timezone: draft.timezone,
        ...(start !== null ? { startMinutes: start } : {}),
        ...(due !== null ? { dueMinutes: due } : {}),
        ...(draft.assigneeEmployeeId
          ? { assigneeEmployeeId: draft.assigneeEmployeeId }
          : {}),
        ...(draft.teamId ? { teamId: draft.teamId } : {}),
        checklist,
      },
    };
  }
  return {
    ok: true,
    body: {
      name,
      description: description || null,
      weekdays: [...draft.weekdays].sort((a, b) => a - b),
      timezone: draft.timezone,
      startMinutes: start,
      dueMinutes: due,
      assigneeEmployeeId: draft.assigneeEmployeeId || null,
      teamId: draft.teamId || null,
      checklist,
    },
  };
}

/* ------------------------------------------------------------ handovers */

export function buildHandoverPayload(input: {
  target: "person" | "team";
  toEmployeeId: string;
  teamId: string;
  note: string;
  occurrenceId?: string;
}): Built<{
  toEmployeeId?: string;
  teamId?: string;
  note: string;
  occurrenceId?: string;
}> {
  const note = input.note.trim();
  if (input.target === "person" && !input.toEmployeeId) {
    return { ok: false, message: "Choose who receives the handover." };
  }
  if (input.target === "team" && !input.teamId) {
    return { ok: false, message: "Choose the team that receives it." };
  }
  if (note.length < 3) {
    return { ok: false, message: "Write a note of at least 3 characters." };
  }
  if (note.length > 2000) {
    return { ok: false, message: "The note is at most 2000 characters." };
  }
  return {
    ok: true,
    body: {
      ...(input.target === "person"
        ? { toEmployeeId: input.toEmployeeId }
        : { teamId: input.teamId }),
      note,
      ...(input.occurrenceId ? { occurrenceId: input.occurrenceId } : {}),
    },
  };
}

export function buildGenerateBody(date: string): Built<{ date: string }> {
  if (!isDateInput(date)) {
    return { ok: false, message: "Choose a valid date." };
  }
  return { ok: true, body: { date } };
}

export function trimmedNote(note: string): { note?: string } {
  const value = note.trim();
  return value ? { note: value.slice(0, 500) } : {};
}
