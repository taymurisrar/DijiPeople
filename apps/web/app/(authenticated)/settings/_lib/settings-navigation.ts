import {
  isVisibleByRules,
  type VisibilityPrincipal,
  type VisibilityRule,
} from "@/lib/runtime/visibility.resolver";
import { hasAnyPermission } from "@/lib/permissions";
import { PERMISSION_KEYS, ROLE_KEYS } from "@/lib/security-keys";

export type SettingsBadge = "Core" | "Admin" | "Advanced" | "New" | "Preview";

export type SettingsNavItem = {
  key: string;
  href: string;
  label: string;
  shortLabel?: string;
  description: string;
  badge?: SettingsBadge;
  icon: string;
  keywords: readonly string[];
  requiredAnyPermissions?: readonly string[];
  requiredAnyRoles?: readonly string[];
  /*
   * The same declarative rules used on tabs, sections and commands. Evaluated
   * in addition to the simpler fields above, so an item can be limited to a
   * department or business unit without inventing a role for it.
   */
  visibilityRules?: readonly VisibilityRule[];
  hideWhenRestricted?: boolean;
  disabled?: boolean;
};

export type SettingsNavGroup = {
  key: string;
  label: string;
  summary: string;
  icon: string;
  items: readonly SettingsNavItem[];
};

export type VisibleSettingsNavItem = SettingsNavItem & {
  groupKey: string;
  groupLabel: string;
  groupSummary: string;
};

const SETTINGS_READ = PERMISSION_KEYS.SETTINGS_READ ?? "settings.read";

const NAV_PERMISSION_KEYS = {
  SETTINGS_READ,

  DEPARTMENTS_READ: "departments.read",
  DESIGNATIONS_READ: "designations.read",
  LOCATIONS_READ: "locations.read",

  PERMISSIONS_READ: "permissions.read",

  DATA_MANAGEMENT_VIEW: "data-management.view",
  DATA_MANAGEMENT_TEMPLATE_DOWNLOAD: "data-management.template.download",

  DOCUMENTS_READ: "documents.read",

  EMPLOYMENT_TYPES_READ: "employment-types.read",
  LEAVE_TYPES_READ: "leave-types.read",
  LEAVE_POLICIES_READ: "leave-policies.read",
  LEAVE_POLICY_ASSIGNMENTS_READ: "leave-policy-assignments.read",
  APPROVAL_MATRICES_READ: "approval-matrices.read",

  PAYROLL_SETTINGS_READ: "payroll.settings.read",

  INTEGRATIONS_READ: "integrations.read",
  ATTENDANCE_DEVICES_READ: "attendanceDevices.read",
  ATTENDANCE_MAPPINGS_READ: "attendanceMappings.read",
  ATTENDANCE_PROVISIONING_READ: "attendanceProvisioning.read",
  GATEWAYS_READ: "gateways.read",
  APP_DOWNLOADS_READ: "appDownloads.read",

  CUSTOMIZATION_READ: "customization.read",
  CUSTOMIZATION_TABLES_READ: "customization.tables.read",
  CUSTOMIZATION_COLUMNS_READ: "customization.columns.read",
  CUSTOMIZATION_VIEWS_READ: "customization.views.read",
  CUSTOMIZATION_FORMS_READ: "customization.forms.read",

  RECRUITMENT_READ: "recruitment.read",
  ONBOARDING_READ: "onboarding.read",

  AUDIT_READ: "audit.read",
  NOTIFICATIONS_READ: "notifications.read",
  NOTIFICATIONS_MANAGE: "notifications.manage",
  NOTIFICATION_TEMPLATES_READ: "notification.templates.read",
  NOTIFICATION_TEMPLATES_MANAGE: "notification.templates.manage",
  NOTIFICATION_PROVIDERS_READ: "notification.providers.read",
  NOTIFICATION_PROVIDERS_MANAGE: "notification.providers.manage",
  NOTIFICATION_LOGS_READ: "notification.logs.read",
} as const;

function canViewItem(
  permissionKeys: readonly string[],
  roleKeys: readonly string[],
  requiredAnyPermissions?: readonly string[],
  requiredAnyRoles?: readonly string[],
) {
  if (
    requiredAnyRoles?.length &&
    !requiredAnyRoles.some((roleKey) => roleKeys.includes(roleKey))
  ) {
    return false;
  }

  if (!requiredAnyPermissions?.length) return true;

  return hasAnyPermission([...permissionKeys], [...requiredAnyPermissions]);
}

