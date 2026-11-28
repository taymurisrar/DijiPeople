/*
 * DP-MASTER WP-28.S3. The pure rules behind the meetings and decision-register
 * screens: statuses and their labels, which actions each status offers, how a
 * decision's chain is laid out (hidden steps included), and the exact request
 * bodies the API accepts (it answers an unknown field with a 400). No I/O, so each
 * rule is unit-tested directly. The API stays the authority on every one of them.
 */

export const MEETING_STATUSES = ["PLANNED", "HELD", "CANCELLED"] as const;
export type MeetingStatus = (typeof MEETING_STATUSES)[number];

export const DECISION_STATUSES = [
  "PROPOSED",
  "DECIDED",
  "SUPERSEDED",
  "REVERSED",
] as const;
export type DecisionStatus = (typeof DECISION_STATUSES)[number];

export const MEETING_STATUS_LABELS: Record<MeetingStatus, string> = {
  PLANNED: "Planned",
  HELD: "Held",
  CANCELLED: "Cancelled",
};

export const DECISION_STATUS_LABELS: Record<DecisionStatus, string> = {
  PROPOSED: "Proposed",
  DECIDED: "Decided",
  SUPERSEDED: "Superseded",
  REVERSED: "Reversed",
};

export const DECISION_PAGE_SIZE = 10;
export const MEETING_PAGE_SIZE = 10;

export const MIN_TITLE = 2;
export const MAX_TITLE = 200;
export const MAX_AGENDA = 5000;
export const MAX_NOTES = 20000;
export const MAX_TEXT = 5000;
export const MIN_REASON = 3;
export const MAX_REASON = 1000;
export const MAX_ATTENDEES = 100;

export type Page<T> = { items: T[]; total: number };

export type MeetingAttendee = { employeeId: string; attended: boolean };

export type Meeting = {
  id: string;
  title: string;
  agenda: string | null;
  scheduledAt: string;
  heldAt: string | null;
  facilitatorEmployeeId: string | null;
  notes: string | null;
  status: MeetingStatus;
  workItemId: string | null;
  blockerId: string | null;
  projectId: string | null;
  createdById: string | null;
  attendees: MeetingAttendee[];
};

export type Decision = {
  id: string;
  title: string;
  context: string | null;
  decision: string;
  status: DecisionStatus;
  ownerEmployeeId: string | null;
  decidedAt: string | null;
  meetingId: string | null;
  workItemId: string | null;
  blockerId: string | null;
  projectId: string | null;
  supersedesId: string | null;
  reversedReason: string | null;
  reversedAt: string | null;
  actionCount?: number;
  openActionCount?: number;
};

/** A step of the chain the caller is not authorised to see: it exists, nothing more. */
export type HiddenStep = { id: null; link: "HIDDEN_LINK" };
export type ChainStep = Decision | HiddenStep;

export type DecisionAction = {
  workItemId: string;
  title: string;
  status: string;
  dueAt: string | null;
  ownerEmployeeId: string | null;
};

export type DecisionMeeting = {
  id: string;
  title: string;
  status: MeetingStatus;
  scheduledAt: string;
  heldAt: string | null;
  notes: string | null;
};

export type DecisionDetail = Decision & {
  meeting: DecisionMeeting | null;
  actions: DecisionAction[];
  /** Nearest first; ends at the original decision. */
  previous: ChainStep[];
  /** Nearest first. */
  next: ChainStep[];
};

export type OpenActionRow = Decision & {
  openActions: (DecisionAction & { overdue: boolean })[];
};

export function isHiddenStep(step: ChainStep): step is HiddenStep {
  return step.id === null;
}

export function meetingTone(
  status: MeetingStatus,
): "info" | "good" | "muted" {
  return status === "HELD" ? "good" : status === "CANCELLED" ? "muted" : "info";
}

export function decisionTone(
  status: DecisionStatus,
): "info" | "good" | "muted" | "danger" {
  switch (status) {
    case "DECIDED":
      return "good";
    case "REVERSED":
      return "danger";
    case "SUPERSEDED":
      return "muted";
    default:
      return "info";
  }
}

