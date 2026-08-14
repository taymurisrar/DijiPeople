/**
 * What an attendance attempt actually meant, and who should be told how.
 *
 * WHY THIS EXISTS. A refused check-in was being routed into the platform's
 * fatal-error dialog: an employee standing in their own office was shown
 * "ERROR VALIDATION_FAILED", a reference id and a "Download log" button, for the
 * entirely expected outcome that this office wants them to use the wall reader.
 * That dialog is for defects. Policy outcomes are not defects — they are the
 * system working, and they need a sentence the employee can act on.
 *
 * The split is drawn on the reason code, not on the status alone: a 422 with a
 * known attendance code is a business answer, a 500 or an unrecognised payload
 * is a defect and still belongs in the technical dialog with its trace id.
 *
 * Kept free of React so the Node test runner in this app can exercise it.
 */

export type AttendanceOutcomeKind =
  /** Recorded. */
  | "recorded"
  /** Refused for a reason the employee can act on. */
  | "policy"
  /** The browser could not produce a usable position. */
  | "location"
  /** Something genuinely went wrong; the technical dialog should handle it. */
  | "unexpected";

export type AttendanceOutcome = {
  readonly kind: AttendanceOutcomeKind;
  /** The stable code, preserved so tests and telemetry can assert on it. */
  readonly reasonCode: string;
  readonly title: string;
  readonly message: string;
  /** Retrying can plausibly succeed without the employee changing anything. */
  readonly canRetry: boolean;
  /** A fallback/approval request is genuinely available. */
  readonly fallbackAvailable: boolean;
  /** True only for `unexpected`: raise the platform's technical error dialog. */
  readonly useTechnicalErrorModal: boolean;
  /** Supporting numbers, where the server sent them. */
  readonly detail?: {
    readonly workSite?: string;
    readonly accuracyMeters?: number;
    readonly requiredAccuracyMeters?: number;
    readonly distanceMeters?: number;
  };
};

/**
 * Reason codes the attendance UI answers for itself.
 *
 * These are the API's own codes — `AttendanceWebAttendanceService` and
 * `AttendanceGeofenceService` emit them — plus the browser-side geolocation
 * failures, which never reach the server at all. Nothing here invents a parallel
 * code: an unknown code deliberately falls through to `unexpected` rather than
 * being guessed at, because silently rendering a friendly message for a failure
 * nobody has classified is how a real defect becomes invisible.
 */
export const ATTENDANCE_POLICY_REASON_CODES = [
  "WORK_SITE_REQUIRES_DEVICE",
  "WORK_SITE_REQUIRES_DEVICE_FALLBACK_AVAILABLE",
  "WORK_SITE_ATTENDANCE_DISABLED",
  "WORK_MODE_DISALLOWS_REMOTE",
  "WORK_MODE_DISALLOWS_OFFICE",
  "WEB_ATTENDANCE_DISABLED",
  "REMOTE_REQUIRES_APPROVAL",
  "METHOD_NOT_ALLOWED",
  "UNAUTHORIZED_WORK_SITE",
  "EMPLOYEE_NOT_FOUND",
] as const;

export const ATTENDANCE_LOCATION_REASON_CODES = [
  // Emitted by AttendanceGeofenceService when the reported position cannot be
  // trusted. These are the API's own names; the UI does not rename them.
  "ACCURACY_TOO_LOW",
  "COORDINATES_INVALID",
  "LOCATION_UNUSABLE",
  // Emitted by the browser capture in lib/location/location-capture.ts, which
  // never reaches the server at all.
  "PERMISSION_DENIED",
  "POSITION_UNAVAILABLE",
  "TIMEOUT",
  "UNSUPPORTED",
] as const;

/** Conflicts the employee resolves by looking at their own day, not by retrying. */
export const ATTENDANCE_CONFLICT_REASON_CODES = [
  "OPEN_SESSION_EXISTS",
  "ALREADY_CHECKED_IN",
] as const;

const POLICY_CODES = new Set<string>(ATTENDANCE_POLICY_REASON_CODES);
const LOCATION_CODES = new Set<string>(ATTENDANCE_LOCATION_REASON_CODES);
const CONFLICT_CODES = new Set<string>(ATTENDANCE_CONFLICT_REASON_CODES);

export type AttendanceFailurePayload = {
  readonly statusCode?: number;
  readonly errorCode?: string;
  readonly code?: string;
  readonly message?: string;
  readonly workSite?: string | null;
  readonly fallbackAvailable?: boolean;
  readonly accuracyMeters?: number | null;
  readonly requiredAccuracyMeters?: number | null;
  readonly distanceMeters?: number | null;
};

