/*
 * DP-MASTER WP-06.S1. The pure rules behind the work screens: which status
 * changes to offer, how an SLA standing reads, and the exact request bodies the
 * API accepts (it answers an unknown field with a 400). No I/O, so each rule is
 * unit-tested directly. The API remains the authority on every one of them.
 */

export const WORK_ITEM_STATUSES = [
  "OPEN",
  "IN_PROGRESS",
  "BLOCKED",
  "IN_REVIEW",
  "DONE",
  "CANCELLED",
] as const;
export type WorkItemStatus = (typeof WORK_ITEM_STATUSES)[number];

export const WORK_ITEM_PRIORITIES = ["LOW", "NORMAL", "HIGH", "URGENT"] as const;
export type WorkItemPriority = (typeof WORK_ITEM_PRIORITIES)[number];

export type SlaState = "NONE" | "ON_TRACK" | "AT_RISK" | "BREACHED" | "MET";

export type WorkItem = {
  id: string;
  kind: string;
  title: string;
  status: WorkItemStatus;
  priority: WorkItemPriority;
  ownerEmployeeId: string | null;
  ownerName?: string | null;
  projectId?: string | null;
  parentId?: string | null;
  milestoneId?: string | null;
  queueId: string | null;
  dueAt: string | null;
  resolutionDueAt: string | null;
  createdAt: string;
  sla: { response: SlaState; resolution: SlaState };
};

export type WorkQueue = {
  id: string;
  key: string;
  name: string;
  teamId: string | null;
  responseSlaMinutes: number | null;
  resolutionSlaMinutes: number | null;
  isActive: boolean;
};

export type QueueSummary = {
  queue: { id: string; key: string; name: string; isActive: boolean };
  open: number;
  byStatus: Record<string, number>;
  unassigned: number;
  sla: { atRisk: number; breached: number; responseBreached: number };
  truncated: boolean;
};

export type OwnerChange = {
  fromEmployeeId: string | null;
  toEmployeeId: string | null;
  fromName?: string | null;
  toName?: string | null;
  reason: string | null;
  changedById: string | null;
  createdAt: string;
};

export type WorkItemPage = { items: WorkItem[]; total: number };

/**
 * Mirrors `WORK_ITEM_TRANSITIONS` in
 * `services/api/src/modules/work-items/work-item-lifecycle.ts`. Kept in step by
 * `work-items.spec.ts`; the API re-checks every move.
 */
export const WORK_ITEM_TRANSITIONS: Record<
  WorkItemStatus,
  readonly WorkItemStatus[]
> = {
  OPEN: ["IN_PROGRESS", "CANCELLED"],
  IN_PROGRESS: ["OPEN", "BLOCKED", "IN_REVIEW", "DONE", "CANCELLED"],
  BLOCKED: ["IN_PROGRESS", "CANCELLED"],
  IN_REVIEW: ["IN_PROGRESS", "DONE"],
  DONE: ["IN_PROGRESS"],
  CANCELLED: ["OPEN"],
};

export type TransitionAction = {
  to: WorkItemStatus;
  label: string;
  variant: "primary" | "outline" | "danger-soft";
};

const ACTION_LABELS: Record<WorkItemStatus, string> = {
  OPEN: "Reopen",
  IN_PROGRESS: "Start",
  BLOCKED: "Block",
  IN_REVIEW: "Send to review",
  DONE: "Done",
  CANCELLED: "Cancel",
};

/** The status moves to offer on a row, in the order the lifecycle lists them. */
export function allowedTransitions(from: WorkItemStatus): TransitionAction[] {
  return (WORK_ITEM_TRANSITIONS[from] ?? []).map((to) => ({
    to,
    // Leaving DONE or CANCELLED is a reopen, whichever status it lands in.
    label:
      from === "DONE" || from === "CANCELLED"
        ? "Reopen"
        : from === "IN_PROGRESS" && to === "OPEN"
          ? "Return to open"
          : ACTION_LABELS[to],
    variant:
      to === "CANCELLED"
        ? "danger-soft"
        : to === "IN_PROGRESS"
          ? "primary"
          : "outline",
  }));
}

export function isTerminal(status: WorkItemStatus): boolean {
  return status === "DONE" || status === "CANCELLED";
}

export const STATUS_LABELS: Record<WorkItemStatus, string> = {
  OPEN: "Open",
  IN_PROGRESS: "In progress",
  BLOCKED: "Blocked",
  IN_REVIEW: "In review",
  DONE: "Done",
  CANCELLED: "Cancelled",
};

