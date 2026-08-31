import type { ReportFilterInput } from '../engine/filter.model';
import type { PeriodPreset } from '../engine/period.engine';

/**
 * Standard reports.
 *
 * Code-defined rather than seeded, because a standard report is part of the
 * product, not tenant data: it should arrive with a deploy, be identical in
 * every tenant, and be impossible for a tenant to edit into something that no
 * longer matches its name. Custom reports are the persisted half
 * (`ReportDefinition`); these are addressed as `std:<key>`.
 *
 * Each one names field keys from the semantic registry. Nothing here is
 * privileged: a standard report runs through the same engine, the same row
 * scope and the same field security as anything a user builds, so a column a
 * caller may not see is dropped for them rather than escaping through a
 * "system" report.
 */
export interface StandardReport {
  key: string;
  name: string;
  description: string;
  /** Grouping in the library UI. */
  category: 'workforce' | 'attendance' | 'leave' | 'recruitment' | 'desktop';
  sourceKey: string;
  columns: string[];
  filters?: ReportFilterInput[];
  sortField?: string;
  sortDirection?: 'asc' | 'desc';
  preset?: PeriodPreset;
  /**
   * Whether the period narrows this report at all.
   *
   * A directory is a statement about who is employed *now*; filtering it by
   * `hireDate` because a period selector happens to be on screen would silently
   * turn "all employees" into "employees hired in the last 30 days". Reports
   * that describe a current population set this false; reports that describe
   * events in a window leave it true.
   */
  appliesPeriod: boolean;
  caveats?: string[];
}

const EMPLOYEE_IDENTITY = [
  'workforce.employee_code',
  'workforce.first_name',
  'workforce.last_name',
];

const EMPLOYEE_PLACEMENT = [
  'workforce.department',
  'workforce.designation',
  'workforce.business_unit',
  'workforce.location',
  'workforce.manager',
];

