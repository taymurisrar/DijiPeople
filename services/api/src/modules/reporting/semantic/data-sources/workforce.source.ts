import {
  EmployeeContractType,
  EmployeeEmploymentStatus,
  EmployeeGender,
  EmployeeRecordType,
  EmployeeType,
  EmployeeWorkMode,
} from '@prisma/client';
import { ENTITY_KEYS } from '../../../../common/constants/rbac-matrix';
import type {
  ReportDataSource,
  ReportFieldDefinition,
} from '../semantic.types';

/**
 * Workforce — current state, one row per employee.
 *
 * Three things here are deliberate and each of them is a defect somewhere else
 * in this repository that this source exists to stop repeating.
 *
 * **1. `baseWhere` is `{ isDeleted: false, deletedAt: null }`.**
 * `Employee` is the only HR model in this schema carrying a soft-delete pair,
 * and `EmployeesRepository.buildWhere()` applies exactly this predicate. The
 * pre-existing `/reports` endpoints omit it, which is why their headcount has
 * never agreed with the Employees screen. Reports disagreeing with the screen
 * they claim to summarise is the defect being fixed, not a rounding difference.
 *
 * **2. The scope options mirror `employees.service.ts` exactly** —
 * `{ organizationIdField: null, userIdField: 'userId' }`. `Employee` does have
 * an `organizationId` column, so `null` here is not a statement about the
 * schema: it is a statement that employee row scope is resolved through
 * accessible business units, the way the Employees screen resolves it. Pointing
 * this at `organizationId` would give a reporting user a different set of
 * employees than the same user sees on the list screen.
 *
 * **3. Identity PII is absent, not restricted.** `cnic`, `taxIdentifier`,
 * `dateOfBirth` and `personalEmail` are reachable columns and are deliberately
 * not exposed: there is no employee-PII permission key in
 * `common/constants/permissions.ts` to gate them with, and a `RESTRICTED` field
 * with no permission is an open field. Bank details and compensation live on
 * their own models and are not reachable as scalars from here at all.
 */

/** Turn a null foreign key into something a chart legend can print. */
const UNASSIGNED = 'Unassigned';

type EmployeeDimensionOptions = {
  /** Source key, used to prefix every produced field key. */
  sourceKey: string;
  /**
   * Relation segments from the source's root model to `Employee`. Empty when
   * the root model *is* `Employee`.
   */
  employeeRelationPath: string[];
  /**
   * The scalar column on the ROOT model holding the employee id, when the
   * employee is reached through a relation. Grouping by employee is only
   * offered when this is given, because Prisma `groupBy` cannot traverse a
   * relation.
   */
  employeeIdField?: string;
};

/**
 * The twelve organisational dimensions every employee-bearing source offers.
 *
 * Produced from one place so `attendance.department` and `workforce.department`
 * can never come to mean different things — and so the `groupable` decision is
 * made once, correctly, per root model.
 *
 * **Grouping is only offered when the root model carries the foreign key.**
 * `Employee` carries `departmentId`, so `workforce.department` groups. An
 * `AttendanceDay` reaches a department through `employee` and carries no
 * `departmentId` of its own, so `attendance.department` is filterable and
 * selectable but **not** groupable: Prisma `groupBy` accepts scalar columns of
 * the model being grouped and nothing else. Inventing a denormalised column to
 * make the registry look symmetrical would be a schema change dressed up as a
 * catalog entry. Grouping attendance by department is done by grouping on
 * `employeeId` and rolling up, or by adding the column — both are decisions for
 * the query planner and the schema owner, not for this file.
 */
