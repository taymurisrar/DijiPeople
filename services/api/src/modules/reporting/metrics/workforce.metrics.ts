import { EmployeeEmploymentStatus } from '@prisma/client';
import {
  WORKFORCE_HISTORY_SOURCE,
  WORKFORCE_SOURCE,
} from '../semantic/data-sources';
import { isGroupable } from '../semantic/semantic.types';
import type {
  ReportDataSource,
  ReportMetricDefinition,
} from '../semantic/semantic.types';

/**
 * Workforce metrics.
 *
 * **Point-in-time measures come from `workforce`; period measures come from
 * `workforce_history`.** That split is not stylistic. `Employee` carries one
 * lifecycle date every row has — `hireDate` — so a period applied to that
 * source is a hire cohort and nothing else; asking it for leavers would mean
 * narrowing on `terminationDate`, and a data source has exactly one default
 * date field. More importantly, a headcount trend computed from `Employee`
 * recomputes history from today's org chart every time it runs, so last
 * quarter's departmental split changes after a reorganisation that happened
 * this week. `WorkforceSnapshotDaily` is what makes joiners, leavers, turnover
 * and tenure answerable without that.
 *
 * The consequence is worth stating plainly: **before a tenant's first snapshot,
 * these period metrics have nothing to report.** That is the honest answer, and
 * it is a better one than a number silently recomputed from current state.
 */

const dimensionsOf = (source: ReportDataSource): string[] =>
  source.fields.filter(isGroupable).map((field) => field.key);

const WORKFORCE_DIMENSIONS = dimensionsOf(WORKFORCE_SOURCE);
const HISTORY_DIMENSIONS = dimensionsOf(WORKFORCE_HISTORY_SOURCE);

