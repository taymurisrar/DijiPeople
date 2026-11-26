/*
 * DP-MASTER WP-38.S1. The pure rules behind blockers and the hours
 * reconciliation: labels, tones, the exact request bodies the API accepts (an
 * unknown field is a 400) and the wording of a gap. No I/O, so each rule is
 * unit-tested directly. The API remains the authority on every move, and on who
 * may name a cause.
 */
import { formatMinutes, buildWorkloadQuery } from "./project-work";
import { isoFromDateInput } from "./work-items";

/** Mirrors `BLOCKER_CATEGORIES` in the API's `dto/work-blocker.dto.ts`. */
export const BLOCKER_CATEGORIES = [
  "WAITING_ON_PERSON",
  "WAITING_ON_APPROVAL",
  "EQUIPMENT_OR_SYSTEM_DOWNTIME",
  "EXTERNAL_PARTY",
  "MATERIAL_OR_STOCK",
  "DECISION_NEEDED",
  "ACCESS_OR_TOOLING",
  "OTHER",
] as const;
export type BlockerCategory = (typeof BLOCKER_CATEGORIES)[number];

/** Mirrors `BLOCKER_CAUSES` in the same file. */
export const BLOCKER_CAUSES = [
  "UNDETERMINED",
  "WORKER_CONTROLLABLE",
  "TEAM_CONTROLLABLE",
  "MANAGEMENT",
  "EXTERNAL",
] as const;
export type BlockerCause = (typeof BLOCKER_CAUSES)[number];

export const BLOCKER_STATUSES = ["OPEN", "RESOLVED", "CANCELLED"] as const;
export type BlockerStatus = (typeof BLOCKER_STATUSES)[number];

/** Mirrors `MAX_ESCALATION_LEVEL` in the API's `work-blockers.service.ts`. */
export const MAX_ESCALATION_LEVEL = 3;

export type Tone = "good" | "muted" | "neutral" | "danger" | "warning" | "info";

export const BLOCKER_CATEGORY_LABELS: Record<BlockerCategory, string> = {
  WAITING_ON_PERSON: "Waiting on a person",
  WAITING_ON_APPROVAL: "Waiting on approval",
  EQUIPMENT_OR_SYSTEM_DOWNTIME: "Equipment or system downtime",
  EXTERNAL_PARTY: "External party",
  MATERIAL_OR_STOCK: "Material or stock",
  DECISION_NEEDED: "Decision needed",
  ACCESS_OR_TOOLING: "Access or tooling",
  OTHER: "Other",
};

export const BLOCKER_CAUSE_LABELS: Record<BlockerCause, string> = {
  UNDETERMINED: "Cause not determined",
  WORKER_CONTROLLABLE: "Worker-controllable",
  TEAM_CONTROLLABLE: "Team-controllable",
  MANAGEMENT: "Management",
  EXTERNAL: "External",
};

export const BLOCKER_STATUS_LABELS: Record<BlockerStatus, string> = {
  OPEN: "Open",
  RESOLVED: "Resolved",
  CANCELLED: "Cancelled",
};

export function categoryLabel(category: string): string {
  return BLOCKER_CATEGORY_LABELS[category as BlockerCategory] ?? category;
}

export function causeLabel(cause: string): string {
  return BLOCKER_CAUSE_LABELS[cause as BlockerCause] ?? cause;
}

export function blockerStatusLabel(status: string): string {
  return BLOCKER_STATUS_LABELS[status as BlockerStatus] ?? status;
}

/**
 * An undetermined cause and a worker-controllable one are the two a reader must
 * not mistake for the rest, so each has its own tone as well as its own words.
 */
export function causeTone(cause: string): Tone {
  switch (cause) {
    case "UNDETERMINED":
      return "warning";
    case "WORKER_CONTROLLABLE":
      return "danger";
    case "TEAM_CONTROLLABLE":
      return "neutral";
    case "MANAGEMENT":
      return "info";
    default:
      return "muted";
  }
}

export function blockerStatusTone(status: string): Tone {
  if (status === "OPEN") return "warning";
  if (status === "RESOLVED") return "good";
  return "muted";
}

export type WorkBlocker = {
  id: string;
  workItemId: string;
  category: BlockerCategory;
  cause: BlockerCause;
  causeSetById: string | null;
  reason: string;
  status: BlockerStatus;
  ownerEmployeeId: string | null;
  ownerName: string | null;
  dueAt: string | null;
  raisedAt: string;
  escalationLevel: number;
  escalatedAt: string | null;
  resolvedAt: string | null;
  resolution: string | null;
  openMinutes: number;
  overdue: boolean;
  workItemTitle?: string | null;
  workItemStatus?: string | null;
  projectId?: string | null;
};

export type BlockerPage = { items: WorkBlocker[]; total: number };

export type BlockerBucket = {
  count: number;
  open: number;
  minutes: number;
};