export function employeeDimensionFields(
  options: EmployeeDimensionOptions,
): ReportFieldDefinition[] {
  const { sourceKey, employeeRelationPath, employeeIdField } = options;
  const isRoot = employeeRelationPath.length === 0;
  const prefix = isRoot ? '' : `${employeeRelationPath.join('.')}.`;
  const key = (name: string) => `${sourceKey}.${name}`;

  /** A relation-backed lookup dimension, e.g. department -> department.name. */
  const lookup = (args: {
    name: string;
    label: string;
    description: string;
    relationField: string;
    /** Prisma delegate that owns the label, e.g. `department`. */
    lookupModel: string;
    /** Scalar foreign key on `Employee`. */
    foreignKey: string;
    labelField?: string;
    nullLabel?: string;
  }): ReportFieldDefinition => ({
    key: key(args.name),
    label: args.label,
    description: args.description,
    type: 'string',
    path: `${prefix}${args.relationField}.${args.labelField ?? 'name'}`,
    relationPath: [...employeeRelationPath, args.relationField],
    reportable: true,
    filterable: true,
    sortable: isRoot,
    // Only the root model's own foreign keys can be grouped on.
    groupable: isRoot,
    ...(isRoot
      ? {
          groupByField: args.foreignKey,
          labelLookup: {
            model: args.lookupModel,
            valueField: 'id',
            labelField: args.labelField ?? 'name',
          },
          nullLabel: args.nullLabel ?? UNASSIGNED,
        }
      : {}),
  });

  /** An enum column on `Employee`. Its own label; no lookup needed. */
  const employeeEnum = (args: {
    name: string;
    label: string;
    description: string;
    column: string;
    values: readonly string[];
    nullLabel?: string;
  }): ReportFieldDefinition => ({
    key: key(args.name),
    label: args.label,
    description: args.description,
    type: 'enum',
    path: `${prefix}${args.column}`,
    ...(isRoot ? {} : { relationPath: [...employeeRelationPath] }),
    enumValues: args.values,
    reportable: true,
    filterable: true,
    sortable: isRoot,
    groupable: isRoot,
    ...(isRoot
      ? { groupByField: args.column, nullLabel: args.nullLabel ?? UNASSIGNED }
      : {}),
  });

  const fields: ReportFieldDefinition[] = [
    lookup({
      name: 'organization',
      label: 'Organization',
      description: 'Legal entity the employee belongs to.',
      relationField: 'organization',
      lookupModel: 'organization',
      foreignKey: 'organizationId',
    }),
    lookup({
      name: 'business_unit',
      label: 'Business unit',
      description:
        'Business unit the employee belongs to. This is the column row-level access scoping resolves against.',
      relationField: 'businessUnit',
      lookupModel: 'businessUnit',
      foreignKey: 'businessUnitId',
    }),
    lookup({
      name: 'department',
      label: 'Department',
      description: 'Department the employee belongs to.',
      relationField: 'department',
      lookupModel: 'department',
      foreignKey: 'departmentId',
    }),
    lookup({
      name: 'team',
      label: 'Team',
      description: 'Team the employee belongs to.',
      relationField: 'team',
      lookupModel: 'team',
      foreignKey: 'teamId',
      nullLabel: 'No team',
    }),
    lookup({
      name: 'location',
      label: 'Location',
      description:
        'Assigned work location. Not the official joining location, which is a separate column.',
      relationField: 'location',
      lookupModel: 'location',
      foreignKey: 'locationId',
      nullLabel: 'No location',
    }),
    lookup({
      name: 'designation',
      label: 'Designation',
      description: 'Job title held by the employee.',
      relationField: 'designation',
      lookupModel: 'designation',
      foreignKey: 'designationId',
    }),
    lookup({
      name: 'employee_level',
      label: 'Employee level',
      description: 'Grade or band.',
      relationField: 'employeeLevel',
      lookupModel: 'employeeLevel',
      foreignKey: 'employeeLevelId',
    }),
    lookup({
      name: 'employment_type',
      label: 'Employment type',
      description:
        'Tenant-configured employment type. Reached through the `employmentTypeRef` relation — `employmentType` is not the relation name on Employee.',
      relationField: 'employmentTypeRef',
      lookupModel: 'employmentType',
      foreignKey: 'employmentTypeId',
    }),
    employeeEnum({
      name: 'employment_status',
      label: 'Employment status',
      description:
        'Lifecycle status. Distinct from the free-text `status` column, which this catalog does not expose.',
      column: 'employmentStatus',
      values: Object.values(EmployeeEmploymentStatus),
    }),
    employeeEnum({
      name: 'work_mode',
      label: 'Work mode',
      description: 'Declared working arrangement.',
      column: 'workMode',
      values: Object.values(EmployeeWorkMode),
      nullLabel: 'Not set',
    }),
    employeeEnum({
      name: 'gender',
      label: 'Gender',
      description:
        'Self-declared. Includes PREFER_NOT_TO_SAY; a null means nothing was recorded, which is not the same answer.',
      column: 'gender',
      values: Object.values(EmployeeGender),
      nullLabel: 'Not recorded',
    }),
    {
      key: key('manager'),
      label: 'Manager',
      description:
        'Reporting manager. Grouping keys on `managerEmployeeId`; the label is the manager employee code, because Employee has no single stored display-name column.',
      type: 'string',
      path: `${prefix}manager.employeeCode`,
      relationPath: [...employeeRelationPath, 'manager'],
      reportable: true,
      filterable: true,
      sortable: isRoot,
      groupable: isRoot,
      ...(isRoot
        ? {
            groupByField: 'managerEmployeeId',
            labelLookup: {
              model: 'employee',
              valueField: 'id',
              labelField: 'employeeCode',
            },
            nullLabel: 'No manager',
          }
        : {}),
    },
  ];

  if (!isRoot) {
    // The employee themself is a dimension on every non-Employee source, and
    // it is the one dimension those sources CAN group on, because they all
    // carry the foreign key.
    fields.unshift({
      key: key('employee'),
      label: 'Employee',
      description:
        'The employee this row belongs to. Labelled by employee code — Employee stores no single display-name column.',
      type: 'string',
      path: `${prefix}employeeCode`,
      relationPath: [...employeeRelationPath],
      reportable: true,
      filterable: true,
      sortable: false,
      groupable: employeeIdField !== undefined,
      ...(employeeIdField !== undefined
        ? {
            groupByField: employeeIdField,
            labelLookup: {
              model: 'employee',
              valueField: 'id',
              labelField: 'employeeCode',
            },
            nullLabel: 'Unknown employee',
          }
        : {}),
    });
  }

  return fields;
}

