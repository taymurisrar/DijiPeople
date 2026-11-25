/*
 * DP-MASTER WP-30.S1/27. The pure rules behind the contribution evidence
 * screens: the vocabularies the API accepts, which fields each measure needs,
 * and the exact request bodies (an unknown field is a 400). Source, verification
 * and review state are never sent: the server decides them. A quantity keeps its
 * own unit and is never converted to time. No I/O; the API is the authority.
 */

export const CONTRIBUTION_WORK_KINDS = [
  "TASK",
  "TRANSACTION",
  "DUTY",
  "OUTPUT",
  "SERVICE",
  "EVENT",
  "CONTRIBUTION",
] as const;
export type ContributionWorkKind = (typeof CONTRIBUTION_WORK_KINDS)[number];

export const CONTRIBUTION_MEASURES = [
  "INTERVAL",
  "QUANTITY",
  "OCCURRENCE",
] as const;
export type ContributionMeasure = (typeof CONTRIBUTION_MEASURES)[number];

export const CONTRIBUTION_CATEGORIES = [
  "PLANNED",
  "UNPLANNED",
  "SUPPORT",
  "MENTORING",
  "KNOWLEDGE",
  "QUALITY",
  "SALES",
  "ADMIN",
  "TRAINING",
  "COVER",
  "DOWNTIME",
  "BLOCKED",
] as const;
export type ContributionCategory = (typeof CONTRIBUTION_CATEGORIES)[number];

export type ContributionVerification =
  | "UNVERIFIED"
  | "VERIFIED"
  | "DISPUTED"
  | "REJECTED";
export type ContributionState = "ACTIVE" | "SUPERSEDED" | "WITHDRAWN";
export type ContributionSource =
  | "SELF_REPORT"
  | "SUPERVISOR"
  | "MANUAL_IMPORT"
  | "INTEGRATION"
  | "WORK_RECORD"
  | "TIME_RECORD";

export type ContributionEntry = {
  id: string;
  employeeId: string;
  workKind: ContributionWorkKind;
  category: ContributionCategory;
  measure: ContributionMeasure;
  occurredAt: string;
  startsAt: string | null;
  endsAt: string | null;
  timezone: string;
  quantity: string | null;
  unitKey: string | null;
  source: ContributionSource;
  verification: ContributionVerification;
  reviewedAt: string | null;
  reviewNote: string | null;
  capturedOffline: boolean;
  retrospective: boolean;
  note: string | null;
  state: ContributionState;
  revision: number;
  correctionReason: string | null;
  workItemId: string | null;
  createdAt: string;
};

export type ContributionDetail = ContributionEntry & {
  history: { id: string; revision: number; state: ContributionState }[];
};

export type ContributionPage = { items: ContributionEntry[]; total: number };

export type ContributionSummary = {
  time: {
    verifiedMinutes: number;
    unverifiedMinutes: number;
    disputedMinutes: number;
    overlapRemovedMinutes: number;
    downtimeMinutes: number;
    blockedMinutes: number;
  };
  quantities: {
    unitKey: string;
    verified: string | number;
    unverified: string | number;
    disputed: string | number;
  }[];
  occurrences: number;
  entries: number;
};

export const WORK_KIND_LABELS: Record<ContributionWorkKind, string> = {
  TASK: "Task",
  TRANSACTION: "Transaction",
  DUTY: "Duty",
  OUTPUT: "Output",
  SERVICE: "Service",
  EVENT: "Event",
  CONTRIBUTION: "Contribution",
};

export const MEASURE_LABELS: Record<ContributionMeasure, string> = {
  INTERVAL: "Time spent",
  QUANTITY: "Quantity",
  OCCURRENCE: "Occurrence",
};

export const CATEGORY_LABELS: Record<ContributionCategory, string> = {
  PLANNED: "Planned",
  UNPLANNED: "Unplanned",
  SUPPORT: "Support",
  MENTORING: "Mentoring",
  KNOWLEDGE: "Knowledge",
  QUALITY: "Quality",
  SALES: "Sales",
  ADMIN: "Admin",
  TRAINING: "Training",
  COVER: "Cover",
  DOWNTIME: "Downtime",
  BLOCKED: "Blocked",
};

export const SOURCE_LABELS: Record<ContributionSource, string> = {
  SELF_REPORT: "Self-reported",
  SUPERVISOR: "Supervisor",
  MANUAL_IMPORT: "Imported",
  INTEGRATION: "Integration",
  WORK_RECORD: "Work record",
  TIME_RECORD: "Time record",
};

export const VERIFICATION_LABELS: Record<ContributionVerification, string> = {
  UNVERIFIED: "Unverified",
  VERIFIED: "Verified",
  DISPUTED: "Disputed",
  REJECTED: "Rejected",
};

export const STATE_LABELS: Record<ContributionState, string> = {
  ACTIVE: "Active",
  SUPERSEDED: "Superseded",
  WITHDRAWN: "Withdrawn",
};

type Tone = "good" | "muted" | "neutral" | "danger" | "warning" | "info";

