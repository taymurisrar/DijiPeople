import {
  RoleAccessLevel,
  SecurityAccessLevel,
  SecurityPrivilege,
} from '@prisma/client';

export type RbacEntityDefinition = {
  key: string;
  label: string;
  category: string;
};

export type MiscPermissionDefinition = {
  key: string;
  label: string;
  description: string;
  category: string;
};

export type SystemRoleKey =
  | 'global-admin'
  | 'system-admin'
  | 'system-customizer'
  | 'ceo'
  | 'manager'
  | 'hr'
  | 'recruiter'
  | 'payroll-manager'
  | 'employee';

export const ROLE_KEYS = {
  GLOBAL_ADMIN: 'global-admin',
  SYSTEM_ADMIN: 'system-admin',
  SYSTEM_CUSTOMIZER: 'system-customizer',
  CEO: 'ceo',
  MANAGER: 'manager',
  HR: 'hr',
  RECRUITER: 'recruiter',
  PAYROLL_MANAGER: 'payroll-manager',
  EMPLOYEE: 'employee',
} as const satisfies Record<string, SystemRoleKey>;

export const ENTITY_KEYS = {
  EMPLOYEES: 'employees',
  EMPLOYEE_LEVELS: 'employee-levels',
  USERS: 'users',
  ROLES: 'roles',
  CANDIDATES: 'candidates',
  JOBS: 'jobs',
  ONBOARDING: 'onboarding',
  ATTENDANCE: 'attendance',
  AGENT: 'agent',
  TIMESHEETS: 'timesheets',
  LEAVE_REQUESTS: 'leave-requests',
  PAYROLL: 'payroll',
  PAYROLL_CALENDARS: 'payroll-calendars',
  PAYROLL_PERIODS: 'payroll-periods',
  PAYROLL_RUNS: 'payroll-runs',
  PAYSLIPS: 'payslips',
  CLAIM_TYPES: 'claim-types',
  CLAIMS: 'claims',
  BUSINESS_TRIPS: 'business-trips',
  TADA_POLICIES: 'tada-policies',
  TIME_PAYROLL_POLICIES: 'time-payroll-policies',
  OVERTIME_POLICIES: 'overtime-policies',
  PAYROLL_TIME_INPUTS: 'payroll-time-inputs',
  TAX_RULES: 'tax-rules',
  PAYROLL_GL: 'payroll-gl',
  PAYROLL_JOURNAL: 'payroll-journal',
  PAY_COMPONENTS: 'pay-components',
  COMPENSATION: 'compensation',
  POLICIES: 'policies',
  DOCUMENTS: 'documents',
  PROJECTS: 'projects',
  SETTINGS: 'settings',
  REPORTS: 'reports',
  CUSTOMIZATION: 'customization',
  HIERARCHY: 'hierarchy',
  TEAMS: 'teams',
  MODULE_VIEWS: 'module-views',
  BRANDING: 'branding',
  TENANT_ADMINISTRATION: 'tenant-administration',
  CLIENT_ACCOUNTS: 'client-accounts',
} as const;

export const MISC_PERMISSION_KEYS = {
  TENANT_SETTINGS_MANAGE: 'tenant.settings.manage',
  BRANDING_MANAGE: 'branding.manage',
  BILLING_VIEW: 'billing.view',
  INTEGRATIONS_MANAGE: 'integrations.manage',
  API_TOKENS_MANAGE: 'api-tokens.manage',
  AUDIT_VIEW: 'audit.view',
  SUPPORT_IMPERSONATE: 'support.impersonate',
  REPORTS_EXPORT: 'reports.export',
  CUSTOMIZATION_ACCESS: 'customization.access',
  CUSTOMIZATION_PUBLISH: 'customization.publish',
  NOTIFICATION_TEMPLATES_MANAGE: 'notification-templates.manage',
  ORGANIZATION_MANAGE: 'organization.manage',
  ROLES_MANAGE: 'roles.manage',
  TEAM_MEMBERSHIP_MANAGE: 'teams.members.manage',
} as const;

export const ACCESS_SCOPE_KEYS = {
  NONE: SecurityAccessLevel.NONE,
  SELF: SecurityAccessLevel.SELF,
  TEAM: SecurityAccessLevel.TEAM,
  BUSINESS_UNIT: SecurityAccessLevel.BUSINESS_UNIT,
  PARENT_CHILD_BUSINESS_UNIT: SecurityAccessLevel.PARENT_CHILD_BUSINESS_UNIT,
  ORGANIZATION: SecurityAccessLevel.ORGANIZATION,
  TENANT: SecurityAccessLevel.TENANT,
} as const;

export const ACTION_KEYS = {
  READ: SecurityPrivilege.READ,
  CREATE: SecurityPrivilege.CREATE,
  WRITE: SecurityPrivilege.WRITE,
  DELETE: SecurityPrivilege.DELETE,
  ASSIGN: SecurityPrivilege.ASSIGN,
  SHARE: SecurityPrivilege.SHARE,
  APPEND: SecurityPrivilege.APPEND,
  APPEND_TO: SecurityPrivilege.APPEND_TO,
  IMPORT: SecurityPrivilege.IMPORT,
  EXPORT: SecurityPrivilege.EXPORT,
  APPROVE: SecurityPrivilege.APPROVE,
  REJECT: SecurityPrivilege.REJECT,
  MANAGE: SecurityPrivilege.MANAGE,
  CONFIGURE: SecurityPrivilege.CONFIGURE,
  CUSTOMIZE: SecurityPrivilege.CUSTOMIZE,
} as const;

