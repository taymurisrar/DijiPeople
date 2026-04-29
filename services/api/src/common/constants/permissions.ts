import { RoleAccessLevel } from '@prisma/client';

export type PermissionDefinition = {
  key: string;
  name: string;
  description: string;
};

export const PERMISSION_KEYS = {
  DASHBOARD_VIEW: 'dashboard.view',
  TENANT_READ: 'tenant.read',
  TENANT_UPDATE: 'tenant.update',
  SETTINGS_READ: 'settings.read',
  SETTINGS_UPDATE: 'settings.update',
  USERS_READ: 'users.read',
  USERS_CREATE: 'users.create',
  USERS_UPDATE: 'users.update',
  USERS_DELETE: 'users.delete',
  USERS_ASSIGN_ROLES: 'users.assign-roles',
  ROLES_READ: 'roles.read',
  ROLES_CREATE: 'roles.create',
  ROLES_UPDATE: 'roles.update',
  ROLES_ASSIGN_PERMISSIONS: 'roles.assign-permissions',
  PERMISSIONS_READ: 'permissions.read',
  AUDIT_READ: 'audit.read',
  EMPLOYEES_READ: 'employees.read',
  EMPLOYEES_CREATE: 'employees.create',
  EMPLOYEES_UPDATE: 'employees.update',
  EMPLOYEES_TERMINATE: 'employees.terminate',
  EMPLOYEE_LEVELS_READ: 'employee-levels.read',
  EMPLOYEE_LEVELS_MANAGE: 'employee-levels.manage',
  LEAVE_REQUESTS_READ: 'leave-requests.read',
  LEAVE_REQUESTS_CREATE: 'leave-requests.create',
  LEAVE_REQUESTS_APPROVE: 'leave-requests.approve',
  LEAVE_REQUESTS_REJECT: 'leave-requests.reject',
  ATTENDANCE_READ: 'attendance.read',
  ATTENDANCE_MANAGE: 'attendance.manage',
  AGENT_SETTINGS_READ: 'agent.settings.read',
  AGENT_SETTINGS_MANAGE: 'agent.settings.manage',
  TIMESHEETS_READ: 'timesheets.read',
  TIMESHEETS_READ_ALL: 'timesheets.read.all',
  TIMESHEETS_READ_TEAM: 'timesheets.read.team',
  PAYROLL_READ: 'payroll.read',
  PAY_COMPONENTS_READ: 'pay-components.read',
  PAY_COMPONENTS_MANAGE: 'pay-components.manage',
  COMPENSATION_READ: 'compensation.read',
  COMPENSATION_MANAGE: 'compensation.manage',
  POLICIES_READ: 'policies.read',
  POLICIES_MANAGE: 'policies.manage',
  RECRUITMENT_READ: 'recruitment.read',
  ONBOARDING_READ: 'onboarding.read',
  DOCUMENTS_READ: 'documents.read',
  CUSTOMIZATION_READ: 'customization.read',
  CUSTOMIZATION_PUBLISH: 'customization.publish',
  TEAMS_READ: 'teams.read',
  TEAMS_CREATE: 'teams.create',
  TEAMS_UPDATE: 'teams.update',
  TEAMS_DELETE: 'teams.delete',
  TEAMS_MEMBERS_MANAGE: 'teams.members.manage',
} as const;

export type BaseRoleKey =
  | 'system-admin'
  | 'system-customizer'
  | 'hr'
  | 'recruiter'
  | 'manager'
  | 'employee';