export type BlockerSummary = {
  period: { from: string; to: string };
  blockers: number;
  open: number;
  overdue: number;
  byCategory: (BlockerBucket & { category: BlockerCategory })[];
  byCause: (BlockerBucket & { cause: BlockerCause })[];
  truncated: boolean;
};

export function isOpenBlocker(blocker: Pick<WorkBlocker, "status">): boolean {
  return blocker.status === "OPEN";
}

export function canEscalate(
  blocker: Pick<WorkBlocker, "status" | "escalationLevel">,
): boolean {
  return isOpenBlocker(blocker) && blocker.escalationLevel < MAX_ESCALATION_LEVEL;
}

/** A short, stable name for a blocker's controls: its reason, cut at 60 characters. */
export function blockerName(blocker: Pick<WorkBlocker, "reason">): string {
  const reason = blocker.reason.trim();
  return reason.length > 60 ? `${reason.slice(0, 57)}...` : reason;
}

export function escalationLabel(level: number): string {
  return level > 0
    ? `Escalation level ${level} of ${MAX_ESCALATION_LEVEL}`
    : "Not escalated";
}

/** "3h 20m", or "2d 4h" once it is more than a day. */
export function formatBlockedDuration(minutes: number | null | undefined): string {
  if (minutes === null || minutes === undefined) return "Not known";
  const total = Math.max(0, Math.round(minutes));
  if (total < 1440) return formatMinutes(total);
  const days = Math.floor(total / 1440);
  const hours = Math.floor((total % 1440) / 60);
  return hours === 0 ? `${days}d` : `${days}d ${hours}h`;
}

export const BLOCKED_TIME_NOTE =
  "Blocked time is reported beside effort. It is never subtracted from it.";

export function openBlockerCountLabel(count: number): string {
  return count === 1 ? "1 open blocker" : `${count} open blockers`;
}

/** Open blockers per work item, for the board cards. */
export function openBlockerCounts(
  blockers: readonly Pick<WorkBlocker, "workItemId" | "status">[],
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const blocker of blockers) {
    if (blocker.status !== "OPEN") continue;
    counts[blocker.workItemId] = (counts[blocker.workItemId] ?? 0) + 1;
  }
  return counts;
}

/** Today and the 27 days before it, as date inputs: a summary looks back. */
export function defaultBlockerPeriod(now: Date = new Date()): {
  from: string;
  to: string;
} {
  const end = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  const start = new Date(end.getTime() - 27 * 86_400_000);
  return {
    from: start.toISOString().slice(0, 10),
    to: end.toISOString().slice(0, 10),
  };
}

/** What each cause row of the summary says in words, beside its figures. */
export const CAUSE_SUMMARY_NOTES: Record<BlockerCause, string> = {
  UNDETERMINED: "No reviewer has judged the cause yet. Not attributed to anyone.",
  WORKER_CONTROLLABLE: "A reviewer judged this within the worker's control.",
  TEAM_CONTROLLABLE: "A reviewer judged this within the team's control.",
  MANAGEMENT: "A reviewer judged this a management matter.",
  EXTERNAL: "A reviewer judged this outside the organisation's control.",
};

export type CauseSummaryRow = {
  cause: BlockerCause;
  count: number;
  open: number;
  minutes: number;
};

/** Every cause in a fixed order, so an absent one reads as zero rather than vanishing. */
export function orderedCauseRows(
  summary: Pick<BlockerSummary, "byCause">,
): CauseSummaryRow[] {
  return BLOCKER_CAUSES.map((cause) => {
    const found = summary.byCause.find((row) => row.cause === cause);
    return {
      cause,
      count: found?.count ?? 0,
      open: found?.open ?? 0,
      minutes: found?.minutes ?? 0,
    };
  });
}

/* ------------------------------------------------------------ request bodies */

export type Built<T> = { ok: true; body: T } | { ok: false; message: string };

const MIN_TEXT = 3;

export function buildRaiseBlockerPayload(input: {
  category: string;
  reason: string;
  ownerEmployeeId?: string;
  dueDate?: string;
  cause?: string;
}): Built<{
  category: BlockerCategory;
  reason: string;
  ownerEmployeeId?: string;
  dueAt?: string;
  cause?: BlockerCause;
}> {
  if (!(BLOCKER_CATEGORIES as readonly string[]).includes(input.category)) {
    return { ok: false, message: "Choose a category." };
  }
  const reason = input.reason.trim();
  if (reason.length < MIN_TEXT) {
    return { ok: false, message: "Describe what is blocking the work (at least 3 characters)." };
  }
  return {
    ok: true,
    body: {
      category: input.category as BlockerCategory,
      reason,
      ...(input.ownerEmployeeId ? { ownerEmployeeId: input.ownerEmployeeId } : {}),
      ...(input.dueDate ? { dueAt: isoFromDateInput(input.dueDate) } : {}),
      ...(input.cause && (BLOCKER_CAUSES as readonly string[]).includes(input.cause)
        ? { cause: input.cause as BlockerCause }
        : {}),
    },
  };
}