export const RBAC_PRIVILEGES = [
  SecurityPrivilege.READ,
  SecurityPrivilege.CREATE,
  SecurityPrivilege.WRITE,
  SecurityPrivilege.DELETE,
  SecurityPrivilege.ASSIGN,
  SecurityPrivilege.SHARE,
  SecurityPrivilege.APPEND,
  SecurityPrivilege.APPEND_TO,
  SecurityPrivilege.IMPORT,
  SecurityPrivilege.EXPORT,
  SecurityPrivilege.APPROVE,
  SecurityPrivilege.REJECT,
  SecurityPrivilege.MANAGE,
  SecurityPrivilege.CONFIGURE,
  SecurityPrivilege.CUSTOMIZE,
] as const;

export const RBAC_ENTITIES: RbacEntityDefinition[] = [
  { key: ENTITY_KEYS.EMPLOYEES, label: 'Employees', category: 'People' },
  { key: ENTITY_KEYS.HIERARCHY, label: 'Hierarchy', category: 'People' },
  {
    key: ENTITY_KEYS.EMPLOYEE_LEVELS,
    label: 'Employee Levels',
    category: 'People',
  },
  { key: ENTITY_KEYS.USERS, label: 'Users', category: 'Security' },
  { key: ENTITY_KEYS.ROLES, label: 'Roles', category: 'Security' },
  { key: ENTITY_KEYS.TEAMS, label: 'Teams', category: 'Security' },
  { key: ENTITY_KEYS.CANDIDATES, label: 'Candidates', category: 'Recruitment' },
  { key: ENTITY_KEYS.JOBS, label: 'Jobs', category: 'Recruitment' },
  { key: ENTITY_KEYS.ONBOARDING, label: 'Onboarding', category: 'Recruitment' },
  { key: ENTITY_KEYS.ATTENDANCE, label: 'Attendance', category: 'Workforce' },
  {
    key: ENTITY_KEYS.AGENT,
    label: 'Desktop Agent',
    category: 'Workforce',
  },
  { key: ENTITY_KEYS.TIMESHEETS, label: 'Timesheets', category: 'Workforce' },
  {
    key: ENTITY_KEYS.LEAVE_REQUESTS,
    label: 'Leave Requests',
    category: 'Workforce',
  },
  { key: ENTITY_KEYS.PAYROLL, label: 'Payroll', category: 'Finance' },
  {
    key: ENTITY_KEYS.PAYROLL_CALENDARS,
    label: 'Payroll Calendars',
    category: 'Finance',
  },
  {
    key: ENTITY_KEYS.PAYROLL_PERIODS,
    label: 'Payroll Periods',
    category: 'Finance',
  },
  {
    key: ENTITY_KEYS.PAYROLL_RUNS,
    label: 'Payroll Runs',
    category: 'Finance',
  },
  {
    key: ENTITY_KEYS.PAYSLIPS,
    label: 'Payslips',
    category: 'Finance',
  },
  {
    key: ENTITY_KEYS.CLAIM_TYPES,
    label: 'Claim Types',
    category: 'Finance',
  },
  {
    key: ENTITY_KEYS.CLAIMS,
    label: 'Claims',
    category: 'Finance',
  },
  {
    key: ENTITY_KEYS.BUSINESS_TRIPS,
    label: 'Business Trips',
    category: 'Finance',
  },
  {
    key: ENTITY_KEYS.TADA_POLICIES,
    label: 'TA/DA Policies',
    category: 'Finance',
  },
  {
    key: ENTITY_KEYS.TIME_PAYROLL_POLICIES,
    label: 'Time Payroll Policies',
    category: 'Finance',
  },
  {
    key: ENTITY_KEYS.OVERTIME_POLICIES,
    label: 'Overtime Policies',
    category: 'Finance',
  },
  {
    key: ENTITY_KEYS.PAYROLL_TIME_INPUTS,
    label: 'Payroll Time Inputs',
    category: 'Finance',
  },
  {
    key: ENTITY_KEYS.TAX_RULES,
    label: 'Tax Rules',
    category: 'Finance',
  },
  {
    key: ENTITY_KEYS.PAYROLL_GL,
    label: 'Payroll GL',
    category: 'Finance',
  },
  {
    key: ENTITY_KEYS.PAYROLL_JOURNAL,
    label: 'Payroll Journals',
    category: 'Finance',
  },
  {
    key: ENTITY_KEYS.PAY_COMPONENTS,
    label: 'Pay Components',
    category: 'Finance',
  },
  {
    key: ENTITY_KEYS.COMPENSATION,
    label: 'Compensation',
    category: 'Finance',
  },
  { key: ENTITY_KEYS.POLICIES, label: 'Policies', category: 'Administration' },
  { key: ENTITY_KEYS.DOCUMENTS, label: 'Documents', category: 'Operations' },
  { key: ENTITY_KEYS.PROJECTS, label: 'Projects', category: 'Operations' },
  { key: ENTITY_KEYS.SETTINGS, label: 'Settings', category: 'Administration' },
  { key: ENTITY_KEYS.REPORTS, label: 'Reports', category: 'Administration' },
  {
    key: ENTITY_KEYS.CUSTOMIZATION,
    label: 'Customization',
    category: 'Administration',
  },
  {
    key: ENTITY_KEYS.MODULE_VIEWS,
    label: 'Module Views',
    category: 'Administration',
  },
  { key: ENTITY_KEYS.BRANDING, label: 'Branding', category: 'Administration' },
  {
    key: ENTITY_KEYS.TENANT_ADMINISTRATION,
    label: 'Tenant Administration',
    category: 'Administration',
  },
  {
    key: ENTITY_KEYS.CLIENT_ACCOUNTS,
    label: 'Client Accounts',
    category: 'Client Management',
  },
];

