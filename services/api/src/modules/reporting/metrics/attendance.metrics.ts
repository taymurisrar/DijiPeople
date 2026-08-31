import { AttendanceDayStatus } from '@prisma/client';
import { ATTENDANCE_SOURCE } from '../semantic/data-sources';
import { isGroupable } from '../semantic/semantic.types';
import type { ReportMetricDefinition } from '../semantic/semantic.types';
import { SHIFT_DAY_CAVEAT } from '../semantic/caveats';

/**
 * Attendance metrics.
 *
 * Every one of these is built on `AttendanceDay`, which is the only attendance
 * model carrying a scheduled denominator. `PENDING` days are excluded by the
 * source's `baseWhere`, so no metric here needs to remember to exclude them and
 * none of them can accidentally include them.
 *
 * **Overtime is two numbers and they are never added.** `approvedOvertimeMinutes`
 * is overtime somebody approved and is the only figure that may reach payroll.
 * `extraMinutes` is time worked past the schedule that nobody approved — the
 * schema comment says so explicitly. A single "overtime" metric summing both
 * would put unapproved time into a payroll conversation, so there are two
 * metrics and they carry each other's name in their descriptions.
 */

const ATTENDANCE_DIMENSIONS = ATTENDANCE_SOURCE.fields
  .filter(isGroupable)
  .map((field) => field.key);

/**
 * Caveats every attendance metric carries, because they are properties of the
 * source rather than of any one calculation.
 */
const SHARED_CAVEATS = [
  'AttendanceDay rows exist only for days the reconciliation engine has finished. Unreconciled days are absent, not zero, so a period including today is usually short a day.',
  SHIFT_DAY_CAVEAT,
];