export const FOUNDATION_PERMISSION_DEFINITIONS: PermissionDefinition[] = [
  {
    key: 'dashboard.view',
    name: 'View dashboard',
    description: 'Access the tenant dashboard and foundation workspace shell.',
  },
  {
    key: 'tenant.read',
    name: 'Read tenant',
    description: 'View tenant profile and business configuration.',
  },
  {
    key: 'tenant.update',
    name: 'Update tenant',
    description: 'Update tenant-level configuration and platform settings.',
  },
  {
    key: 'settings.read',
    name: 'Read settings',
    description: 'View tenant configuration, preferences, and enabled modules.',
  },
  {
    key: 'settings.update',
    name: 'Update settings',
    description:
      'Update tenant configuration values and enabled feature flags.',
  },
  {
    key: 'users.read',
    name: 'Read users',
    description: 'View platform users for the current tenant.',
  },
  {
    key: 'users.create',
    name: 'Create users',
    description: 'Create new users within the current tenant.',
  },
  {
    key: 'users.update',
    name: 'Update users',
    description: 'Update user details and account status.',
  },
  {
    key: 'users.delete',
    name: 'Delete users',
    description: 'Delete tenant users when it is safe to remove their access.',
  },
  {
    key: 'users.assign-roles',
    name: 'Assign user roles',
    description: 'Assign or replace role mappings for tenant users.',
  },
  {
    key: 'roles.read',
    name: 'Read roles',
    description: 'View roles and their permission assignments.',
  },
  {
    key: 'roles.create',
    name: 'Create roles',
    description: 'Create roles for the current tenant.',
  },
  {
    key: 'roles.update',
    name: 'Update roles',
    description: 'Update role metadata and lifecycle state.',
  },
  {
    key: 'roles.assign-permissions',
    name: 'Assign role permissions',
    description: 'Assign permissions to tenant roles.',
  },
  {
    key: 'permissions.read',
    name: 'Read permissions',
    description: 'View the permission catalogue available to the tenant.',
  },
  {
    key: 'audit.read',
    name: 'Read audit logs',
    description:
      'View tenant audit logs for compliance, support, and change tracking.',
  },
  {
    key: PERMISSION_KEYS.TEAMS_READ,
    name: 'Read teams',
    description: 'View security teams and group membership for this tenant.',
  },
  {
    key: PERMISSION_KEYS.TEAMS_CREATE,
    name: 'Create teams',
    description: 'Create tenant security teams and access groups.',
  },
  {
    key: PERMISSION_KEYS.TEAMS_UPDATE,
    name: 'Update teams',
    description: 'Update tenant security team metadata and active status.',
  },
  {
    key: PERMISSION_KEYS.TEAMS_DELETE,
    name: 'Delete teams',
    description: 'Delete inactive or unused custom teams.',
  },
  {
    key: PERMISSION_KEYS.TEAMS_MEMBERS_MANAGE,
    name: 'Manage team members',
    description: 'Add or remove users and role assignments on tenant teams.',
  },
  {
    key: 'documents.read',
    name: 'Read documents',
    description: 'View uploaded document metadata and linked records.',
  },
  {
    key: 'documents.upload',
    name: 'Upload documents',
    description:
      'Upload file-backed documents and create reusable entity links.',
  },
  {
    key: 'documents.update',
    name: 'Update documents',
    description: 'Update document metadata such as title, category, and type.',
  },
  {
    key: 'documents.delete',
    name: 'Delete documents',
    description: 'Archive documents and remove access to linked references.',
  },
  {
    key: 'documents.types.manage',
    name: 'Manage document types',
    description: 'Create and manage document type definitions.',
  },
  {
    key: 'documents.categories.manage',
    name: 'Manage document categories',
    description: 'Create and manage document category definitions.',
  },
  {
    key: 'employees.read',
    name: 'Read employees',
    description: 'View employee records and workforce directory data.',
  },
  {
    key: 'employees.create',
    name: 'Create employees',
    description: 'Create employee records within the current tenant.',
  },
  {
    key: 'employees.update',
    name: 'Update employees',
    description: 'Update employee records, profile details, and assignments.',
  },
  {
    key: 'employees.read.self',
    name: 'Read own employee',
    description: 'View own employee profile.',
  },
  {
    key: 'employees.update.self',
    name: 'Update own employee',
    description: 'Update own employee profile.',
  },
  {
    key: 'employees.documents.read.self',
    name: 'Read own employee documents',
    description: 'View own documents.',
  },
  {
    key: 'employees.documents.upload.self',
    name: 'Upload own employee documents',
    description: 'Upload own documents.',
  },
  {
    key: 'employees.documents.delete.self',
    name: 'Delete own employee documents',
    description: 'Delete own documents.',
  },
  {
    key: 'employees.education.read.self',
    name: 'Read own education',
    description: 'View own education records.',
  },
  {
    key: 'employees.education.create.self',
    name: 'Create own education',
    description: 'Add education records.',
  },
  {
    key: 'employees.education.update.self',
    name: 'Update own education',
    description: 'Update education records.',
  },
  {
    key: 'employees.education.delete.self',
    name: 'Delete own education',
    description: 'Delete education records.',
  },
  {
    key: 'employees.history.read.self',
    name: 'Read own history',
    description: 'View own history.',
  },
  {
    key: 'employees.documents.read',
    name: 'Read employee documents',
    description: 'View uploaded employee documents and profile images.',
  },
  {
    key: 'employees.documents.upload',
    name: 'Upload employee documents',
    description: 'Upload employee documents and profile images.',
  },
  {
    key: 'employees.documents.delete',
    name: 'Delete employee documents',
    description: 'Delete employee documents and profile images.',
  },
  {
    key: 'employees.history.read',
    name: 'Read employee history',
    description: 'View employee history and profile change timeline.',
  },
  {
    key: 'employees.history.create',
    name: 'Create employee history',
    description: 'Create employee history events and timeline entries.',
  },
  {
    key: 'employees.education.read',
    name: 'Read employee education',
    description: 'View employee education records.',
  },
  {
    key: 'employees.education.create',
    name: 'Create employee education',
    description: 'Create employee education records.',
  },
  {
    key: 'employees.education.update',
    name: 'Update employee education',
    description: 'Update employee education records.',
  },
  {
    key: 'employees.education.delete',
    name: 'Delete employee education',
    description: 'Delete employee education records.',
  },
  {
    key: 'employees.terminate',
    name: 'Terminate employees',
    description: 'Terminate or deactivate employee records within the tenant.',
  },
  {
    key: PERMISSION_KEYS.EMPLOYEE_LEVELS_READ,
    name: 'Read employee levels',
    description:
      'View normalized employee level and grade master data for the tenant.',
  },
  {
    key: PERMISSION_KEYS.EMPLOYEE_LEVELS_MANAGE,
    name: 'Manage employee levels',
    description:
      'Create, update, and deactivate employee level and grade master data.',
  },
  {
    key: 'departments.read',
    name: 'Read departments',
    description: 'View department master data for the current tenant.',
  },
  {
    key: 'departments.create',
    name: 'Create departments',
    description:
      'Create department master data records for the current tenant.',
  },
  {
    key: 'departments.update',
    name: 'Update departments',
    description:
      'Update department master data records for the current tenant.',
  },
  {
    key: 'designations.read',
    name: 'Read designations',
    description: 'View designation master data for the current tenant.',
  },
  {
    key: 'designations.create',
    name: 'Create designations',
    description:
      'Create designation master data records for the current tenant.',
  },
  {
    key: 'designations.update',
    name: 'Update designations',
    description:
      'Update designation master data records for the current tenant.',
  },
  {
    key: 'locations.read',
    name: 'Read locations',
    description: 'View location master data for the current tenant.',
  },
  {
    key: 'locations.create',
    name: 'Create locations',
    description: 'Create location master data records for the current tenant.',
  },
  {
    key: 'locations.update',
    name: 'Update locations',
    description: 'Update location master data records for the current tenant.',
  },
  {
    key: 'hierarchy.read',
    name: 'Read hierarchy',
    description:
      'View reporting lines, direct reports, and employee hierarchy details.',
  },
  {
    key: 'hierarchy.update',
    name: 'Update hierarchy',
    description:
      'Assign or change primary managers within the current tenant hierarchy.',
  },
  {
    key: 'leave-types.read',
    name: 'Read leave types',
    description: 'View tenant-configured leave type definitions.',
  },
  {
    key: 'leave-types.create',
    name: 'Create leave types',
    description: 'Create leave type definitions for the current tenant.',
  },
  {
    key: 'leave-types.update',
    name: 'Update leave types',
    description: 'Update leave type definitions for the current tenant.',
  },
  {
    key: 'leave-policies.read',
    name: 'Read leave policies',
    description: 'View tenant-configured leave policies.',
  },
  {
    key: 'leave-policies.create',
    name: 'Create leave policies',
    description: 'Create leave policies for the current tenant.',
  },
  {
    key: 'leave-policies.update',
    name: 'Update leave policies',
    description: 'Update leave policies for the current tenant.',
  },
  {
    key: 'leave-requests.read',
    name: 'Read leave requests',
    description: 'View leave requests for self, team, or approval queues.',
  },
  {
    key: 'leave-requests.create',
    name: 'Create leave requests',
    description: 'Submit leave requests within the current tenant.',
  },
  {
    key: 'leave-requests.approve',
    name: 'Approve leave requests',
    description: 'Approve leave requests assigned through the approval flow.',
  },
  {
    key: 'leave-requests.reject',
    name: 'Reject leave requests',
    description: 'Reject leave requests assigned through the approval flow.',
  },
  {
    key: 'leave-requests.cancel',
    name: 'Cancel leave requests',
    description: 'Cancel pending leave requests before completion.',
  },
  {
    key: 'leaves.read',
    name: 'Read leaves',
    description: 'View leave requests and balances.',
  },
  {
    key: 'leaves.create',
    name: 'Create leaves',
    description: 'Create and submit leave requests.',
  },
  {
    key: 'leaves.approve',
    name: 'Approve leaves',
    description: 'Approve or reject leave requests.',
  },
  {
    key: 'recruitment.read',
    name: 'Read recruitment',
    description: 'View openings, candidates, and hiring pipeline data.',
  },
  {
    key: 'recruitment.create',
    name: 'Create recruitment',
    description: 'Create openings and recruitment pipeline records.',
  },
  {
    key: 'recruitment.update',
    name: 'Update recruitment',
    description: 'Update openings, candidate stages, and hiring workflows.',
  },
  {
    key: 'recruitment.advance',
    name: 'Advance recruitment',
    description: 'Move applications through recruitment stages and decisions.',
  },
  {
    key: 'attendance.read',
    name: 'Read attendance',
    description: 'View attendance logs and shift data.',
  },
  {
    key: 'attendance.create',
    name: 'Create attendance',
    description: 'Create attendance entries or imports.',
  },
  {
    key: 'attendance.checkin',
    name: 'Check in',
    description:
      'Start a self-service attendance session for the current employee.',
  },
  {
    key: 'attendance.checkout',
    name: 'Check out',
    description:
      'Finish an active self-service attendance session for the current employee.',
  },
  {
    key: 'attendance.update',
    name: 'Update attendance',
    description: 'Correct attendance records and shift outcomes.',
  },
  {
    key: 'attendance.manage',
    name: 'Manage attendance',
    description:
      'Create or override attendance records across the current tenant.',
  },
  {
    key: 'attendance.import',
    name: 'Import attendance',
    description: 'Import attendance rows from CSV or other external sources.',
  },
  {
    key: 'attendance.export',
    name: 'Export attendance',
    description: 'Export attendance data based on active operational filters.',
  },
  {
    key: 'attendance.integration.manage',
    name: 'Manage attendance integrations',
    description:
      'Configure attendance machine, API, webhook, and import source settings.',
  },
  {
    key: PERMISSION_KEYS.AGENT_SETTINGS_READ,
    name: 'Read desktop agent settings',
    description: 'View desktop agent productivity and tracking settings.',
  },
  {
    key: PERMISSION_KEYS.AGENT_SETTINGS_MANAGE,
    name: 'Manage desktop agent settings',
    description:
      'Configure desktop agent heartbeat, idle, privacy, and update policies.',
  },
  {
    key: 'timesheets.read',
    name: 'Read timesheets',
    description: 'View timesheet periods and time entries.',
  },
  {
    key: 'timesheets.read.all',
    name: 'Read all timesheets',
    description: 'View timesheets across the accessible tenant scope.',
  },
  {
    key: 'timesheets.read.team',
    name: 'Read team timesheets',
    description: 'View timesheets for direct reports and assigned teams.',
  },
  {
    key: 'timesheets.write',
    name: 'Write timesheets',
    description: 'Create or update draft timesheet entries.',
  },
  {
    key: 'timesheets.submit',
    name: 'Submit timesheets',
    description: 'Submit a timesheet period for approval.',
  },
  {
    key: 'timesheets.approve',
    name: 'Approve timesheets',
    description: 'Approve submitted timesheets.',
  },
  {
    key: 'timesheets.reject',
    name: 'Reject timesheets',
    description: 'Reject submitted timesheets.',
  },
  {
    key: 'timesheets.import',
    name: 'Import timesheets',
    description: 'Import timesheet data from approved templates.',
  },
  {
    key: 'timesheets.export',
    name: 'Export timesheets',
    description: 'Export timesheet data and approved period details.',
  },
  {
    key: 'timesheets.template.export',
    name: 'Export timesheet templates',
    description: 'Export blank or prefilled timesheet import templates.',
  },
  {
    key: 'timesheets.lock',
    name: 'Lock timesheets',
    description: 'Lock approved timesheets for payroll or period close.',
  },
  {
    key: 'timesheets.unlock',
    name: 'Unlock timesheets',
    description: 'Unlock timesheets for controlled corrections.',
  },
  {
    key: 'timesheets.settings.read',
    name: 'Read timesheet settings',
    description: 'View tenant timesheet configuration.',
  },
  {
    key: 'timesheets.settings.update',
    name: 'Update timesheet settings',
    description: 'Update tenant timesheet configuration.',
  },
  {
    key: 'projects.read',
    name: 'Read projects',
    description: 'View projects and their employee assignments.',
  },
  {
    key: 'projects.create',
    name: 'Create projects',
    description: 'Create projects within the current tenant.',
  },
  {
    key: 'projects.update',
    name: 'Update projects',
    description: 'Update project metadata and lifecycle state.',
  },
  {
    key: 'projects.assign',
    name: 'Assign projects',
    description: 'Assign employees to projects and manage allocation details.',
  },
  {
    key: 'onboarding.read',
    name: 'Read onboarding',
    description: 'View onboarding records, templates, and task progress.',
  },
  {
    key: 'onboarding.create',
    name: 'Create onboarding',
    description:
      'Create onboarding templates and start onboarding from hired candidates.',
  },
  {
    key: 'onboarding.update',
    name: 'Update onboarding',
    description: 'Update onboarding tasks, due dates, and completion progress.',
  },
  {
    key: 'payroll.read',
    name: 'Read payroll',
    description: 'View payroll runs, items, and summaries.',
  },
  {
    key: 'payroll.read.all',
    name: 'Read all payroll',
    description: 'View payroll records across the accessible tenant scope.',
  },
  {
    key: 'payroll.write',
    name: 'Write payroll',
    description:
      'Create and update payroll cycles, compensation, and draft data.',
  },
  {
    key: 'payroll.run',
    name: 'Run payroll',
    description: 'Generate draft payroll records for a payroll cycle.',
  },
  {
    key: 'payroll.review',
    name: 'Review payroll',
    description: 'Review payroll records before finalization.',
  },
  {
    key: 'payroll.finalize',
    name: 'Finalize payroll',
    description: 'Finalize payroll cycles and lock generated records.',
  },
  {
    key: 'payroll.export',
    name: 'Export payroll',
    description: 'Export payroll registers, bank files, and payroll reports.',
  },
  {
    key: 'payroll.settings.read',
    name: 'Read payroll settings',
    description: 'View tenant payroll configuration.',
  },
  {
    key: 'payroll.settings.update',
    name: 'Update payroll settings',
    description: 'Update tenant payroll configuration.',
  },
  {
    key: PERMISSION_KEYS.PAY_COMPONENTS_READ,
    name: 'Read pay components',
    description:
      'View the tenant pay component catalog used by compensation and payroll.',
  },
  {
    key: PERMISSION_KEYS.PAY_COMPONENTS_MANAGE,
    name: 'Manage pay components',
    description: 'Create, update, and deactivate tenant pay components.',
  },
  {
    key: PERMISSION_KEYS.COMPENSATION_READ,
    name: 'Read compensation',
    description: 'View employee compensation history and component details.',
  },
  {
    key: PERMISSION_KEYS.COMPENSATION_MANAGE,
    name: 'Manage compensation',
    description:
      'Create and update employee compensation history and salary components.',
  },
  {
    key: PERMISSION_KEYS.POLICIES_READ,
    name: 'Read policies',
    description:
      'View reusable effective-dated policies and assignment metadata.',
  },
  {
    key: PERMISSION_KEYS.POLICIES_MANAGE,
    name: 'Manage policies',
    description:
      'Create, update, retire, and assign reusable tenant policy definitions.',
  },
  {
    key: 'customization.read',
    name: 'Read customization',
    description:
      'Access tenant customization metadata for existing system modules.',
  },
  {
    key: 'customization.publish',
    name: 'Publish customization',
    description:
      'Publish tenant customization changes for existing system modules.',
  },
  {
    key: 'customization.tables.read',
    name: 'Read customization tables',
    description: 'View customizable system table metadata.',
  },
  {
    key: 'customization.tables.update',
    name: 'Update customization tables',
    description:
      'Update tenant labels and metadata for existing system tables.',
  },
  {
    key: 'customization.columns.read',
    name: 'Read customization columns',
    description: 'View system and tenant-defined column metadata.',
  },
  {
    key: 'customization.columns.create',
    name: 'Create customization columns',
    description:
      'Create tenant column metadata without creating database tables.',
  },
  {
    key: 'customization.columns.update',
    name: 'Update customization columns',
    description: 'Update tenant column metadata and presentation behavior.',
  },
  {
    key: 'customization.columns.delete',
    name: 'Delete customization columns',
    description: 'Delete tenant-created column metadata.',
  },
  {
    key: 'customization.views.read',
    name: 'Read customization views',
    description: 'View module view metadata and view customization records.',
  },
  {
    key: 'customization.views.create',
    name: 'Create customization views',
    description: 'Create tenant module views for existing system modules.',
  },
  {
    key: 'customization.views.update',
    name: 'Update customization views',
    description: 'Update tenant module views for existing system modules.',
  },
  {
    key: 'customization.views.delete',
    name: 'Delete customization views',
    description: 'Delete tenant-created module views.',
  },
  {
    key: 'customization.forms.read',
    name: 'Read customization forms',
    description: 'View tenant form metadata for existing system modules.',
  },
  {
    key: 'customization.forms.create',
    name: 'Create customization forms',
    description: 'Create tenant form metadata for existing system modules.',
  },
  {
    key: 'customization.forms.update',
    name: 'Update customization forms',
    description: 'Update tenant form layouts and field presentation metadata.',
  },
  {
    key: 'customization.forms.delete',
    name: 'Delete customization forms',
    description: 'Delete tenant-created form metadata.',
  },
];