export const MISC_PERMISSION_DEFINITIONS: MiscPermissionDefinition[] = [
  {
    key: MISC_PERMISSION_KEYS.TENANT_SETTINGS_MANAGE,
    label: 'Manage tenant settings',
    description: 'Change tenant-level configuration.',
    category: 'Tenant Administration',
  },
  {
    key: MISC_PERMISSION_KEYS.BRANDING_MANAGE,
    label: 'Manage branding',
    description: 'Update visual identity, logos, and portal presentation.',
    category: 'Tenant Administration',
  },
  {
    key: MISC_PERMISSION_KEYS.BILLING_VIEW,
    label: 'View billing',
    description: 'View subscription and billing status.',
    category: 'Tenant Administration',
  },
  {
    key: MISC_PERMISSION_KEYS.INTEGRATIONS_MANAGE,
    label: 'Manage integrations',
    description: 'Configure external systems and connectors.',
    category: 'Tenant Administration',
  },
  {
    key: MISC_PERMISSION_KEYS.API_TOKENS_MANAGE,
    label: 'Manage API tokens',
    description: 'Create and revoke tenant API credentials.',
    category: 'Security',
  },
  {
    key: MISC_PERMISSION_KEYS.AUDIT_VIEW,
    label: 'View audit logs',
    description: 'Inspect security and change audit history.',
    category: 'Security',
  },
  {
    key: MISC_PERMISSION_KEYS.SUPPORT_IMPERSONATE,
    label: 'Support impersonation',
    description: 'Use controlled support access where enabled.',
    category: 'Security',
  },
  {
    key: MISC_PERMISSION_KEYS.REPORTS_EXPORT,
    label: 'Export reports',
    description: 'Export reporting data from allowed scopes.',
    category: 'Reporting',
  },
  {
    key: MISC_PERMISSION_KEYS.CUSTOMIZATION_ACCESS,
    label: 'Access customization',
    description: 'Open customization tools and metadata workspaces.',
    category: 'Customization',
  },
  {
    key: MISC_PERMISSION_KEYS.CUSTOMIZATION_PUBLISH,
    label: 'Publish customization',
    description: 'Publish metadata changes to tenant users.',
    category: 'Customization',
  },
  {
    key: MISC_PERMISSION_KEYS.NOTIFICATION_TEMPLATES_MANAGE,
    label: 'Manage notification templates',
    description: 'Create and update tenant notification templates.',
    category: 'Tenant Administration',
  },
  {
    key: MISC_PERMISSION_KEYS.ORGANIZATION_MANAGE,
    label: 'Manage organizations and business units',
    description: 'Maintain organization and business-unit hierarchy.',
    category: 'Organization',
  },
  {
    key: MISC_PERMISSION_KEYS.ROLES_MANAGE,
    label: 'Manage roles and permissions',
    description: 'Create roles, assign permissions, and manage user access.',
    category: 'Security',
  },
  {
    key: MISC_PERMISSION_KEYS.TEAM_MEMBERSHIP_MANAGE,
    label: 'Manage team membership',
    description:
      'Create teams and maintain team members and team role assignments.',
    category: 'Security',
  },
];

export const SYSTEM_ROLE_DEFINITIONS: Array<{
  key: SystemRoleKey;
  name: string;
  description: string;
  accessLevel: RoleAccessLevel;
  isEditable: boolean;
}> = [
  {
    key: ROLE_KEYS.GLOBAL_ADMIN,
    name: 'Global Administrator',
    description: 'Tenant owner role with full tenant security authority.',
    accessLevel: RoleAccessLevel.TENANT,
    isEditable: false,
  },
  {
    key: ROLE_KEYS.SYSTEM_ADMIN,
    name: 'System Administrator',
    description:
      'Full tenant operational access without tenant-owner override rights.',
    accessLevel: RoleAccessLevel.TENANT,
    isEditable: false,
  },
  {
    key: ROLE_KEYS.SYSTEM_CUSTOMIZER,
    name: 'System Customizer',
    description: 'Customization and metadata configuration access.',
    accessLevel: RoleAccessLevel.TENANT,
    isEditable: false,
  },
  {
    key: ROLE_KEYS.CEO,
    name: 'CEO / Executive Viewer',
    description: 'Executive read visibility across the tenant operating scope.',
    accessLevel: RoleAccessLevel.TENANT,
    isEditable: false,
  },
  {
    key: ROLE_KEYS.MANAGER,
    name: 'Manager',
    description: 'Team workflow and reporting-line access.',
    accessLevel: RoleAccessLevel.PARENT_BU,
    isEditable: false,
  },
  {
    key: ROLE_KEYS.HR,
    name: 'HR Manager',
    description: 'People operations and workforce administration.',
    accessLevel: RoleAccessLevel.ORGANIZATION,
    isEditable: false,
  },
  {
    key: ROLE_KEYS.RECRUITER,
    name: 'Recruiter',
    description: 'Recruitment, candidate, jobs, and onboarding access.',
    accessLevel: RoleAccessLevel.BUSINESS_UNIT,
    isEditable: false,
  },
  {
    key: ROLE_KEYS.PAYROLL_MANAGER,
    name: 'Finance / Payroll Manager',
    description:
      'Payroll and finance operations role for compensation and payroll cycles.',
    accessLevel: RoleAccessLevel.ORGANIZATION,
    isEditable: false,
  },
  {
    key: ROLE_KEYS.EMPLOYEE,
    name: 'Employee Self-Service',
    description: 'Employee self-service access.',
    accessLevel: RoleAccessLevel.USER,
    isEditable: false,
  },
];

