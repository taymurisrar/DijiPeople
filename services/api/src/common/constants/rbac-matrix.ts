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
  | 'employee';

export const RBAC_PRIVILEGES = [
  SecurityPrivilege.READ,
  SecurityPrivilege.CREATE,
  SecurityPrivilege.WRITE,
  SecurityPrivilege.DELETE,
  SecurityPrivilege.ASSIGN,
  SecurityPrivilege.SHARE,
  SecurityPrivilege.APPEND,
  SecurityPrivilege.IMPORT,
  SecurityPrivilege.EXPORT,
  SecurityPrivilege.APPROVE,
  SecurityPrivilege.REJECT,
  SecurityPrivilege.MANAGE,
  SecurityPrivilege.CONFIGURE,
] as const;

export const RBAC_ENTITIES: RbacEntityDefinition[] = [
  { key: 'employees', label: 'Employees', category: 'People' },
  { key: 'candidates', label: 'Candidates', category: 'Recruitment' },
  { key: 'jobs', label: 'Jobs', category: 'Recruitment' },
  { key: 'onboarding', label: 'Onboarding', category: 'Recruitment' },
  { key: 'attendance', label: 'Attendance', category: 'Workforce' },
  { key: 'timesheets', label: 'Timesheets', category: 'Workforce' },
  { key: 'leave-requests', label: 'Leave Requests', category: 'Workforce' },
  { key: 'payroll', label: 'Payroll', category: 'Finance' },
  { key: 'documents', label: 'Documents', category: 'Operations' },
  { key: 'projects', label: 'Projects', category: 'Operations' },
  { key: 'settings', label: 'Settings', category: 'Administration' },
  { key: 'reports', label: 'Reports', category: 'Administration' },
  { key: 'customization', label: 'Customization', category: 'Administration' },
];