export const PRIORITY_LABELS: Record<WorkItemPriority, string> = {
  LOW: "Low",
  NORMAL: "Normal",
  HIGH: "High",
  URGENT: "Urgent",
};

type Tone = "good" | "muted" | "neutral" | "danger" | "warning" | "info";

export function statusTone(status: WorkItemStatus): Tone {
  switch (status) {
    case "DONE":
      return "good";
    case "BLOCKED":
      return "danger";
    case "IN_REVIEW":
      return "info";
    case "IN_PROGRESS":
      return "neutral";
    default:
      return "muted";
  }
}

export function priorityTone(priority: WorkItemPriority): Tone {
  if (priority === "URGENT") return "danger";
  if (priority === "HIGH") return "warning";
  return "muted";
}

const SLA_LABELS: Record<SlaState, string> = {
  NONE: "No SLA",
  ON_TRACK: "On track",
  AT_RISK: "At risk",
  BREACHED: "Breached",
  MET: "Met",
};

export function slaBadge(state: SlaState | undefined): {
  label: string;
  tone: Tone;
} {
  const resolved: SlaState = state && state in SLA_LABELS ? state : "NONE";
  const tone: Tone =
    resolved === "BREACHED"
      ? "danger"
      : resolved === "AT_RISK"
        ? "warning"
        : resolved === "MET"
          ? "good"
          : resolved === "ON_TRACK"
            ? "info"
            : "muted";
  return { label: SLA_LABELS[resolved], tone };
}

/** A date input value to the ISO instant the API validates. */
export function isoFromDateInput(value: string): string {
  return new Date(`${value}T00:00:00.000Z`).toISOString();
}

export function buildCreateTaskPayload(input: {
  title: string;
  priority?: WorkItemPriority | "";
  dueDate?: string;
}): {
  kind: "TASK";
  title: string;
  priority?: WorkItemPriority;
  dueAt?: string;
} {
  return {
    kind: "TASK",
    title: input.title.trim(),
    ...(input.priority ? { priority: input.priority } : {}),
    ...(input.dueDate ? { dueAt: isoFromDateInput(input.dueDate) } : {}),
  };
}

export function buildTransitionPayload(to: WorkItemStatus): {
  to: WorkItemStatus;
} {
  return { to };
}

export function buildReassignPayload(input: {
  ownerEmployeeId: string;
  reason?: string;
}): { ownerEmployeeId: string; reason?: string } {
  const reason = input.reason?.trim();
  return {
    ownerEmployeeId: input.ownerEmployeeId,
    ...(reason ? { reason } : {}),
  };
}

const QUEUE_KEY_PATTERN = /^[a-z0-9][a-z0-9._-]{1,63}$/;

/** A queue key the API will accept, derived from a name. */
export function queueKeyFromName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^[^a-z0-9]+/, "")
    .replace(/-+$/, "")
    .slice(0, 64);
}

export function isValidQueueKey(key: string): boolean {
  return QUEUE_KEY_PATTERN.test(key);
}

export function buildCreateQueuePayload(input: {
  key: string;
  name: string;
  responseSlaMinutes: number | null;
  resolutionSlaMinutes: number | null;
}): {
  key: string;
  name: string;
  responseSlaMinutes?: number;
  resolutionSlaMinutes?: number;
} {
  return {
    key: input.key.trim(),
    name: input.name.trim(),
    ...(input.responseSlaMinutes
      ? { responseSlaMinutes: input.responseSlaMinutes }
      : {}),
    ...(input.resolutionSlaMinutes
      ? { resolutionSlaMinutes: input.resolutionSlaMinutes }
      : {}),
  };
}

export function buildItemsQuery(input: {
  mine?: boolean;
  queueId?: string;
  unassigned?: boolean;
  overdue?: boolean;
  take?: number;
}): string {
  const params = new URLSearchParams();
  if (input.mine) params.set("mine", "true");
  if (input.queueId) params.set("queueId", input.queueId);
  if (input.unassigned) params.set("unassigned", "true");
  if (input.overdue) params.set("overdue", "true");
  params.set("take", String(input.take ?? 100));
  return params.toString();
}

export function messageFromErrorBody(body: unknown, fallback: string): string {
  if (body && typeof body === "object") {
    const message = (body as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message;
    if (Array.isArray(message)) {
      const text = message.filter((m) => typeof m === "string").join(" ");
      if (text) return text;
    }
  }
  return fallback;
}