const FULL_MATRIX = Object.fromEntries(
  RBAC_ENTITIES.flatMap((entity) =>
    RBAC_PRIVILEGES.map((privilege) => [
      `${entity.key}:${privilege}`,
      SecurityAccessLevel.TENANT,
    ]),
  ),
) as Record<string, SecurityAccessLevel>;

function matrix(
  defaultAccessLevel: SecurityAccessLevel,
  overrides: Record<string, SecurityAccessLevel> = {},
) {
  return Object.fromEntries(
    RBAC_ENTITIES.flatMap((entity) =>
      RBAC_PRIVILEGES.map((privilege) => [
        `${entity.key}:${privilege}`,
        overrides[`${entity.key}:${privilege}`] ?? defaultAccessLevel,
      ]),
    ),
  ) as Record<string, SecurityAccessLevel>;
}

export const SYSTEM_ROLE_PRIVILEGES: Record<
  SystemRoleKey,
  Record<string, SecurityAccessLevel>
> = {
  [ROLE_KEYS.GLOBAL_ADMIN]: FULL_MATRIX,
  [ROLE_KEYS.SYSTEM_ADMIN]: {
    ...FULL_MATRIX,
    ...matrix(SecurityAccessLevel.TENANT, {
      'customization:CONFIGURE': SecurityAccessLevel.NONE,
      'customization:CUSTOMIZE': SecurityAccessLevel.NONE,
    }),
  },
  [ROLE_KEYS.SYSTEM_CUSTOMIZER]: matrix(SecurityAccessLevel.NONE, {
    'settings:READ': SecurityAccessLevel.TENANT,
    'settings:CONFIGURE': SecurityAccessLevel.TENANT,
    'customization:READ': SecurityAccessLevel.TENANT,
    'customization:CREATE': SecurityAccessLevel.TENANT,
    'customization:WRITE': SecurityAccessLevel.TENANT,
    'customization:DELETE': SecurityAccessLevel.TENANT,
    'customization:MANAGE': SecurityAccessLevel.TENANT,
    'customization:CONFIGURE': SecurityAccessLevel.TENANT,
    'customization:CUSTOMIZE': SecurityAccessLevel.TENANT,
    'settings:CUSTOMIZE': SecurityAccessLevel.TENANT,
  }),
  [ROLE_KEYS.CEO]: matrix(SecurityAccessLevel.NONE, {
    'employees:READ': SecurityAccessLevel.TENANT,
    'attendance:READ': SecurityAccessLevel.TENANT,
    'timesheets:READ': SecurityAccessLevel.TENANT,
    'leave-requests:READ': SecurityAccessLevel.TENANT,
    'payroll:READ': SecurityAccessLevel.TENANT,
    'documents:READ': SecurityAccessLevel.TENANT,
    'projects:READ': SecurityAccessLevel.TENANT,
    'reports:READ': SecurityAccessLevel.TENANT,
    'reports:EXPORT': SecurityAccessLevel.TENANT,
  }),
  [ROLE_KEYS.MANAGER]: matrix(SecurityAccessLevel.NONE, {
    'employees:READ': SecurityAccessLevel.PARENT_CHILD_BUSINESS_UNIT,
    'attendance:READ': SecurityAccessLevel.PARENT_CHILD_BUSINESS_UNIT,
    'timesheets:READ': SecurityAccessLevel.PARENT_CHILD_BUSINESS_UNIT,
    'timesheets:APPROVE': SecurityAccessLevel.PARENT_CHILD_BUSINESS_UNIT,
    'timesheets:REJECT': SecurityAccessLevel.PARENT_CHILD_BUSINESS_UNIT,
    'leave-requests:READ': SecurityAccessLevel.PARENT_CHILD_BUSINESS_UNIT,
    'leave-requests:APPROVE': SecurityAccessLevel.PARENT_CHILD_BUSINESS_UNIT,
    'leave-requests:REJECT': SecurityAccessLevel.PARENT_CHILD_BUSINESS_UNIT,
    'projects:READ': SecurityAccessLevel.PARENT_CHILD_BUSINESS_UNIT,
    'business-trips:READ': SecurityAccessLevel.PARENT_CHILD_BUSINESS_UNIT,
    'business-trips:APPROVE': SecurityAccessLevel.PARENT_CHILD_BUSINESS_UNIT,
    'business-trips:REJECT': SecurityAccessLevel.PARENT_CHILD_BUSINESS_UNIT,
    'payroll-time-inputs:READ': SecurityAccessLevel.PARENT_CHILD_BUSINESS_UNIT,
  }),
  [ROLE_KEYS.HR]: matrix(SecurityAccessLevel.NONE, {
    'employees:READ': SecurityAccessLevel.ORGANIZATION,
    'employees:CREATE': SecurityAccessLevel.ORGANIZATION,
    'employees:WRITE': SecurityAccessLevel.ORGANIZATION,
    'employees:DELETE': SecurityAccessLevel.ORGANIZATION,
    'employee-levels:READ': SecurityAccessLevel.ORGANIZATION,
    'employee-levels:MANAGE': SecurityAccessLevel.ORGANIZATION,
    'attendance:READ': SecurityAccessLevel.ORGANIZATION,
    'attendance:WRITE': SecurityAccessLevel.ORGANIZATION,
    'agent:READ': SecurityAccessLevel.ORGANIZATION,
    'agent:CONFIGURE': SecurityAccessLevel.ORGANIZATION,
    'agent:MANAGE': SecurityAccessLevel.ORGANIZATION,
    'timesheets:READ': SecurityAccessLevel.ORGANIZATION,
    'leave-requests:READ': SecurityAccessLevel.ORGANIZATION,
    'leave-requests:APPROVE': SecurityAccessLevel.ORGANIZATION,
    'leave-requests:REJECT': SecurityAccessLevel.ORGANIZATION,
    'documents:READ': SecurityAccessLevel.ORGANIZATION,
    'documents:CREATE': SecurityAccessLevel.ORGANIZATION,
    'documents:WRITE': SecurityAccessLevel.ORGANIZATION,
    'settings:READ': SecurityAccessLevel.ORGANIZATION,
    'policies:READ': SecurityAccessLevel.ORGANIZATION,
    'policies:MANAGE': SecurityAccessLevel.ORGANIZATION,
    'business-trips:READ': SecurityAccessLevel.ORGANIZATION,
    'business-trips:CREATE': SecurityAccessLevel.ORGANIZATION,
    'business-trips:WRITE': SecurityAccessLevel.ORGANIZATION,
    'business-trips:APPROVE': SecurityAccessLevel.ORGANIZATION,
    'business-trips:REJECT': SecurityAccessLevel.ORGANIZATION,
    'business-trips:DELETE': SecurityAccessLevel.ORGANIZATION,
    'tada-policies:READ': SecurityAccessLevel.ORGANIZATION,
    'tada-policies:MANAGE': SecurityAccessLevel.ORGANIZATION,
    'time-payroll-policies:READ': SecurityAccessLevel.ORGANIZATION,
    'time-payroll-policies:MANAGE': SecurityAccessLevel.ORGANIZATION,
    'overtime-policies:READ': SecurityAccessLevel.ORGANIZATION,
    'overtime-policies:MANAGE': SecurityAccessLevel.ORGANIZATION,
    'payroll-time-inputs:READ': SecurityAccessLevel.ORGANIZATION,
    'payroll-time-inputs:CREATE': SecurityAccessLevel.ORGANIZATION,
    'tax-rules:READ': SecurityAccessLevel.ORGANIZATION,
    'tax-rules:MANAGE': SecurityAccessLevel.ORGANIZATION,
    'payroll-gl:READ': SecurityAccessLevel.ORGANIZATION,
    'payroll-gl:MANAGE': SecurityAccessLevel.ORGANIZATION,
    'payroll-journal:READ': SecurityAccessLevel.ORGANIZATION,
    'payroll-journal:CREATE': SecurityAccessLevel.ORGANIZATION,
    'payroll-journal:EXPORT': SecurityAccessLevel.ORGANIZATION,
    'reports:READ': SecurityAccessLevel.ORGANIZATION,
  }),
  [ROLE_KEYS.RECRUITER]: matrix(SecurityAccessLevel.NONE, {
    'candidates:READ': SecurityAccessLevel.BUSINESS_UNIT,
    'candidates:CREATE': SecurityAccessLevel.BUSINESS_UNIT,
    'candidates:WRITE': SecurityAccessLevel.BUSINESS_UNIT,
    'jobs:READ': SecurityAccessLevel.BUSINESS_UNIT,
    'jobs:CREATE': SecurityAccessLevel.BUSINESS_UNIT,
    'jobs:WRITE': SecurityAccessLevel.BUSINESS_UNIT,
    'onboarding:READ': SecurityAccessLevel.BUSINESS_UNIT,
    'onboarding:CREATE': SecurityAccessLevel.BUSINESS_UNIT,
    'onboarding:WRITE': SecurityAccessLevel.BUSINESS_UNIT,
    'documents:READ': SecurityAccessLevel.BUSINESS_UNIT,
    'documents:CREATE': SecurityAccessLevel.BUSINESS_UNIT,
  }),
  [ROLE_KEYS.PAYROLL_MANAGER]: matrix(SecurityAccessLevel.NONE, {
    'employees:READ': SecurityAccessLevel.ORGANIZATION,
    'timesheets:READ': SecurityAccessLevel.ORGANIZATION,
    'timesheets:EXPORT': SecurityAccessLevel.ORGANIZATION,
    'payroll:READ': SecurityAccessLevel.ORGANIZATION,
    'payroll:CREATE': SecurityAccessLevel.ORGANIZATION,
    'payroll:WRITE': SecurityAccessLevel.ORGANIZATION,
    'payroll:IMPORT': SecurityAccessLevel.ORGANIZATION,
    'payroll:EXPORT': SecurityAccessLevel.ORGANIZATION,
    'payroll:APPROVE': SecurityAccessLevel.ORGANIZATION,
    'payroll:MANAGE': SecurityAccessLevel.ORGANIZATION,
    'payroll-calendars:READ': SecurityAccessLevel.ORGANIZATION,
    'payroll-calendars:MANAGE': SecurityAccessLevel.ORGANIZATION,
    'payroll-periods:READ': SecurityAccessLevel.ORGANIZATION,
    'payroll-periods:MANAGE': SecurityAccessLevel.ORGANIZATION,
    'payroll-runs:READ': SecurityAccessLevel.ORGANIZATION,
    'payroll-runs:CREATE': SecurityAccessLevel.ORGANIZATION,
    'payroll-runs:MANAGE': SecurityAccessLevel.ORGANIZATION,
    'payroll-runs:CONFIGURE': SecurityAccessLevel.ORGANIZATION,
    'payslips:READ': SecurityAccessLevel.ORGANIZATION,
    'payslips:CREATE': SecurityAccessLevel.ORGANIZATION,
    'payslips:APPROVE': SecurityAccessLevel.ORGANIZATION,
    'payslips:DELETE': SecurityAccessLevel.ORGANIZATION,
    'claim-types:READ': SecurityAccessLevel.ORGANIZATION,
    'claim-types:MANAGE': SecurityAccessLevel.ORGANIZATION,
    'claims:READ': SecurityAccessLevel.ORGANIZATION,
    'claims:CREATE': SecurityAccessLevel.ORGANIZATION,
    'claims:WRITE': SecurityAccessLevel.ORGANIZATION,
    'claims:APPROVE': SecurityAccessLevel.ORGANIZATION,
    'claims:REJECT': SecurityAccessLevel.ORGANIZATION,
    'claims:MANAGE': SecurityAccessLevel.ORGANIZATION,
    'business-trips:READ': SecurityAccessLevel.ORGANIZATION,
    'business-trips:CREATE': SecurityAccessLevel.ORGANIZATION,
    'business-trips:WRITE': SecurityAccessLevel.ORGANIZATION,
    'business-trips:APPROVE': SecurityAccessLevel.ORGANIZATION,
    'business-trips:REJECT': SecurityAccessLevel.ORGANIZATION,
    'business-trips:DELETE': SecurityAccessLevel.ORGANIZATION,
    'business-trips:MANAGE': SecurityAccessLevel.ORGANIZATION,
    'tada-policies:READ': SecurityAccessLevel.ORGANIZATION,
    'tada-policies:MANAGE': SecurityAccessLevel.ORGANIZATION,
    'time-payroll-policies:READ': SecurityAccessLevel.ORGANIZATION,
    'time-payroll-policies:MANAGE': SecurityAccessLevel.ORGANIZATION,
    'overtime-policies:READ': SecurityAccessLevel.ORGANIZATION,
    'overtime-policies:MANAGE': SecurityAccessLevel.ORGANIZATION,
    'payroll-time-inputs:READ': SecurityAccessLevel.ORGANIZATION,
    'payroll-time-inputs:CREATE': SecurityAccessLevel.ORGANIZATION,
    'tax-rules:READ': SecurityAccessLevel.ORGANIZATION,
    'tax-rules:MANAGE': SecurityAccessLevel.ORGANIZATION,
    'payroll-gl:READ': SecurityAccessLevel.ORGANIZATION,
    'payroll-gl:MANAGE': SecurityAccessLevel.ORGANIZATION,
    'payroll-journal:READ': SecurityAccessLevel.ORGANIZATION,
    'payroll-journal:CREATE': SecurityAccessLevel.ORGANIZATION,
    'payroll-journal:EXPORT': SecurityAccessLevel.ORGANIZATION,
    'pay-components:READ': SecurityAccessLevel.ORGANIZATION,
    'pay-components:MANAGE': SecurityAccessLevel.ORGANIZATION,
    'compensation:READ': SecurityAccessLevel.ORGANIZATION,
    'compensation:MANAGE': SecurityAccessLevel.ORGANIZATION,
    'policies:READ': SecurityAccessLevel.ORGANIZATION,
    'policies:MANAGE': SecurityAccessLevel.ORGANIZATION,
    'reports:READ': SecurityAccessLevel.ORGANIZATION,
    'reports:EXPORT': SecurityAccessLevel.ORGANIZATION,
  }),
  [ROLE_KEYS.EMPLOYEE]: matrix(SecurityAccessLevel.NONE, {
    'employees:READ': SecurityAccessLevel.SELF,
    'employees:WRITE': SecurityAccessLevel.SELF,
    'attendance:READ': SecurityAccessLevel.SELF,
    'attendance:CREATE': SecurityAccessLevel.SELF,
    'timesheets:READ': SecurityAccessLevel.SELF,
    'timesheets:CREATE': SecurityAccessLevel.SELF,
    'timesheets:WRITE': SecurityAccessLevel.SELF,
    'leave-requests:READ': SecurityAccessLevel.SELF,
    'leave-requests:CREATE': SecurityAccessLevel.SELF,
    'documents:READ': SecurityAccessLevel.SELF,
    'documents:CREATE': SecurityAccessLevel.SELF,
    'projects:READ': SecurityAccessLevel.SELF,
    'business-trips:READ': SecurityAccessLevel.SELF,
    'business-trips:CREATE': SecurityAccessLevel.SELF,
    'business-trips:DELETE': SecurityAccessLevel.SELF,
  }),
};

