import type { Prisma } from '@prisma/client';

export type SystemColumnDefinition = {
  columnKey: string;
  displayName: string;
  dataType: string;
  isRequired?: boolean;
  isReadOnly?: boolean;
  isSearchable?: boolean;
  isFilterable?: boolean;
  isSortable?: boolean;
  isVisible?: boolean;
  isVisibleInCustomization?: boolean;
  isValidForFormDesigner?: boolean;
  isValidForViewDesigner?: boolean;
  sortOrder?: number;
};

export type SystemTableDefinition = {
  tableKey: string;
  moduleKey: string;
  systemName: string;
  displayName: string;
  pluralName: string;
  icon?: string;
  description: string;
  ownershipType?: 'tenant' | 'organization' | 'businessUnit' | 'user' | 'none';
  isCustomizable: boolean;
  isValidForAdvancedFind: boolean;
  isValidForFormDesigner: boolean;
  isValidForViewDesigner: boolean;
  isVisibleInCustomization: boolean;
  displayOrder: number;
  columns: SystemColumnDefinition[];
};

type ExposedPrismaModelConfig = Omit<SystemTableDefinition, 'columns'> & {
  curatedColumns?: SystemColumnDefinition[];
};

const EXPOSED_PRISMA_MODELS: ExposedPrismaModelConfig[] = [
  table('Employee', 'employees', 'Core HR', 'Employee', 'Employees', 10, {
    icon: 'users',
    description: 'Employee and worker master records.',
  }),
  table(
    'EmployeeCompensation',
    'employeeCompensations',
    'Payroll',
    'Employee Compensation',
    'Employee Compensations',
    20,
  ),
  table(
    'EmployeeDocumentReference',
    'employeeDocumentReferences',
    'Documents',
    'Employee Document',
    'Employee Documents',
    30,
  ),
  table(
    'EmployeeEducation',
    'employeeEducation',
    'Core HR',
    'Employee Education',
    'Employee Education',
    40,
  ),
  table(
    'EmployeeLevel',
    'employeeLevels',
    'Core HR',
    'Employee Level',
    'Employee Levels',
    50,
  ),
  table(
    'EmployeePreviousEmployment',
    'employeePreviousEmployment',
    'Core HR',
    'Previous Employment',
    'Previous Employment',
    60,
  ),
  table(
    'EmergencyContact',
    'emergencyContacts',
    'Core HR',
    'Emergency Contact',
    'Emergency Contacts',
    70,
  ),
  table(
    'BusinessUnit',
    'businessUnits',
    'Organization',
    'Business Unit',
    'Business Units',
    110,
    {
      icon: 'building-2',
      description:
        'Organization, branch, department, or external account containers.',
    },
  ),
  table(
    'Organization',
    'organizations',
    'Organization',
    'Organization',
    'Organizations',
    120,
  ),
  table(
    'Department',
    'departments',
    'Organization',
    'Department',
    'Departments',
    130,
  ),
  table(
    'Designation',
    'designations',
    'Organization',
    'Designation',
    'Designations',
    140,
  ),
  table('Location', 'locations', 'Organization', 'Location', 'Locations', 150),
  table('Team', 'teams', 'Organization', 'Team', 'Teams', 160),
  table('User', 'users', 'Security', 'User', 'Users', 210, {
    isValidForFormDesigner: false,
    description:
      'Tenant application users exposed for security administration metadata.',
  }),
  table('Role', 'roles', 'Security', 'Role', 'Roles', 220, {
    isValidForFormDesigner: false,
  }),
  table(
    'Permission',
    'permissions',
    'Security',
    'Permission',
    'Permissions',
    230,
    {
      isCustomizable: false,
      isValidForFormDesigner: false,
    },
  ),
  table('UserRole', 'userRoles', 'Security', 'User Role', 'User Roles', 240, {
    isValidForFormDesigner: false,
  }),
  table(
    'RolePermission',
    'rolePermissions',
    'Security',
    'Role Permission',
    'Role Permissions',
    250,
    {
      isValidForFormDesigner: false,
    },
  ),
  table(
    'LeaveRequest',
    'leaveRequests',
    'Leave',
    'Leave Request',
    'Leave Requests',
    310,
  ),
  table('LeaveType', 'leaveTypes', 'Leave', 'Leave Type', 'Leave Types', 320),
  table(
    'LeavePolicy',
    'leavePolicies',
    'Leave',
    'Leave Policy',
    'Leave Policies',
    330,
  ),
  table(
    'LeaveBalance',
    'leaveBalances',
    'Leave',
    'Leave Balance',
    'Leave Balances',
    340,
  ),
  table(
    'HolidayCalendar',
    'holidayCalendars',
    'Leave',
    'Holiday Calendar',
    'Holiday Calendars',
    350,
  ),
  table('Holiday', 'holidays', 'Leave', 'Holiday', 'Holidays', 360),
  table(
    'AttendanceEntry',
    'attendanceEntries',
    'Attendance',
    'Attendance Entry',
    'Attendance Entries',
    410,
  ),
  table(
    'AttendancePolicy',
    'attendancePolicies',
    'Attendance',
    'Attendance Policy',
    'Attendance Policies',
    420,
  ),
  table(
    'WorkSchedule',
    'workSchedules',
    'Attendance',
    'Work Schedule',
    'Work Schedules',
    430,
  ),
  table(
    'WorkSession',
    'workSessions',
    'Attendance',
    'Work Session',
    'Work Sessions',
    440,
  ),
  table(
    'Timesheet',
    'timesheets',
    'Attendance',
    'Timesheet',
    'Timesheets',
    450,
  ),
  table(
    'TimesheetEntry',
    'timesheetEntries',
    'Attendance',
    'Timesheet Entry',
    'Timesheet Entries',
    460,
  ),
  table(
    'PayrollCycle',
    'payrollCycles',
    'Payroll',
    'Payroll Cycle',
    'Payroll Cycles',
    510,
    {
      icon: 'wallet-cards',
    },
  ),
  table(
    'PayrollRun',
    'payrollRuns',
    'Payroll',
    'Payroll Run',
    'Payroll Runs',
    520,
  ),
  table(
    'PayrollRunEmployee',
    'payrollRunEmployees',
    'Payroll',
    'Payroll Run Employee',
    'Payroll Run Employees',
    530,
  ),
  table(
    'PayrollRecord',
    'payrollRecords',
    'Payroll',
    'Payroll Record',
    'Payroll Records',
    540,
  ),
  table(
    'PayrollPeriod',
    'payrollPeriods',
    'Payroll',
    'Payroll Period',
    'Payroll Periods',
    550,
  ),
  table('Payslip', 'payslips', 'Payroll', 'Payslip', 'Payslips', 560),
  table(
    'PayComponent',
    'payComponents',
    'Payroll',
    'Pay Component',
    'Pay Components',
    570,
  ),
  table(
    'SalaryComponent',
    'salaryComponents',
    'Payroll',
    'Salary Component',
    'Salary Components',
    580,
  ),
  table(
    'ClaimRequest',
    'claimRequests',
    'Claims',
    'Claim Request',
    'Claim Requests',
    610,
  ),
  table('ClaimType', 'claimTypes', 'Claims', 'Claim Type', 'Claim Types', 620),
  table(
    'ClaimSubType',
    'claimSubTypes',
    'Claims',
    'Claim Sub Type',
    'Claim Sub Types',
    630,
  ),
  table('Document', 'documents', 'Documents', 'Document', 'Documents', 710),
  table(
    'DocumentCategory',
    'documentCategories',
    'Documents',
    'Document Category',
    'Document Categories',
    720,
  ),
  table(
    'DocumentType',
    'documentTypes',
    'Documents',
    'Document Type',
    'Document Types',
    730,
  ),
  table('Policy', 'policies', 'Documents', 'Policy', 'Policies', 740),
  table(
    'PolicyAssignment',
    'policyAssignments',
    'Documents',
    'Policy Assignment',
    'Policy Assignments',
    750,
  ),
  table(
    'Candidate',
    'candidates',
    'Recruitment',
    'Candidate',
    'Candidates',
    810,
    {
      icon: 'user-round-search',
    },
  ),
  table(
    'JobOpening',
    'jobOpenings',
    'Recruitment',
    'Job Opening',
    'Job Openings',
    820,
  ),
  table(
    'Application',
    'applications',
    'Recruitment',
    'Application',
    'Applications',
    830,
  ),
  table(
    'OnboardingTask',
    'onboardingTasks',
    'Onboarding',
    'Onboarding Task',
    'Onboarding Tasks',
    910,
  ),
  table(
    'OnboardingTemplate',
    'onboardingTemplates',
    'Onboarding',
    'Onboarding Template',
    'Onboarding Templates',
    920,
  ),
  table('Project', 'projects', 'Organization', 'Project', 'Projects', 1010, {
    icon: 'folder-kanban',
  }),
  table('Country', 'countries', 'Settings', 'Country', 'Countries', 1110, {
    isCustomizable: false,
    isValidForFormDesigner: false,
  }),
  table(
    'TenantSetting',
    'tenantSettings',
    'Settings',
    'Tenant Setting',
    'Tenant Settings',
    1130,
    {
      isValidForFormDesigner: false,
    },
  ),
];

