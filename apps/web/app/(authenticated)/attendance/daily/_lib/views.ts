/**
 * The named views the manager daily review offers.
 *
 * Each one maps to a REAL server-side predicate in
 * `AttendanceEngineService.viewFilter`. That matters: filtering the current page
 * in the browser would tell a reviewer "3 hybrid days" when the real answer was
 * ninety, and a count that only describes page one is worse than no count.
 *
 * Kept as data rather than hard-coded tabs so the same definitions can be
 * asserted in a test without a browser.
 */

export const TEAM_DAY_VIEWS = [
  {
    key: "ALL",
    label: "All days",
    description: "Every reconciled day in the range.",
  },
  {
    key: "NEEDS_REVIEW",
    label: "Needs review",
    description: "Days with an open exception.",
  },
  {
    key: "PENDING_RECONCILIATION",
    label: "Processing",
    description:
      "Evidence has arrived but the day has not been reconciled yet. Its totals are not final.",
  },
  {
    key: "MISSING_PUNCHES",
    label: "Missing punches",
    description: "A check-in or check-out was never recorded.",
  },
  {
    key: "HYBRID",
    label: "Hybrid attendance",
    description:
      "Days worked in more than one mode, from the derived result rather than the employee's configured arrangement.",
  },
  {
    key: "PENDING_CORRECTIONS",
    label: "Pending corrections",
    description: "A correction request is awaiting approval.",
  },
  {
    key: "LOCKED",
    label: "Finalised",
    description: "Days locked because payroll has consumed them.",
  },
  {
    key: "LOCKED_WITH_NEW_EVIDENCE",
    label: "Finalised — review required",
    description:
      "A punch arrived after the day was finalised. The recorded attendance was NOT changed.",
  },
  {
    key: "ATTENDANCE_DURING_LEAVE",
    label: "Attendance during leave",
    description: "Attendance recorded on a day of approved leave.",
  },
  {
    key: "UNAUTHORIZED_WORK_SITE",
    label: "Unexpected work site",
    description: "A punch from a site the employee is not assigned to.",
  },
] as const;

export type TeamDayViewKey = (typeof TEAM_DAY_VIEWS)[number]["key"];

export const TEAM_DAY_VIEW_KEYS: readonly TeamDayViewKey[] = TEAM_DAY_VIEWS.map(
  (view) => view.key,
);

export function isTeamDayView(value: string): value is TeamDayViewKey {
  return (TEAM_DAY_VIEW_KEYS as readonly string[]).includes(value);
}

export function teamDayViewLabel(key: string): string {
  return TEAM_DAY_VIEWS.find((view) => view.key === key)?.label ?? key;
}

export function teamDayViewDescription(key: string): string | null {
  return TEAM_DAY_VIEWS.find((view) => view.key === key)?.description ?? null;
}

export type TeamDayRow = {
  id: string;
  attendanceDate: string;
  /** The projected AttendanceEntry, null until the day has been reconciled. */
  attendanceEntryId: string | null;
  employee: { id: string; employeeCode: string | null; name: string };
  shift: { id: string; name: string } | null;
  status: string;
  /** True while the engine still has unprocessed evidence for the day. */
  reconciliationPending: boolean;
  firstCheckInAt: string | null;
  lastCheckOutAt: string | null;
  workedMinutes: number;
  scheduledMinutes: number;
  derivedWorkMode: string | null;
  lateMinutes: number;
  earlyDepartureMinutes: number;
  extraMinutes: number;
  approvedOvertimeMinutes: number;
  openExceptionCount: number;
  pendingCorrectionCount: number;
  locked: boolean;
  onLeave: boolean;
  isHoliday: boolean;
  isWeekend: boolean;
};

export type TeamDayResponse = {
  view: string;
  items: TeamDayRow[];
  page: number;
  pageSize: number;
  total: number;
};
