import { LeaveRequestStatus } from '@prisma/client';
import {
  LEAVE_CONSUMPTION_SOURCE,
  LEAVE_REQUESTS_SOURCE,
} from '../semantic/data-sources';
import { isGroupable } from '../semantic/semantic.types';
import type { ReportMetricDefinition } from '../semantic/semantic.types';
import {
  LEAVE_CONSUMPTION_PERIOD_CAVEAT,
  LEAVE_REQUEST_PERIOD_CAVEAT,
} from '../semantic/caveats';

/**
 * Leave metrics.
 *
 * **`$NOW`** is the one relative-date token this registry uses. It appears only
 * in metrics that are inherently as-of-this-instant — who is on leave right now,
 * whose leave is still ahead of them — and the query planner resolves it to the
 * query time. It exists because those two questions are not period questions
 * and cannot be expressed by narrowing a period: "currently on leave" over last
 * March is not a meaningful thing to ask, and a metric that quietly answered it
 * as though it were would be worse than one that refuses.
 *
 * **Days taken comes from `LeaveConsumptionRecord`, not from `LeaveRequest`.**
 * Summing `totalDays` over requests would add pending and rejected days to the
 * total, and the semantic contract offers no filtered sum to exclude them with.
 * Consumption rows are written only when leave is actually consumed, so they are
 * both the correct answer and the simpler one.
 */

/** Resolved by the query planner to the instant the query runs. */
export const RELATIVE_NOW = '$NOW';

const REQUEST_DIMENSIONS = LEAVE_REQUESTS_SOURCE.fields
  .filter(isGroupable)
  .map((field) => field.key);

const CONSUMPTION_DIMENSIONS = LEAVE_CONSUMPTION_SOURCE.fields
  .filter(isGroupable)
  .map((field) => field.key);

const statusCount = (
  key: string,
  label: string,
  status: LeaveRequestStatus,
  description: string,
  direction: ReportMetricDefinition['direction'],
  extraCaveats: string[] = [],
): ReportMetricDefinition => ({
  key,
  label,
  description,
  dataSourceKey: 'leave_requests',
  valueType: 'integer',
  calculation: {
    kind: 'filtered_count',
    where: { 'leave_requests.status': { eq: status } },
  },
  supportedDimensions: REQUEST_DIMENSIONS,
  comparable: true,
  direction,
  caveats: [LEAVE_REQUEST_PERIOD_CAVEAT, ...extraCaveats],
});

export const LEAVE_METRICS: ReportMetricDefinition[] = [
  {
    key: 'leave.requests_raised',
    label: 'Leave requests',
    description:
      'Leave requests in scope, in every status. One row per request regardless of how many days it covers.',
    dataSourceKey: 'leave_requests',
    valueType: 'integer',
    calculation: { kind: 'count' },
    supportedDimensions: REQUEST_DIMENSIONS,
    comparable: true,
    direction: 'neutral',
    caveats: [
      LEAVE_REQUEST_PERIOD_CAVEAT,
      'Counts requests, not days and not people.',
    ],
  },
  statusCount(
    'leave.approved_requests',
    'Approved leave requests',
    LeaveRequestStatus.APPROVED,
    'Leave requests whose current status is APPROVED.',
    'neutral',
    [
      'Current status, not a decision event. A request approved and later cancelled counts as cancelled, not as approved, and no column records that it was ever approved.',
    ],
  ),
  statusCount(
    'leave.rejected_requests',
    'Rejected leave requests',
    LeaveRequestStatus.REJECTED,
    'Leave requests whose current status is REJECTED.',
    'neutral',
    [
      'LeaveRequest stores no rejection reason and no rejected-at timestamp, so neither why nor when is answerable from this metric.',
    ],
  ),
  statusCount(
    'leave.pending_requests',
    'Pending leave requests',
    LeaveRequestStatus.PENDING,
    'Leave requests still awaiting a decision.',
    'down_is_good',
    [
      'A pending request whose leave dates have already passed is a backlog item, and this metric will keep counting it.',
    ],
  ),
  statusCount(
    'leave.cancelled_requests',
    'Cancelled leave requests',
    LeaveRequestStatus.CANCELLED,
    'Leave requests cancelled by the employee or by an administrator.',
    'neutral',
    [
      'Cancellations before and after approval are indistinguishable: the status column carries the outcome and nothing about the path to it.',
    ],
  ),
  {
    key: 'leave.days_taken',
    label: 'Leave days taken',
    description:
      'Days actually consumed against leave balances, from the consumption records written when leave is taken.',
    dataSourceKey: 'leave_consumption',
    valueType: 'number',
    calculation: { kind: 'sum', field: 'leave_consumption.days' },
    supportedDimensions: CONSUMPTION_DIMENSIONS,
    comparable: true,
    direction: 'neutral',
    caveats: [
      LEAVE_CONSUMPTION_PERIOD_CAVEAT,
      'Only leave types that consume balance produce a record. Leave on a non-consuming type is genuinely absent here, by design.',
      'Half days count as fractions, so this is not a count of calendar days off.',
    ],
  },
  {
    key: 'leave.employees_currently_on_leave',
    label: 'Currently on leave',
    description:
      'Approved leave requests whose date range contains this instant. In practice one per person, so it reads as a headcount of who is out today.',
    dataSourceKey: 'leave_requests',
    valueType: 'integer',
    calculation: {
      kind: 'filtered_count',
      where: {
        'leave_requests.status': { eq: LeaveRequestStatus.APPROVED },
        'leave_requests.start_date': { lte: RELATIVE_NOW },
        'leave_requests.end_date': { gte: RELATIVE_NOW },
      },
    },
    supportedDimensions: REQUEST_DIMENSIONS,
    comparable: false,
    direction: 'neutral',
    caveats: [
      'As of now, not as of the reporting period. This number cannot be produced for a past date and the period selector does not apply to it.',
      'Counts requests rather than distinct people. An employee holding two overlapping approved requests would be counted twice; the semantic contract has no filtered distinct count to express the alternative.',
      'Half days count as a whole day of absence here, because a request either spans today or it does not.',
    ],
  },
  {
    key: 'leave.upcoming_leave_requests',
    label: 'Upcoming approved leave',
    description:
      'Approved leave requests whose start date is still ahead of this instant.',
    dataSourceKey: 'leave_requests',
    valueType: 'integer',
    calculation: {
      kind: 'filtered_count',
      where: {
        'leave_requests.status': { eq: LeaveRequestStatus.APPROVED },
        'leave_requests.start_date': { gt: RELATIVE_NOW },
      },
    },
    supportedDimensions: REQUEST_DIMENSIONS,
    comparable: false,
    direction: 'neutral',
    caveats: [
      'As of now, and unbounded into the future: leave approved for next year is included unless a filter narrows the start date.',
      'Pending requests are excluded, so this understates the absence a team should plan for.',
    ],
  },
];