const HIDDEN_COLUMN_PATTERNS = [
  /password/i,
  /token/i,
  /secret/i,
  /apiKey/i,
  /hash/i,
  /salt/i,
  /reset/i,
  /activation/i,
  /tenantId/i,
  /createdBy(User)?Id/i,
  /updatedBy(User)?Id/i,
  /deletedAt/i,
  /stripe/i,
  /webhook/i,
  /raw/i,
  /metadataJson/i,
];

const READ_ONLY_COLUMN_NAMES = new Set([
  'id',
  'createdAt',
  'updatedAt',
  'createdByUserId',
  'updatedByUserId',
  'tenantId',
]);

const FIELD_TYPE_BY_PRISMA_TYPE: Record<string, string> = {
  String: 'text',
  Int: 'number',
  BigInt: 'number',
  Float: 'decimal',
  Decimal: 'decimal',
  DateTime: 'datetime',
  Boolean: 'boolean',
  Json: 'textarea',
  Bytes: 'textarea',
};

export const SYSTEM_CUSTOMIZATION_TABLES: SystemTableDefinition[] =
  buildSystemCustomizationTables();

export const SYSTEM_CUSTOMIZATION_TABLE_KEYS = new Set(
  SYSTEM_CUSTOMIZATION_TABLES.map(
    (tableDefinition) => tableDefinition.tableKey,
  ),
);