export const SYSTEM_ROLE_MISC_PERMISSIONS: Record<SystemRoleKey, string[]> = {
  [ROLE_KEYS.GLOBAL_ADMIN]: MISC_PERMISSION_DEFINITIONS.map(
    (permission) => permission.key,
  ),
  [ROLE_KEYS.SYSTEM_ADMIN]: MISC_PERMISSION_DEFINITIONS.map(
    (permission) => permission.key,
  ).filter((key) => key !== MISC_PERMISSION_KEYS.SUPPORT_IMPERSONATE),
  [ROLE_KEYS.SYSTEM_CUSTOMIZER]: [
    MISC_PERMISSION_KEYS.CUSTOMIZATION_ACCESS,
    MISC_PERMISSION_KEYS.CUSTOMIZATION_PUBLISH,
  ],
  [ROLE_KEYS.CEO]: [
    MISC_PERMISSION_KEYS.AUDIT_VIEW,
    MISC_PERMISSION_KEYS.REPORTS_EXPORT,
    MISC_PERMISSION_KEYS.BILLING_VIEW,
  ],
  [ROLE_KEYS.MANAGER]: [MISC_PERMISSION_KEYS.REPORTS_EXPORT],
  [ROLE_KEYS.HR]: [
    MISC_PERMISSION_KEYS.TENANT_SETTINGS_MANAGE,
    MISC_PERMISSION_KEYS.AUDIT_VIEW,
    MISC_PERMISSION_KEYS.REPORTS_EXPORT,
    MISC_PERMISSION_KEYS.ORGANIZATION_MANAGE,
  ],
  [ROLE_KEYS.PAYROLL_MANAGER]: [MISC_PERMISSION_KEYS.REPORTS_EXPORT],
  [ROLE_KEYS.RECRUITER]: [],
  [ROLE_KEYS.EMPLOYEE]: [],
};

