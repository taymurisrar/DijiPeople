export const ROLE_KEYS = {
  GLOBAL_ADMIN: "global-admin",
  SYSTEM_ADMIN: "system-admin",
  SYSTEM_CUSTOMIZER: "system-customizer",
  CEO: "ceo",
  MANAGER: "manager",
  HR: "hr",
  RECRUITER: "recruiter",
  PAYROLL_MANAGER: "payroll-manager",
  EMPLOYEE: "employee",
} as const;

export const PERMISSION_KEYS = {
  DASHBOARD_VIEW: "dashboard.view",

  SETTINGS_READ: "settings.read",
  SETTINGS_UPDATE: "settings.update",

  TENANT_SETTINGS_MANAGE: "tenant.settings.manage",
  BRANDING_MANAGE: "branding.manage",
  BILLING_VIEW: "billing.view",
  INTEGRATIONS_MANAGE: "integrations.manage",
  API_TOKENS_MANAGE: "api-tokens.manage",
  AUDIT_VIEW: "audit.view",
  AUDIT_READ: "audit.read",
  SUPPORT_IMPERSONATE: "support.impersonate",
  REPORTS_EXPORT: "reports.export",
  NOTIFICATION_TEMPLATES_MANAGE: "notification-templates.manage",
  ORGANIZATION_MANAGE: "organization.manage",
  ROLES_MANAGE: "roles.manage",

  EMPLOYEES_READ: "employees.read",
  EMPLOYEES_READ_ALL: "employees.read.all",
  EMPLOYEES_CREATE: "employees.create",
  EMPLOYEES_UPDATE: "employees.update",
  EMPLOYEES_TERMINATE: "employees.terminate",

  HIERARCHY_READ: "hierarchy.read",
  HIERARCHY_UPDATE: "hierarchy.update",

  EMPLOYEE_LEVELS_READ: "employee-levels.read",
  EMPLOYEE_LEVELS_MANAGE: "employee-levels.manage",

  DEPARTMENTS_READ: "departments.read",
  DESIGNATIONS_READ: "designations.read",
  LOCATIONS_READ: "locations.read",

  USERS_READ: "users.read",
  USERS_CREATE: "users.create",
  USERS_UPDATE: "users.update",
  USERS_DELETE: "users.delete",
  USERS_ASSIGN_ROLES: "users.assign-roles",

  ROLES_READ: "roles.read",
  ROLES_CREATE: "roles.create",
  ROLES_UPDATE: "roles.update",
  ROLES_ASSIGN_PERMISSIONS: "roles.assign-permissions",

  PERMISSIONS_READ: "permissions.read",

  TEAMS_READ: "teams.read",
  TEAMS_CREATE: "teams.create",
  TEAMS_UPDATE: "teams.update",
  TEAMS_DELETE: "teams.delete",
  TEAMS_MEMBERS_MANAGE: "teams.members.manage",

  LEAVE_REQUESTS_READ: "leave-requests.read",
  LEAVE_REQUESTS_CREATE: "leave-requests.create",
  LEAVE_REQUESTS_APPROVE: "leave-requests.approve",
  LEAVE_REQUESTS_REJECT: "leave-requests.reject",
  LEAVES_READ: "leaves.read",
  LEAVE_TYPES_READ: "leave-types.read",
  LEAVE_POLICIES_READ: "leave-policies.read",

  ATTENDANCE_READ: "attendance.read",
  ATTENDANCE_MANAGE: "attendance.manage",
  ATTENDANCE_IMPORT: "attendance.import",
  ATTENDANCE_EXPORT: "attendance.export",
  ATTENDANCE_INTEGRATION_MANAGE: "attendance.integration.manage",

  AGENT_SETTINGS_READ: "agent.settings.read",
  AGENT_SETTINGS_MANAGE: "agent.settings.manage",

  TIMESHEETS_READ: "timesheets.read",
  TIMESHEETS_CREATE: "timesheets.create",
  TIMESHEETS_WRITE: "timesheets.write",
  TIMESHEETS_APPROVE: "timesheets.approve",
  TIMESHEETS_REJECT: "timesheets.reject",
  TIMESHEETS_IMPORT: "timesheets.import",
  TIMESHEETS_EXPORT: "timesheets.export",
  TIMESHEETS_TEMPLATE_EXPORT: "timesheets.template.export",
  TIMESHEETS_LOCK: "timesheets.lock",
  TIMESHEETS_UNLOCK: "timesheets.unlock",
  TIMESHEETS_SETTINGS_READ: "timesheets.settings.read",
  TIMESHEETS_SETTINGS_UPDATE: "timesheets.settings.update",

  PROJECTS_READ: "projects.read",
  PROJECTS_CREATE: "projects.create",
  PROJECTS_UPDATE: "projects.update",
  PROJECTS_ASSIGN: "projects.assign",

  RECRUITMENT_READ: "recruitment.read",
  RECRUITMENT_CREATE: "recruitment.create",
  RECRUITMENT_UPDATE: "recruitment.update",
  RECRUITMENT_ADVANCE: "recruitment.advance",

  ONBOARDING_READ: "onboarding.read",
  ONBOARDING_CREATE: "onboarding.create",
  ONBOARDING_UPDATE: "onboarding.update",

  PAYROLL_READ: "payroll.read",
  PAYROLL_WRITE: "payroll.write",
  PAYROLL_RUN: "payroll.run",
  PAYROLL_REVIEW: "payroll.review",
  PAYROLL_FINALIZE: "payroll.finalize",
  PAYROLL_EXPORT: "payroll.export",
  PAYROLL_SETTINGS_READ: "payroll.settings.read",
  PAYROLL_SETTINGS_UPDATE: "payroll.settings.update",

  PAYROLL_CALENDARS_READ: "payroll-calendars.read",
  PAYROLL_CALENDARS_MANAGE: "payroll-calendars.manage",

  PAYROLL_PERIODS_READ: "payroll-periods.read",
  PAYROLL_PERIODS_MANAGE: "payroll-periods.manage",

  PAYROLL_RUNS_READ: "payroll-runs.read",
  PAYROLL_RUNS_CREATE: "payroll-runs.create",
  PAYROLL_RUNS_CALCULATE: "payroll-runs.calculate",
  PAYROLL_RUNS_LOCK: "payroll-runs.lock",

  PAYSLIPS_READ_ALL: "payslips.read-all",
  PAYSLIPS_READ_OWN: "payslips.read-own",
  PAYSLIPS_MANAGE: "payslips.manage",
  PAYSLIPS_PUBLISH: "payslips.publish",
  PAYSLIPS_VOID: "payslips.void",

  CLAIM_TYPES_READ: "claim-types.read",
  CLAIM_TYPES_MANAGE: "claim-types.manage",

  CLAIMS_READ_ALL: "claims.read-all",
  CLAIMS_READ_OWN: "claims.read-own",
  CLAIMS_CREATE: "claims.create",
  CLAIMS_UPDATE: "claims.update",
  CLAIMS_MANAGER_APPROVE: "claims.manager-approve",
  CLAIMS_PAYROLL_APPROVE: "claims.payroll-approve",
  CLAIMS_REJECT: "claims.reject",
  CLAIMS_CANCEL: "claims.cancel",

  BUSINESS_TRIPS_READ_ALL: "business-trips.read-all",
  BUSINESS_TRIPS_READ_OWN: "business-trips.read-own",
  BUSINESS_TRIPS_CREATE: "business-trips.create",
  BUSINESS_TRIPS_UPDATE: "business-trips.update",
  BUSINESS_TRIPS_APPROVE: "business-trips.approve",
  BUSINESS_TRIPS_REJECT: "business-trips.reject",
  BUSINESS_TRIPS_CANCEL: "business-trips.cancel",

  TADA_POLICIES_READ: "tada-policies.read",
  TADA_POLICIES_MANAGE: "tada-policies.manage",

  TIME_PAYROLL_POLICIES_READ: "time-payroll-policies.read",
  TIME_PAYROLL_POLICIES_MANAGE: "time-payroll-policies.manage",

  OVERTIME_POLICIES_READ: "overtime-policies.read",
  OVERTIME_POLICIES_MANAGE: "overtime-policies.manage",

  PAYROLL_TIME_INPUTS_READ: "payroll-time-inputs.read",
  PAYROLL_TIME_INPUTS_PREPARE: "payroll-time-inputs.prepare",

  TAX_RULES_READ: "tax-rules.read",
  TAX_RULES_MANAGE: "tax-rules.manage",
  PAYROLL_TAX_CALCULATE: "payroll-tax.calculate",

  PAYROLL_GL_READ: "payroll-gl.read",
  PAYROLL_GL_MANAGE: "payroll-gl.manage",

  PAYROLL_JOURNAL_READ: "payroll-journal.read",
  PAYROLL_JOURNAL_GENERATE: "payroll-journal.generate",
  PAYROLL_JOURNAL_EXPORT: "payroll-journal.export",

  PAY_COMPONENTS_READ: "pay-components.read",
  PAY_COMPONENTS_MANAGE: "pay-components.manage",

  COMPENSATION_READ: "compensation.read",
  COMPENSATION_MANAGE: "compensation.manage",

  POLICIES_READ: "policies.read",
  POLICIES_MANAGE: "policies.manage",

  DOCUMENTS_READ: "documents.read",
  DOCUMENTS_UPLOAD: "documents.upload",
  DOCUMENTS_UPDATE: "documents.update",

  CUSTOMIZATION_READ: "customization.read",
  CUSTOMIZATION_ACCESS: "customization.access",
  CUSTOMIZATION_TABLES_READ: "customization.tables.read",
  CUSTOMIZATION_COLUMNS_READ: "customization.columns.read",
  CUSTOMIZATION_VIEWS_READ: "customization.views.read",
  CUSTOMIZATION_VIEWS_CREATE: "customization.views.create",
  CUSTOMIZATION_VIEWS_UPDATE: "customization.views.update",
  CUSTOMIZATION_VIEWS_DELETE: "customization.views.delete",
  CUSTOMIZATION_FORMS_READ: "customization.forms.read",
  CUSTOMIZATION_PUBLISH: "customization.publish",
} as const;

export const FEATURE_KEYS = {
  EMPLOYEES: "employees",
  LEAVE: "leave",
  ATTENDANCE: "attendance",
  TIMESHEETS: "timesheets",
  PROJECTS: "projects",
  PAYROLL: "payroll",
  RECRUITMENT: "recruitment",
  ONBOARDING: "onboarding",
} as const;