export const ATTENDANCE_METRICS: ReportMetricDefinition[] = [
  {
    key: 'attendance.attendance_rate',
    label: 'Attendance rate',
    description:
      'Worked minutes as a percentage of scheduled minutes: the total time actually worked divided by the total time people were scheduled for.',
    dataSourceKey: 'attendance',
    valueType: 'percent',
    format: 'percent',
    calculation: {
      kind: 'ratio',
      numerator: 'attendance.worked_minutes',
      denominator: 'attendance.scheduled_minutes',
      asPercent: true,
    },
    supportedDimensions: ATTENDANCE_DIMENSIONS,
    comparable: true,
    direction: 'up_is_good',
    caveats: [
      ...SHARED_CAVEATS,
      'A ratio of summed minutes, not an average of per-day percentages. The two differ whenever people have different shift lengths, and this is the form that answers "what share of scheduled time was worked".',
      'Weekends, holidays and off days have zero scheduled minutes and therefore contribute nothing to either side. Approved leave does contribute to the denominator: a fully staffed team on approved leave scores below one hundred percent.',
      'Can exceed one hundred percent when people work beyond their schedule, because extra minutes land in the numerator and not in the denominator.',
    ],
  },
  {
    key: 'attendance.present_days',
    label: 'Present days',
    description:
      'Days the engine settled as PRESENT or PARTIAL. Partial days are included because the employee did attend; use the attendance rate for how much of the day they worked.',
    dataSourceKey: 'attendance',
    valueType: 'integer',
    calculation: {
      kind: 'filtered_count',
      where: {
        'attendance.status': {
          in: [AttendanceDayStatus.PRESENT, AttendanceDayStatus.PARTIAL],
        },
      },
    },
    supportedDimensions: ATTENDANCE_DIMENSIONS,
    comparable: true,
    direction: 'up_is_good',
    caveats: [
      ...SHARED_CAVEATS,
      'Present days plus absent days does not equal working days: leave, holiday, weekend, off-day and needs-review days are all separate statuses.',
    ],
  },
  {
    key: 'attendance.absent_days',
    label: 'Absent days',
    description:
      'Days the engine settled as ABSENT: scheduled to work, no attendance, and not covered by leave.',
    dataSourceKey: 'attendance',
    valueType: 'integer',
    calculation: {
      kind: 'filtered_count',
      where: { 'attendance.status': { eq: AttendanceDayStatus.ABSENT } },
    },
    supportedDimensions: ATTENDANCE_DIMENSIONS,
    comparable: true,
    direction: 'down_is_good',
    caveats: [
      ...SHARED_CAVEATS,
      'A day with missing device data reconciles as ABSENT unless an exception was raised and resolved. Check open exceptions before treating a spike as an attendance problem rather than a capture problem.',
    ],
  },
  {
    key: 'attendance.late_arrivals',
    label: 'Late arrivals',
    description:
      'Days with any late minutes recorded, counted as days rather than as minutes.',
    dataSourceKey: 'attendance',
    valueType: 'integer',
    calculation: {
      kind: 'filtered_count',
      where: { 'attendance.late_minutes': { gt: 0 } },
    },
    supportedDimensions: ATTENDANCE_DIMENSIONS,
    comparable: true,
    direction: 'down_is_good',
    caveats: [
      ...SHARED_CAVEATS,
      'One minute late and ninety minutes late both count as one. This metric has no grace period of its own — whatever grace the tenant configured has already been applied when late minutes were derived.',
    ],
  },
  {
    key: 'attendance.early_departures',
    label: 'Early departures',
    description: 'Days with any early departure minutes recorded.',
    dataSourceKey: 'attendance',
    valueType: 'integer',
    calculation: {
      kind: 'filtered_count',
      where: { 'attendance.early_departure_minutes': { gt: 0 } },
    },
    supportedDimensions: ATTENDANCE_DIMENSIONS,
    comparable: true,
    direction: 'down_is_good',
    caveats: [
      ...SHARED_CAVEATS,
      'A missing check-out can look like an early departure. Days carrying open exceptions are the ones to look at first.',
    ],
  },
  {
    key: 'attendance.average_worked_minutes',
    label: 'Average worked minutes per day',
    description:
      'Mean worked minutes across the attendance days in scope, including days with zero worked minutes.',
    dataSourceKey: 'attendance',
    valueType: 'duration_minutes',
    format: 'duration',
    calculation: { kind: 'avg', field: 'attendance.worked_minutes' },
    supportedDimensions: ATTENDANCE_DIMENSIONS,
    comparable: true,
    direction: 'neutral',
    caveats: [
      ...SHARED_CAVEATS,
      'The denominator is attendance days, which includes weekends, holidays, off days and leave days. Filter to scheduled days if the question is about working days.',
    ],
  },
  {
    key: 'attendance.total_worked_minutes',
    label: 'Total worked minutes',
    description:
      'Sum of worked minutes across the attendance days in scope. Reported in minutes because that is the unit the column stores; a client rendering hours divides by sixty at the presentation layer.',
    dataSourceKey: 'attendance',
    valueType: 'duration_minutes',
    format: 'duration',
    calculation: { kind: 'sum', field: 'attendance.worked_minutes' },
    supportedDimensions: ATTENDANCE_DIMENSIONS,
    comparable: true,
    direction: 'neutral',
    caveats: [
      ...SHARED_CAVEATS,
      'This is worked time as reconciled attendance, not billable or payable time. Neither payroll nor timesheets derive from it.',
    ],
  },
  {
    key: 'attendance.approved_overtime_minutes',
    label: 'Approved overtime minutes',
    description:
      'Sum of overtime that has been approved. This is the only overtime figure that may inform pay.',
    dataSourceKey: 'attendance',
    valueType: 'duration_minutes',
    format: 'duration',
    calculation: {
      kind: 'sum',
      field: 'attendance.approved_overtime_minutes',
    },
    supportedDimensions: ATTENDANCE_DIMENSIONS,
    comparable: true,
    direction: 'neutral',
    caveats: [
      ...SHARED_CAVEATS,
      'Never add this to extra minutes. Extra time is unapproved by definition, and a combined total presented as overtime is a payroll claim nobody authorised.',
    ],
  },
  {
    key: 'attendance.extra_minutes',
    label: 'Extra minutes worked (unapproved)',
    description:
      'Sum of time worked beyond the schedule that has not been approved as overtime. Useful as a workload signal; it is not payable.',
    dataSourceKey: 'attendance',
    valueType: 'duration_minutes',
    format: 'duration',
    calculation: { kind: 'sum', field: 'attendance.extra_minutes' },
    supportedDimensions: ATTENDANCE_DIMENSIONS,
    comparable: true,
    direction: 'neutral',
    caveats: [
      ...SHARED_CAVEATS,
      'NOT payable overtime. The schema keeps this separate from approved overtime precisely so the two cannot be conflated, and it must never be labelled "overtime" on its own.',
      'Excludes early arrival, which is tracked separately: arriving before the shift is not work beyond the schedule.',
    ],
  },
  {
    key: 'attendance.open_exceptions',
    label: 'Open attendance exceptions',
    description:
      'Sum of unresolved exceptions across the attendance days in scope — missing check-outs, out-of-geofence punches and similar.',
    dataSourceKey: 'attendance',
    valueType: 'integer',
    calculation: { kind: 'sum', field: 'attendance.open_exception_count' },
    supportedDimensions: ATTENDANCE_DIMENSIONS,
    comparable: true,
    direction: 'down_is_good',
    caveats: [
      ...SHARED_CAVEATS,
      'This is a data-quality measure, not an attendance measure. A high count means the other numbers on this source are less trustworthy for the same period.',
      'Counts exceptions, not days: one day can carry several.',
    ],
  },
];