/* ---------- what each status offers ---------- */

/** Only a planned meeting is held or cancelled. */
export function canHoldOrCancel(meeting: Pick<Meeting, "status">): boolean {
  return meeting.status === "PLANNED";
}

/** A cancelled meeting changes nothing; a held one keeps its agenda. */
export function canEditMeeting(meeting: Pick<Meeting, "status">): boolean {
  return meeting.status !== "CANCELLED";
}

export function agendaLocked(meeting: Pick<Meeting, "status">): boolean {
  return meeting.status === "HELD";
}

/** Attendance is written up after the meeting was held. */
export function canRecordAttendance(meeting: Pick<Meeting, "status">): boolean {
  return meeting.status === "HELD";
}

/** A decision can still be recorded in a planned or held meeting. */
export function canRecordDecision(meeting: Pick<Meeting, "status">): boolean {
  return meeting.status !== "CANCELLED";
}

export function canConfirm(decision: Pick<Decision, "status">): boolean {
  return decision.status === "PROPOSED";
}

export function canSupersede(decision: Pick<Decision, "status">): boolean {
  return decision.status === "DECIDED";
}

export function canReverse(decision: Pick<Decision, "status">): boolean {
  return decision.status === "DECIDED";
}

export function canAddAction(decision: Pick<Decision, "status">): boolean {
  return decision.status === "DECIDED";
}

/* ---------- the chain ---------- */

export type ChainEntry =
  | { kind: "decision"; decision: Decision; current: boolean }
  | { kind: "hidden" };

/**
 * The whole chain, oldest first: the API sends the earlier steps nearest first, so
 * they are turned round, then the decision itself, then the later steps. A step the
 * caller may not see stays in its place as "hidden" so the chain never reads as
 * shorter than it is.
 */
export function chainEntries(detail: DecisionDetail): ChainEntry[] {
  const entry = (step: ChainStep): ChainEntry =>
    isHiddenStep(step)
      ? { kind: "hidden" }
      : { kind: "decision", decision: step, current: false };
  return [
    ...[...(detail.previous ?? [])].reverse().map(entry),
    { kind: "decision", decision: detail, current: true },
    ...(detail.next ?? []).map(entry),
  ];
}

export function hasChain(detail: DecisionDetail): boolean {
  return (detail.previous?.length ?? 0) + (detail.next?.length ?? 0) > 0;
}

/** The reason a reversed decision was reversed, exactly as stored. */
export function reversalNote(decision: Decision): string | null {
  return decision.status === "REVERSED" ? decision.reversedReason : null;
}

/* ---------- validation ---------- */

function trimmedLength(value: string) {
  return value.trim().length;
}

export function validateTitle(title: string): string | null {
  const length = trimmedLength(title);
  if (length < MIN_TITLE) return `Enter a title of at least ${MIN_TITLE} characters.`;
  if (length > MAX_TITLE) return `The title can be at most ${MAX_TITLE} characters.`;
  return null;
}

export function validateMeeting(input: {
  title: string;
  agenda: string;
  scheduledAt: string;
  attendeeIds: readonly string[];
}): string | null {
  const title = validateTitle(input.title);
  if (title) return title;
  if (!input.scheduledAt || Number.isNaN(new Date(input.scheduledAt).getTime())) {
    return "Choose when the meeting is scheduled.";
  }
  if (input.agenda.length > MAX_AGENDA) {
    return `The agenda can be at most ${MAX_AGENDA} characters.`;
  }
  if (input.attendeeIds.length > MAX_ATTENDEES) {
    return `A meeting can have at most ${MAX_ATTENDEES} attendees.`;
  }
  return null;
}

export function validateDecisionInput(input: {
  title: string;
  decision: string;
  context: string;
}): string | null {
  const title = validateTitle(input.title);
  if (title) return title;
  const decisionLength = trimmedLength(input.decision);
  if (decisionLength < 2) return "Enter the decision.";
  if (decisionLength > MAX_TEXT) {
    return `The decision can be at most ${MAX_TEXT} characters.`;
  }
  if (input.context.length > MAX_TEXT) {
    return `The context can be at most ${MAX_TEXT} characters.`;
  }
  return null;
}

