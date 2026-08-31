import { LeaveRequestStatus } from '@prisma/client';
import { ENTITY_KEYS } from '../../../../common/constants/rbac-matrix';
import { TENANT_FEATURE_KEYS } from '../../../../common/constants/tenant-features';
import type {
  ReportDataSource,
  ReportFieldDefinition,
} from '../semantic.types';
import { employeeDimensionFields } from './workforce.source';

/**
 * Leave, in three sources, because the three questions have three answers.
 *
 *   - **`leave_requests`** — what people asked for and what was decided. One
 *     row per request, in every status.
 *   - **`leave_consumption`** — what was actually taken. `LeaveConsumptionRecord`
 *     is written only when leave is consumed, which makes it the only correct
 *     source for "days taken". Summing `LeaveRequest.totalDays` would include
 *     pending and rejected requests, and the semantic contract has no
 *     filtered-sum calculation to exclude them with.
 *   - **`leave_balances`** — where entitlement stands **now**.
 *
 * `LeaveBalance` carries no period, cycle or as-of column: it is a single
 * mutable row per employee per leave type, overwritten in place. A balance
 * therefore cannot be reported as of a past date, and there is no column that
 * could be filtered to fake one. That is stated as a caveat on the source
 * rather than worked around.
 */

const leaveTypeDimension = (sourceKey: string): ReportFieldDefinition => ({
  key: `${sourceKey}.leave_type`,
  label: 'Leave type',
  description: 'Tenant-configured leave type.',
  type: 'string',
  path: 'leaveType.name',
  relationPath: ['leaveType'],
  reportable: true,
  filterable: true,
  sortable: true,
  groupable: true,
  groupByField: 'leaveTypeId',
  labelLookup: { model: 'leaveType', valueField: 'id', labelField: 'name' },
  nullLabel: 'Unknown leave type',
});

const leaveTypeCategory = (sourceKey: string): ReportFieldDefinition => ({
  key: `${sourceKey}.leave_type_category`,
  label: 'Leave category',
  description:
    'Free-text category on the leave type. Tenant-defined, so its values are not a fixed vocabulary.',
  type: 'string',
  path: 'leaveType.category',
  relationPath: ['leaveType'],
  reportable: true,
  filterable: true,
  // The root model carries `leaveTypeId`, not a category column, and grouping
  // cannot traverse a relation. Group by leave type and roll up instead.
  groupable: false,
});

const leaveTypeIsPaid = (sourceKey: string): ReportFieldDefinition => ({
  key: `${sourceKey}.leave_type_is_paid`,
  label: 'Paid leave type',
  description: 'Whether the leave type is paid.',
  type: 'boolean',
  path: 'leaveType.isPaid',
  relationPath: ['leaveType'],
  reportable: true,
  filterable: true,
  groupable: false,
});