export const WORKFORCE_SOURCE: ReportDataSource = {
  key: 'workforce',
  label: 'Workforce',
  description:
    'Current-state employee records. One row per employee, as the Employees screen sees them.',
  prismaModel: 'employee',
  rbacEntityKey: ENTITY_KEYS.EMPLOYEES,
  scope: {
    // Mirrors employees.service.ts findByTenant() exactly. Do not "improve" it.
    organizationIdField: null,
    userIdField: 'userId',
  },
  baseWhere: { isDeleted: false, deletedAt: null },
  defaultDateField: 'hireDate',
  recordIdField: 'id',
  recordHrefTemplate: '/employees/{id}',
  caveats: [
    'Current state only. An employee who moved department last month appears under their department today, for every past period — Employee carries no history. Use the Workforce history source for anything time-sliced.',
    'A period narrows this source on hire date, because that is the only lifecycle date every row has. Headcount is therefore a current-state number and is not narrowed by the period unless the report asks for it.',
    'Soft-deleted employees are excluded (`isDeleted = false` and `deletedAt` is null), matching the Employees screen.',
    'National identity numbers, tax identifiers, dates of birth, personal email addresses, bank details and compensation are not available in reporting.',
  ],
  fields: [
    {
      key: 'workforce.id',
      label: 'Employee record id',
      type: 'string',
      path: 'id',
      reportable: true,
      filterable: true,
      hidden: true,
    },
    {
      key: 'workforce.employee_code',
      label: 'Employee code',
      description: 'Tenant-unique employee code.',
      type: 'string',
      path: 'employeeCode',
      reportable: true,
      filterable: true,
      sortable: true,
    },
    {
      key: 'workforce.first_name',
      label: 'First name',
      type: 'string',
      path: 'firstName',
      reportable: true,
      filterable: true,
      sortable: true,
      sensitivity: 'INTERNAL',
    },
    {
      key: 'workforce.last_name',
      label: 'Last name',
      type: 'string',
      path: 'lastName',
      reportable: true,
      filterable: true,
      sortable: true,
      sensitivity: 'INTERNAL',
    },
    {
      key: 'workforce.preferred_name',
      label: 'Preferred name',
      type: 'string',
      path: 'preferredName',
      reportable: true,
      filterable: true,
      sortable: true,
      sensitivity: 'INTERNAL',
    },
    {
      key: 'workforce.work_email',
      label: 'Work email',
      description:
        'Company email address. The personal email column is deliberately not exposed in reporting.',
      type: 'string',
      path: 'email',
      reportable: true,
      filterable: true,
      sortable: true,
      sensitivity: 'INTERNAL',
    },
    {
      key: 'workforce.record_type',
      label: 'Record type',
      description:
        'Internal employee, external worker or contractor. External workers are counted in headcount unless a report filters them out.',
      type: 'enum',
      path: 'recordType',
      enumValues: Object.values(EmployeeRecordType),
      reportable: true,
      filterable: true,
      sortable: true,
      groupable: true,
      groupByField: 'recordType',
    },
    {
      key: 'workforce.employee_type',
      label: 'Employee type',
      description: 'Full time, part time, contract, intern or consultant.',
      type: 'enum',
      path: 'employeeType',
      enumValues: Object.values(EmployeeType),
      reportable: true,
      filterable: true,
      sortable: true,
      groupable: true,
      groupByField: 'employeeType',
      nullLabel: 'Not set',
    },
    {
      key: 'workforce.contract_type',
      label: 'Contract type',
      type: 'enum',
      path: 'contractType',
      enumValues: Object.values(EmployeeContractType),
      reportable: true,
      filterable: true,
      sortable: true,
      groupable: true,
      groupByField: 'contractType',
      nullLabel: 'Not set',
    },
    {
      key: 'workforce.hire_date',
      label: 'Hire date',
      description: 'Start of employment. The default period field for this source.',
      type: 'date',
      path: 'hireDate',
      format: 'date',
      reportable: true,
      filterable: true,
      sortable: true,
      groupable: true,
      groupByField: 'hireDate',
      aggregatable: true,
      supportedAggregations: ['min', 'max', 'count'],
    },
    {
      key: 'workforce.confirmation_date',
      label: 'Confirmation date',
      description: 'Date probation was confirmed, when it has been.',
      type: 'date',
      path: 'confirmationDate',
      format: 'date',
      reportable: true,
      filterable: true,
      sortable: true,
    },
    {
      key: 'workforce.probation_end_date',
      label: 'Probation end date',
      type: 'date',
      path: 'probationEndDate',
      format: 'date',
      reportable: true,
      filterable: true,
      sortable: true,
    },
    {
      key: 'workforce.termination_date',
      label: 'Termination date',
      description:
        'Set when employment ended. Present on soft-deleted rows too, which this source excludes.',
      type: 'date',
      path: 'terminationDate',
      format: 'date',
      reportable: true,
      filterable: true,
      sortable: true,
    },
    {
      key: 'workforce.notice_period_days',
      label: 'Notice period (days)',
      type: 'integer',
      path: 'noticePeriodDays',
      reportable: true,
      filterable: true,
      sortable: true,
      aggregatable: true,
      supportedAggregations: ['sum', 'avg', 'min', 'max'],
    },
    {
      key: 'workforce.is_draft_profile',
      label: 'Draft profile',
      description:
        'A profile created from recruitment that has not been completed. Counted in headcount unless filtered out — the Employees screen does not exclude these either.',
      type: 'boolean',
      path: 'isDraftProfile',
      reportable: true,
      filterable: true,
      groupable: true,
      groupByField: 'isDraftProfile',
    },
    {
      key: 'workforce.created_at',
      label: 'Record created at',
      type: 'datetime',
      path: 'createdAt',
      format: 'datetime',
      reportable: true,
      filterable: true,
      sortable: true,
    },
    ...employeeDimensionFields({
      sourceKey: 'workforce',
      employeeRelationPath: [],
    }),
  ],
};