export function validateSupersede(input: { decision: string }): string | null {
  const length = trimmedLength(input.decision);
  if (length < 2) return "Enter the new decision.";
  if (length > MAX_TEXT) return `The decision can be at most ${MAX_TEXT} characters.`;
  return null;
}

/** A reversal always states why; the API stores the text and reads it back. */
export function validateReason(reason: string): string | null {
  const length = trimmedLength(reason);
  if (length < MIN_REASON) return `Enter a reason of at least ${MIN_REASON} characters.`;
  if (length > MAX_REASON) return `The reason can be at most ${MAX_REASON} characters.`;
  return null;
}

export function validateAction(input: {
  title: string;
  ownerEmployeeId: string;
  dueAt: string;
}): string | null {
  if (!trimmedLength(input.title)) return "Enter what has to be done.";
  if (trimmedLength(input.title) > MAX_TITLE) {
    return `The title can be at most ${MAX_TITLE} characters.`;
  }
  if (!input.ownerEmployeeId) return "Choose who owns the action.";
  if (!input.dueAt || Number.isNaN(new Date(input.dueAt).getTime())) {
    return "Choose when the action is due.";
  }
  return null;
}

/* ---------- request bodies ---------- */

/** A local `YYYY-MM-DDTHH:mm` value as the ISO instant the API stores. */
export function toIsoInstant(local: string): string {
  return new Date(local).toISOString();
}

