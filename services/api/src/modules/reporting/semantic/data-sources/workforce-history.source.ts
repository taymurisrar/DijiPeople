import {
  EmployeeEmploymentStatus,
  EmployeeGender,
  EmployeeType,
  EmployeeWorkMode,
  WorkforceSnapshotDerivation,
} from '@prisma/client';
import { ENTITY_KEYS } from '../../../../common/constants/rbac-matrix';
import type {
  ReportDataSource,
  ReportFieldDefinition,
} from '../semantic.types';

/**
 * Workforce history — one row per employee per day.
 *
 * `Employee` is a current-state model with no slowly-changing history, so a
 * reorganisation silently rewrites every past departmental breakdown: last
 * quarter's headcount by department is recomputed from today's departments and
 * changes under a report that has not been edited. `WorkforceSnapshotDaily`
 * exists to stop that, and every metric that is genuinely about a period —
 * joiners, leavers, turnover, tenure — is defined against this source rather
 * than against `Employee`.
 *
 * **The dimensions here are denormalised foreign keys, not relations.** The
 * snapshot stores `departmentId` as it was on the snapshot date; it has no
 * `department` relation of its own. Reading the name through `employee` would
 * defeat the entire purpose of the model — it would put the employee back in
 * their *current* department — so this source deliberately offers no
 * relation-backed organisational dimension, and the label for each id is
 * resolved through `labelLookup` against the lookup table instead. A department
 * that has since been renamed therefore reports under its current name, which
 * is correct: the same department, relabelled.
 *
 * `derivation` is exposed as a first-class field because a chart must be able
 * to say which part of a line was observed and which part was reconstructed
 * after the fact.
 */

const snapshotDimension = (args: {
  name: string;
  label: string;
  description: string;
  column: string;
  lookupModel: string;
  labelField?: string;
  nullLabel?: string;
}): ReportFieldDefinition => ({
  key: `workforce_history.${args.name}`,
  label: args.label,
  description: args.description,
  type: 'string',
  path: args.column,
  reportable: true,
  filterable: true,
  sortable: true,
  groupable: true,
  groupByField: args.column,
  labelLookup: {
    model: args.lookupModel,
    valueField: 'id',
    labelField: args.labelField ?? 'name',
  },
  nullLabel: args.nullLabel ?? 'Unassigned',
});

const snapshotEnum = (args: {
  name: string;
  label: string;
  description: string;
  column: string;
  values: readonly string[];
  nullLabel?: string;
}): ReportFieldDefinition => ({
  key: `workforce_history.${args.name}`,
  label: args.label,
  description: args.description,
  type: 'enum',
  path: args.column,
  enumValues: args.values,
  reportable: true,
  filterable: true,
  sortable: true,
  groupable: true,
  groupByField: args.column,
  ...(args.nullLabel ? { nullLabel: args.nullLabel } : {}),
});

