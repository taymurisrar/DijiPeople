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
      // The times are collected even though this type is about mode and site,
      // because the server requires at least one timestamp on every type except
      // OVERTIME_APPROVAL. Without them this option could not be submitted at
      // all: the form hid both time fields, so `validateDraft` had nothing to
      // object to and every attempt reached the API only to come back "A
      // requested check-in or check-out timestamp is required." Asking which
      // period is being re-described is the honest question anyway — a day can
      // hold more than one. See BUG-2505.
      return [
        ...base,
        "requestedCheckInAtUtc",
        "requestedCheckOutAtUtc",
        "requestedWorkMode",
        "requestedWorkSiteId",
        "reason",
      ];

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

/**
 * The attendance record a correction can be seeded from.
 *
 * Structural and deliberately loose: `AttendanceEntryRecord` carries both
 * `checkInAt` and `checkIn` for the same instant depending on which endpoint
 * produced it, and this module should not care which one arrived.
 */
export interface AttendanceEntrySeed {
  id: string;
  date?: string | null;
  attendanceDate?: string | null;
  checkInAt?: string | null;
  checkIn?: string | null;
  checkOutAt?: string | null;
  checkOut?: string | null;
  attendanceMode?: string | null;
  officeLocationId?: string | null;
  status?: string | null;
}

/** The values the record already holds, as the correction form's own vocabulary. */
export interface CorrectionOriginals {
  attendanceDate: string;
  checkInAtUtc: string | null;
  checkOutAtUtc: string | null;
  workMode: string;
  workSiteId: string;
}

export function entryCheckIn(entry: AttendanceEntrySeed): string | null {
  return entry.checkInAt ?? entry.checkIn ?? null;
}

export function entryCheckOut(entry: AttendanceEntrySeed): string | null {
  return entry.checkOutAt ?? entry.checkOut ?? null;
}

/**
 * The day the record belongs to, as YYYY-MM-DD.
 *
 * Read from the record's own date before its check-in time, because on an
 * overnight shift those are different days and the correction is about the
 * former.
 */
export function entryAttendanceDate(entry: AttendanceEntrySeed): string {
  const value =
    entry.attendanceDate ?? entry.date ?? entryCheckIn(entry) ?? entryCheckOut(entry);
  return value ? String(value).slice(0, 10) : "";
}

/**
 * An ISO instant as a `datetime-local` input value, in the viewer's own zone.
 *
 * The form converts back with `new Date(value).toISOString()`, so both
 * directions run through the same local zone and the instant round-trips.
 * Formatting through `toISOString()` here instead would shift every seeded time
 * by the viewer's offset — the record would open showing a check-in an hour or
 * five from the one on the page above it.
 */
