/*
 * DP-MASTER WP-06.S2. The pure rules behind the project Work area: the board
 * columns, how progress and workload read, and the exact request bodies the work
 * items API accepts (an unknown field is a 400). No I/O; the API stays the
 * authority on every figure and every move.
 */
import {
  isoFromDateInput,
  type WorkItem,
  type WorkItemStatus,
} from "./work-items";

export const BOARD_COLUMNS = [
  "OPEN",
  "IN_PROGRESS",
  "BLOCKED",
  "IN_REVIEW",
  "DONE",
] as const satisfies readonly WorkItemStatus[];

export type BoardColumn = (typeof BOARD_COLUMNS)[number];

/** Items by board column. Cancelled work has no column; the list view shows it. */
export function groupByColumn(
  items: readonly WorkItem[],
): Record<BoardColumn, WorkItem[]> {
  const grouped: Record<BoardColumn, WorkItem[]> = {
    OPEN: [],
    IN_PROGRESS: [],
    BLOCKED: [],
    IN_REVIEW: [],
    DONE: [],
  };
  for (const item of items) {
    if ((BOARD_COLUMNS as readonly string[]).includes(item.status)) {
      grouped[item.status as BoardColumn].push(item);
    }
  }
  return grouped;
}

export type ProgressMilestone = {
  id: string;
  title: string;
  status: WorkItemStatus;
  dueAt: string | null;
  tasks: number;
  done: number;
  percent: number | null;
  overdue: boolean;
};

export type ProjectProgress = {
  project: { id: string; name: string };
  tasks: {
    total: number;
    counted: number;
    done: number;
    byStatus: Record<string, number>;
  };
  percentDone: number | null;
  overdue: number;
  milestones: ProgressMilestone[];
  effort: {
    estimateMinutes: number;
    actualMinutes: number;
    contributors: number;
  };
  approvedTimesheetHours: string;
  truncated: boolean;
};

export type WorkloadPerson = {
  employeeId: string;
  name: string;
  openItems: number;
  committedMinutes: number;
  unestimatedItems: number;
  overdue: number;
  /** Weekdays the person is on approved leave in the period. */
  leaveDays: number;
  /** Weekdays that are holidays for the person in the period. */
  holidayDays: number;
  /** Capacity after leave and holidays; zero means no capacity. */
  netCapacityMinutes: number;
  scheduledMinutes?: number;
  capacityBasis?: "SCHEDULE" | "PARTLY_ASSUMED" | "NO_SCHEDULE";
  /** Null when there is no capacity to divide by. */
  loadPercent: number | null;
};

export type Workload = {
  basis: "NET_OF_LEAVE_AND_HOLIDAYS" | "STANDARD_WEEK";
  limits?: "NO_HALF_DAY_HOLIDAYS_NO_ROTATION_WEEKS";
  /** A plain period of weekdays, for reference. */
  capacityMinutes: number;
  people: WorkloadPerson[];
};

/** Whole or part days, as people say them: "0 days", "1 day", "2.5 days". */
export function dayCountLabel(days: number | null | undefined): string {
  const value = days ?? 0;
  const text = Number.isInteger(value) ? String(value) : String(Number(value.toFixed(2)));
  return value === 1 ? `${text} day` : `${text} days`;
}

export type WorkItemContributor = {
  employeeId: string;
  estimateMinutes: number | null;
  actualMinutes: number | null;
};

export type WorkItemDetail = WorkItem & {
  description?: string | null;
  contributors: WorkItemContributor[];
  dependsOn: { dependsOnId: string }[];
  children: { id: string; title: string; status: WorkItemStatus }[];
  effort?: { estimateMinutes: number; actualMinutes: number };
};

/** "No work yet" when the API reports nothing to measure, never "0%". */
export function percentDoneLabel(percent: number | null | undefined): string {
  return percent === null || percent === undefined ? "No work yet" : `${percent}%`;
}

/** Whole minutes as "2h 30m"; zero reads "0m". */
export function formatMinutes(minutes: number | null | undefined): string {
  if (minutes === null || minutes === undefined) return "Not set";
  const total = Math.max(0, Math.round(minutes));
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  if (hours === 0) return `${rest}m`;
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}

/** A load figure, or a plain statement when the API had no capacity to divide by. */
export function loadLabel(percent: number | null | undefined): string {
  return percent === null || percent === undefined ? "No capacity" : `${percent}%`;
}

export function loadTone(
  percent: number | null | undefined,
): "muted" | "good" | "warning" | "danger" {
  if (percent === null || percent === undefined) return "muted";
  if (percent > 100) return "danger";
  if (percent >= 85) return "warning";
  return "good";
}

