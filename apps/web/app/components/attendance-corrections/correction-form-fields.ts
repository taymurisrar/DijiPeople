/**
 * Which fields a correction type needs, and what makes a request valid.
 *
 * PURE, AND SEPARATE FROM THE COMPONENT ON PURPOSE. This repo's web tests run in
 * a node environment against pure functions — there is no jsdom and no testing
 * library — so the rules worth protecting are extracted here where they can be
 * asserted directly. The alternative would be adding a browser test stack for
 * one form.
 *
 * The server remains authoritative. Nothing here relaxes a backend rule; it only
 * stops a person filling in fields that will be ignored, or omitting one that
 * will be refused.
 */

export type CorrectionType =
  | "MISSED_CHECK_IN"
  | "MISSED_CHECK_OUT"
  | "LATE_CHECK_IN"
  | "EARLY_CHECK_OUT"
  | "ABSENCE_CORRECTION"
  | "TIME_ADJUSTMENT"
  | "MANUAL_CORRECTION"
  | "OVERTIME_APPROVAL";

export type CorrectionField =
  | "attendanceDate"
  | "requestedCheckInAtUtc"
  | "requestedCheckOutAtUtc"
  | "requestedWorkMode"
  | "requestedWorkSiteId"
  | "requestedOvertimeMinutes"
  | "fallbackReason"
  | "reason";

/**
 * Modes a single correction may request.
 *
 * HYBRID is deliberately absent everywhere. It describes a whole day assembled
 * from sessions of different modes, so it is meaningless for one work period —
 * and the server rejects it, which would be a confusing way to learn that.
 */
export const REQUESTABLE_WORK_MODES = ["OFFICE", "REMOTE", "FIELD"] as const;

export type RequestableWorkMode = (typeof REQUESTABLE_WORK_MODES)[number];

export const CORRECTION_TYPE_OPTIONS: ReadonlyArray<{
  value: CorrectionType;
  label: string;
  hint: string;
}> = [
  {
    value: "MISSED_CHECK_IN",
    label: "I forgot to check in",
    hint: "Adds the start of a work period that was never recorded.",
  },
  {
    value: "MISSED_CHECK_OUT",
    label: "I forgot to check out",
    hint: "Adds the end of a work period that was left open.",
  },
  {
    value: "LATE_CHECK_IN",
    label: "My check-in time is wrong",
    hint: "Corrects a recorded arrival time.",
  },
  {
    value: "EARLY_CHECK_OUT",
    label: "My check-out time is wrong",
    hint: "Corrects a recorded departure time.",
  },
  {
    value: "MANUAL_CORRECTION",
    label: "I could not use the attendance device",
    hint: "For a day the reader was unavailable or a punch did not register.",
  },
  {
    value: "TIME_ADJUSTMENT",
    label: "My work location or mode is wrong",
    hint: "Corrects whether a period was office, remote or field work.",
  },
  {
    value: "ABSENCE_CORRECTION",
    label: "This day is recorded incorrectly",
    hint: "For a day marked absent that should not be.",
  },
  {
    value: "OVERTIME_APPROVAL",
    label: "I am requesting overtime approval",
    hint: "Asks for time already worked beyond the schedule to be approved.",
  },
];

/**
 * The fields a given correction type actually uses.
 *
 * Showing every field for every type is how a form gets abandoned: an employee
 * reporting a forgotten check-out should not be asked for overtime minutes, and
 * a field the server will ignore is a question that wastes their time.
 */
export function fieldsFor(type: CorrectionType): CorrectionField[] {
  const base: CorrectionField[] = ["attendanceDate"];

  switch (type) {
    case "MISSED_CHECK_IN":
      return [
        ...base,
        "requestedCheckInAtUtc",
        "requestedWorkMode",
        "requestedWorkSiteId",
        "reason",
      ];

    case "MISSED_CHECK_OUT":
      return [
        ...base,
        "requestedCheckOutAtUtc",
        "requestedWorkMode",
        "requestedWorkSiteId",
        "reason",
      ];

    case "LATE_CHECK_IN":
      // Only the time. Correcting a recorded arrival does not change where or
      // how the work happened.
      return [...base, "requestedCheckInAtUtc", "reason"];

    case "EARLY_CHECK_OUT":
      return [...base, "requestedCheckOutAtUtc", "reason"];

    case "MANUAL_CORRECTION":
      // The device-unavailable case: a time, the site it should count at, and
      // why the reader could not be used.
      return [
        ...base,
        "requestedCheckInAtUtc",
        "requestedCheckOutAtUtc",
        "requestedWorkSiteId",
        "fallbackReason",
        "reason",
      ];

    case "TIME_ADJUSTMENT":
      return [...base, "requestedWorkMode", "requestedWorkSiteId", "reason"];

    case "OVERTIME_APPROVAL":
      // Minutes, not times. Approving overtime changes whether time already
      // worked is payable, not when it was worked.
      return [...base, "requestedOvertimeMinutes", "reason"];

    case "ABSENCE_CORRECTION":
    default:
      return [
        ...base,
        "requestedCheckInAtUtc",
        "requestedCheckOutAtUtc",
        "reason",
      ];
  }
}