export const settingsNavGroups = [
  {
    key: "general",
    label: "General Setup",
    summary:
      "Core company structure, tenant identity, locations, departments, and hierarchy.",
    icon: "building-2",
    items: [
      {
        key: "tenant",
        href: "/settings/tenant",
        label: "Tenant Profile",
        shortLabel: "Tenant",
        description:
          "Manage tenant identity, business details, timezone, currency, and company-level defaults.",
        icon: "landmark",
        badge: "Core",
        keywords: ["tenant", "company", "profile", "timezone", "currency"],
        requiredAnyPermissions: [NAV_PERMISSION_KEYS.SETTINGS_READ],
      },
      {
        key: "organizations",
        href: "/settings/organizations",
        label: "Organizations",
        description:
          "Manage legal entities, organization hierarchy, and parent-child structure.",
        icon: "globe-2",
        badge: "Core",
        keywords: ["organizations", "legal entity", "company hierarchy"],
        requiredAnyPermissions: [NAV_PERMISSION_KEYS.SETTINGS_READ],
      },
      {
        key: "business-units",
        href: "/settings/business-units",
        label: "Business Units",
        shortLabel: "Business Units",
        description:
          "Manage business units used for ownership, visibility, approvals, and reporting scope.",
        icon: "git-branch",
        badge: "Core",
        keywords: ["business units", "bu", "hierarchy", "ownership"],
        requiredAnyPermissions: [NAV_PERMISSION_KEYS.SETTINGS_READ],
      },
      {
        key: "departments",
        href: "/settings/departments",
        label: "Departments",
        description:
          "Maintain department master data used across employees, reporting, and approvals.",
        icon: "network",
        keywords: ["departments", "teams", "functions"],
        requiredAnyPermissions: [
          NAV_PERMISSION_KEYS.DEPARTMENTS_READ,
          NAV_PERMISSION_KEYS.SETTINGS_READ,
        ],
      },
      {
        key: "organization-teams",
        href: "/settings/general-setup/organization/teams",
        label: "Teams",
        description:
          "Manage organizational teams under business units and departments.",
        icon: "users",
        keywords: ["teams", "organization teams", "department teams"],
        requiredAnyPermissions: [
          PERMISSION_KEYS.TEAMS_READ,
          NAV_PERMISSION_KEYS.SETTINGS_READ,
        ],
      },
      {
        key: "designations",
        href: "/settings/designations",
        label: "Designations",
        description:
          "Maintain job titles, positions, and designation master records.",
        icon: "badge-check",
        keywords: ["designations", "job titles", "positions"],
        requiredAnyPermissions: [
          NAV_PERMISSION_KEYS.DESIGNATIONS_READ,
          NAV_PERMISSION_KEYS.SETTINGS_READ,
        ],
      },
      {
        key: "locations",
        href: "/settings/locations",
        label: "Work Sites",
        description:
          "Maintain offices, branches, working locations, and address-level setup.",
        icon: "map-pinned",
        keywords: ["locations", "branches", "offices", "sites"],
        requiredAnyPermissions: [
          NAV_PERMISSION_KEYS.LOCATIONS_READ,
          NAV_PERMISSION_KEYS.SETTINGS_READ,
        ],
      },
    ],
  },
  {
    key: "regional-operations",
    label: "Regional Operations",
    summary:
      "Payroll geography, countries, states, cities, localization, currency, and fiscal years.",
    icon: "globe-2",
    items: [
      {
        key: "payroll-regions",
        href: "/settings/regional/payroll-geography/payroll-regions",
        label: "Payroll Regions",
        description:
          "Bind payroll cycles, currencies, tax regions, weekends, holidays, and schedules.",
        icon: "banknote",
        badge: "Core",
        keywords: ["payroll region", "pay cycle", "tax region"],
        requiredAnyPermissions: [
          NAV_PERMISSION_KEYS.SETTINGS_READ,
          NAV_PERMISSION_KEYS.PAYROLL_SETTINGS_READ,
        ],
      },
    ],
  },
  {
    key: "security",
    label: "Security & Access",
    summary:
      "Users, roles, permissions, teams, and access governance across the tenant.",
    icon: "shield-check",
    items: [
      {
        key: "access-center",
        href: "/settings/access",
        label: "Access Center",
        shortLabel: "Access",
        description:
          "Central workspace for managing users, roles, permissions, and access governance.",
        icon: "lock-keyhole",
        badge: "Admin",
        keywords: ["access", "security", "rbac", "permissions"],
        requiredAnyPermissions: [NAV_PERMISSION_KEYS.SETTINGS_READ],
      },
      {
        key: "users",
        href: "/settings/security-access/identities/users",
        label: "Users",
        description:
          "Manage user accounts, employee links, login access, status, and assigned roles.",
        icon: "user-lock",
        badge: "Core",
        keywords: ["users", "accounts", "login", "role assignment"],
        requiredAnyPermissions: [
          PERMISSION_KEYS.USERS_READ,
          NAV_PERMISSION_KEYS.SETTINGS_READ,
        ],
      },
      {
        key: "roles",
        href: "/settings/security-access/authorization/roles",
        label: "Roles",
        description:
          "Create and maintain system and custom roles with permission matrices.",
        icon: "shield",
        badge: "Core",
        keywords: ["roles", "security roles", "permission matrix"],
        requiredAnyPermissions: [
          PERMISSION_KEYS.ROLES_READ,
          NAV_PERMISSION_KEYS.SETTINGS_READ,
        ],
      },
      {
        key: "permissions",
        href: "/settings/security-access/authorization/permissions",
        label: "Permissions",
        description:
          "Review available permissions by module, table, operation, and capability.",
        icon: "key-round",
        keywords: ["permissions", "privileges", "catalog", "matrix"],
        requiredAnyPermissions: [
          NAV_PERMISSION_KEYS.PERMISSIONS_READ,
          PERMISSION_KEYS.ROLES_READ,
          NAV_PERMISSION_KEYS.SETTINGS_READ,
        ],
      },
      {
        key: "access-teams",
        href: "/settings/security-access/authorization/access-teams",
        label: "Access Teams",
        description:
          "Manage access teams, membership, shared ownership, and team-based access.",
        icon: "users",
        keywords: ["teams", "groups", "membership", "ownership"],
        requiredAnyPermissions: [
          PERMISSION_KEYS.TEAMS_READ,
          NAV_PERMISSION_KEYS.SETTINGS_READ,
        ],
      },
      {
        key: "field-security",
        href: "/settings/security-access/security-governance/field-security",
        label: "Field Security",
        description:
          "Control sensitive field visibility, masking, and editability after role permissions.",
        icon: "shield-check",
        keywords: ["field security", "masking", "sensitive fields"],
        requiredAnyPermissions: [
          NAV_PERMISSION_KEYS.SETTINGS_READ,
          "field-security.read",
        ],
      },
      {
        key: "password-login-policies",
        href: "/settings/security-access/security-governance/password-login-policies",
        label: "Password & Login Policies",
        description:
          "Configure tenant password, session, invitation, and MFA rules.",
        icon: "lock-keyhole",
        keywords: ["password", "login", "session", "mfa", "invitation"],
        requiredAnyPermissions: [NAV_PERMISSION_KEYS.SETTINGS_READ],
      },
      {
        key: "login-history",
        href: "/settings/security-access/security-governance/login-history",
        label: "Login History",
        description:
          "Review immutable authentication attempts and session outcomes.",
        icon: "history",
        keywords: ["login history", "authentication", "sessions", "audit"],
        requiredAnyPermissions: [
          NAV_PERMISSION_KEYS.SETTINGS_READ,
          NAV_PERMISSION_KEYS.AUDIT_READ,
        ],
      },
    ],
  },
  {
    key: "people",
    label: "People Configuration",
    summary:
      "Employee setup, employee levels, documents, attendance defaults, and notifications.",
    icon: "users",
    items: [
      {
        key: "employee-settings",
        href: "/settings/employees",
        label: "Employee Settings",
        shortLabel: "Employees",
        description:
          "Configure employee codes, onboarding defaults, reporting rules, and employee profile behavior.",
        icon: "user-cog",
        keywords: ["employees", "employee code", "onboarding", "profile"],
        requiredAnyPermissions: [
          PERMISSION_KEYS.SETTINGS_READ,
          PERMISSION_KEYS.EMPLOYEES_READ,
        ],
      },
      {
        key: "employee-levels",
        href: "/settings/employee-levels",
        label: "Employee Levels",
        description:
          "Manage employee grades and levels used for policy assignment, compensation, and reporting.",
        icon: "layers-3",
        badge: "Core",
        keywords: ["employee levels", "grades", "levels", "policy scope"],
        requiredAnyPermissions: [
          PERMISSION_KEYS.EMPLOYEE_LEVELS_READ,
          PERMISSION_KEYS.EMPLOYEE_LEVELS_MANAGE,
          NAV_PERMISSION_KEYS.SETTINGS_READ,
        ],
      },
      {
        key: "employment-types",
        href: "/settings/people/workforce/employment-types",
        label: "Employment Types",
        description:
          "Manage employment categories used by employees, payroll, leave, benefits, overtime, and probation defaults.",
        icon: "briefcase-business",
        badge: "Core",
        keywords: ["employment types", "full time", "part time", "contract"],
        requiredAnyPermissions: [
          NAV_PERMISSION_KEYS.EMPLOYMENT_TYPES_READ,
          NAV_PERMISSION_KEYS.SETTINGS_READ,
        ],
      },
      {
        key: "documents",
        href: "/settings/people/documents/documents",
        label: "Document Settings",
        shortLabel: "Documents",
        description:
          "Configure document categories, storage rules, validation, and employee document governance.",
        icon: "file-stack",
        keywords: ["documents", "files", "validation", "storage"],
        requiredAnyPermissions: [
          NAV_PERMISSION_KEYS.SETTINGS_READ,
          NAV_PERMISSION_KEYS.DOCUMENTS_READ,
        ],
      },
      {
        key: "document-categories",
        href: "/settings/people/documents/categories",
        label: "Document Categories",
        description:
          "Maintain reusable document categories for uploads, expiry, verification, and retention.",
        icon: "folder-open",
        keywords: ["document categories", "files", "expiry", "verification"],
        requiredAnyPermissions: [
          NAV_PERMISSION_KEYS.SETTINGS_READ,
          NAV_PERMISSION_KEYS.DOCUMENTS_READ,
        ],
      },
      {
        key: "shifts",
        href: "/settings/shifts",
        label: "Shifts",
        description:
          "Manage shift hours, breaks, expected hours, grace periods, timezones, and night shifts.",
        icon: "clock-3",
        badge: "Core",
        keywords: ["shift", "working hours", "grace", "night shift"],
        requiredAnyPermissions: [NAV_PERMISSION_KEYS.SETTINGS_READ],
      },
      {
        key: "work-calendars",
        href: "/settings/work-calendars",
        label: "Work Calendar",
        description:
          "Configure work calendar patterns, working days, weekends, and calendar behavior.",
        icon: "calendar-clock",
        keywords: ["work calendar", "calendar", "working days", "weekends"],
        requiredAnyPermissions: [NAV_PERMISSION_KEYS.SETTINGS_READ],
      },
      {
        key: "holiday-calendars",
        href: "/settings/holiday-calendars",
        label: "Holiday Calendar",
        description:
          "Maintain holiday calendars, public holidays, optional holidays, and assignments.",
        icon: "calendar-days",
        keywords: ["holiday calendar", "holidays", "public holidays"],
        requiredAnyPermissions: [NAV_PERMISSION_KEYS.SETTINGS_READ],
      },
      {
        key: "attendance",
        href: "/settings/people/attendance/attendance",
        label: "Attendance Settings",
        description:
          "Configure attendance rules, grace periods, device behavior, shifts, and check-in controls.",
        icon: "clock-3",
        keywords: ["attendance", "check in", "check out", "grace period"],
        requiredAnyPermissions: [
          PERMISSION_KEYS.SETTINGS_READ,
          PERMISSION_KEYS.ATTENDANCE_READ,
          PERMISSION_KEYS.TIMESHEETS_SETTINGS_READ,
        ],
      },
      {
        key: "timesheets",
        href: "/settings/people/attendance/timesheets",
        label: "Timesheet Settings",
        description:
          "Configure scoped monthly timesheets, weekly workflows, integrations, payroll readiness, and exports.",
        icon: "calendar-clock",
        keywords: [
          "timesheets",
          "weekly submission",
          "time entry",
          "payroll readiness",
        ],
        requiredAnyPermissions: [
          PERMISSION_KEYS.SETTINGS_READ,
          PERMISSION_KEYS.TIMESHEETS_SETTINGS_READ,
        ],
      },
      {
        key: "notifications",
        href: "/settings/notifications",
        label: "Notifications",
        description:
          "Configure notification channels, templates, alert rules, and communication defaults.",
        icon: "bell",
        keywords: ["notifications", "alerts", "email", "templates"],
        requiredAnyPermissions: [
          NAV_PERMISSION_KEYS.NOTIFICATIONS_READ,
          NAV_PERMISSION_KEYS.NOTIFICATIONS_MANAGE,
          NAV_PERMISSION_KEYS.SETTINGS_READ,
        ],
      },
      {
        key: "notification-email-templates",
        href: "/settings/notifications/templates",
        label: "Email Templates",
        description:
          "Manage template-driven notification emails, previews, and test sends.",
        icon: "mail",
        keywords: ["email templates", "notifications", "preview", "test send"],
        requiredAnyPermissions: [
          NAV_PERMISSION_KEYS.NOTIFICATION_TEMPLATES_READ,
          NAV_PERMISSION_KEYS.NOTIFICATION_TEMPLATES_MANAGE,
        ],
      },
      {
        key: "notification-email-providers",
        href: "/settings/notifications/providers",
        label: "Email Providers",
        description:
          "Configure tenant sender identities and provider settings for template email delivery.",
        icon: "server-cog",
        keywords: ["email providers", "smtp", "sender", "delivery"],
        requiredAnyPermissions: [
          NAV_PERMISSION_KEYS.NOTIFICATION_PROVIDERS_READ,
          NAV_PERMISSION_KEYS.NOTIFICATION_PROVIDERS_MANAGE,
        ],
      },
      {
        key: "notification-email-logs",
        href: "/settings/notifications/logs",
        label: "Email Delivery Logs",
        shortLabel: "Email Logs",
        description:
          "Review email delivery attempts, statuses, provider IDs, and failure diagnostics.",
        icon: "list-checks",
        keywords: ["email logs", "delivery logs", "notifications", "status"],
        requiredAnyPermissions: [NAV_PERMISSION_KEYS.NOTIFICATION_LOGS_READ],
      },
    ],
  },
  {
    key: "leave",
    label: "Leave & Approvals",
    summary:
      "Leave types, leave policies, approval routing, and workflow matrices.",
    icon: "clipboard-check",
    items: [
      {
        key: "leave-types",
        href: "/settings/people/leave/leave-types",
        label: "Leave Types",
        description:
          "Define reusable annual, sick, unpaid, compensatory, and custom leave categories.",
        icon: "calendar-days",
        badge: "Core",
        keywords: ["leave types", "absence", "annual leave", "sick leave"],
        requiredAnyPermissions: [
          NAV_PERMISSION_KEYS.LEAVE_TYPES_READ,
          PERMISSION_KEYS.LEAVES_READ,
          NAV_PERMISSION_KEYS.SETTINGS_READ,
        ],
      },
      {
        key: "leave-policies",
        href: "/settings/people/leave/leave-policies",
        label: "Leave Policies",
        description:
          "Package leave type rules into assignable policy containers.",
        icon: "file-check",
        badge: "Core",
        keywords: ["leave policies", "accrual", "carry forward", "eligibility"],
        requiredAnyPermissions: [
          NAV_PERMISSION_KEYS.LEAVE_POLICIES_READ,
          NAV_PERMISSION_KEYS.LEAVE_POLICY_ASSIGNMENTS_READ,
          PERMISSION_KEYS.LEAVE_REQUESTS_READ,
          NAV_PERMISSION_KEYS.SETTINGS_READ,
        ],
      },
      {
        key: "approval-matrices",
        href: "/settings/approval-matrices",
        label: "Approval Matrices",
        shortLabel: "Approvals",
        description:
          "Route approvals across leave, timesheets, claims, trips, resources, and payroll.",
        icon: "workflow",
        keywords: ["approval", "matrix", "workflow", "routing"],
        requiredAnyPermissions: [
          NAV_PERMISSION_KEYS.APPROVAL_MATRICES_READ,
          NAV_PERMISSION_KEYS.LEAVE_POLICIES_READ,
          PERMISSION_KEYS.LEAVE_REQUESTS_READ,
          NAV_PERMISSION_KEYS.SETTINGS_READ,
        ],
      },
      {
        key: "policy-engine",
        href: "/settings/policies",
        label: "Policy Engine",
        shortLabel: "Policies",
        description:
          "Manage effective-dated policy definitions, scopes, assignments, and resolver behavior.",
        icon: "file-cog",
        badge: "Advanced",
        keywords: ["policies", "policy engine", "assignments", "resolver"],
        requiredAnyPermissions: [
          PERMISSION_KEYS.POLICIES_READ,
          PERMISSION_KEYS.POLICIES_MANAGE,
          NAV_PERMISSION_KEYS.SETTINGS_READ,
        ],
      },
    ],
  },
  {
    key: "payroll",
    label: "Payroll & Finance",
    summary:
      "Compensation, claims, overtime, taxes, GL accounts, and payroll posting configuration.",
    icon: "wallet",
    items: [
      {
        key: "subscription",
        href: "/settings/subscription",
        label: "Subscription",
        description:
          "Review subscription status, plan features, Stripe billing actions, and invoices.",
        icon: "receipt",
        badge: "Admin",
        keywords: [
          "subscription",
          "billing",
          "features",
          "invoice",
          "stripe",
          "plans",
        ],
        hideWhenRestricted: true,
        requiredAnyRoles: [ROLE_KEYS.GLOBAL_ADMIN, ROLE_KEYS.SYSTEM_ADMIN],
      },
      {
        key: "payroll-settings",
        href: "/settings/payroll/configuration/payroll-settings",
        label: "Payroll Settings",
        shortLabel: "Payroll",
        description:
          "Configure pay frequency, payroll defaults, compensation behavior, and payroll preferences.",
        icon: "banknote",
        badge: "Core",
        keywords: ["payroll", "salary", "pay frequency", "compensation"],
        requiredAnyPermissions: [
          NAV_PERMISSION_KEYS.SETTINGS_READ,
          NAV_PERMISSION_KEYS.PAYROLL_SETTINGS_READ,
          PERMISSION_KEYS.PAYROLL_READ,
        ],
      },
      {
        key: "pay-components",
        href: "/settings/payroll/configuration/pay-components",
        label: "Pay Components",
        description:
          "Manage earnings, allowances, deductions, reimbursements, tax, and adjustment components.",
        icon: "list-tree",
        badge: "Core",
        keywords: ["pay components", "earnings", "allowances", "deductions"],
        requiredAnyPermissions: [
          PERMISSION_KEYS.PAY_COMPONENTS_READ,
          PERMISSION_KEYS.PAY_COMPONENTS_MANAGE,
        ],
      },
      {
        key: "claim-types",
        href: "/settings/payroll/configuration/claim-types",
        label: "Claim Types",
        description:
          "Configure reimbursement claim categories, subtypes, limits, and receipt requirements.",
        icon: "receipt",
        keywords: ["claims", "reimbursements", "expenses", "receipts"],
        requiredAnyPermissions: [
          PERMISSION_KEYS.CLAIM_TYPES_READ,
          PERMISSION_KEYS.CLAIM_TYPES_MANAGE,
        ],
      },
      {
        key: "travel-allowance-policies",
        href: "/settings/payroll/configuration/travel-allowance-policies",
        label: "Travel Allowance Rules",
        shortLabel: "TA/DA Policies",
        description:
          "Configure employee-level, destination-based, and trip-based travel allowance rules.",
        icon: "plane",
        keywords: ["travel", "ta da", "business trip", "allowance"],
        requiredAnyPermissions: [
          PERMISSION_KEYS.TADA_POLICIES_READ,
          PERMISSION_KEYS.TADA_POLICIES_MANAGE,
        ],
      },
      {
        key: "time-payroll-policies",
        href: "/settings/payroll/configuration/time-payroll-policies",
        label: "Time-Based Pay Rules",
        description:
          "Configure attendance, timesheet, no-show, and source-to-payroll behavior.",
        icon: "calendar-clock",
        keywords: ["time payroll", "attendance payroll", "timesheet payroll"],
        requiredAnyPermissions: [
          PERMISSION_KEYS.TIME_PAYROLL_POLICIES_READ,
          PERMISSION_KEYS.TIME_PAYROLL_POLICIES_MANAGE,
        ],
      },
      {
        key: "overtime-policies",
        href: "/settings/payroll/configuration/overtime-policies",
        label: "Overtime Rules",
        description:
          "Configure overtime thresholds, multipliers, eligibility, and payroll calculation behavior.",
        icon: "timer-reset",
        keywords: ["overtime", "ot", "multipliers", "time payroll"],
        requiredAnyPermissions: [
          PERMISSION_KEYS.OVERTIME_POLICIES_READ,
          PERMISSION_KEYS.OVERTIME_POLICIES_MANAGE,
        ],
      },
      {
        key: "tax-rules",
        href: "/settings/payroll/configuration/tax-rules",
        label: "Tax Policies",
        description:
          "Configure effective-dated tax deductions, brackets, exemptions, and employer contributions.",
        icon: "percent",
        keywords: ["tax", "statutory", "deductions", "contributions"],
        requiredAnyPermissions: [
          PERMISSION_KEYS.TAX_RULES_READ,
          PERMISSION_KEYS.TAX_RULES_MANAGE,
        ],
      },
      {
        key: "employee-tax-profiles",
        href: "/settings/payroll/configuration/employee-tax-profiles",
        label: "Employee Tax Profiles",
        shortLabel: "Tax Profiles",
        description:
          "Assign effective-dated tax policies, exemptions, credits, and employee tax details.",
        icon: "badge-percent",
        keywords: ["employee tax", "tax profile", "filing", "tax identifier"],
        requiredAnyPermissions: [
          PERMISSION_KEYS.EMPLOYEE_TAX_PROFILES_READ,
          PERMISSION_KEYS.EMPLOYEE_TAX_PROFILES_MANAGE,
        ],
      },
      {
        key: "payroll-banks",
        href: "/settings/payroll/banking/banks",
        label: "Banks",
        description:
          "Maintain bank master records used by employee and employer payroll bank accounts.",
        icon: "landmark",
        badge: "Core",
        keywords: [
          "banks",
          "bank master",
          "swift",
          "routing",
          "payroll banking",
        ],
        requiredAnyPermissions: [
          NAV_PERMISSION_KEYS.SETTINGS_READ,
          NAV_PERMISSION_KEYS.PAYROLL_SETTINGS_READ,
        ],
      },
      {
        key: "employer-bank-accounts",
        href: "/settings/payroll/banking/employer-bank-accounts",
        label: "Employer Bank Accounts",
        shortLabel: "Employer Banks",
        description:
          "Configure employer bank accounts used as payroll funding and payment file sources.",
        icon: "credit-card",
        badge: "Core",
        keywords: [
          "employer bank account",
          "payroll banking",
          "funding account",
          "payment file",
        ],
        requiredAnyPermissions: [
          NAV_PERMISSION_KEYS.SETTINGS_READ,
          NAV_PERMISSION_KEYS.PAYROLL_SETTINGS_READ,
        ],
      },
      {
        key: "gl-accounts",
        href: "/settings/payroll/configuration/gl-accounts",
        label: "GL Accounts",
        description:
          "Maintain payroll accounting accounts used for journals and financial exports.",
        icon: "book-open",
        keywords: ["gl", "accounts", "ledger", "journal", "accounting"],
        requiredAnyPermissions: [
          PERMISSION_KEYS.PAYROLL_GL_READ,
          PERMISSION_KEYS.PAYROLL_GL_MANAGE,
        ],
      },
      {
        key: "posting-rules",
        href: "/settings/payroll/configuration/posting-rules",
        label: "Posting Rules",
        description:
          "Map payroll components, tax rules, and line item categories to debit and credit accounts.",
        icon: "split",
        keywords: ["posting", "journal", "debit", "credit", "accounting"],
        requiredAnyPermissions: [
          PERMISSION_KEYS.PAYROLL_GL_READ,
          PERMISSION_KEYS.PAYROLL_GL_MANAGE,
        ],
      },
    ],
  },
  {
    key: "customization",
    label: "Customization",
    summary:
      "Manage modules, packages, and publishing for tenant-specific metadata.",
    icon: "sliders-horizontal",
    items: [
      {
        key: "tables",
        href: "/settings/customization/modules",
        label: "Modules",
        description:
          "Configure module labels, icons, descriptions, ownership behavior, and active state.",
        icon: "table-2",
        keywords: ["modules", "tables", "entities", "metadata"],
        requiredAnyPermissions: [
          NAV_PERMISSION_KEYS.CUSTOMIZATION_TABLES_READ,
          PERMISSION_KEYS.CUSTOMIZATION_ACCESS,
          NAV_PERMISSION_KEYS.SETTINGS_READ,
        ],
        requiredAnyRoles: [
          ROLE_KEYS.GLOBAL_ADMIN,
          ROLE_KEYS.SYSTEM_CUSTOMIZER,
        ],
      },
      {
        key: "sidebar",
        href: "/settings/customization/sidebar",
        label: "Sidebar Designer",
        description:
          "Reorder, rename, hide, and audience-gate the main sidebar. Entries stay product-defined, so new modules still appear automatically.",
        icon: "panel-left",
        keywords: [
          "sidebar",
          "navigation",
          "menu",
          "order",
          "hide",
          "rename",
          "audience",
        ],
        requiredAnyPermissions: [
          NAV_PERMISSION_KEYS.CUSTOMIZATION_READ,
          PERMISSION_KEYS.CUSTOMIZATION_ACCESS,
          NAV_PERMISSION_KEYS.SETTINGS_READ,
        ],
        requiredAnyRoles: [
          ROLE_KEYS.GLOBAL_ADMIN,
          ROLE_KEYS.SYSTEM_CUSTOMIZER,
        ],
      },
      {
        key: "packages",
        href: "/settings/customization/packages",
        label: "Packages",
        description:
          "Organize metadata as Package, Module, and Components for JSON export and future layering.",
        icon: "package",
        keywords: [
          "packages",
          "solutions",
          "publisher",
          "prefix",
          "import",
          "export",
        ],
        requiredAnyPermissions: [
          NAV_PERMISSION_KEYS.CUSTOMIZATION_READ,
          PERMISSION_KEYS.CUSTOMIZATION_ACCESS,
          NAV_PERMISSION_KEYS.SETTINGS_READ,
        ],
        requiredAnyRoles: [
          ROLE_KEYS.GLOBAL_ADMIN,
          ROLE_KEYS.SYSTEM_CUSTOMIZER,
        ],
      },
      {
        key: "publish-center",
        href: "/settings/customization/publish-center",
        label: "Publish Center",
        description:
          "Validate draft package metadata before publishing. Publish selected is disabled until dependency validation is complete.",
        icon: "send",
        keywords: ["publish", "draft", "metadata", "validation", "packages"],
        requiredAnyPermissions: [
          NAV_PERMISSION_KEYS.CUSTOMIZATION_READ,
          PERMISSION_KEYS.CUSTOMIZATION_ACCESS,
          NAV_PERMISSION_KEYS.SETTINGS_READ,
        ],
        requiredAnyRoles: [
          ROLE_KEYS.GLOBAL_ADMIN,
          ROLE_KEYS.SYSTEM_CUSTOMIZER,
        ],
      },
    ],
  },
  {
    key: "integrations",
    label: "Integrations",
    summary:
      "Connect DijiPeople to attendance devices and other external systems.",
    icon: "plug",
    items: [
      {
        key: "attendance-integrations-overview",
        href: "/settings/integrations/attendance",
        label: "Attendance Overview",
        shortLabel: "Overview",
        description:
          "See how your attendance integrations are configured and what still needs attention.",
        icon: "gauge",
        badge: "New",
        keywords: [
          "attendance",
          "integration",
          "device",
          "biometric",
          "terminal",
          "overview",
        ],
        requiredAnyPermissions: [
          NAV_PERMISSION_KEYS.INTEGRATIONS_READ,
          PERMISSION_KEYS.INTEGRATIONS_MANAGE,
        ],
      },
      {
        key: "attendance-integrations",
        href: "/settings/integrations/attendance/integrations",
        label: "Attendance Integrations",
        shortLabel: "Integrations",
        description:
          "Connect attendance terminals and attendance platforms, and manage their configuration.",
        icon: "plug-zap",
        badge: "New",
        keywords: [
          "attendance integration",
          "zkteco",
          "terminal",
          "connector",
          "gateway",
          "sync",
        ],
        requiredAnyPermissions: [
          NAV_PERMISSION_KEYS.INTEGRATIONS_READ,
          PERMISSION_KEYS.INTEGRATIONS_MANAGE,
        ],
      },
      {
        key: "attendance-devices",
        href: "/settings/integrations/attendance/devices",
        label: "Attendance Devices",
        shortLabel: "Devices",
        description:
          "Attendance terminals, the work sites they serve, and which employees may use them.",
        icon: "fingerprint",
        badge: "New",
        keywords: ["device", "terminal", "reader", "biometric", "work site"],
        requiredAnyPermissions: [
          NAV_PERMISSION_KEYS.ATTENDANCE_DEVICES_READ,
          PERMISSION_KEYS.ATTENDANCE_DEVICES_MANAGE,
        ],
      },
      {
        key: "attendance-employee-mapping",
        href: "/settings/integrations/attendance/mapping",
        label: "Employee Mapping",
        shortLabel: "Mapping",
        description:
          "Match users found on your attendance devices to DijiPeople employees.",
        icon: "users-round",
        badge: "New",
        keywords: ["mapping", "external user", "match", "device user"],
        requiredAnyPermissions: [
          NAV_PERMISSION_KEYS.ATTENDANCE_MAPPINGS_READ,
          PERMISSION_KEYS.ATTENDANCE_MAPPINGS_MANAGE,
        ],
      },
      {
        key: "attendance-provisioning",
        href: "/settings/integrations/attendance/provisioning",
        label: "Device Provisioning",
        shortLabel: "Provisioning",
        description:
          "Track employee records being sent to attendance devices, and retry anything that failed.",
        icon: "list-checks",
        badge: "New",
        keywords: ["provisioning", "enrolment", "device user", "retry"],
        requiredAnyPermissions: [
          NAV_PERMISSION_KEYS.ATTENDANCE_PROVISIONING_READ,
          PERMISSION_KEYS.ATTENDANCE_PROVISIONING_MANAGE,
        ],
      },
      {
        key: "attendance-gateways",
        href: "/settings/integrations/attendance/gateways",
        label: "Integration Gateways",
        shortLabel: "Gateways",
        description:
          "On-premise gateways that let DijiPeople reach devices inside your network.",
        icon: "server",
        badge: "New",
        keywords: ["gateway", "on premise", "pairing", "local network"],
        requiredAnyPermissions: [
          NAV_PERMISSION_KEYS.GATEWAYS_READ,
          PERMISSION_KEYS.GATEWAYS_MANAGE,
        ],
      },
      {
        key: "attendance-sync-history",
        href: "/settings/integrations/attendance/sync-history",
        label: "Sync History",
        shortLabel: "Sync History",
        description:
          "Every synchronisation run, what it collected, and anything that failed.",
        icon: "history",
        badge: "New",
        keywords: ["sync", "history", "run", "log", "records"],
        requiredAnyPermissions: [
          NAV_PERMISSION_KEYS.INTEGRATIONS_READ,
          PERMISSION_KEYS.INTEGRATIONS_MANAGE,
        ],
      },
      {
        // The gateway installer lives here, so the page belongs beside the
        // integrations that need it. It had no navigation entry at all before.
        key: "apps-downloads",
        href: "/settings/apps",
        label: "Apps & Downloads",
        shortLabel: "Downloads",
        description:
          "Installers for the gateway and other DijiPeople applications available to your organisation.",
        icon: "download",
        badge: "New",
        keywords: [
          "download",
          "installer",
          "gateway",
          "agent",
          "app",
          "setup",
        ],
        requiredAnyPermissions: [
          NAV_PERMISSION_KEYS.APP_DOWNLOADS_READ,
          PERMISSION_KEYS.AGENT_SETTINGS_READ,
          PERMISSION_KEYS.AGENT_SETTINGS_MANAGE,
        ],
      },
    ],
  },
  {
    key: "apps",
    label: "Apps & Modules",
    summary: "Recruitment, desktop agent, and optional product modules.",
    icon: "app-window",
    items: [
      {
        key: "recruitment",
        href: "/settings/recruitment",
        label: "Recruitment & Onboarding",
        shortLabel: "Recruitment",
        description:
          "Configure hiring stages, onboarding steps, and candidate-to-employee defaults.",
        icon: "user-plus",
        keywords: ["recruitment", "hiring", "onboarding", "candidates"],
        requiredAnyPermissions: [
          NAV_PERMISSION_KEYS.SETTINGS_READ,
          NAV_PERMISSION_KEYS.RECRUITMENT_READ,
          NAV_PERMISSION_KEYS.ONBOARDING_READ,
        ],
      },
      {
        key: "desktop-agent",
        href: "/settings/desktop-agent",
        label: "Desktop Agent",
        description:
          "Configure productivity tracking, heartbeat, idle detection, privacy, and update policies.",
        icon: "monitor-up",
        badge: "New",
        keywords: ["desktop agent", "productivity", "tracking", "heartbeat"],
        requiredAnyPermissions: [
          PERMISSION_KEYS.AGENT_SETTINGS_READ,
          PERMISSION_KEYS.AGENT_SETTINGS_MANAGE,
          NAV_PERMISSION_KEYS.SETTINGS_READ,
        ],
      },
    ],
  },
  {
    key: "appearance",
    label: "Appearance & Experience",
    summary:
      "Branding, theme, content, navigation, dashboard experience, and reusable templates.",
    icon: "palette",
    items: [
      {
        key: "branding",
        href: "/settings/branding",
        label: "Branding",
        description:
          "Manage logo, favicon, typography, tenant identity, and brand presentation.",
        icon: "palette",
        badge: "Core",
        keywords: ["branding", "logo", "theme", "favicon", "typography"],
        requiredAnyPermissions: [NAV_PERMISSION_KEYS.SETTINGS_READ],
      },
      {
        key: "system-preferences",
        href: "/settings/system",
        label: "System Preferences",
        shortLabel: "Preferences",
        description:
          "Configure date formats, time formats, UI defaults, locale, and tenant-wide preferences.",
        icon: "settings-2",
        keywords: ["system", "preferences", "date format", "locale"],
        requiredAnyPermissions: [NAV_PERMISSION_KEYS.SETTINGS_READ],
      },
    ],
  },
  {
    key: "audit",
    label: "Audit & Compliance",
    summary:
      "Audit logs, change history, administrative actions, and compliance visibility.",
    icon: "history",
    items: [
      {
        key: "audit-logs",
        href: "/settings/audit",
        label: "Audit Logs",
        shortLabel: "Audit",
        description:
          "Review critical setting changes, role changes, user changes, and security events.",
        icon: "history",
        badge: "Admin",
        keywords: ["audit", "logs", "history", "security events"],
        requiredAnyPermissions: [
          NAV_PERMISSION_KEYS.AUDIT_READ,
          PERMISSION_KEYS.AUDIT_VIEW,
          NAV_PERMISSION_KEYS.SETTINGS_READ,
        ],
      },
    ],
  },
  {
    key: "data-management",
    label: "Data Management",
    summary:
      "Import and export module data, download templates, and review import history.",
    icon: "database",
    items: [
      {
        key: "data-management",
        href: "/settings/data-management",
        label: "Import & Export",
        shortLabel: "Data",
        description:
          "Download import templates, import records in bulk, export module data, and review past jobs.",
        icon: "database",
        badge: "New",
        keywords: [
          "import",
          "export",
          "data",
          "template",
          "migration",
          "bulk",
          "excel",
          "csv",
        ],
        // Gated on the dedicated permission rather than settings.read, so a
        // user who can read settings does not automatically get bulk data
        // tooling.
        requiredAnyPermissions: [NAV_PERMISSION_KEYS.DATA_MANAGEMENT_VIEW],
      },
    ],
  },
] as const satisfies readonly SettingsNavGroup[];

