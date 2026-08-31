import { AttendanceDayStatus, EmployeeWorkMode } from '@prisma/client';
import { ENTITY_KEYS } from '../../../../common/constants/rbac-matrix';
import { TENANT_FEATURE_KEYS } from '../../../../common/constants/tenant-features';
import type {
  ReportDataSource,
  ReportFieldDefinition,
} from '../semantic.types';
import { employeeDimensionFields } from './workforce.source';

/**
 * Attendance — one row per employee per shift-day.
 *
 * **This is built on `AttendanceDay`, never on `AttendanceEntry`.** The two
 * models are not interchangeable and choosing the wrong one produces numbers
 * that look plausible and are not:
 *
 *   - `AttendanceEntry.workedMinutes` is nullable and is only populated once a
 *     day has been reconciled, so summing it silently omits every unreconciled
 *     day rather than reporting that they are missing.
 *   - `AttendanceEntry` has no scheduled denominator at all, so an attendance
 *     *rate* cannot be computed from it. Every rate here divides by
 *     `scheduledMinutes`, which only `AttendanceDay` carries.
 *
 * **`PENDING` is excluded in `baseWhere`, not in each metric.** An
 * `AttendanceDayStatus` of `PENDING` means the reconciliation engine has not
 * finished with the day — the minutes on it are not yet a fact. Leaving those
 * rows in a denominator makes a tenant's attendance rate sag every morning and
 * recover through the day, which reads as a workforce problem and is a pipeline
 * artefact. Excluding it once, here, means no metric can forget to; the cost is
 * that a reconciliation-backlog report cannot be built on this source and needs
 * one of its own.
 *
 * **A shift-day is not a calendar day.** An overnight 21:00 to 06:00 shift is
 * ONE row whose punches straddle midnight, dated to the shift. Joining these
 * rows to a calendar-dated source by date will not line up.
 */

/** Minute columns that behave identically: sum, average, floor and ceiling. */
const minutesField = (args: {
  name: string;
  label: string;
  description: string;
  column: string;
}): ReportFieldDefinition => ({
  key: `attendance.${args.name}`,
  label: args.label,
  description: args.description,
  type: 'duration_minutes',
  path: args.column,
  format: 'duration',
  reportable: true,
  filterable: true,
  sortable: true,
  aggregatable: true,
  supportedAggregations: ['sum', 'avg', 'min', 'max'],
});

const flagField = (args: {
  name: string;
  label: string;
  description: string;
  column: string;
}): ReportFieldDefinition => ({
  key: `attendance.${args.name}`,
  label: args.label,
  description: args.description,
  type: 'boolean',
  path: args.column,
  reportable: true,
  filterable: true,
  groupable: true,
  groupByField: args.column,
});