export const LEAVE_REQUESTS_SOURCE: ReportDataSource = {
  key: 'leave_requests',
  label: 'Leave requests',
  description:
    'Leave requests in every status, one row per request, with the dates requested and the decision taken.',
  prismaModel: 'leaveRequest',
  rbacEntityKey: ENTITY_KEYS.LEAVE_REQUESTS,
  scope: {
    organizationIdField: null,
    // The only ownership column LeaveRequest carries. It identifies the user who
    // raised the request, which is the correct SELF-level scope for leave.
    createdByIdField: 'createdById',
  },
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
  defaultDateField: 'startDate',
  recordIdField: 'id',
  requiredFeatureKey: TENANT_FEATURE_KEYS.LEAVE,
  caveats: [
    'A period narrows this source on the leave START date, not on when the request was raised. Use the "Requested at" field explicitly to report on request volume by raise date.',
    'A request spanning a period boundary is counted once, in the period its start date falls in. Its days are not apportioned across periods.',
    'Total days is what was requested. It is not what was consumed: a cancelled or rejected request still carries a day count. Use the Leave consumption source for days actually taken.',
    'Organisational dimensions are read through the employee and reflect their current department, team and location rather than where they sat when the leave was taken.',
  ],
  fields: [
    {
      key: 'leave_requests.id',
      label: 'Leave request id',
      type: 'string',
      path: 'id',
      reportable: true,
      filterable: true,
      hidden: true,
    },
    {
      key: 'leave_requests.status',
      label: 'Status',
      description: 'Decision state of the request.',
      type: 'enum',
      path: 'status',
      enumValues: Object.values(LeaveRequestStatus),
      reportable: true,
      filterable: true,
      sortable: true,
      groupable: true,
      groupByField: 'status',
    },
    {
      key: 'leave_requests.start_date',
      label: 'Leave start date',
      description:
        'First day of leave. The default period field for this source.',
      type: 'date',
      path: 'startDate',
      format: 'date',
      reportable: true,
      filterable: true,
      sortable: true,
      groupable: true,
      groupByField: 'startDate',
    },
    {
      key: 'leave_requests.end_date',
      label: 'Leave end date',
      type: 'date',
      path: 'endDate',
      format: 'date',
      reportable: true,
      filterable: true,
      sortable: true,
    },
    {
      key: 'leave_requests.total_days',
      label: 'Days requested',
      description:
        'Days on the request, half-days included. What was asked for, not necessarily what was taken.',
      type: 'number',
      path: 'totalDays',
      reportable: true,
      filterable: true,
      sortable: true,
      aggregatable: true,
      supportedAggregations: ['sum', 'avg', 'min', 'max'],
    },
    {
      key: 'leave_requests.attachment_required',
      label: 'Attachment required',
      type: 'boolean',
      path: 'attachmentRequired',
      reportable: true,
      filterable: true,
      groupable: true,
      groupByField: 'attachmentRequired',
    },
    {
      key: 'leave_requests.requested_at',
      label: 'Requested at',
      description: 'When the request was raised.',
      type: 'datetime',
      path: 'createdAt',
      format: 'datetime',
      reportable: true,
      filterable: true,
      sortable: true,
    },
    {
      key: 'leave_requests.decided_at',
      label: 'Last updated at',
      description:
        'When the request row last changed. This is the closest thing to a decision timestamp on the model; LeaveRequest stores no approved-at or rejected-at column, so a genuine approval turnaround time is not computable from this source.',
      type: 'datetime',
      path: 'updatedAt',
      format: 'datetime',
      reportable: true,
      filterable: true,
      sortable: true,
    },
    leaveTypeDimension('leave_requests'),
    leaveTypeCategory('leave_requests'),
    leaveTypeIsPaid('leave_requests'),
    ...employeeDimensionFields({
      sourceKey: 'leave_requests',
      employeeRelationPath: ['employee'],
      employeeIdField: 'employeeId',
    }),
  ],
};

export const LEAVE_CONSUMPTION_SOURCE: ReportDataSource = {
  key: 'leave_consumption',
  label: 'Leave consumption',
  description:
    'Leave actually consumed. One row per consuming leave request, written only when the leave is taken.',
  prismaModel: 'leaveConsumptionRecord',
  rbacEntityKey: ENTITY_KEYS.LEAVE_REQUESTS,
  scope: {
    // LeaveConsumptionRecord carries tenantId, employeeId, leaveRequestId and
    // leaveTypeId — no user, owner or creator column. Sub-tenant row scope has
    // to travel through the employee relation; see the engine finding.
    organizationIdField: null,
  },
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
  defaultDateField: 'createdAt',
  recordIdField: 'id',
  requiredFeatureKey: TENANT_FEATURE_KEYS.LEAVE,
  caveats: [
    'A period narrows this source on when the consumption row was WRITTEN, not on the leave dates. Filter on "Leave start date" to report by when the leave was taken.',
    'Only leave types that consume balance produce a row here. Leave on a type with consumesBalance disabled is absent by design, not missing.',
    'One row per leave request, so a request spanning two months contributes its whole day count once.',
  ],
  fields: [
    {
      key: 'leave_consumption.id',
      label: 'Consumption record id',
      type: 'string',
      path: 'id',
      reportable: true,
      filterable: true,
      hidden: true,
    },
    {
      key: 'leave_consumption.days',
      label: 'Days taken',
      description: 'Days consumed against the balance.',
      type: 'number',
      path: 'days',
      reportable: true,
      filterable: true,
      sortable: true,
      aggregatable: true,
      supportedAggregations: ['sum', 'avg', 'min', 'max'],
    },
    {
      key: 'leave_consumption.is_paid',
      label: 'Paid',
      description:
        'Whether the consumed leave was paid, as decided at the time.',
      type: 'boolean',
      path: 'isPaid',
      reportable: true,
      filterable: true,
      groupable: true,
      groupByField: 'isPaid',
    },
    {
      key: 'leave_consumption.recorded_at',
      label: 'Recorded at',
      description:
        'When consumption was written. The default period field for this source.',
      type: 'datetime',
      path: 'createdAt',
      format: 'datetime',
      reportable: true,
      filterable: true,
      sortable: true,
    },
    {
      key: 'leave_consumption.leave_start_date',
      label: 'Leave start date',
      description: 'First day of the leave this consumption belongs to.',
      type: 'date',
      path: 'leaveRequest.startDate',
      relationPath: ['leaveRequest'],
      format: 'date',
      reportable: true,
      filterable: true,
      sortable: true,
      groupable: false,
    },
    {
      key: 'leave_consumption.leave_end_date',
      label: 'Leave end date',
      type: 'date',
      path: 'leaveRequest.endDate',
      relationPath: ['leaveRequest'],
      format: 'date',
      reportable: true,
      filterable: true,
      groupable: false,
    },
    leaveTypeDimension('leave_consumption'),
    leaveTypeCategory('leave_consumption'),
    leaveTypeIsPaid('leave_consumption'),
    ...employeeDimensionFields({
      sourceKey: 'leave_consumption',
      employeeRelationPath: ['employee'],
      employeeIdField: 'employeeId',
    }),
  ],
};