/**
 * Classifies a failed attendance attempt.
 *
 * A status outside the expected business range routes to the technical dialog
 * even when the code looks familiar: a 500 that happens to carry an attendance
 * code is still a server fault, and hiding it behind a friendly sentence would
 * lose the trace id somebody needs.
 */
export function classifyAttendanceFailure(
  payload: AttendanceFailurePayload | null | undefined,
): AttendanceOutcome {
  const reasonCode = (payload?.errorCode || payload?.code || "").trim();
  const statusCode = payload?.statusCode ?? 0;
  const businessStatus =
    statusCode === 400 || statusCode === 409 || statusCode === 422;
  const detail = readDetail(payload);

  if (reasonCode && LOCATION_CODES.has(reasonCode) && (businessStatus || !statusCode)) {
    return locationOutcome(reasonCode, payload, detail);
  }

  if (reasonCode && POLICY_CODES.has(reasonCode) && businessStatus) {
    return policyOutcome(reasonCode, payload, detail);
  }

  if (reasonCode && CONFLICT_CODES.has(reasonCode) && businessStatus) {
    return {
      kind: "policy",
      reasonCode,
      title: "You already have an open session",
      message:
        payload?.message ||
        "You are already checked in. Check out to close the current session first.",
      canRetry: false,
      fallbackAvailable: false,
      useTechnicalErrorModal: false,
      detail,
    };
  }

  /*
   * A 409 with no code is still a conflict the employee can understand — the
   * API raises plain ConflictExceptions for "already checked in today" and
   * approved-leave clashes — so it is answered inline with the server's own
   * sentence rather than escalated.
   */
  if (statusCode === 409) {
    return {
      kind: "policy",
      reasonCode: reasonCode || "ATTENDANCE_CONFLICT",
      title: "Attendance not recorded",
      message: payload?.message || "This attendance action conflicts with your day.",
      canRetry: false,
      fallbackAvailable: false,
      useTechnicalErrorModal: false,
      detail,
    };
  }

  return {
    kind: "unexpected",
    reasonCode: reasonCode || "SYSTEM_UNEXPECTED_ERROR",
    title: "Attendance could not be recorded",
    message:
      payload?.message ||
      "Something went wrong while recording your attendance. Please try again.",
    canRetry: true,
    fallbackAvailable: false,
    useTechnicalErrorModal: true,
    detail,
  };
}

function policyOutcome(
  reasonCode: string,
  payload: AttendanceFailurePayload | null | undefined,
  detail: AttendanceOutcome["detail"],
): AttendanceOutcome {
  const workSite = payload?.workSite?.trim() || "";
  const fallbackAvailable = payload?.fallbackAvailable === true;

  if (
    reasonCode === "WORK_SITE_REQUIRES_DEVICE" ||
    reasonCode === "WORK_SITE_REQUIRES_DEVICE_FALLBACK_AVAILABLE"
  ) {
    return {
      kind: "policy",
      reasonCode,
      title: workSite ? `You're at ${workSite}` : "Use an attendance device",
      message:
        payload?.message ||
        `Attendance at ${workSite || "this work site"} must be recorded using an attendance device. Please use the attendance machine to check in.`,
      canRetry: false,
      fallbackAvailable,
      useTechnicalErrorModal: false,
      detail,
    };
  }

  if (reasonCode === "METHOD_NOT_ALLOWED") {
    return {
      kind: "policy",
      reasonCode,
      title: workSite ? `You're at ${workSite}` : "This method is not available here",
      message:
        payload?.message ||
        "This work site does not accept attendance from the web app.",
      canRetry: false,
      fallbackAvailable,
      useTechnicalErrorModal: false,
      detail,
    };
  }

  if (reasonCode === "WORK_MODE_DISALLOWS_REMOTE") {
    return {
      kind: "policy",
      reasonCode,
      title: "Remote check-in is not available for you",
      message:
        payload?.message ||
        "Your attendance policy allows office work only. Please check in at your work site, or ask your manager to record this attendance.",
      canRetry: false,
      fallbackAvailable,
      useTechnicalErrorModal: false,
      detail,
    };
  }

  if (reasonCode === "REMOTE_REQUIRES_APPROVAL") {
    return {
      kind: "policy",
      reasonCode,
      title: "Remote attendance needs approval",
      message:
        payload?.message ||
        "Remote attendance needs approval in your organisation. Submit a request and your manager will review it.",
      canRetry: false,
      fallbackAvailable: true,
      useTechnicalErrorModal: false,
      detail,
    };
  }

  return {
    kind: "policy",
    reasonCode,
    title: "Attendance not recorded",
    message:
      payload?.message ||
      "Your attendance policy does not allow this check-in right now.",
    canRetry: false,
    fallbackAvailable,
    useTechnicalErrorModal: false,
    detail,
  };
}