export function toLocalDateTimeInput(value: string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

export function originalsOf(entry: AttendanceEntrySeed): CorrectionOriginals {
  const mode = entry.attendanceMode ?? "";
  return {
    attendanceDate: entryAttendanceDate(entry),
    checkInAtUtc: entryCheckIn(entry),
    checkOutAtUtc: entryCheckOut(entry),
    // Only a mode a correction may actually request survives. An entry recorded
    // MACHINE or MANUAL describes how the punch arrived, not where the person
    // was, and seeding it would put a value in the selector that the selector
    // does not offer and the server would refuse.
    workMode: (REQUESTABLE_WORK_MODES as readonly string[]).includes(mode)
      ? mode
      : "",
    workSiteId: entry.officeLocationId ?? "",
  };
}

/**
 * The correction this record most likely needs.
 *
 * A starting point, never a decision: the employee can change it, and the type
 * they choose is what governs the form. Inferring it matters because the
 * alternative is opening every correction on "I forgot to check out" regardless
 * of what the record actually shows.
 */
export function inferCorrectionType(entry: AttendanceEntrySeed): CorrectionType {
  const checkIn = entryCheckIn(entry);
  const checkOut = entryCheckOut(entry);

  if (entry.status === "MISSED_CHECK_OUT") return "MISSED_CHECK_OUT";
  if (entry.status === "ABSENT" || entry.status === "ON_LEAVE") {
    return "ABSENCE_CORRECTION";
  }
  if (!checkIn && !checkOut) return "ABSENCE_CORRECTION";
  if (checkIn && !checkOut) return "MISSED_CHECK_OUT";
  if (!checkIn && checkOut) return "MISSED_CHECK_IN";

  // Both times are present, so nothing is missing and the likely complaint is
  // that one of them is wrong. "My check-in time is wrong" shows both fields
  // seeded, which is the same surface a check-out correction needs.
  return "LATE_CHECK_IN";
}

/** A draft that opens showing what the record already says. */
export function seedDraftFromEntry(entry: AttendanceEntrySeed): CorrectionDraft {
  const originals = originalsOf(entry);
  return {
    correctionType: inferCorrectionType(entry),
    attendanceDate: originals.attendanceDate,
    requestedCheckInAtUtc: toLocalDateTimeInput(originals.checkInAtUtc),
    requestedCheckOutAtUtc: toLocalDateTimeInput(originals.checkOutAtUtc),
    requestedWorkMode: originals.workMode,
    requestedWorkSiteId: originals.workSiteId,
    requestedOvertimeMinutes: "",
    fallbackReason: "",
    reason: "",
  };
}

/**
 * Whether a seeded draft actually asks for anything.
 *
 * Seeding creates a failure the blank form could not have: every field is
 * already filled in, so a request can be submitted that proposes exactly what
 * the record already says. That reaches the manager as a decision with no
 * subject. Only the fields the chosen type shows are compared — a value left
 * behind in a hidden field is never sent, so it is not a change.
 */
export function hasRequestedChange(
  draft: CorrectionDraft,
  entry: AttendanceEntrySeed,
): boolean {
  const seed = seedDraftFromEntry(entry);
  const shows = (field: CorrectionField) => showsField(draft.correctionType, field);

  if (draft.correctionType === "OVERTIME_APPROVAL") {
    // Overtime is a request for something the record does not hold at all, so
    // there is nothing for it to differ from.
    return Number(draft.requestedOvertimeMinutes) > 0;
  }

  const compared: CorrectionField[] = [
    "attendanceDate",
    "requestedCheckInAtUtc",
    "requestedCheckOutAtUtc",
    "requestedWorkMode",
    "requestedWorkSiteId",
  ];

  return compared.some(
    (field) =>
      shows(field) && (draft[field] ?? "").trim() !== (seed[field] ?? "").trim(),
  );
}

export type CorrectionChangeKind = "datetime" | "text" | "minutes";

export interface CorrectionChange {
  field: string;
  label: string;
  kind: CorrectionChangeKind;
  /** What the record says today. `null` where it holds nothing. */
  from: string | null;
  /** What the request asks for. */
  to: string | null;
}

/**
 * What a correction request is asking to change, and only that.
 *
 * The manager's whole decision is this list. It used to be two cards — "Original
 * Values" and "Requested Values" — listing check-in and check-out whether or not
 * either had moved, so an unchanged field looked exactly like a changed one and
 * a mode-only correction looked like no correction at all.
 *
 * The original side of a mode or site change is read from the linked attendance
 * entry, because the request stores no original for either. That is the entry as
 * it stands now rather than as it stood when the request was raised; the manager
 * is deciding against current truth, which is the comparison that matters.
 */
export function correctionChanges(request: {
  originalCheckInAtUtc?: string | null;
  originalCheckOutAtUtc?: string | null;
  requestedCheckInAtUtc?: string | null;
  requestedCheckOutAtUtc?: string | null;
  requestedWorkMode?: string | null;
  requestedWorkSiteId?: string | null;
  requestedOvertimeMinutes?: number | null;
  fallbackReason?: string | null;
  attendanceEntry?: {
    attendanceMode?: string | null;
    officeLocationId?: string | null;
  } | null;
}): CorrectionChange[] {
  const changes: CorrectionChange[] = [];

  const sameInstant = (a: string | null | undefined, b: string | null | undefined) => {
    if (!a || !b) return !a && !b;
    const left = new Date(a).getTime();
    const right = new Date(b).getTime();
    return (
      !Number.isNaN(left) && !Number.isNaN(right) && left === right
    );
  };

  if (
    request.requestedCheckInAtUtc &&
    !sameInstant(request.requestedCheckInAtUtc, request.originalCheckInAtUtc)
  ) {
    changes.push({
      field: "checkIn",
      label: "Check-in",
      kind: "datetime",
      from: request.originalCheckInAtUtc ?? null,
      to: request.requestedCheckInAtUtc,
    });
  }

  if (
    request.requestedCheckOutAtUtc &&
    !sameInstant(request.requestedCheckOutAtUtc, request.originalCheckOutAtUtc)
  ) {
    changes.push({
      field: "checkOut",
      label: "Check-out",
      kind: "datetime",
      from: request.originalCheckOutAtUtc ?? null,
      to: request.requestedCheckOutAtUtc,
    });
  }

  const originalMode = request.attendanceEntry?.attendanceMode ?? null;
  if (request.requestedWorkMode && request.requestedWorkMode !== originalMode) {
    changes.push({
      field: "workMode",
      label: "Work mode",
      kind: "text",
      from: originalMode,
      to: request.requestedWorkMode,
    });
  }

  const originalSite = request.attendanceEntry?.officeLocationId ?? null;
  if (request.requestedWorkSiteId && request.requestedWorkSiteId !== originalSite) {
    changes.push({
      field: "workSite",
      label: "Work site",
      kind: "text",
      from: originalSite,
      to: request.requestedWorkSiteId,
    });
  }

  if (request.requestedOvertimeMinutes) {
    changes.push({
      field: "overtimeMinutes",
      label: "Overtime requested",
      kind: "minutes",
      // The record holds no overtime, so there is no previous value to strike
      // through. Rendering "0" would claim one.
      from: null,
      to: String(request.requestedOvertimeMinutes),
    });
  }

  if (request.fallbackReason?.trim()) {
    changes.push({
      field: "fallbackReason",
      label: "Device could not be used",
      kind: "text",
      from: null,
      to: request.fallbackReason.trim(),
    });
  }

  return changes;
}

export function workModeLabel(mode: string): string {
  switch (mode) {
    case "REMOTE":
      return "Remote";
    case "FIELD":
      return "Field";
    case "HYBRID":
      return "Hybrid";
    case "MACHINE":
      return "Machine";
    case "MANUAL":
      return "Manual";
    case "OFFICE":
      return "Office";
    default:
      return mode;
  }
}