export const STANDARD_REPORTS: readonly StandardReport[] = [
  // ── Workforce ──────────────────────────────────────────────────────────
  {
    key: 'workforce.directory',
    name: 'Employee Directory',
    description:
      'Every employee you can see, with their placement and employment status.',
    category: 'workforce',
    sourceKey: 'workforce',
    columns: [
      ...EMPLOYEE_IDENTITY,
      'workforce.work_email',
      ...EMPLOYEE_PLACEMENT,
      'workforce.employment_status',
      'workforce.employment_type',
      'workforce.hire_date',
    ],
    sortField: 'workforce.last_name',
    sortDirection: 'asc',
    appliesPeriod: false,
  },
  {
    key: 'workforce.active-employees',
    name: 'Active Employees',
    description: 'Employees currently in active service.',
    category: 'workforce',
    sourceKey: 'workforce',
    columns: [
      ...EMPLOYEE_IDENTITY,
      ...EMPLOYEE_PLACEMENT,
      'workforce.employment_type',
      'workforce.hire_date',
    ],
    filters: [
      { field: 'workforce.employment_status', operator: 'eq', value: 'ACTIVE' },
    ],
    sortField: 'workforce.hire_date',
    sortDirection: 'desc',
    appliesPeriod: false,
  },
  {
    key: 'workforce.probation',
    name: 'Employees on Probation',
    description:
      'Employees whose employment status is probation, with their probation end date.',
    category: 'workforce',
    sourceKey: 'workforce',
    columns: [
      ...EMPLOYEE_IDENTITY,
      'workforce.department',
      'workforce.manager',
      'workforce.hire_date',
      'workforce.probation_end_date',
      'workforce.confirmation_date',
    ],
    filters: [
      {
        field: 'workforce.employment_status',
        operator: 'eq',
        value: 'PROBATION',
      },
    ],
    sortField: 'workforce.probation_end_date',
    sortDirection: 'asc',
    appliesPeriod: false,
  },
  {
    key: 'workforce.notice-period',
    name: 'Employees Serving Notice',
    description: 'Employees serving notice, with their termination date.',
    category: 'workforce',
    sourceKey: 'workforce',
    columns: [
      ...EMPLOYEE_IDENTITY,
      'workforce.department',
      'workforce.manager',
      'workforce.notice_period_days',
      'workforce.termination_date',
    ],
    filters: [
      { field: 'workforce.employment_status', operator: 'eq', value: 'NOTICE' },
    ],
    sortField: 'workforce.termination_date',
    sortDirection: 'asc',
    appliesPeriod: false,
  },
  {
    key: 'workforce.joiners',
    name: 'Joiners',
    description: 'Employees who joined during the selected period.',
    category: 'workforce',
    sourceKey: 'workforce',
    columns: [
      ...EMPLOYEE_IDENTITY,
      'workforce.hire_date',
      ...EMPLOYEE_PLACEMENT,
      'workforce.employment_type',
    ],
    sortField: 'workforce.hire_date',
    sortDirection: 'desc',
    preset: 'last_30_days',
    appliesPeriod: true,
  },
  {
    key: 'workforce.headcount-history',
    name: 'Headcount History',
    description:
      'Daily headcount from the workforce snapshot, broken down by placement.',
    category: 'workforce',
    sourceKey: 'workforce_history',
    columns: [
      'workforce_history.snapshot_date',
      'workforce_history.employee_code',
      'workforce_history.department',
      'workforce_history.business_unit',
      'workforce_history.employment_status',
      'workforce_history.is_joiner',
      'workforce_history.is_leaver',
      'workforce_history.derivation',
    ],
    sortField: 'workforce_history.snapshot_date',
    sortDirection: 'desc',
    preset: 'last_30_days',
    appliesPeriod: true,
    caveats: [
      'Rows marked BACKFILLED were reconstructed from hire and termination dates. They place an employee in their current department, not the one they were in at the time.',
      'History begins on the day the snapshot job was first enabled for this tenant.',
    ],
  },

  // ── Attendance ─────────────────────────────────────────────────────────
  {
    key: 'attendance.daily',
    name: 'Daily Attendance',
    description:
      'One row per employee per day, with scheduled and worked minutes.',
    category: 'attendance',
    sourceKey: 'attendance',
    columns: [
      'attendance.attendance_date',
      'attendance.employee',
      'attendance.status',
      'attendance.scheduled_minutes',
      'attendance.worked_minutes',
      'attendance.late_minutes',
      'attendance.early_departure_minutes',
      'attendance.first_check_in_at',
      'attendance.last_check_out_at',
      'attendance.derived_work_mode',
    ],
    sortField: 'attendance.attendance_date',
    sortDirection: 'desc',
    preset: 'last_30_days',
    appliesPeriod: true,
    caveats: [
      'Only days the attendance engine has reconciled appear here.',
      'Days still PENDING are excluded from rates, because the engine has not finished with them.',
    ],
  },
  {
    key: 'attendance.late-arrivals',
    name: 'Late Arrivals',
    description: 'Days on which an employee arrived after their shift start.',
    category: 'attendance',
    sourceKey: 'attendance',
    columns: [
      'attendance.attendance_date',
      'attendance.employee',
      'attendance.late_minutes',
      'attendance.first_check_in_at',
      'attendance.status',
      'attendance.derived_work_mode',
    ],
    filters: [{ field: 'attendance.late_minutes', operator: 'gt', value: 0 }],
    sortField: 'attendance.late_minutes',
    sortDirection: 'desc',
    preset: 'last_30_days',
    appliesPeriod: true,
  },
  {
    key: 'attendance.exceptions',
    name: 'Attendance Exceptions',
    description: 'Days carrying at least one unresolved attendance exception.',
    category: 'attendance',
    sourceKey: 'attendance',
    columns: [
      'attendance.attendance_date',
      'attendance.employee',
      'attendance.open_exception_count',
      'attendance.status',
      'attendance.first_check_in_at',
      'attendance.last_check_out_at',
    ],
    filters: [
      { field: 'attendance.open_exception_count', operator: 'gt', value: 0 },
    ],
    sortField: 'attendance.open_exception_count',
    sortDirection: 'desc',
    preset: 'last_30_days',
    appliesPeriod: true,
  },
  {
    key: 'attendance.missing-check-out',
    name: 'Missing Check-Out',
    description:
      'Days with a check-in and no check-out. Usually a forgotten punch rather than an absence.',
    category: 'attendance',
    sourceKey: 'attendance',
    columns: [
      'attendance.attendance_date',
      'attendance.employee',
      'attendance.first_check_in_at',
      'attendance.status',
      'attendance.worked_minutes',
    ],
    filters: [
      { field: 'attendance.last_check_out_at', operator: 'isnull' },
      { field: 'attendance.first_check_in_at', operator: 'isnotnull' },
    ],
    sortField: 'attendance.attendance_date',
    sortDirection: 'desc',
    preset: 'last_30_days',
    appliesPeriod: true,
  },

  // ── Leave ──────────────────────────────────────────────────────────────
  {
    key: 'leave.requests',
    name: 'Leave Requests',
    description: 'Leave requests raised in the selected period, any status.',
    category: 'leave',
    sourceKey: 'leave_requests',
    columns: [
      'leave_requests.employee',
      'leave_requests.leave_type',
      'leave_requests.status',
      'leave_requests.start_date',
      'leave_requests.end_date',
      'leave_requests.total_days',
      'leave_requests.requested_at',
      'leave_requests.decided_at',
    ],
    sortField: 'leave_requests.start_date',
    sortDirection: 'desc',
    preset: 'last_30_days',
    appliesPeriod: true,
  },
  {
    key: 'leave.approved',
    name: 'Approved Leave',
    description: 'Approved leave starting in the selected period.',
    category: 'leave',
    sourceKey: 'leave_requests',
    columns: [
      'leave_requests.employee',
      'leave_requests.leave_type',
      'leave_requests.start_date',
      'leave_requests.end_date',
      'leave_requests.total_days',
      'leave_requests.department',
    ],
    filters: [
      { field: 'leave_requests.status', operator: 'eq', value: 'APPROVED' },
    ],
    sortField: 'leave_requests.start_date',
    sortDirection: 'asc',
    preset: 'last_30_days',
    appliesPeriod: true,
  },
  {
    key: 'leave.pending',
    name: 'Pending Leave Requests',
    description: 'Leave requests still awaiting a decision.',
    category: 'leave',
    sourceKey: 'leave_requests',
    columns: [
      'leave_requests.employee',
      'leave_requests.leave_type',
      'leave_requests.start_date',
      'leave_requests.end_date',
      'leave_requests.total_days',
      'leave_requests.requested_at',
      'leave_requests.manager',
    ],
    filters: [
      { field: 'leave_requests.status', operator: 'eq', value: 'PENDING' },
    ],
    sortField: 'leave_requests.requested_at',
    sortDirection: 'asc',
    appliesPeriod: false,
  },
  {
    key: 'leave.balances',
    name: 'Leave Balances',
    description: 'Current leave balance per employee and leave type.',
    category: 'leave',
    sourceKey: 'leave_balances',
    columns: [
      'leave_balances.employee',
      'leave_balances.leave_type',
      'leave_balances.total_allocated',
      'leave_balances.total_used',
      'leave_balances.total_remaining',
      'leave_balances.department',
      'leave_balances.last_updated_at',
    ],
    sortField: 'leave_balances.total_remaining',
    sortDirection: 'asc',
    appliesPeriod: false,
    caveats: [
      'Balances are current state only. LeaveBalance has no period column, so a balance cannot be reported as it stood on a past date.',
    ],
  },

  // ── Recruitment ────────────────────────────────────────────────────────
  {
    key: 'recruitment.open-jobs',
    name: 'Open Jobs',
    description: 'Job openings currently open.',
    category: 'recruitment',
    sourceKey: 'recruitment_openings',
    columns: [
      'recruitment_openings.title',
      'recruitment_openings.code',
      'recruitment_openings.status',
      'recruitment_openings.pipeline',
      'recruitment_openings.created_at',
    ],
    filters: [
      { field: 'recruitment_openings.status', operator: 'eq', value: 'OPEN' },
    ],
    sortField: 'recruitment_openings.created_at',
    sortDirection: 'desc',
    appliesPeriod: false,
    caveats: [
      'JobOpening carries no department, hiring manager, opening date or headcount, so requisition ageing and fill rate cannot be reported.',
    ],
  },
  {
    key: 'recruitment.applications',
    name: 'Applications',
    description:
      'Applications received in the selected period, with their stage.',
    category: 'recruitment',
    sourceKey: 'recruitment_applications',
    columns: [
      'recruitment_applications.candidate',
      'recruitment_applications.job_opening',
      'recruitment_applications.stage',
      'recruitment_applications.applied_at',
      'recruitment_applications.moved_at',
      'recruitment_applications.recruiter',
      'recruitment_applications.candidate_source',
    ],
    sortField: 'recruitment_applications.applied_at',
    sortDirection: 'desc',
    preset: 'last_30_days',
    appliesPeriod: true,
    caveats: [
      'Candidate source is free text with no controlled vocabulary, so source effectiveness groups on whatever was typed.',
    ],
  },
  {
    key: 'recruitment.hires',
    name: 'Hires',
    description: 'Applications that reached the hired stage.',
    category: 'recruitment',
    sourceKey: 'recruitment_applications',
    columns: [
      'recruitment_applications.candidate',
      'recruitment_applications.job_opening',
      'recruitment_applications.applied_at',
      'recruitment_applications.moved_at',
      'recruitment_applications.recruiter',
      'recruitment_applications.candidate_source',
    ],
    filters: [
      {
        field: 'recruitment_applications.stage',
        operator: 'eq',
        value: 'HIRED',
      },
    ],
    sortField: 'recruitment_applications.moved_at',
    sortDirection: 'desc',
    preset: 'year_to_date',
    appliesPeriod: true,
  },
  {
    key: 'recruitment.stage-transitions',
    name: 'Pipeline Movement',
    description:
      'Every stage change in the period — the basis for funnel conversion and time in stage.',
    category: 'recruitment',
    sourceKey: 'recruitment_stage_transitions',
    columns: [
      'recruitment_stage_transitions.application',
      'recruitment_stage_transitions.from_stage',
      'recruitment_stage_transitions.to_stage',
      'recruitment_stage_transitions.changed_at',
      'recruitment_stage_transitions.job_opening',
    ],
    sortField: 'recruitment_stage_transitions.changed_at',
    sortDirection: 'desc',
    preset: 'last_30_days',
    appliesPeriod: true,
  },

  // ── Desktop activity ───────────────────────────────────────────────────
  {
    key: 'desktop.work-activity',
    name: 'Work Activity',
    description:
      'Daily active, idle and away time reported by the desktop agent.',
    category: 'desktop',
    sourceKey: 'desktop_activity',
    columns: [
      'desktop_activity.date',
      'desktop_activity.employee',
      'desktop_activity.active_seconds',
      'desktop_activity.idle_seconds',
      'desktop_activity.away_seconds',
      'desktop_activity.logged_in_seconds',
      'desktop_activity.department',
    ],
    sortField: 'desktop_activity.date',
    sortDirection: 'desc',
    preset: 'last_30_days',
    appliesPeriod: true,
    caveats: [
      'The day boundary is UTC, not the tenant timezone, so a day here does not line up with the attendance day.',
      'Totals are nominal — samples multiplied by the configured heartbeat interval — not measured elapsed time. Time when the agent was not running is absent, not zero.',
      'Rows written before the heartbeat idempotency fix are known to be inflated and were never corrected (ITEM-0032).',
      'The lookback is bounded by the tenant’s telemetry retention window, 90 days by default.',
    ],
  },
  {
    key: 'desktop.device-coverage',
    name: 'Device Coverage',
    description:
      'Registered devices, their operating system, agent version and when each last reported.',
    category: 'desktop',
    sourceKey: 'desktop_devices',
    columns: [
      'desktop_devices.employee',
      'desktop_devices.device_name',
      'desktop_devices.os',
      'desktop_devices.platform',
      'desktop_devices.agent_version',
      'desktop_devices.last_seen_at',
      'desktop_devices.is_active',
    ],
    sortField: 'desktop_devices.last_seen_at',
    sortDirection: 'desc',
    appliesPeriod: false,
    caveats: [
      'A device that has never reported has no last-seen value. That is a device that was registered and never used, not an employee who was absent.',
    ],
  },
];

const BY_KEY: ReadonlyMap<string, StandardReport> = new Map(
  STANDARD_REPORTS.map((report) => [report.key, report]),
);

export function getStandardReport(key: string): StandardReport | undefined {
  return BY_KEY.get(key);
}

export function listStandardReports(): readonly StandardReport[] {
  return STANDARD_REPORTS;
}