export const CUSTOMIZATION_PERMISSION_KEYS =
  FOUNDATION_PERMISSION_DEFINITIONS.map((permission) => permission.key).filter(
    (permissionKey) => permissionKey.startsWith('customization.'),
  );

export const NON_CUSTOMIZATION_PERMISSION_KEYS =
  FOUNDATION_PERMISSION_DEFINITIONS.map((permission) => permission.key).filter(
    (permissionKey) => !permissionKey.startsWith('customization.'),
  );

export const BASE_ROLE_DEFINITIONS: Array<{
  key: BaseRoleKey;
  name: string;
  description: string;
  isSystem: boolean;
  accessLevel: RoleAccessLevel;
}> = [
  {
    key: 'system-admin',
    name: 'System Admin',
    description:
      'Broad tenant-wide access across operational modules. Customization requires System Customizer.',
    isSystem: true,
    accessLevel: RoleAccessLevel.TENANT,
  },
  {
    key: 'system-customizer',
    name: 'System Customizer',
    description:
      'Implementation role allowed to customize tenant metadata for existing system modules.',
    isSystem: true,
    accessLevel: RoleAccessLevel.TENANT,
  },
  {
    key: 'hr',
    name: 'HR',
    description: 'People operations role focused on workforce administration.',
    isSystem: true,
    accessLevel: RoleAccessLevel.ORGANIZATION,
  },
  {
    key: 'recruiter',
    name: 'Recruiter',
    description: 'Hiring-focused role for openings and candidate pipelines.',
    isSystem: true,
    accessLevel: RoleAccessLevel.BUSINESS_UNIT,
  },
  {
    key: 'manager',
    name: 'Manager',
    description: 'Team leadership role for approvals and employee visibility.',
    isSystem: true,
    accessLevel: RoleAccessLevel.PARENT_BU,
  },
  {
    key: 'employee',
    name: 'Employee',
    description: 'Self-service role for individual workforce actions.',
    isSystem: true,
    accessLevel: RoleAccessLevel.USER,
  },
];