export const WORKFORCE_HISTORY_SOURCE: ReportDataSource = {
  key: 'workforce_history',
  label: 'Workforce history',
  description:
    'Daily workforce snapshots. One row per employee per day, carrying the organisational placement that was true on that date.',
  prismaModel: 'workforceSnapshotDaily',
  rbacEntityKey: ENTITY_KEYS.EMPLOYEES,
  scope: {
    // `organizationIdField: null` for the same reason as the Workforce source:
    // employee row scope resolves through accessible business units, and the
    // snapshot must not disagree with the Employees screen. The snapshot does
    // carry an `organizationId` column, so this is a deliberate choice and not
    // a statement that the column is missing.
    organizationIdField: null,
    businessUnitIdField: 'businessUnitId',
  },
  defaultDateField: 'snapshotDate',
  recordIdField: 'id',
  caveats: [
    'A BACKFILLED row is reconstructed, not observed: it places the employee in their CURRENT department, business unit, team, location, designation and level, because no record of the historical placement exists before snapshots began. Break any trend down by Derivation before drawing a conclusion about a reorganisation.',
    'Snapshots begin on the day the tenant first ran the snapshot job. Days before that either do not exist or are BACKFILLED.',
    'Organisational dimensions are stored as ids and labelled from the current lookup tables, so a renamed department reports under its new name for every past period.',
    'One row per employee per day: a period longer than a day multiplies the row count. Headcount for a period is the count on a single snapshot date, never the count of rows.',
  ],
  fields: [
    {
      key: 'workforce_history.id',
      label: 'Snapshot row id',
      type: 'string',
      path: 'id',
      reportable: true,
      filterable: true,
      hidden: true,
    },
    {
      key: 'workforce_history.snapshot_date',
      label: 'Snapshot date',
      description:
        'The day this row describes. The default period field for this source.',
      type: 'date',
      path: 'snapshotDate',
      format: 'date',
      reportable: true,
      filterable: true,
      sortable: true,
      groupable: true,
      groupByField: 'snapshotDate',
    },
    {
      key: 'workforce_history.employee',
      label: 'Employee',
      description:
        'The employee this snapshot row describes. Labelled by employee code — Employee stores no single display-name column.',
      type: 'string',
      path: 'employeeId',
      reportable: true,
      filterable: true,
      groupable: true,
      groupByField: 'employeeId',
      labelLookup: {
        model: 'employee',
        valueField: 'id',
        labelField: 'employeeCode',
      },
      nullLabel: 'Unknown employee',
    },
    {
      key: 'workforce_history.employee_code',
      label: 'Employee code',
      description:
        'Read through the employee relation, so it reflects the code today rather than on the snapshot date.',
      type: 'string',
      path: 'employee.employeeCode',
      relationPath: ['employee'],
      reportable: true,
      filterable: true,
    },
    snapshotDimension({
      name: 'organization',
      label: 'Organization',
      description: 'Legal entity on the snapshot date.',
      column: 'organizationId',
      lookupModel: 'organization',
    }),
    snapshotDimension({
      name: 'business_unit',
      label: 'Business unit',
      description: 'Business unit on the snapshot date.',
      column: 'businessUnitId',
      lookupModel: 'businessUnit',
    }),
    snapshotDimension({
      name: 'department',
      label: 'Department',
      description: 'Department on the snapshot date.',
      column: 'departmentId',
      lookupModel: 'department',
    }),
    snapshotDimension({
      name: 'team',
      label: 'Team',
      description: 'Team on the snapshot date.',
      column: 'teamId',
      lookupModel: 'team',
      nullLabel: 'No team',
    }),
    snapshotDimension({
      name: 'location',
      label: 'Location',
      description: 'Assigned location on the snapshot date.',
      column: 'locationId',
      lookupModel: 'location',
      nullLabel: 'No location',
    }),
    snapshotDimension({
      name: 'designation',
      label: 'Designation',
      description: 'Job title on the snapshot date.',
      column: 'designationId',
      lookupModel: 'designation',
    }),
    snapshotDimension({
      name: 'employee_level',
      label: 'Employee level',
      description: 'Grade or band on the snapshot date.',
      column: 'employeeLevelId',
      lookupModel: 'employeeLevel',
    }),
    snapshotDimension({
      name: 'employment_type',
      label: 'Employment type',
      description: 'Tenant-configured employment type on the snapshot date.',
      column: 'employmentTypeId',
      lookupModel: 'employmentType',
    }),
    snapshotDimension({
      name: 'manager',
      label: 'Manager',
      description:
        'Reporting manager on the snapshot date, labelled by employee code.',
      column: 'managerEmployeeId',
      lookupModel: 'employee',
      labelField: 'employeeCode',
      nullLabel: 'No manager',
    }),
    snapshotEnum({
      name: 'employment_status',
      label: 'Employment status',
      description: 'Lifecycle status on the snapshot date.',
      column: 'employmentStatus',
      values: Object.values(EmployeeEmploymentStatus),
    }),
    snapshotEnum({
      name: 'employee_type',
      label: 'Employee type',
      description: 'Full time, part time, contract, intern or consultant.',
      column: 'employeeType',
      values: Object.values(EmployeeType),
      nullLabel: 'Not set',
    }),
    snapshotEnum({
      name: 'work_mode',
      label: 'Work mode',
      description: 'Declared working arrangement on the snapshot date.',
      column: 'workMode',
      values: Object.values(EmployeeWorkMode),
      nullLabel: 'Not set',
    }),
    snapshotEnum({
      name: 'gender',
      label: 'Gender',
      description:
        'Self-declared. A null means nothing was recorded, which is a different answer from PREFER_NOT_TO_SAY.',
      column: 'gender',
      values: Object.values(EmployeeGender),
      nullLabel: 'Not recorded',
    }),
    snapshotEnum({
      name: 'derivation',
      label: 'Derivation',
      description:
        'OBSERVED means the snapshot job ran that day. BACKFILLED means the row was reconstructed afterwards and places the employee in their current organisational unit.',
      column: 'derivation',
      values: Object.values(WorkforceSnapshotDerivation),
    }),
    {
      key: 'workforce_history.hire_date',
      label: 'Hire date',
      type: 'date',
      path: 'hireDate',
      format: 'date',
      reportable: true,
      filterable: true,
      sortable: true,
    },
    {
      key: 'workforce_history.termination_date',
      label: 'Termination date',
      type: 'date',
      path: 'terminationDate',
      format: 'date',
      reportable: true,
      filterable: true,
      sortable: true,
    },
    {
      key: 'workforce_history.is_joiner',
      label: 'Joined on this date',
      description: 'True on the snapshot date matching the employee hire date.',
      type: 'boolean',
      path: 'isJoiner',
      reportable: true,
      filterable: true,
      groupable: true,
      groupByField: 'isJoiner',
    },
    {
      key: 'workforce_history.is_leaver',
      label: 'Left on this date',
      description:
        'True on the snapshot date matching the employee termination date.',
      type: 'boolean',
      path: 'isLeaver',
      reportable: true,
      filterable: true,
      groupable: true,
      groupByField: 'isLeaver',
    },
    {
      key: 'workforce_history.tenure_days',
      label: 'Tenure (days)',
      description:
        'Days between hire date and the snapshot date. Stored per row, so averaging it across a single snapshot date is correct; averaging across several dates weights long periods by row count.',
      type: 'integer',
      path: 'tenureDays',
      reportable: true,
      filterable: true,
      sortable: true,
      aggregatable: true,
      supportedAggregations: ['avg', 'min', 'max', 'sum'],
    },
  ],
};
