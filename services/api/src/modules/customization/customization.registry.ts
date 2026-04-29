export type SystemColumnDefinition = {
  columnKey: string;
  displayName: string;
  dataType: string;
  isRequired?: boolean;
  isReadOnly?: boolean;
  isSearchable?: boolean;
};

export type SystemTableDefinition = {
  tableKey: string;
  moduleKey: string;
  systemName: string;
  displayName: string;
  pluralName: string;
  icon?: string;
  description: string;
  columns: SystemColumnDefinition[];
};

export const SYSTEM_CUSTOMIZATION_TABLES: SystemTableDefinition[] = [
  {
    tableKey: 'candidates',
    moduleKey: 'recruitment',
    systemName: 'Candidate',
    displayName: 'Candidate',
    pluralName: 'Candidates',
    icon: 'user-round-search',
    description: 'Candidate profiles used by recruitment workflows.',
    columns: [
      {
        columnKey: 'firstName',
        displayName: 'First Name',
        dataType: 'text',
        isRequired: true,
        isSearchable: true,
      },
      {
        columnKey: 'lastName',
        displayName: 'Last Name',
        dataType: 'text',
        isRequired: true,
        isSearchable: true,
      },
      {
        columnKey: 'email',
        displayName: 'Email',
        dataType: 'email',
        isSearchable: true,
      },
      {
        columnKey: 'phone',
        displayName: 'Phone',
        dataType: 'phone',
        isSearchable: true,
      },
      { columnKey: 'status', displayName: 'Status', dataType: 'select' },
      { columnKey: 'source', displayName: 'Source', dataType: 'select' },
    ],
  },
  {
    tableKey: 'leads',
    moduleKey: 'crm',
    systemName: 'Lead',
    displayName: 'Lead',
    pluralName: 'Leads',
    icon: 'badge-dollar-sign',
    description: 'Prospect records used by sales and onboarding workflows.',
    columns: [
      {
        columnKey: 'companyName',
        displayName: 'Company Name',
        dataType: 'text',
        isRequired: true,
        isSearchable: true,
      },
      {
        columnKey: 'contactName',
        displayName: 'Contact Name',
        dataType: 'text',
        isSearchable: true,
      },
      {
        columnKey: 'contactEmail',
        displayName: 'Contact Email',
        dataType: 'email',
        isSearchable: true,
      },
      {
        columnKey: 'contactPhone',
        displayName: 'Contact Phone',
        dataType: 'phone',
      },
      { columnKey: 'status', displayName: 'Status', dataType: 'select' },
    ],
  },
  {
    tableKey: 'customers',
    moduleKey: 'crm',
    systemName: 'CustomerAccount',
    displayName: 'Customer',
    pluralName: 'Customers',
    icon: 'briefcase-business',
    description: 'Customer account records managed by the tenant.',
    columns: [
      {
        columnKey: 'companyName',
        displayName: 'Company Name',
        dataType: 'text',
        isRequired: true,
        isSearchable: true,
      },
      {
        columnKey: 'legalCompanyName',
        displayName: 'Legal Company Name',
        dataType: 'text',
        isSearchable: true,
      },
      {
        columnKey: 'contactEmail',
        displayName: 'Contact Email',
        dataType: 'email',
        isSearchable: true,
      },
      {
        columnKey: 'contactPhone',
        displayName: 'Contact Phone',
        dataType: 'phone',
      },
      { columnKey: 'status', displayName: 'Status', dataType: 'select' },
    ],
  },
  {
    tableKey: 'employees',
    moduleKey: 'employees',
    systemName: 'Employee',
    displayName: 'Employee',
    pluralName: 'Employees',
    icon: 'users',
    description: 'Employee and worker master records.',
    columns: [
      {
        columnKey: 'employeeCode',
        displayName: 'Employee Code',
        dataType: 'text',
        isRequired: true,
        isSearchable: true,
      },
      {
        columnKey: 'firstName',
        displayName: 'First Name',
        dataType: 'text',
        isRequired: true,
        isSearchable: true,
      },
      {
        columnKey: 'lastName',
        displayName: 'Last Name',
        dataType: 'text',
        isRequired: true,
        isSearchable: true,
      },
      {
        columnKey: 'email',
        displayName: 'Work Email',
        dataType: 'email',
        isSearchable: true,
      },
      {
        columnKey: 'recordType',
        displayName: 'Record Type',
        dataType: 'select',
      },
      {
        columnKey: 'businessUnitId',
        displayName: 'Business Unit',
        dataType: 'lookup',
      },
      {
        columnKey: 'departmentId',
        displayName: 'Department',
        dataType: 'lookup',
      },
      {
        columnKey: 'employmentStatus',
        displayName: 'Employment Status',
        dataType: 'select',
      },
    ],
  },
  {
    tableKey: 'businessUnits',
    moduleKey: 'organization',
    systemName: 'BusinessUnit',
    displayName: 'Business Unit',
    pluralName: 'Business Units',
    icon: 'building-2',
    description:
      'Generic organization, branch, department, or external account containers.',
    columns: [
      {
        columnKey: 'name',
        displayName: 'Name',
        dataType: 'text',
        isRequired: true,
        isSearchable: true,
      },
      { columnKey: 'type', displayName: 'Type', dataType: 'select' },
      {
        columnKey: 'organizationId',
        displayName: 'Organization',
        dataType: 'lookup',
        isRequired: true,
      },
      {
        columnKey: 'parentBusinessUnitId',
        displayName: 'Parent Business Unit',
        dataType: 'lookup',
      },
    ],
  },
  {
    tableKey: 'projects',
    moduleKey: 'projects',
    systemName: 'Project',
    displayName: 'Project',
    pluralName: 'Projects',
    icon: 'folder-kanban',
    description: 'Projects, cost centers, and work allocation contexts.',
    columns: [
      {
        columnKey: 'code',
        displayName: 'Code',
        dataType: 'text',
        isSearchable: true,
      },
      {
        columnKey: 'name',
        displayName: 'Name',
        dataType: 'text',
        isRequired: true,
        isSearchable: true,
      },
      {
        columnKey: 'businessUnitId',
        displayName: 'Business Unit',
        dataType: 'lookup',
      },
      { columnKey: 'status', displayName: 'Status', dataType: 'select' },
    ],
  },
  {
    tableKey: 'timesheets',
    moduleKey: 'timesheets',
    systemName: 'Timesheet',
    displayName: 'Timesheet',
    pluralName: 'Timesheets',
    icon: 'calendar-days',
    description: 'Monthly work record periods and approval state.',
    columns: [
      {
        columnKey: 'employeeId',
        displayName: 'Employee',
        dataType: 'lookup',
        isRequired: true,
      },
      {
        columnKey: 'businessUnitId',
        displayName: 'Business Unit',
        dataType: 'lookup',
      },
      {
        columnKey: 'year',
        displayName: 'Year',
        dataType: 'number',
        isRequired: true,
      },
      {
        columnKey: 'month',
        displayName: 'Month',
        dataType: 'number',
        isRequired: true,
      },
      { columnKey: 'status', displayName: 'Status', dataType: 'select' },
    ],
  },
  {
    tableKey: 'payrollCycles',
    moduleKey: 'payroll',
    systemName: 'PayrollCycle',
    displayName: 'Payroll Cycle',
    pluralName: 'Payroll Cycles',
    icon: 'wallet-cards',
    description: 'Payroll processing windows and generated payroll outputs.',
    columns: [
      {
        columnKey: 'businessUnitId',
        displayName: 'Business Unit',
        dataType: 'lookup',
      },
      {
        columnKey: 'periodStart',
        displayName: 'Period Start',
        dataType: 'date',
        isRequired: true,
      },
      {
        columnKey: 'periodEnd',
        displayName: 'Period End',
        dataType: 'date',
        isRequired: true,
      },
      { columnKey: 'status', displayName: 'Status', dataType: 'select' },
      { columnKey: 'runDate', displayName: 'Run Date', dataType: 'datetime' },
    ],
  },
];

export function findSystemCustomizationTable(tableKey: string) {
  return SYSTEM_CUSTOMIZATION_TABLES.find(
    (table) => table.tableKey === tableKey,
  );
}