export const WORKLOAD_CAVEAT =
  "Capacity follows each person's own schedule, net of approved leave and holidays; someone with no schedule is shown on a plain Monday to Friday, 8 hour week. Half-day holidays and rotating weeks are not yet taken into account. Items with no estimate are counted separately, never as zero.";

/** Today and the next 27 days, as date inputs. */
export function defaultWorkloadPeriod(now: Date = new Date()): {
  from: string;
  to: string;
} {
  const start = new Date(
    Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()),
  );
  const end = new Date(start.getTime() + 27 * 86_400_000);
  return { from: dateInputValue(start), to: dateInputValue(end) };
}

function dateInputValue(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** The inclusive date-input period as the API's half-open [from, to) instants. */
export function buildWorkloadQuery(input: {
  from: string;
  to: string;
  projectId?: string;
}): string {
  const params = new URLSearchParams();
  params.set("from", isoFromDateInput(input.from));
  const exclusiveEnd = new Date(isoFromDateInput(input.to));
  exclusiveEnd.setUTCDate(exclusiveEnd.getUTCDate() + 1);
  params.set("to", exclusiveEnd.toISOString());
  if (input.projectId) params.set("projectId", input.projectId);
  return params.toString();
}

export function validateWorkloadPeriod(input: {
  from: string;
  to: string;
}): string | null {
  if (!input.from || !input.to) return "Choose both dates for the period.";
  if (input.to < input.from) return "The period must end on or after it starts.";
  return null;
}

export function buildProjectItemsQuery(input: {
  projectId: string;
  milestoneId?: string;
  take?: number;
}): string {
  const params = new URLSearchParams();
  params.set("projectId", input.projectId);
  params.set("kind", "TASK");
  if (input.milestoneId) params.set("milestoneId", input.milestoneId);
  // The API caps take at 100 (ListWorkItemsDto); 200 made the whole Work area fail to load.
  params.set("take", String(input.take ?? 100));
  return params.toString();
}

export function buildCreateMilestonePayload(input: {
  title: string;
  projectId: string;
  dueDate?: string;
}): { kind: "MILESTONE"; title: string; projectId: string; dueAt?: string } {
  return {
    kind: "MILESTONE",
    title: input.title.trim(),
    projectId: input.projectId,
    ...(input.dueDate ? { dueAt: isoFromDateInput(input.dueDate) } : {}),
  };
}

export function buildProjectTaskPayload(input: {
  title: string;
  projectId: string;
  milestoneId?: string;
  parentId?: string;
}): {
  kind: "TASK";
  title: string;
  projectId: string;
  milestoneId?: string;
  parentId?: string;
} {
  return {
    kind: "TASK",
    title: input.title.trim(),
    projectId: input.projectId,
    ...(input.milestoneId ? { milestoneId: input.milestoneId } : {}),
    ...(input.parentId ? { parentId: input.parentId } : {}),
  };
}

/** Assigning sends the id; clearing sends an empty body, which the API reads as "none". */
export function buildSetMilestonePayload(milestoneId: string): {
  milestoneId?: string;
} {
  return milestoneId ? { milestoneId } : {};
}

export function buildDependencyPayload(dependsOnId: string): {
  dependsOnId: string;
} {
  return { dependsOnId };
}

/** Blank leaves a figure unchanged; only whole, non-negative minutes are sent. */
export function parseMinutes(value: string): number | null | "invalid" {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!/^\d{1,6}$/.test(trimmed)) return "invalid";
  return Number(trimmed);
}

export function buildContributorPayload(input: {
  estimate: string;
  actual: string;
}):
  | { ok: true; body: { estimateMinutes?: number; actualMinutes?: number } }
  | { ok: false; message: string } {
  const estimate = parseMinutes(input.estimate);
  const actual = parseMinutes(input.actual);
  if (estimate === "invalid" || actual === "invalid") {
    return { ok: false, message: "Enter whole minutes, zero or more." };
  }
  if (estimate === null && actual === null) {
    return { ok: false, message: "Enter an estimate, the actual time, or both." };
  }
  return {
    ok: true,
    body: {
      ...(estimate !== null ? { estimateMinutes: estimate } : {}),
      ...(actual !== null ? { actualMinutes: actual } : {}),
    },
  };
}

/** Whether a progress bar's fill is a number worth drawing. */
export function barWidth(percent: number | null | undefined): number {
  if (percent === null || percent === undefined) return 0;
  return Math.min(100, Math.max(0, percent));
}
