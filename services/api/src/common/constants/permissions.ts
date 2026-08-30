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
  TENANT_SETTINGS_RESOLVED_READ: 'tenant-settings.resolved.read',
  USER_PREFERENCES_READ: 'user-preferences.read',
  USER_PREFERENCES_WRITE: 'user-preferences.write',
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
  FIELD_SECURITY_READ: 'field-security.read',
  FIELD_SECURITY_MANAGE: 'field-security.manage',
  EMPLOYEES_READ: 'employees.read',
  EMPLOYEES_CREATE: 'employees.create',
  EMPLOYEES_UPDATE: 'employees.update',
  EMPLOYEES_TERMINATE: 'employees.terminate',
  EMPLOYEE_LEVELS_READ: 'employee-levels.read',
  EMPLOYEE_LEVELS_MANAGE: 'employee-levels.manage',
  EMPLOYMENT_TYPES_READ: 'employment-types.read',
  EMPLOYMENT_TYPES_MANAGE: 'employment-types.manage',
  LEAVE_REQUESTS_READ: 'leave-requests.read',
  LEAVE_REQUESTS_CREATE: 'leave-requests.create',
  LEAVE_REQUESTS_APPROVE: 'leave-requests.approve',
  LEAVE_REQUESTS_REJECT: 'leave-requests.reject',
  LEAVE_TYPES_READ: 'leave-types.read',
  LEAVE_TYPES_CREATE: 'leave-types.create',
  LEAVE_TYPES_UPDATE: 'leave-types.update',
  LEAVE_POLICIES_READ: 'leave-policies.read',
  LEAVE_POLICIES_CREATE: 'leave-policies.create',
  LEAVE_POLICIES_UPDATE: 'leave-policies.update',
  LEAVE_POLICY_ASSIGNMENTS_READ: 'leave-policy-assignments.read',
  LEAVE_POLICY_ASSIGNMENTS_CREATE: 'leave-policy-assignments.create',
  LEAVE_POLICY_ASSIGNMENTS_UPDATE: 'leave-policy-assignments.update',
  LEAVE_POLICY_ASSIGNMENTS_DELETE: 'leave-policy-assignments.delete',
  APPROVAL_MATRICES_READ: 'approval-matrices.read',
  APPROVAL_MATRICES_CREATE: 'approval-matrices.create',
  APPROVAL_MATRICES_UPDATE: 'approval-matrices.update',
  APPROVAL_MATRICES_DELETE: 'approval-matrices.delete',
  ATTENDANCE_READ: 'attendance.read',
  ATTENDANCE_CORRECTION_READ: 'attendance.correction.read',
  ATTENDANCE_CORRECTION_CREATE: 'attendance.correction.create',
  ATTENDANCE_CORRECTION_READ_OWN: 'attendance.correction.readOwn',
  ATTENDANCE_CORRECTION_READ_TEAM: 'attendance.correction.readTeam',
  ATTENDANCE_CORRECTION_APPROVE: 'attendance.correction.approve',
  ATTENDANCE_CORRECTION_REJECT: 'attendance.correction.reject',
  ATTENDANCE_CORRECTION_CANCEL: 'attendance.correction.cancel',
  ATTENDANCE_CORRECTION_MANAGE: 'attendance.correction.manage',
  ATTENDANCE_MANAGE: 'attendance.manage',
  ATTENDANCE_LOCATION_EVIDENCE_READ: 'attendance.locationEvidence.read',
  AGENT_SETTINGS_READ: 'agent.settings.read',
  AGENT_SETTINGS_MANAGE: 'agent.settings.manage',

  // Attendance Integration Platform. `integrations.manage` already existed and
  // is reused as the umbrella manage permission rather than being duplicated.
  INTEGRATIONS_READ: 'integrations.read',
  ATTENDANCE_DEVICES_READ: 'attendanceDevices.read',
  ATTENDANCE_DEVICES_MANAGE: 'attendanceDevices.manage',
  ATTENDANCE_MAPPINGS_READ: 'attendanceMappings.read',
  ATTENDANCE_MAPPINGS_MANAGE: 'attendanceMappings.manage',
  ATTENDANCE_PROVISIONING_READ: 'attendanceProvisioning.read',
  ATTENDANCE_PROVISIONING_MANAGE: 'attendanceProvisioning.manage',
  GATEWAYS_READ: 'gateways.read',
  GATEWAYS_MANAGE: 'gateways.manage',
  APP_DOWNLOADS_READ: 'appDownloads.read',
  APP_DOWNLOADS_MANAGE: 'appDownloads.manage',
  // Reading captured DLP content (clipboard text, screenshots) is a distinct
  // authority from configuring the agent — see TASK-0020. Held by no role by
  // default; a tenant assigns it to a dedicated investigations role, and
  // elevated admins reach it via the guard bypass.
  DLP_REVIEW: 'dlp.review',

  TIMESHEETS_READ: 'timesheets.read',
  TIMESHEETS_READ_ALL: 'timesheets.read.all',
  TIMESHEETS_READ_TEAM: 'timesheets.read.team',
  TIMESHEETS_WITHDRAW: 'timesheets.withdraw',
  TIMESHEETS_REOPEN: 'timesheets.reopen',
  TIMESHEETS_PAYROLL_HANDOFF: 'timesheets.payroll.handoff',
  CUSTOMERS_READ: 'customers.read',
  CUSTOMERS_CREATE: 'customers.create',
  CUSTOMERS_WRITE: 'customers.write',
  CUSTOMERS_DELETE: 'customers.delete',
  CUSTOMERS_ASSIGN: 'customers.assign',
  CUSTOMERS_SHARE: 'customers.share',
  PAYROLL_READ: 'payroll.read',
  PAYROLL_CALENDARS_READ: 'payroll-calendars.read',
  PAYROLL_CALENDARS_MANAGE: 'payroll-calendars.manage',
  PAYROLL_PERIODS_READ: 'payroll-periods.read',
  PAYROLL_PERIODS_MANAGE: 'payroll-periods.manage',
  PAYROLL_RUNS_READ: 'payroll-runs.read',
  PAYROLL_RUNS_CREATE: 'payroll-runs.create',
  PAYROLL_RUNS_CALCULATE: 'payroll-runs.calculate',
  PAYROLL_RUNS_LOCK: 'payroll-runs.lock',
  PAYROLL_RUNS_DELETE: 'payroll-runs.delete',
  PAYROLL_OPERATIONS_DASHBOARD: 'payroll-operations.dashboard',
  PAYROLL_EXCEPTIONS_READ: 'payroll-exceptions.read',
  PAYROLL_EXCEPTIONS_EXPORT: 'payroll-exceptions.export',
  PAYROLL_RUNS_FINALIZE: 'payroll-runs.finalize',
  PAYROLL_BANK_EXPORT_GENERATE: 'payroll-bank-export.generate',
  PAYROLL_RUNS_DISBURSE: 'payroll-runs.disburse',
  PAYSLIPS_READ_ALL: 'payslips.read-all',
  PAYSLIPS_READ_OWN: 'payslips.read-own',
  PAYSLIPS_MANAGE: 'payslips.manage',
  PAYSLIPS_PUBLISH: 'payslips.publish',
  PAYSLIPS_VOID: 'payslips.void',
  PAYSLIPS_DELIVER: 'payslips.deliver',
  PAYSLIPS_DOWNLOAD: 'payslips.download',
  CLAIM_TYPES_READ: 'claim-types.read',
  CLAIM_TYPES_MANAGE: 'claim-types.manage',
  CLAIMS_READ_ALL: 'claims.read-all',
  CLAIMS_READ_OWN: 'claims.read-own',
  CLAIMS_CREATE: 'claims.create',
  CLAIMS_UPDATE: 'claims.update',
  CLAIMS_MANAGER_APPROVE: 'claims.manager-approve',
  CLAIMS_PAYROLL_APPROVE: 'claims.payroll-approve',
  CLAIMS_REJECT: 'claims.reject',
  CLAIMS_CANCEL: 'claims.cancel',
  BENEFITS_READ: 'benefits.read',
  BENEFITS_READ_OWN: 'benefits.read-own',
  BENEFITS_MANAGE: 'benefits.manage',
  BENEFITS_ASSIGN: 'benefits.assign',
  BENEFITS_CONSUME: 'benefits.consume',
  BENEFITS_READ_SENSITIVE: 'benefits.read-sensitive',
  LOANS_READ_ALL: 'loans.read-all',
  LOANS_READ_OWN: 'loans.read-own',
  LOANS_CREATE: 'loans.create',
  LOANS_UPDATE: 'loans.update',
  LOANS_APPROVE: 'loans.approve',
  LOANS_REJECT: 'loans.reject',
  LOANS_SETTLE: 'loans.settle',
  BANKS_READ: 'banks.read',
  BANKS_MANAGE: 'banks.manage',
  EMPLOYEE_BANK_ACCOUNTS_READ: 'employee-bank-accounts.read',
  EMPLOYEE_BANK_ACCOUNTS_READ_OWN: 'employee-bank-accounts.read-own',
  EMPLOYEE_BANK_ACCOUNTS_MANAGE: 'employee-bank-accounts.manage',
  EMPLOYEE_BANK_ACCOUNTS_VERIFY: 'employee-bank-accounts.verify',
  BUSINESS_TRIPS_READ_ALL: 'business-trips.read-all',
  BUSINESS_TRIPS_READ_OWN: 'business-trips.read-own',
  BUSINESS_TRIPS_CREATE: 'business-trips.create',
  BUSINESS_TRIPS_UPDATE: 'business-trips.update',
  BUSINESS_TRIPS_APPROVE: 'business-trips.approve',
  BUSINESS_TRIPS_REJECT: 'business-trips.reject',
  BUSINESS_TRIPS_CANCEL: 'business-trips.cancel',
  TADA_POLICIES_READ: 'tada-policies.read',
  TADA_POLICIES_MANAGE: 'tada-policies.manage',
  TIME_PAYROLL_POLICIES_READ: 'time-payroll-policies.read',
  TIME_PAYROLL_POLICIES_MANAGE: 'time-payroll-policies.manage',
  OVERTIME_POLICIES_READ: 'overtime-policies.read',
  OVERTIME_POLICIES_MANAGE: 'overtime-policies.manage',
  PAYROLL_TIME_INPUTS_READ: 'payroll-time-inputs.read',
  PAYROLL_TIME_INPUTS_PREPARE: 'payroll-time-inputs.prepare',
  TAX_RULES_READ: 'tax-rules.read',
  TAX_RULES_MANAGE: 'tax-rules.manage',
  EMPLOYEE_TAX_PROFILES_READ: 'employee-tax-profiles.read',
  EMPLOYEE_TAX_PROFILES_MANAGE: 'employee-tax-profiles.manage',
  PAYROLL_TAX_CALCULATE: 'payroll-tax.calculate',
  PAYROLL_GL_READ: 'payroll-gl.read',
  PAYROLL_GL_MANAGE: 'payroll-gl.manage',
  PAYROLL_JOURNAL_GENERATE: 'payroll-journal.generate',
  PAYROLL_JOURNAL_EXPORT: 'payroll-journal.export',
  PAYROLL_JOURNAL_READ: 'payroll-journal.read',
  PAYROLL_JOURNAL_MANAGE: 'payroll-journal.manage',
  PAY_COMPONENTS_READ: 'pay-components.read',
  PAY_COMPONENTS_MANAGE: 'pay-components.manage',
  COMPENSATION_READ: 'compensation.read',
  COMPENSATION_MANAGE: 'compensation.manage',
  POLICIES_READ: 'policies.read',
  POLICIES_MANAGE: 'policies.manage',
  RECRUITMENT_READ: 'recruitment.read',
  ONBOARDING_READ: 'onboarding.read',
  DOCUMENTS_READ: 'documents.read',
  DATA_MANAGEMENT_VIEW: 'data-management.view',
  DATA_MANAGEMENT_TEMPLATE_DOWNLOAD: 'data-management.template.download',
  DATA_MANAGEMENT_IMPORT_VALIDATE: 'data-management.import.validate',
  DATA_MANAGEMENT_IMPORT_EXECUTE: 'data-management.import.execute',
  DATA_MANAGEMENT_EXPORT: 'data-management.export',
  DATA_MANAGEMENT_JOBS_READ_ALL: 'data-management.jobs.readAll',
  DATA_MANAGEMENT_IMPORT_RETRY: 'data-management.import.retry',
  DATA_MANAGEMENT_IMPORT_CANCEL: 'data-management.import.cancel',
  DATA_MANAGEMENT_MAPPINGS_MANAGE: 'data-management.mappings.manage',
  INBOX_READ: 'inbox.read',
  INBOX_MARK_READ: 'inbox.markRead',
  INBOX_DISMISS: 'inbox.dismiss',
  INBOX_ARCHIVE: 'inbox.archive',
  INBOX_BULK_UPDATE: 'inbox.bulkUpdate',
  NOTIFICATIONS_READ: 'notifications.read',
  NOTIFICATIONS_MANAGE: 'notifications.manage',
  NOTIFICATIONS_MANAGE_RULES: 'notifications.manageRules',
  NOTIFICATIONS_MANAGE_TEMPLATES: 'notifications.manageTemplates',
  NOTIFICATION_TEMPLATES_READ: 'notification.templates.read',
  NOTIFICATION_TEMPLATES_MANAGE: 'notification.templates.manage',
  WORKFLOWS_READ: 'workflows.read',
  WORKFLOWS_MANAGE: 'workflows.manage',
  NOTIFICATION_PROVIDERS_READ: 'notification.providers.read',
  NOTIFICATION_PROVIDERS_MANAGE: 'notification.providers.manage',
  NOTIFICATION_LOGS_READ: 'notification.logs.read',
  NOTIFICATION_DIAGNOSTICS_READ: 'notification.diagnostics.read',
  APPROVALS_READ: 'approvals.read',
  APPROVALS_READ_OWN: 'approvals.readOwn',
  APPROVALS_READ_ASSIGNED: 'approvals.readAssigned',
  APPROVALS_READ_TEAM: 'approvals.readTeam',
  APPROVALS_MANAGE: 'approvals.manage',
  SLA_READ: 'sla.read',
  SLA_MANAGE: 'sla.manage',
  CUSTOMIZATION_READ: 'customization.read',
  CUSTOMIZATION_PUBLISH: 'customization.publish',
  CUSTOMIZATION_MODULES_READ: 'customization.modules.read',
  CUSTOMIZATION_MODULES_MANAGE: 'customization.modules.manage',
  CUSTOMIZATION_FIELDS_MANAGE: 'customization.fields.manage',
  CUSTOMIZATION_FORMS_MANAGE: 'customization.forms.manage',
  CUSTOMIZATION_VIEWS_MANAGE: 'customization.views.manage',
  CUSTOMIZATION_CHOICE_LISTS_MANAGE: 'customization.choice-lists.manage',
  CUSTOMIZATION_RELATIONSHIPS_MANAGE: 'customization.relationships.manage',
  CUSTOMIZATION_ACTION_BARS_MANAGE: 'customization.action-bars.manage',
  CUSTOMIZATION_PACKAGES_MANAGE: 'customization.packages.manage',
  CUSTOMIZATION_PUBLISH_CENTER_READ: 'customization.publish-center.read',
  CUSTOMIZATION_IMPORT_PREVIEW: 'customization.import.preview',
  CUSTOMIZATION_EXPORT: 'customization.export',
  WIDGET_MANAGE: 'widget.manage',
  TIMELINE_READ: 'timeline.read',
  TIMELINE_MANAGE_TEMPLATES: 'timeline.manage.templates',
  TEAMS_READ: 'teams.read',
  TEAMS_CREATE: 'teams.create',
  TEAMS_UPDATE: 'teams.update',
  TEAMS_DELETE: 'teams.delete',
  TEAMS_MEMBERS_MANAGE: 'teams.members.manage',
  BUSINESS_UNITS_READ: 'business-units.read',

  // Reports & Analytics (TASK-0028). `reports.export` is NOT here — it lives in
  // MISC_PERMISSION_KEYS in rbac-matrix.ts and predates this work.
  REPORTS_READ: 'reports.read',
  REPORTS_BUILDER_USE: 'reports.builder.use',
  REPORTS_DEFINITIONS_MANAGE: 'reports.definitions.manage',
  REPORTS_SAVED_VIEWS_MANAGE: 'reports.saved-views.manage',
  REPORTS_SCHEDULE_MANAGE: 'reports.schedule.manage',
  REPORTS_DATA_QUALITY_READ: 'reports.data-quality.read',

  // Desktop Activity analytics. Deliberately separate from `agent.*`: those
  // govern configuring the agent, these govern reading what it reported. A
  // manager holds neither by default — see the owner decision recorded in
  // EXECPLAN-0030.
  DESKTOP_ANALYTICS_READ_OWN: 'desktop-analytics.read.own',
  DESKTOP_ANALYTICS_READ_ORGANIZATION: 'desktop-analytics.read.organization',
  DESKTOP_ANALYTICS_DEVICE_HEALTH_READ: 'desktop-analytics.device-health.read',
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
    key: 'reports.read',
    name: 'View reports and analytics',
    description:
      'Open the Reports & Analytics workspace and run reports within the scope the role allows.',
  },
  {
    key: 'reports.builder.use',
    name: 'Use the report builder',
    description:
      'Build ad-hoc reports from the reporting semantic layer. Field access is still resolved per user.',
  },
  {
    key: 'reports.definitions.manage',
    name: 'Manage saved reports',
    description:
      'Create, edit, duplicate, share and delete custom report definitions.',
  },
  {
    key: 'reports.saved-views.manage',
    name: 'Manage saved analytics views',
    description:
      'Save, rename, share and remove filter and period presets on analytics surfaces.',
  },
  {
    key: 'reports.schedule.manage',
    name: 'Manage scheduled reports',
    description:
      'Create and change scheduled report delivery. Delivery is authorised again at execution time.',
  },
  {
    key: 'reports.data-quality.read',
    name: 'View reporting data quality',
    description:
      'See records excluded from analytics because a required dimension is missing.',
  },
  {
    key: 'desktop-analytics.read.own',
    name: 'View own desktop activity',
    description:
      'See your own desktop agent activity summary. Grants no visibility of anyone else.',
  },
  {
    key: 'desktop-analytics.read.organization',
    name: 'View organization desktop activity',
    description:
      'See desktop activity analytics across the organization. Intended for HR and administrators, not line managers.',
  },
  {
    key: 'desktop-analytics.device-health.read',
    name: 'View device and agent health',
    description:
      'See device coverage, agent versions and reporting freshness. Carries no activity detail.',
  },
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
    key: 'tenant-settings.resolved.read',
    name: 'Read resolved runtime settings',
    description:
      'Read the resolved tenant settings required by the authenticated application shell and runtime.',
  },
  {
    key: 'user-preferences.read',
    name: 'Read own preferences',
    description: 'Read the authenticated user preferences.',
  },
  {
    key: 'user-preferences.write',
    name: 'Update own preferences',
    description: 'Update the authenticated user preferences.',
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
    key: 'field-security.read',
    name: 'Read field security policies',
    description: 'View field-level security policies, rules, and assignments.',
  },
  {
    key: 'field-security.manage',
    name: 'Manage field security policies',
    description:
      'Create, update, assign, and delete field-level security policies.',
  },
  {
    key: PERMISSION_KEYS.INBOX_READ,
    name: 'Read inbox',
    description: 'View assigned notification, work queue, and history items.',
  },
  {
    key: PERMISSION_KEYS.INBOX_MARK_READ,
    name: 'Mark inbox notifications read',
    description: 'Mark inbox notifications as read or unread.',
  },
  {
    key: PERMISSION_KEYS.INBOX_DISMISS,
    name: 'Dismiss inbox notifications',
    description: 'Dismiss notifications that no longer need attention.',
  },
  {
    key: PERMISSION_KEYS.INBOX_ARCHIVE,
    name: 'Archive inbox notifications',
    description: 'Archive inbox notification history items.',
  },
  {
    key: PERMISSION_KEYS.INBOX_BULK_UPDATE,
    name: 'Bulk update inbox notifications',
    description: 'Apply bulk read, dismiss, or archive changes to inbox items.',
  },
  {
    key: PERMISSION_KEYS.NOTIFICATIONS_READ,
    name: 'Read notifications',
    description:
      'View notification event definitions and tenant notification configuration.',
  },
  {
    key: PERMISSION_KEYS.NOTIFICATIONS_MANAGE,
    name: 'Manage notifications',
    description:
      'Manage tenant notification event preferences and channel defaults.',
  },
  {
    key: PERMISSION_KEYS.NOTIFICATIONS_MANAGE_RULES,
    name: 'Manage notification rules',
    description:
      'Configure tenant notification routing rules and display behavior.',
  },
  {
    key: PERMISSION_KEYS.NOTIFICATIONS_MANAGE_TEMPLATES,
    name: 'Manage notification message templates',
    description:
      'Configure reusable in-app notification templates for tenant events.',
  },
  {
    key: PERMISSION_KEYS.NOTIFICATION_TEMPLATES_READ,
    name: 'Read notification templates',
    description:
      'View system and tenant email templates used by notification events.',
  },
  {
    key: PERMISSION_KEYS.NOTIFICATION_TEMPLATES_MANAGE,
    name: 'Manage notification templates',
    description:
      'Create, update, version, and archive tenant notification email templates.',
  },
  {
    key: PERMISSION_KEYS.WORKFLOWS_READ,
    name: 'Read workflows',
    description:
      'View tenant workflows, their triggers and actions, and their run history.',
  },
  {
    key: PERMISSION_KEYS.WORKFLOWS_MANAGE,
    name: 'Manage workflows',
    description:
      'Create, update, activate and delete workflows that send email when an event happens.',
  },
  {
    key: PERMISSION_KEYS.NOTIFICATION_PROVIDERS_READ,
    name: 'Read notification providers',
    description:
      'View tenant email provider settings and sender configuration metadata.',
  },
  {
    key: PERMISSION_KEYS.NOTIFICATION_PROVIDERS_MANAGE,
    name: 'Manage notification providers',
    description:
      'Create and update tenant email provider settings and sender configuration.',
  },
  {
    key: PERMISSION_KEYS.NOTIFICATION_LOGS_READ,
    name: 'Read notification logs',
    description:
      'View tenant email delivery logs and notification delivery outcomes.',
  },
  {
    key: PERMISSION_KEYS.NOTIFICATION_DIAGNOSTICS_READ,
    name: 'Read notification diagnostics',
    description:
      'View provider, queue, retry, and notification execution diagnostics.',
  },
  {
    key: PERMISSION_KEYS.APPROVALS_READ,
    name: 'Read approvals',
    description: 'View relevant generic approval requests and progress.',
  },
  {
    key: PERMISSION_KEYS.APPROVALS_READ_OWN,
    name: 'Read own approvals',
    description: 'View approval requests submitted by the current user.',
  },
  {
    key: PERMISSION_KEYS.APPROVALS_READ_ASSIGNED,
    name: 'Read assigned approvals',
    description: 'View approval requests assigned to the current user.',
  },
  {
    key: PERMISSION_KEYS.APPROVALS_READ_TEAM,
    name: 'Read team approvals',
    description: 'View team approval requests within the current scope.',
  },
  {
    key: PERMISSION_KEYS.APPROVALS_MANAGE,
    name: 'Manage approvals',
    description: 'Administer generic approval request tracking records.',
  },
  {
    key: PERMISSION_KEYS.SLA_READ,
    name: 'Read SLA tracking',
    description: 'View SLA policies, due dates, and tracking status.',
  },
  {
    key: PERMISSION_KEYS.SLA_MANAGE,
    name: 'Manage SLA tracking',
    description:
      'Configure SLA policies, rules, milestones, and escalation levels.',
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
    key: PERMISSION_KEYS.BANKS_READ,
    name: 'Read banks',
    description:
      'View the tenant list of banking institutions used to pick a bank. Contains no employee account data.',
  },
  {
    key: PERMISSION_KEYS.BANKS_MANAGE,
    name: 'Manage banks',
    description: 'Add and edit the tenant list of banking institutions.',
  },
  {
    key: PERMISSION_KEYS.DATA_MANAGEMENT_VIEW,
    name: 'View data management',
    description:
      'Open Settings > Data Management and view import and export activity.',
  },
  {
    key: PERMISSION_KEYS.DATA_MANAGEMENT_TEMPLATE_DOWNLOAD,
    name: 'Download import templates',
    description:
      'Download module import templates and reference data workbooks.',
  },
  {
    key: PERMISSION_KEYS.DATA_MANAGEMENT_IMPORT_VALIDATE,
    name: 'Validate imports',
    description:
      'Upload a file and run validation without writing any records.',
  },
  {
    key: PERMISSION_KEYS.DATA_MANAGEMENT_IMPORT_EXECUTE,
    name: 'Execute imports',
    description:
      'Run an import that creates or updates records. Module create and update permissions are still enforced per row.',
  },
  {
    key: PERMISSION_KEYS.DATA_MANAGEMENT_EXPORT,
    name: 'Export data',
    description:
      'Export module records, filtered results, and failed import rows.',
  },
  {
    key: PERMISSION_KEYS.DATA_MANAGEMENT_JOBS_READ_ALL,
    name: 'View all import jobs',
    description:
      'View import and export jobs submitted by any user in the tenant, not only your own.',
  },
  {
    key: PERMISSION_KEYS.DATA_MANAGEMENT_IMPORT_RETRY,
    name: 'Retry imports',
    description: 'Retry failed rows or batches on an existing import job.',
  },
  {
    key: PERMISSION_KEYS.DATA_MANAGEMENT_IMPORT_CANCEL,
    name: 'Cancel imports',
    description: 'Cancel a queued or in-progress import job where it is safe.',
  },
  {
    key: PERMISSION_KEYS.DATA_MANAGEMENT_MAPPINGS_MANAGE,
    name: 'Manage saved mappings',
    description:
      'Create, update, and delete reusable column mapping profiles for the tenant.',
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
    // The employees export and export-template endpoints already require this
    // key, but it was never defined, so no role could hold it and export was
    // reachable only by roles that bypass permission checks.
    key: 'employees.export',
    name: 'Export employees',
    description:
      'Export employee records and download the employee import template. Rows are limited to the caller’s existing read scope.',
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
    key: 'departments.delete',
    name: 'Delete departments',
    description:
      'Remove department master data records from active use for the current tenant.',
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
    key: 'designations.delete',
    name: 'Delete designations',
    description:
      'Remove designation master data records from active use for the current tenant.',
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
    key: 'locations.delete',
    name: 'Delete locations',
    description:
      'Remove location master data records from active use for the current tenant.',
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
    key: PERMISSION_KEYS.EMPLOYMENT_TYPES_READ,
    name: 'Read employment types',
    description:
      'View tenant employment type definitions used by employee records and workforce settings.',
  },
  {
    key: PERMISSION_KEYS.EMPLOYMENT_TYPES_MANAGE,
    name: 'Manage employment types',
    description:
      'Create, update, and deactivate tenant employment type definitions.',
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
    key: PERMISSION_KEYS.LEAVE_POLICY_ASSIGNMENTS_READ,
    name: 'Read leave policy assignments',
    description:
      'View effective-dated leave policy assignment rules for the tenant.',
  },
  {
    key: PERMISSION_KEYS.LEAVE_POLICY_ASSIGNMENTS_CREATE,
    name: 'Create leave policy assignments',
    description:
      'Assign leave policies to tenant, organization, workforce, or employee scopes.',
  },
  {
    key: PERMISSION_KEYS.LEAVE_POLICY_ASSIGNMENTS_UPDATE,
    name: 'Update leave policy assignments',
    description: 'Update leave policy assignment scopes and effective dates.',
  },
  {
    key: PERMISSION_KEYS.LEAVE_POLICY_ASSIGNMENTS_DELETE,
    name: 'Delete leave policy assignments',
    description:
      'Deactivate leave policy assignments that should no longer apply.',
  },
  {
    key: 'approval-matrices.read',
    name: 'Read approval matrices',
    description: 'View tenant leave approval routing configuration.',
  },
  {
    key: 'approval-matrices.create',
    name: 'Create approval matrices',
    description: 'Create tenant leave approval routing steps.',
  },
  {
    key: 'approval-matrices.update',
    name: 'Update approval matrices',
    description: 'Update tenant leave approval routing steps.',
  },
  {
    key: 'approval-matrices.delete',
    name: 'Delete approval matrices',
    description: 'Deactivate tenant leave approval routing steps.',
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
    key: 'recruitment.delete',
    name: 'Delete recruitment records',
    description:
      'Permanently remove candidates and their documents. Separate from update because the removal cannot be undone.',
  },
  {
    key: 'onboarding.delete',
    name: 'Delete onboarding records',
    description:
      'Permanently remove onboarding records. Separate from update because the removal cannot be undone.',
  },
  {
    key: 'attendance.read',
    name: 'Read attendance',
    description: 'View attendance logs and shift data.',
  },
  {
    key: 'attendance.read.own',
    name: 'Read own attendance',
    description: 'View attendance records linked to the current employee.',
  },
  {
    key: 'attendance.read.team',
    name: 'Read team attendance',
    description: 'View attendance records for permitted direct reports.',
  },
  {
    key: 'attendance.read.all',
    name: 'Read all attendance',
    description:
      'View attendance records across the tenant or authorized business-unit scope.',
  },
  {
    key: 'attendance.locationEvidence.read',
    name: 'Read attendance location evidence',
    description:
      'View the exact coordinates captured when a web or mobile attendance action was accepted or refused. Deliberately separate from reading attendance: the business result is what most people need, and precise employee locations should be seen by as few as possible.',
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
    key: 'attendance.override',
    name: 'Override attendance',
    description:
      'Override attendance timestamps, status, and related audit details.',
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
    key: PERMISSION_KEYS.INTEGRATIONS_READ,
    name: 'View integrations',
    description: 'View configured integrations and their connection status.',
  },
  {
    key: PERMISSION_KEYS.ATTENDANCE_DEVICES_READ,
    name: 'View attendance devices',
    description:
      'View attendance terminals, the work sites they serve, and their health.',
  },
  {
    key: PERMISSION_KEYS.ATTENDANCE_DEVICES_MANAGE,
    name: 'Manage attendance devices',
    description:
      'Add, configure, enable and disable attendance terminals at work sites.',
  },
  {
    key: PERMISSION_KEYS.ATTENDANCE_MAPPINGS_READ,
    name: 'View employee device mapping',
    description: 'View how device users are matched to DijiPeople employees.',
  },
  {
    key: PERMISSION_KEYS.ATTENDANCE_MAPPINGS_MANAGE,
    name: 'Manage employee device mapping',
    description:
      'Match, re-match, ignore and resolve conflicts between device users and employees.',
  },
  {
    key: PERMISSION_KEYS.ATTENDANCE_PROVISIONING_READ,
    name: 'View device provisioning',
    description:
      'View the status of employee records being sent to attendance devices.',
  },
  {
    key: PERMISSION_KEYS.ATTENDANCE_PROVISIONING_MANAGE,
    name: 'Manage device provisioning',
    description:
      'Retry, cancel and re-request employee provisioning on attendance devices.',
  },
  {
    key: PERMISSION_KEYS.GATEWAYS_READ,
    name: 'View gateways',
    description:
      'View on-premise gateways, their status and last contact time.',
  },
  {
    key: PERMISSION_KEYS.GATEWAYS_MANAGE,
    name: 'Manage gateways',
    description:
      'Create gateways, issue pairing codes, and revoke gateway access.',
  },
  {
    key: PERMISSION_KEYS.APP_DOWNLOADS_READ,
    name: 'View apps and downloads',
    description: 'Browse and download DijiPeople applications and utilities.',
  },
  {
    key: PERMISSION_KEYS.APP_DOWNLOADS_MANAGE,
    name: 'Manage apps and downloads',
    description:
      'Publish, update and retire downloadable DijiPeople application releases.',
  },
  {
    key: PERMISSION_KEYS.DLP_REVIEW,
    name: 'Review DLP captures',
    description:
      'View captured clipboard content and screenshots collected by the desktop agent for data-loss investigations.',
  },
  {
    key: PERMISSION_KEYS.ATTENDANCE_CORRECTION_READ,
    name: 'Read attendance corrections',
    description: 'View attendance correction request workflows.',
  },
  {
    key: PERMISSION_KEYS.ATTENDANCE_CORRECTION_CREATE,
    name: 'Create attendance corrections',
    description: 'Submit attendance correction requests for review.',
  },
  {
    key: PERMISSION_KEYS.ATTENDANCE_CORRECTION_READ_OWN,
    name: 'Read own attendance corrections',
    description: 'View attendance correction requests submitted by the user.',
  },
  {
    key: PERMISSION_KEYS.ATTENDANCE_CORRECTION_READ_TEAM,
    name: 'Read team attendance corrections',
    description:
      'View attendance correction requests for permitted direct reports.',
  },
  {
    key: PERMISSION_KEYS.ATTENDANCE_CORRECTION_APPROVE,
    name: 'Approve attendance corrections',
    description:
      'Approve assigned attendance correction requests from the request record.',
  },
  {
    key: PERMISSION_KEYS.ATTENDANCE_CORRECTION_REJECT,
    name: 'Reject attendance corrections',
    description:
      'Reject assigned attendance correction requests from the request record.',
  },
  {
    key: PERMISSION_KEYS.ATTENDANCE_CORRECTION_CANCEL,
    name: 'Cancel attendance corrections',
    description: 'Cancel own or managed attendance correction requests.',
  },
  {
    key: PERMISSION_KEYS.ATTENDANCE_CORRECTION_MANAGE,
    name: 'Manage attendance corrections',
    description:
      'Administer attendance correction request visibility and workflow setup.',
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
  ...[
    [
      'timesheets.withdraw',
      'Withdraw own timesheets',
      'Withdraw a pending weekly submission before final approval.',
    ],
    [
      'timesheets.approve.project',
      'Approve project time',
      'Approve project-scoped timesheet entries.',
    ],
    [
      'timesheets.read.payroll',
      'View payroll timesheets',
      'View payroll readiness and handoff details.',
    ],
    [
      'timesheets.read.hr',
      'View HR timesheets',
      'View timesheets through HR scope.',
    ],
    [
      'timesheets.reopen',
      'Request timesheet reopening',
      'Request or authorize controlled reopening.',
    ],
    [
      'timesheets.override',
      'Override timesheet validation',
      'Override a blocking validation with an audited reason.',
    ],
    [
      'timesheets.export.audit',
      'Export timesheet audit',
      'Export approval and audit history.',
    ],
    [
      'timesheets.payroll.handoff',
      'Process timesheet payroll handoff',
      'Send eligible approved time to payroll.',
    ],
    [
      'timesheets.policy.configure',
      'Configure timesheet policy',
      'Create and version scoped timesheet policies.',
    ],
    [
      'timesheets.policy.resolution.read',
      'View timesheet policy resolution',
      'Preview resolved values and their sources.',
    ],
    [
      'timesheets.access.override',
      'Override timesheet access restriction',
      'Grant a temporary audited access override.',
    ],
    [
      'timesheets.bulk.approve',
      'Bulk approve timesheets',
      'Approve assigned timesheet weeks in bulk.',
    ],
    [
      'timesheets.bulk.reject',
      'Bulk reject timesheets',
      'Reject assigned timesheet weeks in bulk.',
    ],
    [
      'timesheets.notes.sensitive.read',
      'View sensitive timesheet notes',
      'View restricted entry notes in authorized scopes.',
    ],
    [
      'timesheets.jobs.run',
      'Run timesheet background jobs',
      'Run and retry tenant timesheet jobs.',
    ],
  ].map(([key, name, description]) => ({ key, name, description })),
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
    key: PERMISSION_KEYS.CUSTOMERS_READ,
    name: 'Read customers',
    description: 'View tenant customers and related projects.',
  },
  {
    key: PERMISSION_KEYS.CUSTOMERS_CREATE,
    name: 'Create customers',
    description: 'Create tenant customer/client records.',
  },
  {
    key: PERMISSION_KEYS.CUSTOMERS_WRITE,
    name: 'Update customers',
    description: 'Update tenant customer/client records.',
  },
  {
    key: PERMISSION_KEYS.CUSTOMERS_DELETE,
    name: 'Delete customers',
    description: 'Deactivate or delete customer/client records when safe.',
  },
  {
    key: PERMISSION_KEYS.CUSTOMERS_ASSIGN,
    name: 'Assign customers',
    description: 'Assign customer ownership and project relationships.',
  },
  {
    key: PERMISSION_KEYS.CUSTOMERS_SHARE,
    name: 'Share customers',
    description: 'Share customer records within tenant access scopes.',
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
    key: PERMISSION_KEYS.PAYROLL_CALENDARS_READ,
    name: 'Read payroll calendars',
    description: 'View payroll calendar definitions and schedule metadata.',
  },
  {
    key: PERMISSION_KEYS.PAYROLL_CALENDARS_MANAGE,
    name: 'Manage payroll calendars',
    description: 'Create and update payroll calendar definitions.',
  },
  {
    key: PERMISSION_KEYS.PAYROLL_PERIODS_READ,
    name: 'Read payroll periods',
    description: 'View payroll periods and processing status.',
  },
  {
    key: PERMISSION_KEYS.PAYROLL_PERIODS_MANAGE,
    name: 'Manage payroll periods',
    description: 'Create and update payroll periods.',
  },
  {
    key: PERMISSION_KEYS.PAYROLL_RUNS_READ,
    name: 'Read payroll runs',
    description:
      'View payroll run details, employees, line items, and exceptions.',
  },
  {
    key: PERMISSION_KEYS.PAYROLL_RUNS_CREATE,
    name: 'Create payroll runs',
    description: 'Create draft payroll runs for eligible payroll periods.',
  },
  {
    key: PERMISSION_KEYS.PAYROLL_RUNS_CALCULATE,
    name: 'Calculate payroll runs',
    description: 'Calculate draft payroll runs from approved payroll inputs.',
  },
  {
    key: PERMISSION_KEYS.PAYROLL_RUNS_LOCK,
    name: 'Lock payroll runs',
    description: 'Lock calculated payroll runs to prevent further edits.',
  },
  {
    key: PERMISSION_KEYS.PAYROLL_RUNS_DELETE,
    name: 'Delete payroll runs',
    description:
      'Delete draft or failed payroll runs before they are calculated or finalized.',
  },
  {
    key: PERMISSION_KEYS.PAYROLL_OPERATIONS_DASHBOARD,
    name: 'View payroll operations dashboard',
    description:
      'View payroll readiness, cost, exception, and delivery widgets.',
  },
  {
    key: PERMISSION_KEYS.PAYROLL_EXCEPTIONS_READ,
    name: 'Read payroll exceptions',
    description: 'Review payroll readiness blockers and warnings.',
  },
  {
    key: PERMISSION_KEYS.PAYROLL_EXCEPTIONS_EXPORT,
    name: 'Export payroll exceptions',
    description: 'Export payroll readiness exceptions for remediation.',
  },
  {
    key: PERMISSION_KEYS.PAYROLL_RUNS_FINALIZE,
    name: 'Finalize payroll runs',
    description: 'Finalize validated payroll runs after configured approval.',
  },
  {
    key: PERMISSION_KEYS.PAYROLL_BANK_EXPORT_GENERATE,
    name: 'Generate payroll bank exports',
    description: 'Generate provider-based payroll payment files.',
  },
  {
    key: PERMISSION_KEYS.PAYROLL_RUNS_DISBURSE,
    name: 'Mark payroll runs disbursed',
    description:
      'Record payroll disbursement after a bank export is generated.',
  },
  {
    key: PERMISSION_KEYS.PAYSLIPS_READ_ALL,
    name: 'Read all payslips',
    description: 'View generated payslips across the accessible tenant scope.',
  },
  {
    key: PERMISSION_KEYS.PAYSLIPS_READ_OWN,
    name: 'Read own payslips',
    description: 'View own published employee payslips.',
  },
  {
    key: PERMISSION_KEYS.PAYSLIPS_MANAGE,
    name: 'Manage payslips',
    description: 'Generate payslips from calculated payroll run employees.',
  },
  {
    key: PERMISSION_KEYS.PAYSLIPS_PUBLISH,
    name: 'Publish payslips',
    description: 'Publish generated payslips for employee self-service.',
  },
  {
    key: PERMISSION_KEYS.PAYSLIPS_VOID,
    name: 'Void payslips',
    description: 'Void generated or published payslips with a reason.',
  },
  {
    key: PERMISSION_KEYS.PAYSLIPS_DELIVER,
    name: 'Deliver payslips',
    description: 'Send or resend published payslip notifications.',
  },
  {
    key: PERMISSION_KEYS.PAYSLIPS_DOWNLOAD,
    name: 'Download payslips',
    description: 'Download authorized payslips as PDF documents.',
  },
  {
    key: PERMISSION_KEYS.CLAIM_TYPES_READ,
    name: 'Read claim types',
    description: 'View claim type and subtype configuration.',
  },
  {
    key: PERMISSION_KEYS.CLAIM_TYPES_MANAGE,
    name: 'Manage claim types',
    description: 'Create, update, and deactivate claim types and subtypes.',
  },
  {
    key: PERMISSION_KEYS.CLAIMS_READ_ALL,
    name: 'Read all claims',
    description:
      'View employee claim requests across the accessible tenant scope.',
  },
  {
    key: PERMISSION_KEYS.CLAIMS_READ_OWN,
    name: 'Read own claims',
    description: 'View own employee claim requests.',
  },
  {
    key: PERMISSION_KEYS.CLAIMS_CREATE,
    name: 'Create claims',
    description: 'Create and submit employee claim requests.',
  },
  {
    key: PERMISSION_KEYS.CLAIMS_UPDATE,
    name: 'Update claims',
    description: 'Update draft employee claim requests.',
  },
  {
    key: PERMISSION_KEYS.CLAIMS_MANAGER_APPROVE,
    name: 'Manager approve claims',
    description: 'Approve submitted claims as manager.',
  },
  {
    key: PERMISSION_KEYS.CLAIMS_PAYROLL_APPROVE,
    name: 'Payroll approve claims',
    description: 'Approve manager-approved claims for payroll inclusion.',
  },
  {
    key: PERMISSION_KEYS.CLAIMS_REJECT,
    name: 'Reject claims',
    description: 'Reject submitted or approved claim requests.',
  },
  {
    key: PERMISSION_KEYS.CLAIMS_CANCEL,
    name: 'Cancel claims',
    description: 'Cancel claim requests before payroll inclusion.',
  },
  {
    key: PERMISSION_KEYS.BENEFITS_READ,
    name: 'Read benefits',
    description: 'View benefit policies and employee assignments.',
  },
  {
    key: PERMISSION_KEYS.BENEFITS_READ_OWN,
    name: 'Read own benefits',
    description: 'View employee-visible self-service benefits and perks.',
  },
  {
    key: PERMISSION_KEYS.BENEFITS_MANAGE,
    name: 'Manage benefits',
    description: 'Configure benefit policies and renewal rules.',
  },
  {
    key: PERMISSION_KEYS.BENEFITS_ASSIGN,
    name: 'Assign benefits',
    description: 'Assign, suspend, cancel, and override employee benefits.',
  },
  {
    key: PERMISSION_KEYS.BENEFITS_CONSUME,
    name: 'Consume benefits',
    description: 'Record auditable usage against benefit balances.',
  },
  {
    key: PERMISSION_KEYS.BENEFITS_READ_SENSITIVE,
    name: 'Read sensitive benefit values',
    description: 'View protected benefit amounts and balances.',
  },
  {
    key: PERMISSION_KEYS.LOANS_READ_ALL,
    name: 'Read all loans',
    description: 'View employee loans across the accessible tenant scope.',
  },
  {
    key: PERMISSION_KEYS.LOANS_READ_OWN,
    name: 'Read own loans',
    description: 'View own loan requests and repayment schedules.',
  },
  {
    key: PERMISSION_KEYS.LOANS_CREATE,
    name: 'Create loans',
    description: 'Create and submit loan requests.',
  },
  {
    key: PERMISSION_KEYS.LOANS_UPDATE,
    name: 'Update loans',
    description: 'Update and submit loan requests.',
  },
  {
    key: PERMISSION_KEYS.LOANS_APPROVE,
    name: 'Approve loans',
    description: 'Approve loans and generate repayment schedules.',
  },
  {
    key: PERMISSION_KEYS.LOANS_REJECT,
    name: 'Reject loans',
    description: 'Reject submitted loan requests.',
  },
  {
    key: PERMISSION_KEYS.LOANS_SETTLE,
    name: 'Settle loans',
    description: 'Perform audited early loan settlement.',
  },
  {
    key: PERMISSION_KEYS.EMPLOYEE_BANK_ACCOUNTS_READ,
    name: 'Read employee bank accounts',
    description: 'View masked employee payroll bank accounts.',
  },
  {
    key: PERMISSION_KEYS.EMPLOYEE_BANK_ACCOUNTS_READ_OWN,
    name: 'Read own bank accounts',
    description: 'View own masked payroll bank accounts.',
  },
  {
    key: PERMISSION_KEYS.EMPLOYEE_BANK_ACCOUNTS_MANAGE,
    name: 'Manage employee bank accounts',
    description: 'Create and update employee payroll bank accounts.',
  },
  {
    key: PERMISSION_KEYS.EMPLOYEE_BANK_ACCOUNTS_VERIFY,
    name: 'Verify employee bank accounts',
    description: 'Verify payroll bank details independently from HR access.',
  },
  {
    key: PERMISSION_KEYS.BUSINESS_TRIPS_READ_ALL,
    name: 'Read all business trips',
    description:
      'View employee business trip requests across the accessible tenant scope.',
  },
  {
    key: PERMISSION_KEYS.BUSINESS_TRIPS_READ_OWN,
    name: 'Read own business trips',
    description: 'View own employee business trip requests.',
  },
  {
    key: PERMISSION_KEYS.BUSINESS_TRIPS_CREATE,
    name: 'Create business trips',
    description: 'Create and submit employee business trip requests.',
  },
  {
    key: PERMISSION_KEYS.BUSINESS_TRIPS_UPDATE,
    name: 'Update business trips',
    description:
      'Update draft business trip requests and allowance calculations.',
  },
  {
    key: PERMISSION_KEYS.BUSINESS_TRIPS_APPROVE,
    name: 'Approve business trips',
    description: 'Approve submitted business trip requests.',
  },
  {
    key: PERMISSION_KEYS.BUSINESS_TRIPS_REJECT,
    name: 'Reject business trips',
    description: 'Reject submitted business trip requests.',
  },
  {
    key: PERMISSION_KEYS.BUSINESS_TRIPS_CANCEL,
    name: 'Cancel business trips',
    description: 'Cancel business trip requests before payroll inclusion.',
  },
  {
    key: PERMISSION_KEYS.TADA_POLICIES_READ,
    name: 'Read TA/DA policies',
    description: 'View travel allowance policy and rule configuration.',
  },
  {
    key: PERMISSION_KEYS.TADA_POLICIES_MANAGE,
    name: 'Manage TA/DA policies',
    description:
      'Create, update, and deactivate travel allowance policies and rules.',
  },
  {
    key: PERMISSION_KEYS.TIME_PAYROLL_POLICIES_READ,
    name: 'Read time payroll policies',
    description: 'View attendance and timesheet payroll policy configuration.',
  },
  {
    key: PERMISSION_KEYS.TIME_PAYROLL_POLICIES_MANAGE,
    name: 'Manage time payroll policies',
    description:
      'Create, update, and deactivate attendance and timesheet payroll policies.',
  },
  {
    key: PERMISSION_KEYS.OVERTIME_POLICIES_READ,
    name: 'Read overtime policies',
    description: 'View overtime threshold and multiplier policy configuration.',
  },
  {
    key: PERMISSION_KEYS.OVERTIME_POLICIES_MANAGE,
    name: 'Manage overtime policies',
    description: 'Create, update, and deactivate overtime policies.',
  },
  {
    key: PERMISSION_KEYS.PAYROLL_TIME_INPUTS_READ,
    name: 'Read payroll time inputs',
    description:
      'View prepared attendance, timesheet, no-show, and overtime payroll inputs.',
  },
  {
    key: PERMISSION_KEYS.PAYROLL_TIME_INPUTS_PREPARE,
    name: 'Prepare payroll time inputs',
    description: 'Prepare time payroll inputs for payroll runs.',
  },
  {
    key: PERMISSION_KEYS.TAX_RULES_READ,
    name: 'Read tax rules',
    description:
      'View configurable tax rules, brackets, and taxable pay component mappings.',
  },
  {
    key: PERMISSION_KEYS.TAX_RULES_MANAGE,
    name: 'Manage tax rules',
    description: 'Create, update, deactivate, and map configurable tax rules.',
  },
  {
    key: PERMISSION_KEYS.EMPLOYEE_TAX_PROFILES_READ,
    name: 'Read employee tax profiles',
    description:
      'View effective-dated employee tax profiles and assigned tax policies.',
  },
  {
    key: PERMISSION_KEYS.EMPLOYEE_TAX_PROFILES_MANAGE,
    name: 'Manage employee tax profiles',
    description:
      'Create, update, and deactivate employee tax profiles and tax adjustments.',
  },
  {
    key: PERMISSION_KEYS.PAYROLL_TAX_CALCULATE,
    name: 'Calculate payroll tax',
    description:
      'Calculate configurable payroll tax deductions and employer contributions.',
  },
  {
    key: PERMISSION_KEYS.PAYROLL_GL_READ,
    name: 'Read payroll GL',
    description:
      'View payroll GL accounts, posting rules, and journal configuration.',
  },
  {
    key: PERMISSION_KEYS.PAYROLL_GL_MANAGE,
    name: 'Manage payroll GL',
    description:
      'Create, update, and deactivate payroll GL accounts and posting rules.',
  },
  {
    key: PERMISSION_KEYS.PAYROLL_JOURNAL_READ,
    name: 'Read payroll journals',
    description: 'View generated payroll accounting journal entries and lines.',
  },
  {
    key: PERMISSION_KEYS.PAYROLL_JOURNAL_GENERATE,
    name: 'Generate payroll journals',
    description:
      'Generate or regenerate payroll journal entries from payroll run line items.',
  },
  {
    key: PERMISSION_KEYS.PAYROLL_JOURNAL_EXPORT,
    name: 'Export payroll journals',
    description:
      'Export payroll journal entries to CSV and mark journals exported.',
  },
  {
    key: PERMISSION_KEYS.PAYROLL_JOURNAL_MANAGE,
    name: 'Manage payroll journal lifecycle',
    description: 'Post and reverse payroll journal entries.',
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
    key: 'customization.modules.read',
    name: 'Read customization modules',
    description: 'View module metadata in customization workspaces.',
  },
  {
    key: 'customization.modules.manage',
    name: 'Manage customization modules',
    description: 'Manage module metadata in customization workspaces.',
  },
  {
    key: 'customization.fields.manage',
    name: 'Manage customization fields',
    description: 'Manage field metadata in customization workspaces.',
  },
  {
    key: 'customization.forms.manage',
    name: 'Manage customization forms',
    description: 'Manage form metadata in customization workspaces.',
  },
  {
    key: 'customization.views.manage',
    name: 'Manage customization views',
    description: 'Manage view metadata in customization workspaces.',
  },
  {
    key: 'customization.choice-lists.manage',
    name: 'Manage customization choice lists',
    description: 'Manage choice-list metadata in customization workspaces.',
  },
  {
    key: 'customization.relationships.manage',
    name: 'Manage customization relationships',
    description: 'Manage relationship metadata in customization workspaces.',
  },
  {
    key: 'customization.action-bars.manage',
    name: 'Manage customization action bars',
    description: 'Manage action bar metadata in customization workspaces.',
  },
  {
    key: 'customization.packages.manage',
    name: 'Manage customization packages',
    description: 'Manage metadata packages and package components.',
  },
  {
    key: 'customization.publish-center.read',
    name: 'Read publish center',
    description: 'Open the customization publish center.',
  },
  {
    key: 'customization.import.preview',
    name: 'Preview customization imports',
    description: 'Preview customization package imports before applying them.',
  },
  {
    key: 'customization.export',
    name: 'Export customization',
    description: 'Export customization package metadata.',
  },
  {
    key: 'widget.manage',
    name: 'Manage widgets',
    description: 'Create, configure, and place reusable runtime widgets.',
  },
  {
    key: 'timeline.read',
    name: 'Read timeline',
    description: 'View user-facing record timeline activity.',
  },
  {
    key: 'timeline.manage.templates',
    name: 'Manage timeline templates',
    description: 'Manage timeline templates, placeholders, and display rules.',
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
    key: 'customization.table.manage',
    name: 'Manage customization tables',
    description:
      'Create, update, deactivate, and delete custom metadata tables.',
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
    key: 'customization.column.manage',
    name: 'Manage customization columns',
    description:
      'Create, update, deactivate, and delete table column metadata.',
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
    key: 'customization.view.manage',
    // Distinct from 'customization.views.manage' ("Manage customization
    // views"). Permission carries @@unique([tenantId, name]), so two
    // definitions sharing a name meant createMany(skipDuplicates) silently
    // dropped the second — this key was never created in any tenant.
    name: 'Manage table views',
    description:
      'Create, update, activate, deactivate, and delete table views.',
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
  {
    key: 'customization.form.manage',
    // See the note on 'customization.view.manage' above: the duplicate display
    // name kept this permission out of every tenant.
    name: 'Manage table forms',
    description:
      'Create, update, activate, deactivate, and delete table forms.',
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
  'system-customizer': [
    ...CUSTOMIZATION_PERMISSION_KEYS,
    'tenant-settings.resolved.read',
    'field-security.read',
    'field-security.manage',
    'inbox.read',
    'inbox.markRead',
    'inbox.dismiss',
  ],
  hr: [
    'dashboard.view',
    // Reports & Analytics (TASK-0028). HR owns reporting for the organization,
    // including scheduled delivery and the desktop-activity surfaces. Row scope is
    // still applied per query — holding these does not widen who HR can see.
    'reports.read',
    'reports.builder.use',
    'reports.definitions.manage',
    'reports.saved-views.manage',
    'reports.schedule.manage',
    'reports.data-quality.read',
    'desktop-analytics.read.own',
    'desktop-analytics.read.organization',
    'desktop-analytics.device-health.read',
    'tenant-settings.resolved.read',
    // HR runs employee data migration, so it owns the Data Management area.
    // These grant use of the tool only: each row still goes through the
    // module's own create/update permission checks, so HR cannot import
    // anything it could not create by hand.
    PERMISSION_KEYS.DATA_MANAGEMENT_VIEW,
    PERMISSION_KEYS.DATA_MANAGEMENT_TEMPLATE_DOWNLOAD,
    PERMISSION_KEYS.DATA_MANAGEMENT_IMPORT_VALIDATE,
    PERMISSION_KEYS.DATA_MANAGEMENT_IMPORT_EXECUTE,
    PERMISSION_KEYS.DATA_MANAGEMENT_EXPORT,
    PERMISSION_KEYS.DATA_MANAGEMENT_JOBS_READ_ALL,
    PERMISSION_KEYS.DATA_MANAGEMENT_IMPORT_RETRY,
    PERMISSION_KEYS.DATA_MANAGEMENT_IMPORT_CANCEL,
    PERMISSION_KEYS.DATA_MANAGEMENT_MAPPINGS_MANAGE,
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
    'inbox.read',
    'inbox.markRead',
    'inbox.dismiss',
    'inbox.archive',
    'inbox.bulkUpdate',
    'notifications.read',
    'notifications.manageRules',
    'notifications.manageTemplates',
    'approvals.read',
    'approvals.readOwn',
    'approvals.readAssigned',
    'approvals.readTeam',
    'approvals.manage',
    'sla.read',
    'sla.manage',
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
    'employment-types.read',
    'employment-types.manage',
    'departments.read',
    'departments.create',
    'departments.update',
    'departments.delete',
    'designations.read',
    'designations.create',
    'designations.update',
    'designations.delete',
    'locations.read',
    'locations.create',
    'locations.update',
    'locations.delete',
    'hierarchy.read',
    'hierarchy.update',
    'leave-types.read',
    'leave-types.create',
    'leave-types.update',
    'leave-policies.read',
    'leave-policies.create',
    'leave-policies.update',
    'leave-policy-assignments.read',
    'leave-policy-assignments.create',
    'leave-policy-assignments.update',
    'leave-policy-assignments.delete',
    'approval-matrices.read',
    'approval-matrices.create',
    'approval-matrices.update',
    'approval-matrices.delete',
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
    'attendance.read.own',
    'attendance.read.team',
    'attendance.read.all',
    'attendance.create',
    'attendance.checkin',
    'attendance.checkout',
    'attendance.update',
    'attendance.override',
    'attendance.manage',
    'attendance.import',
    'attendance.export',
    'attendance.integration.manage',
    'attendance.correction.read',
    'attendance.correction.create',
    'attendance.correction.readOwn',
    'attendance.correction.readTeam',
    'attendance.correction.approve',
    'attendance.correction.reject',
    'attendance.correction.cancel',
    'attendance.correction.manage',
    'agent.settings.read',
    'agent.settings.manage',
    // Attendance Integration Platform. Kept in step with
    // SYSTEM_ROLE_MISC_PERMISSIONS in rbac-matrix.ts, which is what
    // PermissionBootstrapService actually reads; this list is asserted against
    // the permission catalogue by wiring-invariants.spec.ts.
    'integrations.read',
    'integrations.manage',
    'attendanceDevices.read',
    'attendanceDevices.manage',
    'attendanceMappings.read',
    'attendanceMappings.manage',
    'attendanceProvisioning.read',
    'attendanceProvisioning.manage',
    'gateways.read',
    'gateways.manage',
    'appDownloads.read',
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
    'timesheets.withdraw',
    'timesheets.approve.project',
    'timesheets.read.payroll',
    'timesheets.read.hr',
    'timesheets.reopen',
    'timesheets.override',
    'timesheets.export.audit',
    'timesheets.payroll.handoff',
    'timesheets.policy.configure',
    'timesheets.policy.resolution.read',
    'timesheets.access.override',
    'timesheets.bulk.approve',
    'timesheets.bulk.reject',
    'timesheets.notes.sensitive.read',
    'timesheets.jobs.run',
    'projects.read',
    'projects.create',
    'projects.update',
    'projects.assign',
    'customers.read',
    'customers.create',
    'customers.write',
    'customers.assign',
    'onboarding.read',
    'onboarding.create',
    'onboarding.update',
    'payroll.read',
    'payroll.read.all',
    'payroll.settings.read',
    'payroll-calendars.read',
    'payroll-periods.read',
    'payroll-runs.read',
    'payslips.read-all',
    'payslips.download',
    'claim-types.read',
    'claim-types.manage',
    'claims.read-all',
    'claims.create',
    'claims.update',
    'claims.manager-approve',
    'claims.reject',
    'claims.cancel',
    'benefits.read',
    'benefits.manage',
    'benefits.assign',
    'benefits.consume',
    'business-trips.read-all',
    'business-trips.create',
    'business-trips.update',
    'business-trips.approve',
    'business-trips.reject',
    'business-trips.cancel',
    'tada-policies.read',
    'tada-policies.manage',
    'time-payroll-policies.read',
    'time-payroll-policies.manage',
    'overtime-policies.read',
    'overtime-policies.manage',
    'payroll-time-inputs.read',
    'tax-rules.read',
    'employee-tax-profiles.read',
    'employee-tax-profiles.manage',
    'payroll-gl.read',
    'payroll-journal.read',
    'pay-components.read',
    'compensation.read',
    'policies.read',
    'policies.manage',
  ],
  recruiter: [
    'dashboard.view',
    // Reports & Analytics (TASK-0028): recruitment analytics, own desktop activity.
    'reports.read',
    'reports.saved-views.manage',
    'desktop-analytics.read.own',
    'tenant-settings.resolved.read',
    'settings.read',
    'documents.read',
    'users.read',
    'employees.read',
    'employees.documents.read',
    'employees.history.read',
    'employees.education.read',
    'employee-levels.read',
    'employment-types.read',
    'departments.read',
    'designations.read',
    'locations.read',
    'recruitment.read',
    'recruitment.create',
    'recruitment.update',
    'recruitment.advance',
    'inbox.read',
    'inbox.markRead',
    'inbox.dismiss',
  ],
  manager: [
    'dashboard.view',
    // Reports & Analytics (TASK-0028). A manager reads and builds reports within
    // their business-unit scope, but deliberately receives NO desktop analytics
    // beyond their own, and cannot schedule delivery to other people. Recorded as
    // an owner decision in EXECPLAN-0030 — widening it is a product decision, not
    // a permissions tidy-up.
    'reports.read',
    'reports.builder.use',
    'reports.definitions.manage',
    'reports.saved-views.manage',
    'desktop-analytics.read.own',
    'tenant-settings.resolved.read',
    'settings.read',
    'inbox.read',
    'inbox.markRead',
    'inbox.dismiss',
    'inbox.archive',
    'notifications.read',
    'approvals.read',
    'approvals.readAssigned',
    'approvals.readTeam',
    'sla.read',
    'documents.read',
    'users.read',
    'employees.read',
    'employee-levels.read',
    'employment-types.read',
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
    'leave-policy-assignments.read',
    'approval-matrices.read',
    'approval-matrices.create',
    'approval-matrices.update',
    'approval-matrices.delete',
    'leave-requests.read',
    'leave-requests.approve',
    'leave-requests.reject',
    'leaves.read',
    'leaves.approve',
    'recruitment.read',
    'attendance.read',
    'attendance.read.team',
    'attendance.export',
    'attendance.correction.read',
    'attendance.correction.create',
    'attendance.correction.readOwn',
    'attendance.correction.readTeam',
    'attendance.correction.approve',
    'attendance.correction.reject',
    'timesheets.read',
    'timesheets.read.team',
    'timesheets.approve',
    'timesheets.reject',
    'timesheets.export',
    'timesheets.approve.project',
    'timesheets.bulk.approve',
    'timesheets.bulk.reject',
    'projects.read',
    'customers.read',
    'onboarding.read',
    'claim-types.read',
    'claims.read-all',
    'claims.manager-approve',
    'business-trips.read-all',
    'business-trips.approve',
    'business-trips.reject',
    'tada-policies.read',
    'time-payroll-policies.read',
    'overtime-policies.read',
  ],
  employee: [
    'dashboard.view',
    // An employee sees their own desktop activity and nothing else here. The
    // Reports workspace itself is hidden for self-service users.
    'desktop-analytics.read.own',
    'tenant-settings.resolved.read',
    'inbox.read',
    'inbox.markRead',
    'inbox.dismiss',
    'inbox.archive',
    'notifications.read',
    'approvals.readOwn',
    'approvals.readAssigned',
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
    'attendance.read.own',
    'attendance.create',
    'attendance.checkin',
    'attendance.checkout',
    'attendance.correction.create',
    'attendance.correction.readOwn',
    'attendance.correction.cancel',
    'timesheets.read',
    'timesheets.write',
    'timesheets.submit',
    'timesheets.withdraw',
    'timesheets.reopen',
    'projects.read',
    'customers.read',
    'payslips.read-own',
    'payslips.download',
    // Self-service desktop-agent download + the agent's update-feed (TASK-0025).
    'appDownloads.read',
    'claims.read-own',
    'claims.create',
    'benefits.read-own',
    'loans.read-own',
    'loans.create',
    'employee-bank-accounts.read-own',
    'business-trips.read-own',
    'business-trips.create',
    'business-trips.cancel',
  ],
};

export const DEFAULT_PERMISSION_DEFINITIONS = FOUNDATION_PERMISSION_DEFINITIONS;