export const BASE_ROLE_PERMISSION_KEYS: Record<BaseRoleKey, string[]> = {
  'system-admin': NON_CUSTOMIZATION_PERMISSION_KEYS,
  'system-customizer': CUSTOMIZATION_PERMISSION_KEYS,
  hr: [
    'dashboard.view',
    'tenant.read',
    'settings.read',
    'settings.update',
    'users.read',
    'users.create',
    'users.update',
    'users.delete',
    'roles.read',
    'permissions.read',
    'audit.read',
    'documents.read',
    'documents.upload',
    'documents.delete',
    'employees.read',
    'employees.create',
    'employees.update',
    'employees.documents.read',
    'employees.documents.upload',
    'employees.documents.delete',
    'employees.history.read',
    'employees.history.create',
    'employees.education.read',
    'employees.education.create',
    'employees.education.update',
    'employees.education.delete',
    'employees.terminate',
    'employee-levels.read',
    'employee-levels.manage',
    'departments.read',
    'departments.create',
    'departments.update',
    'designations.read',
    'designations.create',
    'designations.update',
    'locations.read',
    'locations.create',
    'locations.update',
    'hierarchy.read',
    'hierarchy.update',
    'leave-types.read',
    'leave-types.create',
    'leave-types.update',
    'leave-policies.read',
    'leave-policies.create',
    'leave-policies.update',
    'leave-requests.read',
    'leave-requests.create',
    'leave-requests.approve',
    'leave-requests.reject',
    'leave-requests.cancel',
    'leaves.read',
    'leaves.approve',
    'recruitment.read',
    'recruitment.create',
    'recruitment.update',
    'recruitment.advance',
    'attendance.read',
    'attendance.create',
    'attendance.checkin',
    'attendance.checkout',
    'attendance.update',
    'attendance.manage',
    'attendance.import',
    'attendance.export',
    'attendance.integration.manage',
    'agent.settings.read',
    'agent.settings.manage',
    'timesheets.read',
    'timesheets.read.all',
    'timesheets.read.team',
    'timesheets.write',
    'timesheets.submit',
    'timesheets.approve',
    'timesheets.reject',
    'timesheets.import',
    'timesheets.export',
    'timesheets.template.export',
    'timesheets.lock',
    'timesheets.unlock',
    'timesheets.settings.read',
    'timesheets.settings.update',
    'projects.read',
    'projects.create',
    'projects.update',
    'projects.assign',
    'onboarding.read',
    'onboarding.create',
    'onboarding.update',
    'payroll.read',
    'payroll.read.all',
    'payroll.write',
    'payroll.run',
    'payroll.review',
    'payroll.finalize',
    'payroll.export',
    'payroll.settings.read',
    'payroll.settings.update',
    'pay-components.read',
    'pay-components.manage',
    'compensation.read',
    'compensation.manage',
    'policies.read',
    'policies.manage',
  ],
  recruiter: [
    'dashboard.view',
    'settings.read',
    'documents.read',
    'users.read',
    'employees.read',
    'employees.documents.read',
    'employees.history.read',
    'employees.education.read',
    'employee-levels.read',
    'departments.read',
    'designations.read',
    'locations.read',
    'recruitment.read',
    'recruitment.create',
    'recruitment.update',
    'recruitment.advance',
  ],
  manager: [
    'dashboard.view',
    'settings.read',
    'documents.read',
    'users.read',
    'employees.read',
    'employee-levels.read',
    'departments.read',
    'designations.read',
    'locations.read',
    'hierarchy.read',
    'leave-types.read',
    'leave-types.create',
    'leave-types.update',
    'leave-policies.read',
    'leave-policies.create',
    'leave-policies.update',
    'leave-requests.read',
    'leave-requests.approve',
    'leave-requests.reject',
    'leaves.read',
    'leaves.approve',
    'recruitment.read',
    'attendance.read',
    'attendance.update',
    'attendance.export',
    'timesheets.read',
    'timesheets.read.team',
    'timesheets.approve',
    'timesheets.reject',
    'timesheets.export',
    'projects.read',
    'onboarding.read',
    'payroll.read',
    'pay-components.read',
    'compensation.read',
  ],
  employee: [
    'dashboard.view',
    'settings.read',
    'documents.read',
    'employees.read.self',
    'employees.update.self',
    'employees.documents.read.self',
    'employees.documents.upload.self',
    'employees.documents.delete.self',
    'employees.history.read.self',
    'employees.education.read.self',
    'employees.education.create.self',
    'employees.education.update.self',
    'employees.education.delete.self',
    'documents.upload',
    'leave-requests.read',
    'leave-types.read',
    'leave-requests.create',
    'leave-requests.cancel',
    'leaves.read',
    'leaves.create',
    'attendance.read',
    'attendance.create',
    'attendance.checkin',
    'attendance.checkout',
    'attendance.update',
    'timesheets.read',
    'timesheets.write',
    'timesheets.submit',
    'projects.read',
  ],
};

export const DEFAULT_PERMISSION_DEFINITIONS = FOUNDATION_PERMISSION_DEFINITIONS;