/** Only what changed is sent; clearing an owner or a date is not offered. */
export function buildUpdateBlockerPayload(input: {
  ownerEmployeeId?: string;
  dueDate?: string;
}): Built<{ ownerEmployeeId?: string; dueAt?: string }> {
  const body = {
    ...(input.ownerEmployeeId ? { ownerEmployeeId: input.ownerEmployeeId } : {}),
    ...(input.dueDate ? { dueAt: isoFromDateInput(input.dueDate) } : {}),
  };
  if (!Object.keys(body).length) {
    return { ok: false, message: "Choose an owner, a due date, or both." };
  }
  return { ok: true, body };
}

export function buildCausePayload(input: {
  cause: string;
  note?: string;
}): Built<{ cause: BlockerCause; note?: string }> {
  if (!(BLOCKER_CAUSES as readonly string[]).includes(input.cause)) {
    return { ok: false, message: "Choose a cause." };
  }
  const note = input.note?.trim();
  return {
    ok: true,
    body: {
      cause: input.cause as BlockerCause,
      ...(note ? { note } : {}),
    },
  };
}

export function buildEscalatePayload(note?: string): { note?: string } {
  const trimmed = note?.trim();
  return trimmed ? { note: trimmed } : {};
}

/** Resolving and cancelling both need a stated resolution of at least 3 characters. */
export function buildCloseBlockerPayload(
  resolution: string,
): Built<{ resolution: string }> {
  const text = resolution.trim();
  if (text.length < MIN_TEXT) {
    return { ok: false, message: "Enter a resolution (at least 3 characters)." };
  }
  return { ok: true, body: { resolution: text } };
}

export function buildBlockersQuery(input: {
  status?: BlockerStatus | "";
  mine?: boolean;
  overdue?: boolean;
  workItemId?: string;
  projectId?: string;
  take?: number;
  skip?: number;
}): string {
  const params = new URLSearchParams();
  if (input.status) params.set("status", input.status);
  if (input.mine) params.set("mine", "true");
  if (input.overdue) params.set("overdue", "true");
  if (input.workItemId) params.set("workItemId", input.workItemId);
  if (input.projectId) params.set("projectId", input.projectId);
  params.set("take", String(Math.min(100, input.take ?? 100)));
  if (input.skip) params.set("skip", String(input.skip));
  return params.toString();
}

/** The summary takes the same inclusive date-input period the workload does. */
export function buildBlockerSummaryQuery(input: {
  from: string;
  to: string;
  projectId?: string;
}): string {
  return buildWorkloadQuery(input);
}

/* ------------------------------------------------------------------ hours */

/** Mirrors the `reconciliation` values `WorkItemsService.hours` can return. */
export const HOURS_RECONCILIATIONS = [
  "MATCHES",
  "REPORTED_NOT_YET_APPROVED",
  "APPROVED_EXCEEDS_REPORTED",
  "NO_ACTUAL_REPORTED",
  "NOTHING_BOOKED",
] as const;
export type HoursReconciliation = (typeof HOURS_RECONCILIATIONS)[number];

export type HoursPerson = {
  employeeId: string;
  name: string;
  estimateMinutes: number | null;
  reportedActualMinutes: number | null;
  approvedTimesheetMinutes: number;
  pendingTimesheetMinutes: number;
  differenceMinutes: number | null;
  reconciliation: HoursReconciliation;
};

export type WorkItemHours = { workItemId: string; people: HoursPerson[] };

/**
 * The gap between what a person reported and what approved timesheets say, in
 * words. The two figures are different facts and are shown beside each other;
 * this names how they relate and never picks one.
 */
export function hoursGapLabel(
  person: Pick<HoursPerson, "reconciliation" | "differenceMinutes">,
): string {
  const difference = person.differenceMinutes;
  switch (person.reconciliation) {
    case "MATCHES":
      return "Reported time matches approved timesheets";
    case "REPORTED_NOT_YET_APPROVED":
      return difference === null
        ? "Reported time is not yet approved"
        : `Reported ${formatMinutes(Math.abs(difference))} more than is approved so far (not yet approved)`;
    case "APPROVED_EXCEEDS_REPORTED":
      return difference === null
        ? "Approved timesheets exceed the reported time"
        : `Approved timesheets exceed the reported time by ${formatMinutes(Math.abs(difference))}`;
    case "NO_ACTUAL_REPORTED":
      return "No actual time reported; timesheet hours exist";
    case "NOTHING_BOOKED":
      return "Nothing reported or booked";
    default:
      return "Not reconciled";
  }
}

export function hoursGapTone(reconciliation: string): Tone {
  switch (reconciliation) {
    case "MATCHES":
      return "good";
    case "APPROVED_EXCEEDS_REPORTED":
      return "warning";
    case "REPORTED_NOT_YET_APPROVED":
      return "info";
    default:
      return "muted";
  }
}

/** A figure that may be absent: "Not reported", never zero. */
export function reportedLabel(minutes: number | null | undefined): string {
  return minutes === null || minutes === undefined
    ? "Not reported"
    : formatMinutes(minutes);
}