export const LEAVE_BALANCES_SOURCE: ReportDataSource = {
  key: 'leave_balances',
  label: 'Leave balances (current)',
  description:
    'Current leave entitlement, allocation and remaining balance. One mutable row per employee per leave type.',
  prismaModel: 'leaveBalance',
  rbacEntityKey: ENTITY_KEYS.LEAVE_REQUESTS,
  scope: {
    organizationIdField: null,
  },
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
  defaultDateField: 'lastUpdatedAt',
  // Describes a current population, not events in a window. Narrowing it by
  // the selected period would turn a headcount into a count of recent hires.
  periodScoped: false,
  recordIdField: 'id',
  requiredFeatureKey: TENANT_FEATURE_KEYS.LEAVE,
  caveats: [
    'Current state only. LeaveBalance has no period, cycle or as-of column and is overwritten in place, so a balance as of a past date is not computable from this source and no filter can produce one.',
    'The default period field is the last-updated timestamp, so narrowing this source by a period selects balances TOUCHED in that period — it does not reconstruct the balance that stood at the end of it.',
    'Allocation reflects the policy currently assigned to the employee. A mid-year policy change rewrites the row.',
  ],
  fields: [
    {
      key: 'leave_balances.id',
      label: 'Balance row id',
      type: 'string',
      path: 'id',
      reportable: true,
      filterable: true,
      hidden: true,
    },
    {
      key: 'leave_balances.total_allocated',
      label: 'Allocated days',
      type: 'number',
      path: 'totalAllocated',
      reportable: true,
      filterable: true,
      sortable: true,
      aggregatable: true,
      supportedAggregations: ['sum', 'avg', 'min', 'max'],
    },
    {
      key: 'leave_balances.total_used',
      label: 'Used days',
      type: 'number',
      path: 'totalUsed',
      reportable: true,
      filterable: true,
      sortable: true,
      aggregatable: true,
      supportedAggregations: ['sum', 'avg', 'min', 'max'],
    },
    {
      key: 'leave_balances.total_remaining',
      label: 'Remaining days',
      type: 'number',
      path: 'totalRemaining',
      reportable: true,
      filterable: true,
      sortable: true,
      aggregatable: true,
      supportedAggregations: ['sum', 'avg', 'min', 'max'],
    },
    {
      key: 'leave_balances.last_updated_at',
      label: 'Last updated at',
      description:
        'When the balance last changed. The default period field for this source.',
      type: 'datetime',
      path: 'lastUpdatedAt',
      format: 'datetime',
      reportable: true,
      filterable: true,
      sortable: true,
    },
    leaveTypeDimension('leave_balances'),
    leaveTypeCategory('leave_balances'),
    leaveTypeIsPaid('leave_balances'),
    ...employeeDimensionFields({
      sourceKey: 'leave_balances',
      employeeRelationPath: ['employee'],
      employeeIdField: 'employeeId',
    }),
  ],
};