export function findSystemCustomizationTable(tableKey: string) {
  return SYSTEM_CUSTOMIZATION_TABLES.find(
    (tableDefinition) => tableDefinition.tableKey === tableKey,
  );
}

export function isDesignerColumn(column: {
  isVisible?: boolean;
  isVisibleInCustomization?: boolean;
  isValidForFormDesigner?: boolean;
}) {
  return (
    column.isVisible !== false &&
    column.isVisibleInCustomization !== false &&
    column.isValidForFormDesigner !== false
  );
}

export function isViewDesignerColumn(column: {
  isVisible?: boolean;
  isVisibleInCustomization?: boolean;
  isValidForViewDesigner?: boolean;
}) {
  return (
    column.isVisible !== false &&
    column.isVisibleInCustomization !== false &&
    column.isValidForViewDesigner !== false
  );
}

function buildSystemCustomizationTables() {
  const prismaDmmf = loadPrismaDmmf();
  const modelByName = new Map(
    prismaDmmf.datamodel.models.map((model) => [model.name, model]),
  );

  return EXPOSED_PRISMA_MODELS.flatMap((definition) => {
    const model = modelByName.get(definition.systemName);
    if (!model) return [];
    const curatedByKey = new Map(
      (definition.curatedColumns ?? []).map((column) => [
        column.columnKey,
        column,
      ]),
    );
    const columns = model.fields
      .filter((field) => field.kind === 'scalar' || field.kind === 'enum')
      .map((field, index) => {
        const curated = curatedByKey.get(field.name);
        const visible =
          curated?.isVisibleInCustomization ?? isBusinessColumn(field.name);
        const isLookupId =
          field.name.endsWith('Id') &&
          !['id', 'employeeId', 'userId'].includes(field.name);
        return {
          columnKey: field.name,
          displayName: curated?.displayName ?? humanize(field.name),
          dataType:
            curated?.dataType ??
            mapFieldType(field.type, field.kind, field.name),
          isRequired:
            curated?.isRequired ?? (field.isRequired && !field.hasDefaultValue),
          isReadOnly:
            curated?.isReadOnly ??
            (READ_ONLY_COLUMN_NAMES.has(field.name) ||
              field.isId ||
              field.isUpdatedAt),
          isSearchable:
            curated?.isSearchable ??
            (visible && field.type === 'String' && !field.name.endsWith('Id')),
          isFilterable: curated?.isFilterable ?? visible,
          isSortable: curated?.isSortable ?? visible,
          isVisible: curated?.isVisible ?? visible,
          isVisibleInCustomization: visible,
          isValidForFormDesigner:
            curated?.isValidForFormDesigner ??
            (visible && definition.isValidForFormDesigner && !isLookupId),
          isValidForViewDesigner:
            curated?.isValidForViewDesigner ??
            (visible && definition.isValidForViewDesigner),
          sortOrder: curated?.sortOrder ?? index * 10,
        };
      });

    return [{ ...definition, columns }];
  }).sort((left, right) => left.displayOrder - right.displayOrder);
}