export function canViewSettingsItem(
  permissionKeys: readonly string[] = [],
  roleKeys: readonly string[] = [],
  item: SettingsNavItem,
  placement?: Omit<VisibilityPrincipal, "roleKeys" | "permissionKeys">,
) {
  if (
    !canViewItem(
      permissionKeys,
      roleKeys,
      item.requiredAnyPermissions,
      item.requiredAnyRoles,
    )
  ) {
    return false;
  }

  return isVisibleByRules(item, {
    principal: { ...placement, roleKeys, permissionKeys },
  });
}

export function resolveVisibleSettingsGroups(
  permissionKeys: readonly string[] = [],
  options?: {
    includeRestricted?: boolean;
    roleKeys?: readonly string[];
  },
) {
  const roleKeys = options?.roleKeys ?? [];

  return settingsNavGroups
    .map((group) => {
      const items = group.items.filter((item) => {
        if ("disabled" in item && item.disabled) return false;
        if (
          options?.includeRestricted &&
          !("hideWhenRestricted" in item && item.hideWhenRestricted)
        ) {
          return true;
        }

        return canViewItem(
          permissionKeys,
          roleKeys,
          "requiredAnyPermissions" in item
            ? item.requiredAnyPermissions
            : undefined,
          "requiredAnyRoles" in item ? item.requiredAnyRoles : undefined,
        );
      });

      return {
        ...group,
        items,
      };
    })
    .filter((group) => group.items.length > 0);
}