export const WORKFORCE_METRICS: ReportMetricDefinition[] = [
  {
    key: 'workforce.headcount',
    label: 'Headcount',
    description:
      'Employee records that exist right now, excluding soft-deleted ones. Counts every record type and employment status, including people on notice and people whose profile is still a draft — filter or break down to narrow it.',
    dataSourceKey: 'workforce',
    valueType: 'integer',
    calculation: { kind: 'count' },
    supportedDimensions: WORKFORCE_DIMENSIONS,
    comparable: true,
    direction: 'neutral',
    caveats: [
      'Current state. Broken down by department, it uses today’s departments for every period. Use Historical headcount for anything time-sliced.',
    ],
  },
  {
    key: 'workforce.active_headcount',
    label: 'Active headcount',
    description:
      'Employees whose employment status is ACTIVE. Excludes probation, notice, inactive and terminated.',
    dataSourceKey: 'workforce',
    valueType: 'integer',
    calculation: {
      kind: 'filtered_count',
      where: {
        'workforce.employment_status': {
          eq: EmployeeEmploymentStatus.ACTIVE,
        },
      },
    },
    supportedDimensions: WORKFORCE_DIMENSIONS,
    comparable: true,
    direction: 'neutral',
    caveats: [
      'People on probation and on notice are employed and are NOT counted here. Headcount is the total; this is the ACTIVE slice of it.',
    ],
  },
  {
    key: 'workforce.probation_headcount',
    label: 'On probation',
    description: 'Employees whose employment status is PROBATION.',
    dataSourceKey: 'workforce',
    valueType: 'integer',
    calculation: {
      kind: 'filtered_count',
      where: {
        'workforce.employment_status': {
          eq: EmployeeEmploymentStatus.PROBATION,
        },
      },
    },
    supportedDimensions: WORKFORCE_DIMENSIONS,
    comparable: true,
    direction: 'neutral',
    caveats: [
      'Driven by the employment status column, not by the probation end date. An employee whose probation lapsed without anyone confirming it still counts here.',
    ],
  },
  {
    key: 'workforce.notice_period_headcount',
    label: 'On notice',
    description: 'Employees whose employment status is NOTICE.',
    dataSourceKey: 'workforce',
    valueType: 'integer',
    calculation: {
      kind: 'filtered_count',
      where: {
        'workforce.employment_status': {
          eq: EmployeeEmploymentStatus.NOTICE,
        },
      },
    },
    supportedDimensions: WORKFORCE_DIMENSIONS,
    comparable: true,
    direction: 'down_is_good',
    caveats: [
      'Still employed, and still counted in Headcount. These are departures that have not happened yet, so they will appear again as leavers.',
    ],
  },
  {
    key: 'workforce.historical_headcount',
    label: 'Historical headcount',
    description:
      'Headcount on a given day, from the daily workforce snapshot, using the organisational placement that was true on that day.',
    dataSourceKey: 'workforce_history',
    valueType: 'integer',
    calculation: { kind: 'count' },
    supportedDimensions: HISTORY_DIMENSIONS,
    comparable: true,
    direction: 'neutral',
    caveats: [
      'One row per employee per day. A period spanning several days must be grouped by snapshot date; the raw row count over a month is roughly thirty times the headcount.',
      'BACKFILLED rows place employees in their current department, so a breakdown across the backfilled range shows today’s structure applied to the past.',
    ],
  },
  {
    key: 'workforce.joiners',
    label: 'Joiners',
    description:
      'Employees whose hire date falls in the period, counted from the daily snapshot.',
    dataSourceKey: 'workforce_history',
    valueType: 'integer',
    calculation: {
      kind: 'filtered_count',
      where: { 'workforce_history.is_joiner': { eq: true } },
    },
    supportedDimensions: HISTORY_DIMENSIONS,
    comparable: true,
    direction: 'neutral',
    caveats: [
      'Only countable for days a snapshot exists for. A period beginning before the tenant’s first snapshot reports fewer joiners than actually joined, not zero.',
    ],
  },
  {
    key: 'workforce.leavers',
    label: 'Leavers',
    description:
      'Employees whose termination date falls in the period, counted from the daily snapshot.',
    dataSourceKey: 'workforce_history',
    valueType: 'integer',
    calculation: {
      kind: 'filtered_count',
      where: { 'workforce_history.is_leaver': { eq: true } },
    },
    supportedDimensions: HISTORY_DIMENSIONS,
    comparable: true,
    direction: 'down_is_good',
    caveats: [
      'Counts departures regardless of reason. Voluntary and involuntary exits are not distinguished anywhere in this schema, so this is not a resignation count.',
    ],
  },
  {
    key: 'workforce.net_change',
    label: 'Net headcount change',
    description: 'Joiners minus leavers over the period.',
    dataSourceKey: 'workforce_history',
    valueType: 'integer',
    calculation: {
      kind: 'derived',
      dependsOn: ['workforce.joiners', 'workforce.leavers'],
    },
    supportedDimensions: HISTORY_DIMENSIONS,
    comparable: true,
    direction: 'neutral',
    caveats: [
      'Net change will not reconcile exactly against the difference between two headcounts if the snapshot job missed a day, because a joiner or leaver on a missed day has no row to be counted from.',
    ],
  },
  {
    key: 'workforce.turnover_rate',
    label: 'Turnover rate',
    description:
      'Leavers in the period as a percentage of the average daily headcount over the same period.',
    dataSourceKey: 'workforce_history',
    valueType: 'percent',
    format: 'percent',
    calculation: {
      kind: 'derived',
      dependsOn: ['workforce.leavers', 'workforce.historical_headcount'],
    },
    supportedDimensions: HISTORY_DIMENSIONS,
    comparable: true,
    direction: 'down_is_good',
    caveats: [
      'The denominator is average daily headcount across the period, not headcount on the closing day. The two differ whenever the workforce grew or shrank, and quoting the second as though it were the first understates turnover in a growing company.',
      'Not annualised. A monthly figure is a monthly figure; multiplying it by twelve assumes departures are evenly spread and they are not.',
    ],
  },
  {
    key: 'workforce.retention_rate',
    label: 'Retention rate',
    description:
      'The complement of turnover: one hundred percent minus the turnover rate for the same period.',
    dataSourceKey: 'workforce_history',
    valueType: 'percent',
    format: 'percent',
    calculation: {
      kind: 'derived',
      dependsOn: ['workforce.turnover_rate'],
    },
    supportedDimensions: HISTORY_DIMENSIONS,
    comparable: true,
    direction: 'up_is_good',
    caveats: [
      'Defined as the complement of turnover, so it carries every one of turnover’s caveats. It is not a cohort retention rate and does not follow a group of hires forward in time.',
    ],
  },
  {
    key: 'workforce.average_tenure_days',
    label: 'Average tenure (days)',
    description:
      'Average days between hire date and the snapshot date, across the employees present on the snapshot.',
    dataSourceKey: 'workforce_history',
    valueType: 'number',
    calculation: { kind: 'avg', field: 'workforce_history.tenure_days' },
    supportedDimensions: HISTORY_DIMENSIONS,
    comparable: true,
    direction: 'neutral',
    caveats: [
      'Average over a single snapshot date is what this means. Averaged over a multi-day period it weights each employee by the number of days they appear, which is nearly uniform and therefore nearly harmless — but it is not the same statistic.',
      'Tenure of people still employed. It says nothing about how long leavers stayed, which is the question most tenure discussions are actually about.',
    ],
  },
];