function locationOutcome(
  reasonCode: string,
  payload: AttendanceFailurePayload | null | undefined,
  detail: AttendanceOutcome["detail"],
): AttendanceOutcome {
  if (reasonCode === "PERMISSION_DENIED") {
    return {
      kind: "location",
      reasonCode,
      title: "Location access is required",
      message:
        "Location access is required to check in remotely. Allow location access for DijiPeople in your browser and try again.",
      canRetry: true,
      fallbackAvailable: false,
      useTechnicalErrorModal: false,
      detail,
    };
  }

  if (reasonCode === "TIMEOUT") {
    return {
      kind: "location",
      reasonCode,
      title: "We couldn't get your current location",
      message:
        "Getting your location took too long. Check that location services are enabled and try again.",
      canRetry: true,
      fallbackAvailable: false,
      useTechnicalErrorModal: false,
      detail,
    };
  }

  if (reasonCode === "UNSUPPORTED") {
    return {
      kind: "location",
      reasonCode,
      title: "This device cannot share its location",
      message:
        "This browser does not support location capture, so web attendance is unavailable here. Please use an attendance device or ask your manager to record this attendance.",
      canRetry: false,
      fallbackAvailable: false,
      useTechnicalErrorModal: false,
      detail,
    };
  }

  if (
    reasonCode === "POSITION_UNAVAILABLE" ||
    reasonCode === "COORDINATES_INVALID" ||
    reasonCode === "LOCATION_UNUSABLE"
  ) {
    return {
      kind: "location",
      reasonCode,
      title: "We couldn't get your current location",
      message:
        "Check that location services are enabled on your device and try again.",
      canRetry: true,
      fallbackAvailable: false,
      useTechnicalErrorModal: false,
      detail,
    };
  }

  return {
    kind: "location",
    reasonCode,
    title: "We couldn't verify your location accurately enough",
    message: accuracyMessage(detail),
    canRetry: true,
    fallbackAvailable: payload?.fallbackAvailable === true,
    useTechnicalErrorModal: false,
    detail,
  };
}

/**
 * The accuracy sentence, with the two numbers only when both are known.
 *
 * Reporting "required: 0 m" because a value was missing would be worse than
 * saying nothing, so a partial payload degrades to the plain instruction.
 */
function accuracyMessage(detail: AttendanceOutcome["detail"]) {
  const advice =
    "Turn on Precise Location or move somewhere with a better GPS signal, then try again.";

  if (
    typeof detail?.accuracyMeters === "number" &&
    typeof detail?.requiredAccuracyMeters === "number"
  ) {
    return `Your device reported an accuracy of ${formatMeters(
      detail.accuracyMeters,
    )}, and this work site requires ${formatMeters(
      detail.requiredAccuracyMeters,
    )} or better. ${advice}`;
  }

  return advice;
}

export function formatMeters(value: number) {
  return `${Math.round(value).toLocaleString("en-US")} m`;
}

/**
 * Maps a browser geolocation failure onto the same shape as a server refusal.
 *
 * The two are the same event to the employee — "we could not check you in, here
 * is what to do" — so they render through one component rather than two that
 * drift apart.
 */
export function classifyLocationCaptureFailure(input: {
  readonly reason: string;
  readonly message?: string;
}): AttendanceOutcome {
  const outcome = classifyAttendanceFailure({
    statusCode: 422,
    errorCode: input.reason,
    message: input.message,
  });

  return outcome.kind === "unexpected"
    ? {
        ...outcome,
        kind: "location",
        title: "We couldn't get your current location",
        message:
          input.message ||
          "Check that location services are enabled and try again.",
        canRetry: true,
        useTechnicalErrorModal: false,
      }
    : outcome;
}

function readDetail(
  payload: AttendanceFailurePayload | null | undefined,
): AttendanceOutcome["detail"] {
  const detail = {
    workSite: payload?.workSite?.trim() || undefined,
    accuracyMeters: finiteOrUndefined(payload?.accuracyMeters),
    requiredAccuracyMeters: finiteOrUndefined(payload?.requiredAccuracyMeters),
    distanceMeters: finiteOrUndefined(payload?.distanceMeters),
  };

  return Object.values(detail).some((value) => value !== undefined)
    ? detail
    : undefined;
}

function finiteOrUndefined(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}