export function flattenVisibleSettingsItems(
  permissionKeys: readonly string[] = [],
  options?: {
    includeRestricted?: boolean;
    roleKeys?: readonly string[];
  },
): VisibleSettingsNavItem[] {
  return resolveVisibleSettingsGroups(permissionKeys, options).flatMap(
    (group) =>
      group.items.map((item) => ({
        ...item,
        groupKey: group.key,
        groupLabel: group.label,
        groupSummary: group.summary,
      })),
  );
}

export function flattenSettingsItems(): VisibleSettingsNavItem[] {
  return settingsNavGroups.flatMap((group) =>
    group.items.map((item) => ({
      ...item,
      groupKey: group.key,
      groupLabel: group.label,
      groupSummary: group.summary,
    })),
  );
}

export function findSettingsItemByPath(pathname: string) {
  const normalizedPathname = normalizePath(pathname);

  let bestMatch: VisibleSettingsNavItem | null = null;

  for (const item of flattenSettingsItems()) {
    const normalizedHref = normalizePath(item.href);

    const isMatch =
      normalizedPathname === normalizedHref ||
      normalizedPathname.startsWith(`${normalizedHref}/`);

    if (!isMatch) continue;

    if (!bestMatch || item.href.length > bestMatch.href.length) {
      bestMatch = item;
    }
  }

  return bestMatch;
}

export function searchVisibleSettingsItems(
  permissionKeys: readonly string[] = [],
  query = "",
  options?: {
    includeRestricted?: boolean;
    roleKeys?: readonly string[];
  },
): VisibleSettingsNavItem[] {
  const normalizedQuery = query.trim().toLowerCase();

  const items = flattenVisibleSettingsItems(permissionKeys, options).filter(
    (item) => !item.disabled,
  );

  if (!normalizedQuery) return items;

  return items.filter((item) => {
    const searchableText = [
      item.label,
      item.shortLabel,
      item.description,
      item.groupLabel,
      item.groupSummary,
      item.badge,
      ...item.keywords,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    return searchableText.includes(normalizedQuery);
  });
}

export function getSettingsGroupByKey(groupKey: string) {
  return settingsNavGroups.find((group) => group.key === groupKey) ?? null;
}

export function getSettingsItemByKey(itemKey: string) {
  return flattenSettingsItems().find((item) => item.key === itemKey) ?? null;
}

function normalizePath(pathname: string) {
  if (!pathname) return "/";

  const cleanPath = pathname.split("?")[0]?.split("#")[0] ?? pathname;

  return cleanPath.length > 1 ? cleanPath.replace(/\/+$/, "") : cleanPath;
}