export const ATTENDANCE_SOURCE: ReportDataSource = {
  key: 'attendance',
  label: 'Attendance',
  description:
    'Reconciled attendance days. One row per employee per shift-day, with the scheduled minutes every rate divides by.',
  prismaModel: 'attendanceDay',
  rbacEntityKey: ENTITY_KEYS.ATTENDANCE,
  scope: {
    // `AttendanceDay` carries tenantId and employeeId and nothing else the
    // access helpers know how to scope on: no businessUnitId, no organizationId,
    // no userId, no ownerUserId, no createdById. Row scope below TENANT level
    // therefore cannot be expressed as a column predicate on this model and has
    // to be resolved through the `employee` relation, which the shared helper
    // does not support today. See the note in ReportScopeResolver and the
    // finding raised with the engine stream.
    organizationIdField: null,
  },
  baseWhere: { status: { not: AttendanceDayStatus.PENDING } },
  // This model carries tenantId and employeeId and nothing else the access
  // helpers can narrow on. Scoping it on its own columns has only two
  // possible outcomes and both are wrong: the whole tenant, or nothing at
  // all. Scoping through the employee relation gives a business-unit reader
  // exactly the rows of the employees they can already see.
  scopeRelationPath: ['employee'],
  scopeRelationOptions: {
    organizationIdField: null,
    userIdField: 'userId',
  },
  defaultDateField: 'attendanceDate',
  recordIdField: 'id',
  requiredFeatureKey: TENANT_FEATURE_KEYS.ATTENDANCE,
  caveats: [
    'An AttendanceDay row exists only once the reconciliation engine has produced it. Days that have not been reconciled are absent entirely — they are not counted as absences, and a period that includes today will usually be short a day.',
    'Days still PENDING reconciliation are excluded from this source, so they appear in neither the numerator nor the denominator of any rate.',
    'The date is the SHIFT day, not the calendar day. An overnight shift produces one row dated to the shift start, with punches on either side of midnight.',
    'Extra minutes are not payable overtime. Approved overtime is a separate column, and the two are never added together here.',
    'Organisational dimensions are read through the employee, so they reflect the employee CURRENT department, team and location rather than where they sat on the attendance date.',
  ],
  fields: [
    {
      key: 'attendance.id',
      label: 'Attendance day id',
      type: 'string',
      path: 'id',
      reportable: true,
      filterable: true,
      hidden: true,
    },
    {
      key: 'attendance.attendance_date',
      label: 'Attendance date',
      description:
        'The shift workday. The default period field for this source.',
      type: 'date',
      path: 'attendanceDate',
      format: 'date',
      reportable: true,
      filterable: true,
      sortable: true,
      groupable: true,
      groupByField: 'attendanceDate',
    },
    {
      key: 'attendance.status',
      label: 'Day status',
      description:
        'Outcome the reconciliation engine settled on. PENDING never appears: this source excludes unreconciled days.',
      type: 'enum',
      path: 'status',
      enumValues: Object.values(AttendanceDayStatus),
      reportable: true,
      filterable: true,
      sortable: true,
      groupable: true,
      groupByField: 'status',
    },
    {
      key: 'attendance.derived_work_mode',
      label: 'Derived work mode',
      description:
        'Derived from the sessions actually worked. HYBRID is only ever produced here and is never asserted by a client.',
      type: 'enum',
      path: 'derivedWorkMode',
      enumValues: Object.values(EmployeeWorkMode),
      reportable: true,
      filterable: true,
      groupable: true,
      groupByField: 'derivedWorkMode',
      nullLabel: 'Not derived',
    },
    {
      key: 'attendance.timezone',
      label: 'Timezone',
      description:
        'IANA zone the shift was evaluated in, when one was resolved.',
      type: 'string',
      path: 'timezone',
      reportable: true,
      filterable: true,
      groupable: true,
      groupByField: 'timezone',
      nullLabel: 'Not set',
    },
    minutesField({
      name: 'scheduled_minutes',
      label: 'Scheduled minutes',
      description:
        'Minutes the employee was scheduled to work. The denominator of every attendance rate; zero on weekends, holidays and off days.',
      column: 'scheduledMinutes',
    }),
    minutesField({
      name: 'worked_minutes',
      label: 'Worked minutes',
      description: 'Minutes actually worked, from the reconciled sessions.',
      column: 'workedMinutes',
    }),
    minutesField({
      name: 'office_minutes',
      label: 'Office minutes',
      description: 'Worked minutes attributed to on-site sessions.',
      column: 'officeMinutes',
    }),
    minutesField({
      name: 'remote_minutes',
      label: 'Remote minutes',
      description: 'Worked minutes attributed to remote sessions.',
      column: 'remoteMinutes',
    }),
    minutesField({
      name: 'field_minutes',
      label: 'Field minutes',
      description: 'Worked minutes attributed to field sessions.',
      column: 'fieldMinutes',
    }),
    minutesField({
      name: 'break_minutes',
      label: 'Break minutes',
      description: 'Minutes recorded as breaks.',
      column: 'breakMinutes',
    }),
    minutesField({
      name: 'late_minutes',
      label: 'Late minutes',
      description: 'Minutes after the shift start before the first check-in.',
      column: 'lateMinutes',
    }),
    minutesField({
      name: 'early_departure_minutes',
      label: 'Early departure minutes',
      description: 'Minutes between the last check-out and the shift end.',
      column: 'earlyDepartureMinutes',
    }),
    minutesField({
      name: 'early_arrival_minutes',
      label: 'Early arrival minutes',
      description:
        'Minutes worked before the shift started. Arriving early is not overtime and is tracked separately so a policy can decide what it means.',
      column: 'earlyArrivalMinutes',
    }),
    minutesField({
      name: 'extra_minutes',
      label: 'Extra minutes',
      description:
        'Time worked beyond the schedule. NOT payable overtime — that requires approval, which is why approved overtime is a different column. Never add the two together.',
      column: 'extraMinutes',
    }),
    minutesField({
      name: 'approved_overtime_minutes',
      label: 'Approved overtime minutes',
      description:
        'Overtime that has been approved, and therefore the only overtime figure that may reach payroll.',
      column: 'approvedOvertimeMinutes',
    }),
    minutesField({
      name: 'leave_minutes',
      label: 'Leave minutes',
      description: 'Scheduled minutes covered by approved leave.',
      column: 'leaveMinutes',
    }),
    {
      key: 'attendance.session_count',
      label: 'Session count',
      description: 'Number of distinct work periods reconciled into the day.',
      type: 'integer',
      path: 'sessionCount',
      reportable: true,
      filterable: true,
      sortable: true,
      aggregatable: true,
      supportedAggregations: ['sum', 'avg', 'min', 'max'],
    },
    {
      key: 'attendance.open_exception_count',
      label: 'Open exceptions',
      description:
        'Unresolved exceptions on the day — missing check-out, out-of-geofence, and similar. A day with open exceptions has numbers the engine is not confident in.',
      type: 'integer',
      path: 'openExceptionCount',
      reportable: true,
      filterable: true,
      sortable: true,
      aggregatable: true,
      supportedAggregations: ['sum', 'avg', 'min', 'max'],
    },
    {
      key: 'attendance.first_check_in_at',
      label: 'First check-in',
      type: 'datetime',
      path: 'firstCheckInAt',
      format: 'datetime',
      reportable: true,
      filterable: true,
      sortable: true,
    },
    {
      key: 'attendance.last_check_out_at',
      label: 'Last check-out',
      type: 'datetime',
      path: 'lastCheckOutAt',
      format: 'datetime',
      reportable: true,
      filterable: true,
      sortable: true,
    },
    flagField({
      name: 'is_holiday',
      label: 'Holiday',
      description: 'The day fell on a holiday in the employee calendar.',
      column: 'isHoliday',
    }),
    flagField({
      name: 'is_weekend',
      label: 'Weekend',
      description: 'The day fell on a weekend in the employee schedule.',
      column: 'isWeekend',
    }),
    flagField({
      name: 'is_off_day',
      label: 'Off day',
      description: 'The employee was not scheduled to work.',
      column: 'isOffDay',
    }),
    flagField({
      name: 'on_leave',
      label: 'On leave',
      description: 'Approved leave covered part or all of the day.',
      column: 'onLeave',
    }),
    flagField({
      name: 'locked',
      label: 'Locked',
      description:
        'Reconciliation will no longer change this day. Late events persist as evidence and raise an exception instead.',
      column: 'locked',
    }),
    {
      key: 'attendance.last_reconciled_at',
      label: 'Last reconciled at',
      description: 'When the engine last recomputed this day.',
      type: 'datetime',
      path: 'lastReconciledAt',
      format: 'datetime',
      reportable: true,
      filterable: true,
      sortable: true,
    },
    ...employeeDimensionFields({
      sourceKey: 'attendance',
      employeeRelationPath: ['employee'],
      employeeIdField: 'employeeId',
    }),
  ],
};