function table(
  systemName: string,
  tableKey: string,
  moduleKey: string,
  displayName: string,
  pluralName: string,
  displayOrder: number,
  overrides: Partial<ExposedPrismaModelConfig> = {},
): ExposedPrismaModelConfig {
  return {
    tableKey,
    moduleKey,
    systemName,
    displayName,
    pluralName,
    icon: overrides.icon ?? 'database',
    description:
      overrides.description ??
      `${displayName} metadata exposed through the tenant Default Solution.`,
    ownershipType: overrides.ownershipType ?? 'tenant',
    isCustomizable: overrides.isCustomizable ?? true,
    isValidForAdvancedFind: overrides.isValidForAdvancedFind ?? true,
    isValidForFormDesigner: overrides.isValidForFormDesigner ?? true,
    isValidForViewDesigner: overrides.isValidForViewDesigner ?? true,
    isVisibleInCustomization: overrides.isVisibleInCustomization ?? true,
    displayOrder,
    curatedColumns: overrides.curatedColumns,
  };
}

function isBusinessColumn(columnKey: string) {
  return !HIDDEN_COLUMN_PATTERNS.some((pattern) => pattern.test(columnKey));
}

function mapFieldType(type: string, kind: string, fieldName: string) {
  if (kind === 'enum') return 'select';
  if (/email/i.test(fieldName)) return 'email';
  if (/phone|mobile/i.test(fieldName)) return 'phone';
  if (/url|website/i.test(fieldName)) return 'url';
  if (/amount|salary|price|cost|rate|currency/i.test(fieldName))
    return 'currency';
  return FIELD_TYPE_BY_PRISMA_TYPE[type] ?? 'text';
}

function humanize(value: string) {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\bid\b/gi, 'ID')
    .replace(/\b\w/g, (char) => char.toUpperCase())
    .trim();
}

function loadPrismaDmmf(): typeof Prisma.dmmf {
  // Lazy load avoids CJS initialization cycles in seed scripts that import
  // PrismaClient and this registry in the same module.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const prismaClient = require('@prisma/client') as {
    Prisma: { dmmf: typeof Prisma.dmmf };
  };
  return prismaClient.Prisma.dmmf;
}