export function verificationTone(v: ContributionVerification): Tone {
  switch (v) {
    case "VERIFIED":
      return "good";
    case "DISPUTED":
      return "warning";
    case "REJECTED":
      return "danger";
    default:
      return "muted";
  }
}

export function stateTone(state: ContributionState): Tone {
  return state === "ACTIVE" ? "info" : "muted";
}

/** An entry can only be corrected, withdrawn or disputed while it is the live revision. */
export function isLiveEntry(entry: Pick<ContributionEntry, "state">): boolean {
  return entry.state === "ACTIVE";
}

export function minutesBetween(startsAt: string, endsAt: string): number {
  return Math.round(
    (new Date(endsAt).getTime() - new Date(startsAt).getTime()) / 60_000,
  );
}

/** What an entry amounts to, in its own measure; a quantity keeps its unit. */
export function describeAmount(entry: ContributionEntry): string {
  if (entry.measure === "INTERVAL" && entry.startsAt && entry.endsAt) {
    return formatDuration(minutesBetween(entry.startsAt, entry.endsAt));
  }
  if (entry.measure === "QUANTITY") {
    return `${entry.quantity ?? "0"} ${entry.unitKey ?? ""}`.trim();
  }
  return "1 occurrence";
}

export function formatDuration(minutes: number): string {
  const total = Math.max(0, Math.round(minutes));
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  if (hours === 0) return `${rest}m`;
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}

/* ---------- the record form ---------- */

export type ContributionFormState = {
  workKind: ContributionWorkKind;
  measure: ContributionMeasure;
  category: ContributionCategory | "";
  /** datetime-local values: INTERVAL start and end, or the single event time. */
  startsAt: string;
  endsAt: string;
  occurredAt: string;
  quantity: string;
  unitKey: string;
  note: string;
  capturedOffline: boolean;
  capturedAt: string;
  clientRequestId: string;
};

export function emptyContributionForm(
  clientRequestId: string,
): ContributionFormState {
  return {
    workKind: "TASK",
    measure: "INTERVAL",
    category: "",
    startsAt: "",
    endsAt: "",
    occurredAt: "",
    quantity: "",
    unitKey: "",
    note: "",
    capturedOffline: false,
    capturedAt: "",
    clientRequestId,
  };
}

/** Generated once per form open so a retried submit is one entry, not two. */
export function newClientRequestId(
  random: () => string = () => globalThis.crypto.randomUUID(),
): string {
  return `web-${random()}`.slice(0, 64);
}

const UNIT_KEY_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}$/;
const QUANTITY_PATTERN = /^\d{1,14}(\.\d{1,4})?$/;
export const RETROSPECTIVE_AFTER_DAYS = 7;

/** A datetime-local value (the browser's zone) as the ISO instant the API validates. */
export function isoFromLocalDateTime(value: string): string {
  return new Date(value).toISOString();
}

/** The fields to show for a measure, in order. */
export function fieldsForMeasure(
  measure: ContributionMeasure,
): readonly ("interval" | "occurredAt" | "quantity")[] {
  switch (measure) {
    case "INTERVAL":
      return ["interval"];
    case "QUANTITY":
      return ["occurredAt", "quantity"];
    default:
      return ["occurredAt"];
  }
}

/** Whether the entry's own time is old enough that the API wants a note. */
export function needsRetrospectiveNote(
  form: Pick<ContributionFormState, "measure" | "startsAt" | "occurredAt">,
  now: Date = new Date(),
): boolean {
  const when = form.measure === "INTERVAL" ? form.startsAt : form.occurredAt;
  if (!when) return false;
  const at = new Date(when).getTime();
  if (Number.isNaN(at)) return false;
  return now.getTime() - at > RETROSPECTIVE_AFTER_DAYS * 86_400_000;
}

/** A message for the first thing wrong with the form, or null. */
export function validateContributionForm(
  form: ContributionFormState,
  now: Date = new Date(),
): string | null {
  if (form.measure === "INTERVAL") {
    if (!form.startsAt || !form.endsAt) return "Enter when the work started and ended.";
    if (new Date(form.endsAt).getTime() <= new Date(form.startsAt).getTime()) {
      return "The end must be after the start.";
    }
  } else {
    if (!form.occurredAt) return "Enter when it happened.";
    if (form.measure === "QUANTITY") {
      if (!QUANTITY_PATTERN.test(form.quantity.trim())) {
        return "Enter the quantity as a number, up to four decimals.";
      }
      if (!UNIT_KEY_PATTERN.test(form.unitKey.trim())) {
        return "Enter the unit as lowercase letters, digits, dots, dashes or underscores.";
      }
    }
  }
  if (form.capturedOffline && !form.capturedAt) {
    return "Enter when it was captured on the device.";
  }
  if (needsRetrospectiveNote(form, now) && !form.note.trim()) {
    return `Entries older than ${RETROSPECTIVE_AFTER_DAYS} days need a note saying why they are recorded late.`;
  }
  return null;
}

type MeasureFields = {
  startsAt?: string;
  endsAt?: string;
  occurredAt?: string;
  quantity?: string;
  unitKey?: string;
};

