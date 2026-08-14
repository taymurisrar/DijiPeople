/**
 * Shapes the exception workspace reads.
 *
 * Deliberately without coordinates. The list API does not return them and this
 * type does not admit them, so a future field cannot arrive here by accident and
 * find its way into a table every manager can open.
 */

export type AttendanceExceptionStatus =
  | "OPEN"
  | "RESOLVED"
  | "IGNORED"
  | "APPROVED"
  | "REJECTED";

export type AttendanceExceptionSeverity = "INFO" | "WARNING" | "BLOCKING";

export type AttendanceExceptionRow = {
  id: string;
  type: string;
  status: AttendanceExceptionStatus;
  severity: AttendanceExceptionSeverity;
  message: string;
  attendanceDate: string;
  detectedAt: string;
  employee: {
    id: string;
    employeeCode: string | null;
    name: string;
  };
  workSite: { id: string; name: string } | null;
};

export type AttendanceExceptionListResponse = {
  items: AttendanceExceptionRow[];
  page: number;
  pageSize: number;
  total: number;
};

export type AttendanceExceptionSummaryResponse = {
  open: number;
  critical: number;
  missingPunch: number;
  leaveConflict: number;
  workSiteConflict: number;
  lockedPeriod: number;
};

/** The exception types the workspace filters by, in triage order. */
export const EXCEPTION_TYPE_OPTIONS = [
  { value: "MISSING_CHECKOUT", label: "No check-out recorded" },
  { value: "MISSING_CHECKIN", label: "No check-in recorded" },
  { value: "OVERLAPPING_SESSION", label: "Overlapping work periods" },
  { value: "UNKNOWN_PUNCH_DIRECTION", label: "Unclear punch" },
  { value: "ATTENDANCE_DURING_LEAVE", label: "Attendance during leave" },
  { value: "UNAUTHORIZED_WORK_SITE", label: "Unexpected work site" },
  { value: "CROSS_SITE_SESSION", label: "Started and ended at different sites" },
  { value: "LOCKED_PERIOD_EVENT", label: "Arrived after finalisation" },
  { value: "LATE_ARRIVING_EVENT", label: "Attendance arrived late" },
  { value: "GEOFENCE_FAILURE", label: "Location outside the work site" },
  { value: "GPS_ACCURACY_FAILURE", label: "Location not accurate enough" },
  { value: "WORK_MODE_POLICY_CONFLICT", label: "Work arrangement conflict" },
  { value: "ATTENDANCE_OUTSIDE_EMPLOYMENT", label: "Outside employment" },
  { value: "DEVICE_CLOCK_WARNING", label: "Device clock drift" },
  { value: "HOLIDAY_WORK", label: "Worked on a holiday" },
  { value: "WEEKEND_WORK", label: "Worked on a non-working day" },
  { value: "DUPLICATE_SEMANTIC_PUNCH", label: "Repeated punch" },
  { value: "IMPOSSIBLE_TRAVEL", label: "Implausible travel" },
] as const;

export const EXCEPTION_STATUS_OPTIONS = [
  { value: "OPEN", label: "Open" },
  { value: "RESOLVED", label: "Resolved" },
  { value: "IGNORED", label: "Ignored" },
  { value: "APPROVED", label: "Approved" },
  { value: "REJECTED", label: "Rejected" },
] as const;

/** Business wording for an exception type. Never the enum, never a vendor code. */
export function exceptionTypeLabel(type: string): string {
  return (
    EXCEPTION_TYPE_OPTIONS.find((option) => option.value === type)?.label ?? type
  );
}

export function exceptionStatusLabel(status: string): string {
  return (
    EXCEPTION_STATUS_OPTIONS.find((option) => option.value === status)?.label ??
    status
  );
}

export function severityLabel(severity: string): string {
  switch (severity) {
    case "BLOCKING":
      return "Critical";
    case "WARNING":
      return "Needs review";
    case "INFO":
    default:
      return "For information";
  }
}

/**
 * BLOCKING is "danger" because the day's numbers cannot be trusted while it
 * stands; WARNING is worth seeing but does not invalidate the result.
 */
export function severityTone(
  severity: string,
): "danger" | "warning" | "neutral" {
  switch (severity) {
    case "BLOCKING":
      return "danger";
    case "WARNING":
      return "warning";
    case "INFO":
    default:
      return "neutral";
  }
}

export function statusTone(
  status: string,
): "good" | "warning" | "muted" | "danger" {
  switch (status) {
    case "RESOLVED":
    case "APPROVED":
      return "good";
    case "REJECTED":
      return "danger";
    case "IGNORED":
      return "muted";
    case "OPEN":
    default:
      return "warning";
  }
}