export function showsField(type: CorrectionType, field: CorrectionField): boolean {
  return fieldsFor(type).includes(field);
}

export interface CorrectionDraft {
  correctionType: CorrectionType;
  attendanceDate?: string;
  requestedCheckInAtUtc?: string;
  requestedCheckOutAtUtc?: string;
  requestedWorkMode?: string;
  requestedWorkSiteId?: string;
  requestedOvertimeMinutes?: string;
  fallbackReason?: string;
  reason?: string;
}

export interface ValidationIssue {
  field: CorrectionField;
  message: string;
}

/**
 * Checks a draft before it is sent.
 *
 * Deliberately shallow. It catches the mistakes a person can see and fix — an
 * empty reason, a negative number, a missing time — and leaves everything that
 * depends on shift, policy or reconciliation to the server, which is the only
 * place that knows them. Re-implementing those rules here would give two answers
 * to the same question and one of them would go stale.
 */
export function validateDraft(draft: CorrectionDraft): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const shows = (field: CorrectionField) => showsField(draft.correctionType, field);

  if (!draft.reason?.trim()) {
    issues.push({
      field: "reason",
      message: "A reason is required so your manager can review the request.",
    });
  }

  if (shows("attendanceDate") && !draft.attendanceDate?.trim()) {
    issues.push({
      field: "attendanceDate",
      message: "Choose the day this correction is about.",
    });
  }

  if (draft.correctionType === "OVERTIME_APPROVAL") {
    const minutes = Number(draft.requestedOvertimeMinutes);

    if (!draft.requestedOvertimeMinutes?.trim() || Number.isNaN(minutes)) {
      issues.push({
        field: "requestedOvertimeMinutes",
        message: "Enter how many minutes of overtime you are requesting.",
      });
    } else if (minutes <= 0) {
      issues.push({
        field: "requestedOvertimeMinutes",
        message: "Overtime minutes must be more than zero.",
      });
    } else if (minutes > MAX_OVERTIME_MINUTES) {
      issues.push({
        field: "requestedOvertimeMinutes",
        message: `Overtime cannot exceed ${MAX_OVERTIME_MINUTES} minutes in a day.`,
      });
    }
  } else {
    // Every other type needs at least one time, otherwise there is nothing to
    // correct. TIME_ADJUSTMENT is the exception: it changes mode, not timing.
    const needsTime =
      shows("requestedCheckInAtUtc") || shows("requestedCheckOutAtUtc");

    if (
      needsTime &&
      !draft.requestedCheckInAtUtc?.trim() &&
      !draft.requestedCheckOutAtUtc?.trim()
    ) {
      issues.push({
        field: shows("requestedCheckInAtUtc")
          ? "requestedCheckInAtUtc"
          : "requestedCheckOutAtUtc",
        message: "Enter the time you are requesting.",
      });
    }
  }

  if (
    draft.requestedCheckInAtUtc &&
    draft.requestedCheckOutAtUtc &&
    new Date(draft.requestedCheckOutAtUtc) < new Date(draft.requestedCheckInAtUtc)
  ) {
    issues.push({
      field: "requestedCheckOutAtUtc",
      message: "The check-out time cannot be before the check-in time.",
    });
  }

  // Belt and braces: the option is never offered, and would be refused anyway.
  if (draft.requestedWorkMode === "HYBRID") {
    issues.push({
      field: "requestedWorkMode",
      message:
        "Hybrid describes a whole day, not a single work period. Choose office, remote or field.",
    });
  }

  if (
    draft.correctionType === "MANUAL_CORRECTION" &&
    !draft.fallbackReason?.trim()
  ) {
    issues.push({
      field: "fallbackReason",
      message: "Say why the attendance device could not be used.",
    });
  }

  return issues;
}

/** A day's worth. Beyond this the request is a data-entry error, not overtime. */
export const MAX_OVERTIME_MINUTES = 1440;

export function correctionTypeLabel(type: string): string {
  return (
    CORRECTION_TYPE_OPTIONS.find((option) => option.value === type)?.label ?? type
  );
}

export function correctionStatusLabel(status: string): string {
  switch (status) {
    case "PENDING_APPROVAL":
    case "SUBMITTED":
      return "Pending approval";
    case "APPROVED":
      return "Approved";
    case "REJECTED":
      return "Rejected";
    case "CANCELLED":
      return "Cancelled";
    case "RETURNED":
      return "Returned for more information";
    case "DRAFT":
      return "Draft";
    default:
      return status;
  }
}

export function correctionStatusTone(
  status: string,
): "good" | "warning" | "danger" | "muted" {
  switch (status) {
    case "APPROVED":
      return "good";
    case "REJECTED":
      return "danger";
    case "CANCELLED":
      return "muted";
    default:
      return "warning";
  }
}