export const MISC_PERMISSION_DEFINITIONS: MiscPermissionDefinition[] = [
  {
    key: 'tenant.settings.manage',
    label: 'Manage tenant settings',
    description: 'Change tenant-level configuration.',
    category: 'Tenant Administration',
  },
  {
    key: 'branding.manage',
    label: 'Manage branding',
    description: 'Update visual identity, logos, and portal presentation.',
    category: 'Tenant Administration',
  },
  {
    key: 'billing.view',
    label: 'View billing',
    description: 'View subscription and billing status.',
    category: 'Tenant Administration',
  },
  {
    key: 'integrations.manage',
    label: 'Manage integrations',
    description: 'Configure external systems and connectors.',
    category: 'Tenant Administration',
  },
  {
    key: 'api-tokens.manage',
    label: 'Manage API tokens',
    description: 'Create and revoke tenant API credentials.',
    category: 'Security',
  },
  {
    key: 'audit.view',
    label: 'View audit logs',
    description: 'Inspect security and change audit history.',
    category: 'Security',
  },
  {
    key: 'support.impersonate',
    label: 'Support impersonation',
    description: 'Use controlled support access where enabled.',
    category: 'Security',
  },
  {
    key: 'reports.export',
    label: 'Export reports',
    description: 'Export reporting data from allowed scopes.',
    category: 'Reporting',
  },
  {
    key: 'customization.access',
    label: 'Access customization',
    description: 'Open customization tools and metadata workspaces.',
    category: 'Customization',
  },
  {
    key: 'customization.publish',
    label: 'Publish customization',
    description: 'Publish metadata changes to tenant users.',
    category: 'Customization',
  },
  {
    key: 'notification-templates.manage',
    label: 'Manage notification templates',
    description: 'Create and update tenant notification templates.',
    category: 'Tenant Administration',
  },
  {
    key: 'organization.manage',
    label: 'Manage organizations and business units',
    description: 'Maintain organization and business-unit hierarchy.',
    category: 'Organization',
  },
  {
    key: 'roles.manage',
    label: 'Manage roles and permissions',
    description: 'Create roles, assign permissions, and manage user access.',
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
    key: 'global-admin',
    name: 'Global Administrator',
    description: 'Tenant owner role with full tenant security authority.',
    accessLevel: RoleAccessLevel.TENANT,
    isEditable: false,
  },
  {
    key: 'system-admin',
    name: 'System Administrator',
    description:
      'Full tenant operational access without tenant-owner override rights.',
    accessLevel: RoleAccessLevel.TENANT,
    isEditable: false,
  },
  {
    key: 'system-customizer',
    name: 'System Customizer',
    description: 'Customization and metadata configuration access.',
    accessLevel: RoleAccessLevel.TENANT,
    isEditable: false,
  },
  {
    key: 'ceo',
    name: 'CEO',
    description: 'Executive visibility across the tenant operating scope.',
    accessLevel: RoleAccessLevel.TENANT,
    isEditable: false,
  },
  {
    key: 'manager',
    name: 'Manager',
    description: 'Team workflow and reporting-line access.',
    accessLevel: RoleAccessLevel.PARENT_BU,
    isEditable: false,
  },
  {
    key: 'hr',
    name: 'HR',
    description: 'People operations and workforce administration.',
    accessLevel: RoleAccessLevel.ORGANIZATION,
    isEditable: false,
  },
  {
    key: 'recruiter',
    name: 'Recruiter',
    description: 'Recruitment, candidate, jobs, and onboarding access.',
    accessLevel: RoleAccessLevel.BUSINESS_UNIT,
    isEditable: false,
  },
  {
    key: 'employee',
    name: 'Employee',
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
  'global-admin': FULL_MATRIX,
  'system-admin': {
    ...FULL_MATRIX,
    ...matrix(SecurityAccessLevel.TENANT, {
      'customization:CONFIGURE': SecurityAccessLevel.NONE,
    }),
  },
  'system-customizer': matrix(SecurityAccessLevel.NONE, {
    'settings:READ': SecurityAccessLevel.TENANT,
    'settings:CONFIGURE': SecurityAccessLevel.TENANT,
    'customization:READ': SecurityAccessLevel.TENANT,
    'customization:CREATE': SecurityAccessLevel.TENANT,
    'customization:WRITE': SecurityAccessLevel.TENANT,
    'customization:DELETE': SecurityAccessLevel.TENANT,
    'customization:MANAGE': SecurityAccessLevel.TENANT,
    'customization:CONFIGURE': SecurityAccessLevel.TENANT,
  }),
  ceo: matrix(SecurityAccessLevel.NONE, {
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
  manager: matrix(SecurityAccessLevel.NONE, {
    'employees:READ': SecurityAccessLevel.PARENT_CHILD_BUSINESS_UNITS,
    'attendance:READ': SecurityAccessLevel.PARENT_CHILD_BUSINESS_UNITS,
    'timesheets:READ': SecurityAccessLevel.PARENT_CHILD_BUSINESS_UNITS,
    'timesheets:APPROVE': SecurityAccessLevel.PARENT_CHILD_BUSINESS_UNITS,
    'timesheets:REJECT': SecurityAccessLevel.PARENT_CHILD_BUSINESS_UNITS,
    'leave-requests:READ': SecurityAccessLevel.PARENT_CHILD_BUSINESS_UNITS,
    'leave-requests:APPROVE': SecurityAccessLevel.PARENT_CHILD_BUSINESS_UNITS,
    'leave-requests:REJECT': SecurityAccessLevel.PARENT_CHILD_BUSINESS_UNITS,
    'projects:READ': SecurityAccessLevel.PARENT_CHILD_BUSINESS_UNITS,
  }),
  hr: matrix(SecurityAccessLevel.NONE, {
    'employees:READ': SecurityAccessLevel.ORGANIZATION,
    'employees:CREATE': SecurityAccessLevel.ORGANIZATION,
    'employees:WRITE': SecurityAccessLevel.ORGANIZATION,
    'employees:DELETE': SecurityAccessLevel.ORGANIZATION,
    'attendance:READ': SecurityAccessLevel.ORGANIZATION,
    'attendance:WRITE': SecurityAccessLevel.ORGANIZATION,
    'timesheets:READ': SecurityAccessLevel.ORGANIZATION,
    'leave-requests:READ': SecurityAccessLevel.ORGANIZATION,
    'leave-requests:APPROVE': SecurityAccessLevel.ORGANIZATION,
    'leave-requests:REJECT': SecurityAccessLevel.ORGANIZATION,
    'documents:READ': SecurityAccessLevel.ORGANIZATION,
    'documents:CREATE': SecurityAccessLevel.ORGANIZATION,
    'documents:WRITE': SecurityAccessLevel.ORGANIZATION,
    'settings:READ': SecurityAccessLevel.ORGANIZATION,
    'reports:READ': SecurityAccessLevel.ORGANIZATION,
  }),
  recruiter: matrix(SecurityAccessLevel.NONE, {
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
  employee: matrix(SecurityAccessLevel.NONE, {
    'employees:READ': SecurityAccessLevel.USER,
    'employees:WRITE': SecurityAccessLevel.USER,
    'attendance:READ': SecurityAccessLevel.USER,
    'attendance:CREATE': SecurityAccessLevel.USER,
    'timesheets:READ': SecurityAccessLevel.USER,
    'timesheets:CREATE': SecurityAccessLevel.USER,
    'timesheets:WRITE': SecurityAccessLevel.USER,
    'leave-requests:READ': SecurityAccessLevel.USER,
    'leave-requests:CREATE': SecurityAccessLevel.USER,
    'documents:READ': SecurityAccessLevel.USER,
    'documents:CREATE': SecurityAccessLevel.USER,
    'projects:READ': SecurityAccessLevel.USER,
  }),
};

export const SYSTEM_ROLE_MISC_PERMISSIONS: Record<SystemRoleKey, string[]> = {
  'global-admin': MISC_PERMISSION_DEFINITIONS.map((permission) => permission.key),
  'system-admin': MISC_PERMISSION_DEFINITIONS.map((permission) => permission.key).filter(
    (key) => key !== 'support.impersonate',
  ),
  'system-customizer': ['customization.access', 'customization.publish'],
  ceo: ['audit.view', 'reports.export', 'billing.view'],
  manager: ['reports.export'],
  hr: [
    'tenant.settings.manage',
    'audit.view',
    'reports.export',
    'organization.manage',
  ],
  recruiter: [],
  employee: [],
};

export const SECURITY_ACCESS_LEVEL_WEIGHT: Record<SecurityAccessLevel, number> = {
  NONE: 0,
  USER: 1,
  BUSINESS_UNIT: 2,
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
      return SecurityAccessLevel.USER;
  }
}

export function matrixPrivilegeToPermissionKey(
  entityKey: string,
  privilege: SecurityPrivilege,
) {
  const normalizedPrivilege = privilege.toLowerCase();

  const explicit: Record<string, string> = {
    'leave-requests:read': 'leave-requests.read',
    'leave-requests:create': 'leave-requests.create',
    'leave-requests:approve': 'leave-requests.approve',
    'leave-requests:reject': 'leave-requests.reject',
    'attendance:import': 'attendance.import',
    'attendance:export': 'attendance.export',
    'attendance:manage': 'attendance.manage',
    'timesheets:write': 'timesheets.write',
    'timesheets:approve': 'timesheets.approve',
    'timesheets:reject': 'timesheets.reject',
    'timesheets:import': 'timesheets.import',
    'timesheets:export': 'timesheets.export',
    'payroll:write': 'payroll.write',
    'payroll:manage': 'payroll.run',
    'payroll:approve': 'payroll.review',
    'payroll:export': 'payroll.export',
    'documents:create': 'documents.upload',
    'documents:write': 'documents.update',
    'projects:assign': 'projects.assign',
    'settings:configure': 'settings.update',
    'customization:configure': 'customization.publish',
    'customization:manage': 'customization.publish',
    'reports:read': 'employees.read',
    'reports:export': 'reports.export',
    'jobs:read': 'recruitment.read',
    'jobs:create': 'recruitment.create',
    'jobs:write': 'recruitment.update',
    'candidates:read': 'recruitment.read',
    'candidates:create': 'recruitment.create',
    'candidates:write': 'recruitment.update',
  };

  return explicit[`${entityKey}:${normalizedPrivilege}`] ?? `${entityKey}.${normalizedPrivilege}`;
}