export const SECURITY_ACCESS_LEVEL_WEIGHT: Record<SecurityAccessLevel, number> =
  {
    NONE: 0,
    SELF: 1,
    USER: 1,
    TEAM: 2,
    BUSINESS_UNIT: 2,
    PARENT_CHILD_BUSINESS_UNIT: 3,
    PARENT_CHILD_BUSINESS_UNITS: 3,
    ORGANIZATION: 4,
    TENANT: 5,
  };

export function legacyRoleAccessLevelToSecurityAccessLevel(
  accessLevel: RoleAccessLevel,
) {
  switch (accessLevel) {
    case RoleAccessLevel.TENANT:
      return SecurityAccessLevel.TENANT;
    case RoleAccessLevel.ORGANIZATION:
      return SecurityAccessLevel.ORGANIZATION;
    case RoleAccessLevel.PARENT_BU:
      return SecurityAccessLevel.PARENT_CHILD_BUSINESS_UNITS;
    case RoleAccessLevel.BUSINESS_UNIT:
      return SecurityAccessLevel.BUSINESS_UNIT;
    case RoleAccessLevel.USER:
    default:
      return SecurityAccessLevel.SELF;
  }
}

export function matrixPrivilegeToPermissionKey(
  entityKey: string,
  privilege: SecurityPrivilege,
) {
  const normalizedPrivilege = privilege.toLowerCase();

  const explicit: Record<string, string> = {
    'hierarchy:read': 'hierarchy.read',
    'hierarchy:write': 'hierarchy.update',
    'hierarchy:manage': 'hierarchy.update',
    'leave-requests:read': 'leave-requests.read',
    'leave-requests:create': 'leave-requests.create',
    'leave-requests:approve': 'leave-requests.approve',
    'leave-requests:reject': 'leave-requests.reject',
    'attendance:import': 'attendance.import',
    'attendance:export': 'attendance.export',
    'attendance:manage': 'attendance.manage',
    'agent:read': 'agent.settings.read',
    'agent:configure': 'agent.settings.manage',
    'agent:manage': 'agent.settings.manage',
    'timesheets:write': 'timesheets.write',
    'timesheets:approve': 'timesheets.approve',
    'timesheets:reject': 'timesheets.reject',
    'timesheets:import': 'timesheets.import',
    'timesheets:export': 'timesheets.export',
    'payroll:write': 'payroll.write',
    'payroll:manage': 'payroll.run',
    'payroll:approve': 'payroll.review',
    'payroll:export': 'payroll.export',
    'payroll-calendars:read': 'payroll-calendars.read',
    'payroll-calendars:create': 'payroll-calendars.manage',
    'payroll-calendars:write': 'payroll-calendars.manage',
    'payroll-calendars:manage': 'payroll-calendars.manage',
    'payroll-periods:read': 'payroll-periods.read',
    'payroll-periods:create': 'payroll-periods.manage',
    'payroll-periods:write': 'payroll-periods.manage',
    'payroll-periods:manage': 'payroll-periods.manage',
    'payroll-runs:read': 'payroll-runs.read',
    'payroll-runs:create': 'payroll-runs.create',
    'payroll-runs:manage': 'payroll-runs.calculate',
    'payroll-runs:configure': 'payroll-runs.lock',
    'payslips:read': 'payslips.read-all',
    'payslips:create': 'payslips.manage',
    'payslips:manage': 'payslips.manage',
    'payslips:approve': 'payslips.publish',
    'payslips:delete': 'payslips.void',
    'claim-types:read': 'claim-types.read',
    'claim-types:create': 'claim-types.manage',
    'claim-types:write': 'claim-types.manage',
    'claim-types:delete': 'claim-types.manage',
    'claim-types:manage': 'claim-types.manage',
    'claims:read': 'claims.read-all',
    'claims:create': 'claims.create',
    'claims:write': 'claims.update',
    'claims:approve': 'claims.manager-approve',
    'claims:reject': 'claims.reject',
    'claims:manage': 'claims.payroll-approve',
    'business-trips:read': 'business-trips.read-all',
    'business-trips:create': 'business-trips.create',
    'business-trips:write': 'business-trips.update',
    'business-trips:approve': 'business-trips.approve',
    'business-trips:reject': 'business-trips.reject',
    'business-trips:delete': 'business-trips.cancel',
    'business-trips:manage': 'business-trips.update',
    'tada-policies:read': 'tada-policies.read',
    'tada-policies:create': 'tada-policies.manage',
    'tada-policies:write': 'tada-policies.manage',
    'tada-policies:delete': 'tada-policies.manage',
    'tada-policies:manage': 'tada-policies.manage',
    'time-payroll-policies:read': 'time-payroll-policies.read',
    'time-payroll-policies:create': 'time-payroll-policies.manage',
    'time-payroll-policies:write': 'time-payroll-policies.manage',
    'time-payroll-policies:delete': 'time-payroll-policies.manage',
    'time-payroll-policies:manage': 'time-payroll-policies.manage',
    'overtime-policies:read': 'overtime-policies.read',
    'overtime-policies:create': 'overtime-policies.manage',
    'overtime-policies:write': 'overtime-policies.manage',
    'overtime-policies:delete': 'overtime-policies.manage',
    'overtime-policies:manage': 'overtime-policies.manage',
    'payroll-time-inputs:read': 'payroll-time-inputs.read',
    'payroll-time-inputs:create': 'payroll-time-inputs.prepare',
    'payroll-time-inputs:manage': 'payroll-time-inputs.prepare',
    'tax-rules:read': 'tax-rules.read',
    'tax-rules:create': 'tax-rules.manage',
    'tax-rules:write': 'tax-rules.manage',
    'tax-rules:delete': 'tax-rules.manage',
    'tax-rules:manage': 'tax-rules.manage',
    'payroll-gl:read': 'payroll-gl.read',
    'payroll-gl:create': 'payroll-gl.manage',
    'payroll-gl:write': 'payroll-gl.manage',
    'payroll-gl:delete': 'payroll-gl.manage',
    'payroll-gl:manage': 'payroll-gl.manage',
    'payroll-journal:read': 'payroll-journal.read',
    'payroll-journal:create': 'payroll-journal.generate',
    'payroll-journal:write': 'payroll-journal.generate',
    'payroll-journal:export': 'payroll-journal.export',
    'payroll-journal:manage': 'payroll-journal.generate',
    'pay-components:create': 'pay-components.manage',
    'pay-components:write': 'pay-components.manage',
    'pay-components:delete': 'pay-components.manage',
    'pay-components:manage': 'pay-components.manage',
    'compensation:create': 'compensation.manage',
    'compensation:write': 'compensation.manage',
    'compensation:delete': 'compensation.manage',
    'compensation:manage': 'compensation.manage',
    'employees:read': 'employees.read',
    'employees:create': 'employees.create',
    'employees:write': 'employees.update',
    'employees:delete': 'employees.terminate',
    'employee-levels:create': 'employee-levels.manage',
    'employee-levels:write': 'employee-levels.manage',
    'employee-levels:delete': 'employee-levels.manage',
    'employee-levels:manage': 'employee-levels.manage',
    'policies:create': 'policies.manage',
    'policies:write': 'policies.manage',
    'policies:delete': 'policies.manage',
    'policies:manage': 'policies.manage',
    'documents:create': 'documents.upload',
    'documents:write': 'documents.update',
    'projects:assign': 'projects.assign',
    'settings:configure': 'settings.update',
    'customization:configure': 'customization.publish',
    'customization:customize': 'customization.publish',
    'customization:manage': 'customization.publish',
    'users:read': 'users.read',
    'users:create': 'users.create',
    'users:write': 'users.update',
    'users:delete': 'users.delete',
    'users:assign': 'users.assign-roles',
    'users:manage': 'users.assign-roles',
    'roles:read': 'roles.read',
    'roles:create': 'roles.create',
    'roles:write': 'roles.update',
    'roles:delete': 'roles.update',
    'roles:assign': 'roles.assign-permissions',
    'roles:configure': 'roles.assign-permissions',
    'roles:manage': 'roles.assign-permissions',
    'teams:read': 'teams.read',
    'teams:create': 'teams.create',
    'teams:write': 'teams.update',
    'teams:delete': 'teams.delete',
    'teams:assign': 'teams.members.manage',
    'teams:manage': 'teams.members.manage',
    'module-views:read': 'customization.views.read',
    'module-views:create': 'customization.views.create',
    'module-views:write': 'customization.views.update',
    'module-views:delete': 'customization.views.delete',
    'module-views:customize': 'customization.views.update',
    'branding:read': 'settings.read',
    'branding:write': 'branding.manage',
    'branding:configure': 'branding.manage',
    'tenant-administration:read': 'settings.read',
    'tenant-administration:write': 'settings.update',
    'tenant-administration:configure': 'tenant.settings.manage',
    'tenant-administration:manage': 'tenant.settings.manage',
    'reports:read': 'employees.read',
    'reports:export': 'reports.export',
    'jobs:read': 'recruitment.read',
    'jobs:create': 'recruitment.create',
    'jobs:write': 'recruitment.update',
    'candidates:read': 'recruitment.read',
    'candidates:create': 'recruitment.create',
    'candidates:write': 'recruitment.update',
  };

  return (
    explicit[`${entityKey}:${normalizedPrivilege}`] ??
    `${entityKey}.${normalizedPrivilege}`
  );
}