/** An ISO instant as the local `YYYY-MM-DDTHH:mm` a picker edits. */
export function toLocalMoment(iso: string | null | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function buildCreateMeetingPayload(input: {
  title: string;
  agenda: string;
  scheduledAt: string;
  facilitatorEmployeeId: string;
  attendeeIds: readonly string[];
  workItemId?: string;
  blockerId?: string;
  projectId?: string;
}) {
  const agenda = input.agenda.trim();
  return {
    title: input.title.trim(),
    ...(agenda ? { agenda } : {}),
    scheduledAt: toIsoInstant(input.scheduledAt),
    ...(input.facilitatorEmployeeId
      ? { facilitatorEmployeeId: input.facilitatorEmployeeId }
      : {}),
    attendeeEmployeeIds: [...new Set(input.attendeeIds)],
    ...(input.workItemId ? { workItemId: input.workItemId } : {}),
    ...(input.blockerId ? { blockerId: input.blockerId } : {}),
    ...(input.projectId ? { projectId: input.projectId } : {}),
  };
}

/**
 * The edit body. Only what the meeting's status allows is sent: a held meeting
 * accepts its notes alone, so a planning field is never sent for it.
 */
export function buildUpdateMeetingPayload(
  meeting: Pick<Meeting, "status">,
  input: {
    title: string;
    agenda: string;
    scheduledAt: string;
    facilitatorEmployeeId: string;
    attendeeIds: readonly string[];
    notes: string;
  },
) {
  if (agendaLocked(meeting)) return { notes: input.notes };
  return {
    title: input.title.trim(),
    agenda: input.agenda.trim(),
    scheduledAt: toIsoInstant(input.scheduledAt),
    ...(input.facilitatorEmployeeId
      ? { facilitatorEmployeeId: input.facilitatorEmployeeId }
      : {}),
    attendeeEmployeeIds: [...new Set(input.attendeeIds)],
  };
}

export function buildHoldPayload(notes: string): { notes?: string } {
  return notes.trim() ? { notes } : {};
}

export function buildCancelPayload(reason: string): { reason?: string } {
  return reason.trim() ? { reason: reason.trim() } : {};
}

export function buildAttendancePayload(
  attendees: readonly MeetingAttendee[],
  attended: ReadonlySet<string>,
) {
  return {
    entries: attendees.map((a) => ({
      employeeId: a.employeeId,
      attended: attended.has(a.employeeId),
    })),
  };
}

export function buildCreateDecisionPayload(input: {
  title: string;
  decision: string;
  context: string;
  status: "PROPOSED" | "DECIDED";
  ownerEmployeeId: string;
  meetingId?: string;
  workItemId?: string;
  blockerId?: string;
  projectId?: string;
}) {
  const context = input.context.trim();
  return {
    title: input.title.trim(),
    decision: input.decision.trim(),
    ...(context ? { context } : {}),
    status: input.status,
    ...(input.ownerEmployeeId ? { ownerEmployeeId: input.ownerEmployeeId } : {}),
    ...(input.meetingId ? { meetingId: input.meetingId } : {}),
    ...(input.workItemId ? { workItemId: input.workItemId } : {}),
    ...(input.blockerId ? { blockerId: input.blockerId } : {}),
    ...(input.projectId ? { projectId: input.projectId } : {}),
  };
}

/** Anything left out carries over from the decision being replaced. */
export function buildSupersedePayload(input: {
  decision: string;
  title: string;
  original: Pick<Decision, "title">;
}) {
  const title = input.title.trim();
  return {
    decision: input.decision.trim(),
    ...(title && title !== input.original.title ? { title } : {}),
  };
}

export function buildReversePayload(reason: string): { reason: string } {
  return { reason: reason.trim() };
}

export function buildActionPayload(input: {
  title: string;
  ownerEmployeeId: string;
  dueAt: string;
}) {
  return {
    title: input.title.trim(),
    ownerEmployeeId: input.ownerEmployeeId,
    dueAt: toIsoInstant(input.dueAt),
  };
}

/* ---------- queries ---------- */

function pageParams(skip: number, take: number) {
  const params = new URLSearchParams();
  params.set("take", String(take));
  params.set("skip", String(Math.max(0, skip)));
  return params;
}

export function buildMeetingsQuery(input: {
  status?: MeetingStatus | "";
  skip?: number;
  workItemId?: string;
  blockerId?: string;
  projectId?: string;
}): string {
  const params = pageParams(input.skip ?? 0, MEETING_PAGE_SIZE);
  if (input.status) params.set("status", input.status);
  if (input.workItemId) params.set("workItemId", input.workItemId);
  if (input.blockerId) params.set("blockerId", input.blockerId);
  if (input.projectId) params.set("projectId", input.projectId);
  return params.toString();
}

export function buildDecisionsQuery(input: {
  status?: DecisionStatus | "";
  mine?: boolean;
  skip?: number;
  meetingId?: string;
  workItemId?: string;
  blockerId?: string;
  projectId?: string;
  take?: number;
}): string {
  const params = pageParams(input.skip ?? 0, input.take ?? DECISION_PAGE_SIZE);
  if (input.status) params.set("status", input.status);
  if (input.mine) params.set("mine", "true");
  if (input.meetingId) params.set("meetingId", input.meetingId);
  if (input.workItemId) params.set("workItemId", input.workItemId);
  if (input.blockerId) params.set("blockerId", input.blockerId);
  if (input.projectId) params.set("projectId", input.projectId);
  return params.toString();
}

export function buildOpenActionsQuery(skip = 0): string {
  return pageParams(skip, DECISION_PAGE_SIZE).toString();
}

/** "1-10 of 25", with the previous / next flags a pager needs. */
export function describePage(
  skip: number,
  shown: number,
  total: number,
  size: number,
): { label: string; hasPrev: boolean; hasNext: boolean } {
  if (total === 0 || shown === 0) {
    return { label: "0 of 0", hasPrev: skip > 0, hasNext: false };
  }
  return {
    label: `${skip + 1}-${skip + shown} of ${total}`,
    hasPrev: skip > 0,
    hasNext: skip + size < total,
  };
}

/** Names the people on a row with the lookup the screen already holds. */
export function attendeeSummary(
  meeting: Pick<Meeting, "attendees" | "status">,
): string {
  const invited = meeting.attendees.length;
  if (meeting.status !== "HELD") return `${invited} invited`;
  const came = meeting.attendees.filter((a) => a.attended).length;
  return `${came} of ${invited} attended`;
}