function measureFields(form: ContributionFormState): MeasureFields {
  if (form.measure === "INTERVAL") {
    return {
      startsAt: isoFromLocalDateTime(form.startsAt),
      endsAt: isoFromLocalDateTime(form.endsAt),
    };
  }
  if (form.measure === "QUANTITY") {
    return {
      occurredAt: isoFromLocalDateTime(form.occurredAt),
      quantity: form.quantity.trim(),
      unitKey: form.unitKey.trim(),
    };
  }
  return { occurredAt: isoFromLocalDateTime(form.occurredAt) };
}

export function buildCreateContributionPayload(
  form: ContributionFormState,
  timezone: string,
): Record<string, unknown> {
  const note = form.note.trim();
  return {
    workKind: form.workKind,
    measure: form.measure,
    ...(form.category ? { category: form.category } : {}),
    ...measureFields(form),
    timezone,
    ...(note ? { note } : {}),
    clientRequestId: form.clientRequestId,
    ...(form.capturedOffline
      ? {
          capturedOffline: true,
          capturedAt: isoFromLocalDateTime(form.capturedAt),
        }
      : {}),
  };
}

/** A correction restates the changed fields; the reason is mandatory. */
export function buildCorrectContributionPayload(
  form: ContributionFormState,
  reason: string,
  timezone: string,
): Record<string, unknown> {
  const note = form.note.trim();
  return {
    reason: reason.trim(),
    ...(form.category ? { category: form.category } : {}),
    ...measureFields(form),
    timezone,
    ...(note ? { note } : {}),
  };
}

export const MIN_REASON_LENGTH = 5;

export function validateReason(reason: string): string | null {
  return reason.trim().length >= MIN_REASON_LENGTH
    ? null
    : `Give a reason of at least ${MIN_REASON_LENGTH} characters.`;
}

export function buildReasonPayload(reason: string): { reason: string } {
  return { reason: reason.trim() };
}

export type ReviewDecision = "VERIFIED" | "REJECTED" | "DISPUTED";

export const REVIEW_DECISION_LABELS: Record<ReviewDecision, string> = {
  VERIFIED: "Verify",
  REJECTED: "Reject",
  DISPUTED: "Dispute",
};

/** Rejecting or disputing someone's evidence has to say why; verifying does not. */
export function validateReview(
  decision: ReviewDecision,
  note: string,
): string | null {
  if (decision === "VERIFIED") return null;
  return note.trim()
    ? null
    : `Add a note saying why you are choosing to ${REVIEW_DECISION_LABELS[decision].toLowerCase()} this entry.`;
}

export function buildReviewPayload(
  decision: ReviewDecision,
  note: string,
): { decision: ReviewDecision; note?: string } {
  const trimmed = note.trim();
  return { decision, ...(trimmed ? { note: trimmed } : {}) };
}

/* ---------- queries ---------- */

export function buildContributionsQuery(input: {
  employeeId?: string;
  from?: string;
  to?: string;
  verification?: ContributionVerification;
  workKind?: ContributionWorkKind;
  includeHistory?: boolean;
  take?: number;
}): string {
  const params = new URLSearchParams();
  if (input.employeeId) params.set("employeeId", input.employeeId);
  if (input.from) params.set("from", input.from);
  if (input.to) params.set("to", input.to);
  if (input.verification) params.set("verification", input.verification);
  if (input.workKind) params.set("workKind", input.workKind);
  if (input.includeHistory) params.set("includeHistory", "true");
  params.set("take", String(input.take ?? 100));
  return params.toString();
}

/** Monday 00:00 UTC to the following Monday, as ISO instants, for a date. */
export function weekRange(date: Date = new Date()): { from: string; to: string } {
  const day = date.getUTCDay();
  const sinceMonday = (day + 6) % 7;
  const start = new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate() - sinceMonday,
    ),
  );
  const end = new Date(start.getTime() + 7 * 86_400_000);
  return { from: start.toISOString(), to: end.toISOString() };
}

export function buildSummaryQuery(input: {
  from: string;
  to: string;
  employeeId?: string;
}): string {
  const params = new URLSearchParams({ from: input.from, to: input.to });
  if (input.employeeId) params.set("employeeId", input.employeeId);
  return params.toString();
}

/** A stored ISO instant back to a datetime-local value in the browser's zone. */
export function localDateTimeValue(iso: string | null | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** The form pre-filled from an existing entry, for a correction. */
export function formFromEntry(
  entry: ContributionEntry,
  clientRequestId: string,
): ContributionFormState {
  return {
    workKind: entry.workKind,
    measure: entry.measure,
    category: entry.category,
    startsAt: localDateTimeValue(entry.startsAt),
    endsAt: localDateTimeValue(entry.endsAt),
    occurredAt: localDateTimeValue(entry.occurredAt),
    quantity: entry.quantity ?? "",
    unitKey: entry.unitKey ?? "",
    note: entry.note ?? "",
    capturedOffline: false,
    capturedAt: "",
    clientRequestId,
  };
}
