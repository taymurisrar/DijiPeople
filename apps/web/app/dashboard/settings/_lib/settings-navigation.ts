import { hasAnyPermission } from "@/lib/permissions";
import { PERMISSION_KEYS } from "@/lib/security-keys";

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

  DOCUMENTS_READ: "documents.read",

  LEAVE_TYPES_READ: "leave-types.read",
  LEAVE_POLICIES_READ: "leave-policies.read",

  PAYROLL_SETTINGS_READ: "payroll.settings.read",

  CUSTOMIZATION_READ: "customization.read",
  CUSTOMIZATION_TABLES_READ: "customization.tables.read",
  CUSTOMIZATION_COLUMNS_READ: "customization.columns.read",
  CUSTOMIZATION_VIEWS_READ: "customization.views.read",
  CUSTOMIZATION_FORMS_READ: "customization.forms.read",

  RECRUITMENT_READ: "recruitment.read",
  ONBOARDING_READ: "onboarding.read",

  AUDIT_READ: "audit.read",
} as const;

function canViewItem(
  permissionKeys: readonly string[],
  requiredAnyPermissions?: readonly string[],
) {
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
        href: "/dashboard/settings/tenant",
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
        href: "/dashboard/settings/organizations",
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
        href: "/dashboard/settings/business-units",
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
        href: "/dashboard/settings/departments",
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
        key: "designations",
        href: "/dashboard/settings/designations",
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
        href: "/dashboard/settings/locations",
        label: "Locations",
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
    key: "security",
    label: "Security & Access",
    summary:
      "Users, roles, permissions, teams, and access governance across the tenant.",
    icon: "shield-check",
    items: [
      {
        key: "access-center",
        href: "/dashboard/settings/access",
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
        href: "/dashboard/settings/access/users",
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
        href: "/dashboard/settings/access/roles",
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
        href: "/dashboard/settings/access/permissions",
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
        key: "teams",
        href: "/dashboard/settings/access/teams",
        label: "Teams",
        description:
          "Manage access teams, membership, shared ownership, and team-based access.",
        icon: "users",
        keywords: ["teams", "groups", "membership", "ownership"],
        requiredAnyPermissions: [
          PERMISSION_KEYS.TEAMS_READ,
          NAV_PERMISSION_KEYS.SETTINGS_READ,
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
        href: "/dashboard/settings/employees",
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
        href: "/dashboard/settings/employee-levels",
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
        key: "documents",
        href: "/dashboard/settings/documents",
        label: "Document Rules",
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
        key: "attendance",
        href: "/dashboard/settings/attendance",
        label: "Attendance",
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
        key: "notifications",
        href: "/dashboard/settings/notifications",
        label: "Notifications",
        description:
          "Configure notification channels, templates, alert rules, and communication defaults.",
        icon: "bell",
        keywords: ["notifications", "alerts", "email", "templates"],
        requiredAnyPermissions: [NAV_PERMISSION_KEYS.SETTINGS_READ],
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
        href: "/dashboard/settings/leave-types",
        label: "Leave Types",
        description:
          "Manage annual, sick, unpaid, compensatory, and custom leave categories.",
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
        href: "/dashboard/settings/leave-policies",
        label: "Leave Policies",
        description:
          "Configure accruals, eligibility, carry forward, encashment, and document rules.",
        icon: "file-check",
        badge: "Core",
        keywords: ["leave policies", "accrual", "carry forward", "eligibility"],
        requiredAnyPermissions: [
          NAV_PERMISSION_KEYS.LEAVE_POLICIES_READ,
          PERMISSION_KEYS.LEAVE_REQUESTS_READ,
          NAV_PERMISSION_KEYS.SETTINGS_READ,
        ],
      },
      {
        key: "approval-matrices",
        href: "/dashboard/settings/approval-matrices",
        label: "Approval Matrices",
        shortLabel: "Approvals",
        description:
          "Define approval routing for leave, claims, payroll, HR, and manager workflows.",
        icon: "workflow",
        keywords: ["approval", "matrix", "workflow", "routing"],
        requiredAnyPermissions: [
          NAV_PERMISSION_KEYS.LEAVE_POLICIES_READ,
          PERMISSION_KEYS.LEAVE_REQUESTS_READ,
          NAV_PERMISSION_KEYS.SETTINGS_READ,
        ],
      },
      {
        key: "policy-engine",
        href: "/dashboard/settings/policies",
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
        key: "payroll-settings",
        href: "/dashboard/settings/payroll",
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
        href: "/dashboard/settings/pay-components",
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
        href: "/dashboard/settings/claim-types",
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
        href: "/dashboard/settings/travel-allowance-policies",
        label: "Travel Allowance Policies",
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
        href: "/dashboard/settings/time-payroll-policies",
        label: "Time Payroll Policies",
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
        href: "/dashboard/settings/overtime-policies",
        label: "Overtime Policies",
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
        href: "/dashboard/settings/tax-rules",
        label: "Tax Rules",
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
        key: "gl-accounts",
        href: "/dashboard/settings/payroll/gl-accounts",
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
        href: "/dashboard/settings/payroll/posting-rules",
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
      "Configure tables, columns, forms, views, publishing, and tenant-specific metadata.",
    icon: "sliders-horizontal",
    items: [
      {
        key: "customization-overview",
        href: "/dashboard/settings/customization",
        label: "Customization Overview",
        shortLabel: "Overview",
        description:
          "Review available customization areas and open metadata workspaces.",
        icon: "sliders-horizontal",
        badge: "Advanced",
        keywords: ["customization", "metadata", "tables", "columns", "forms"],
        requiredAnyPermissions: [
          NAV_PERMISSION_KEYS.CUSTOMIZATION_READ,
          PERMISSION_KEYS.CUSTOMIZATION_ACCESS,
          NAV_PERMISSION_KEYS.SETTINGS_READ,
        ],
      },
      {
        key: "tables",
        href: "/dashboard/settings/customization/tables",
        label: "Tables",
        description:
          "Configure table labels, icons, descriptions, ownership behavior, and active state.",
        icon: "table-2",
        keywords: ["tables", "entities", "metadata"],
        requiredAnyPermissions: [
          NAV_PERMISSION_KEYS.CUSTOMIZATION_TABLES_READ,
          PERMISSION_KEYS.CUSTOMIZATION_ACCESS,
          NAV_PERMISSION_KEYS.SETTINGS_READ,
        ],
      },
      {
        key: "columns",
        href: "/dashboard/settings/customization/columns",
        label: "Columns",
        description:
          "Configure field metadata, labels, visibility, validation, and tenant-specific behavior.",
        icon: "columns-3",
        keywords: ["columns", "fields", "metadata"],
        requiredAnyPermissions: [
          NAV_PERMISSION_KEYS.CUSTOMIZATION_COLUMNS_READ,
          PERMISSION_KEYS.CUSTOMIZATION_ACCESS,
          NAV_PERMISSION_KEYS.SETTINGS_READ,
        ],
      },
      {
        key: "views",
        href: "/dashboard/settings/customization/views",
        label: "Views",
        description:
          "Manage saved views, filters, sorting, columns, and visibility scope.",
        icon: "layout-grid",
        keywords: ["views", "filters", "sorting", "saved views"],
        requiredAnyPermissions: [
          NAV_PERMISSION_KEYS.CUSTOMIZATION_VIEWS_READ,
          PERMISSION_KEYS.CUSTOMIZATION_ACCESS,
          NAV_PERMISSION_KEYS.SETTINGS_READ,
        ],
      },
      {
        key: "forms",
        href: "/dashboard/settings/customization/forms",
        label: "Forms",
        description:
          "Manage form metadata for main, create, edit, quick create, and detail layouts.",
        icon: "form-input",
        keywords: ["forms", "layouts", "fields"],
        requiredAnyPermissions: [
          NAV_PERMISSION_KEYS.CUSTOMIZATION_FORMS_READ,
          PERMISSION_KEYS.CUSTOMIZATION_ACCESS,
          NAV_PERMISSION_KEYS.SETTINGS_READ,
        ],
      },
    ],
  },
  {
    key: "apps",
    label: "Apps & Modules",
    summary:
      "Recruitment, desktop agent, feature access, and optional product modules.",
    icon: "app-window",
    items: [
      {
        key: "features",
        href: "/dashboard/settings/features",
        label: "Feature Access",
        shortLabel: "Features",
        description:
          "Enable or restrict modules and feature flags based on plan, tenant, and operations.",
        icon: "toggle-right",
        keywords: ["features", "modules", "feature flags", "enablement"],
        requiredAnyPermissions: [NAV_PERMISSION_KEYS.SETTINGS_READ],
      },
      {
        key: "recruitment",
        href: "/dashboard/settings/recruitment",
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
        href: "/dashboard/settings/desktop-agent",
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
        href: "/dashboard/settings/branding",
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
        href: "/dashboard/settings/system",
        label: "System Preferences",
        shortLabel: "Preferences",
        description:
          "Configure date formats, time formats, UI defaults, locale, and tenant-wide preferences.",
        icon: "settings-2",
        keywords: ["system", "preferences", "date format", "locale"],
        requiredAnyPermissions: [NAV_PERMISSION_KEYS.SETTINGS_READ],
      },
      {
        key: "theme",
        href: "/dashboard/settings/theme",
        label: "Theme & Colors",
        shortLabel: "Theme",
        description:
          "Configure primary, accent, surface, text, status colors, and light or dark mode defaults.",
        icon: "paintbrush",
        badge: "Preview",
        keywords: ["theme", "colors", "primary color", "dark mode"],
        requiredAnyPermissions: [NAV_PERMISSION_KEYS.SETTINGS_READ],
        disabled: true,
      },
      {
        key: "content",
        href: "/dashboard/settings/content",
        label: "Content & Labels",
        shortLabel: "Content",
        description:
          "Configure tenant wording, page copy, empty states, labels, and help text.",
        icon: "file-text",
        badge: "Preview",
        keywords: ["content", "labels", "copy", "help text"],
        requiredAnyPermissions: [NAV_PERMISSION_KEYS.SETTINGS_READ],
        disabled: true,
      },
      {
        key: "navigation",
        href: "/dashboard/settings/navigation",
        label: "Navigation & Menu",
        shortLabel: "Navigation",
        description:
          "Configure menu visibility, ordering, grouping, and role-based navigation behavior.",
        icon: "panel-left",
        badge: "Preview",
        keywords: ["navigation", "menu", "sidebar", "module visibility"],
        requiredAnyPermissions: [NAV_PERMISSION_KEYS.SETTINGS_READ],
        disabled: true,
      },
      {
        key: "dashboard",
        href: "/dashboard/settings/dashboard",
        label: "Dashboard Experience",
        shortLabel: "Dashboard",
        description:
          "Configure widgets, quick actions, banners, and role-based landing experiences.",
        icon: "monitor-smartphone",
        badge: "Preview",
        keywords: ["dashboard", "widgets", "quick actions", "landing page"],
        requiredAnyPermissions: [NAV_PERMISSION_KEYS.SETTINGS_READ],
        disabled: true,
      },
      {
        key: "templates",
        href: "/dashboard/settings/templates",
        label: "Templates",
        description:
          "Manage reusable templates for announcements, banners, onboarding cards, and page sections.",
        icon: "copy",
        badge: "Preview",
        keywords: ["templates", "banners", "announcements", "cards"],
        requiredAnyPermissions: [NAV_PERMISSION_KEYS.SETTINGS_READ],
        disabled: true,
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
        href: "/dashboard/settings/audit",
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
] as const satisfies readonly SettingsNavGroup[];

export function canViewSettingsItem(
  permissionKeys: readonly string[] = [],
  item: SettingsNavItem,
) {
  return canViewItem(permissionKeys, item.requiredAnyPermissions);
}

export function resolveVisibleSettingsGroups(
  permissionKeys: readonly string[] = [],
  options?: {
    includeRestricted?: boolean;
  },
) {
  return settingsNavGroups
    .map((group) => {
      const items = group.items.filter((item) => {
        if (options?.includeRestricted) return true;

        return canViewItem(permissionKeys, item.requiredAnyPermissions);
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
  },
): VisibleSettingsNavItem[] {
  return resolveVisibleSettingsGroups(permissionKeys, options).flatMap((group) =>
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