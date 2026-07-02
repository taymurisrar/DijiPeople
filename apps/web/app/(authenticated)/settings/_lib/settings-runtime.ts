import {
  canViewSettingsItem,
  flattenSettingsItems,
  type SettingsNavItem,
  type VisibleSettingsNavItem,
} from "./settings-navigation";
import { getSettingsAdapter } from "./settings-adapter-registry";

export type SettingsRuntimeAction =
  | "new"
  | "edit"
  | "delete"
  | "refresh"
  | "import"
  | "export"
  | "export-template"
  | "save"
  | "save-close"
  | "back";

export type SettingsRuntimeItem = SettingsNavItem & {
  category: string;
  categoryLabel: string;
  group: string;
  groupLabel: string;
  route: string;
  conciseRoute: string;
  legacyRoute: string;
  dataSource: { adapterKey: string; endpoint?: string };
  listView: { enabled: boolean; viewKey: string };
  form: { enabled: boolean; formKey: string };
  actions: readonly SettingsRuntimeAction[];
  transfer: { import: boolean; export: boolean; exportTemplate: boolean };
  timeline: boolean;
};

export type SettingsRuntimeGroup = {
  key: string;
  label: string;
  description: string;
  route: string;
  items: readonly SettingsRuntimeItem[];
};

export type SettingsRuntimeCategory = {
  key: string;
  label: string;
  description: string;
  route: string;
  groups: readonly SettingsRuntimeGroup[];
};

const categoryDefinitions = {
  "general-setup": [
    "General Setup",
    "Tenant identity, organization structure, defaults, and optional product modules.",
  ],
  regional: [
    "Regional Operations",
    "Countries, calendars, currencies, regions, and localization behavior.",
  ],
  "security-access": [
    "Security & Access",
    "Users, roles, permissions, teams, and access governance.",
  ],
  people: [
    "People Configuration",
    "Employee defaults, work configuration, attendance, leave, and documents.",
  ],
  payroll: [
    "Payroll & Finance",
    "Payroll, compensation, claims, tax, benefits, and accounting configuration.",
  ],
  approvals: [
    "Approvals & Workflows",
    "Reusable approval matrices, policies, delegation, and workflow routing.",
  ],
  notifications: [
    "Notifications & Communication",
    "Notification rules, providers, templates, and delivery history.",
  ],
  customization: [
    "Customization",
    "Packages, modules, fields, forms, views, and publishing.",
  ],
  appearance: [
    "Appearance & Experience",
    "Branding, theme, typography, density, and workspace presentation.",
  ],
  "audit-compliance": [
    "Audit & Compliance",
    "Change history, access evidence, retention, and compliance exports.",
  ],
} as const;

const itemPlacement: Record<
  string,
  readonly [keyof typeof categoryDefinitions, string, string]
> = {
  tenant: ["general-setup", "tenant", "Tenant & Company"],
  organizations: ["general-setup", "organization", "Organization Structure"],
  "business-units": ["general-setup", "organization", "Organization Structure"],
  departments: ["general-setup", "organization", "Organization Structure"],
  designations: ["people", "workforce", "Workforce Structure"],
  locations: ["people", "work-management", "Work Management"],
  "work-calendars": ["people", "work-management", "Work Management"],
  "holiday-calendars": ["people", "work-management", "Work Management"],
  shifts: ["people", "work-management", "Work Management"],
  "work-schedules": ["people", "work-management", "Work Management"],
  attendance: ["people", "attendance", "Attendance & Time"],
  "employee-settings": ["people", "workforce", "Workforce Structure"],
  "employee-levels": ["people", "workforce", "Workforce Structure"],
  documents: ["people", "documents", "Document Rules"],
  "leave-types": ["people", "leave", "Leave Configuration"],
  "leave-policies": ["people", "leave", "Leave Configuration"],
  "payroll-regions": ["regional", "payroll-geography", "Payroll Geography"],
  "exchange-rates": ["regional", "currency", "Currency & Exchange"],
  countries: ["regional", "geography", "Countries & Regions"],
  regions: ["regional", "geography", "Countries & Regions"],
  timezones: ["regional", "localization", "Localization"],
  currencies: ["regional", "currency", "Currency & Exchange"],
  "fiscal-years": ["regional", "business-calendar", "Business Calendar"],
  "business-date-rules": ["regional", "business-calendar", "Business Calendar"],
  users: ["security-access", "identities", "Identity Management"],
  roles: ["security-access", "authorization", "Authorization"],
  permissions: ["security-access", "authorization", "Authorization"],
  teams: ["security-access", "authorization", "Authorization"],
  "field-security": ["security-access", "governance", "Security Governance"],
  "password-login-policies": [
    "security-access",
    "governance",
    "Security Governance",
  ],
  "login-history": ["security-access", "governance", "Security Governance"],
  "access-center": ["security-access", "authorization", "Authorization"],
  "approval-matrices": ["approvals", "routing", "Approval Routing"],
  "delegation-rules": ["approvals", "routing", "Approval Routing"],
  "escalation-rules": ["approvals", "routing", "Approval Routing"],
  "workflow-templates": ["approvals", "templates", "Workflow Templates"],
  "policy-engine": ["approvals", "policies", "Policy Engine"],
  "payroll-periods": ["payroll", "cycles", "Payroll Cycles"],
  "salary-package-rules": ["payroll", "configuration", "Payroll Configuration"],
  "benefit-policies": ["payroll", "benefits", "Benefits"],
  "loan-policies": ["payroll", "loans", "Loans"],
  banks: ["payroll", "banking", "Banking"],
  notifications: ["notifications", "rules", "Notification Rules"],
  "notification-email-templates": ["notifications", "templates", "Templates"],
  "notification-email-providers": ["notifications", "providers", "Providers"],
  "notification-email-logs": ["notifications", "delivery", "Delivery History"],
  branding: ["appearance", "branding", "Branding & Theme"],
  "system-preferences": ["appearance", "experience", "Workspace Experience"],
  "audit-logs": ["audit-compliance", "history", "Audit History"],
  "retention-rules": [
    "audit-compliance",
    "retention",
    "Retention & Compliance",
  ],
  "data-access-history": ["audit-compliance", "history", "Audit History"],
  "compliance-exports": [
    "audit-compliance",
    "retention",
    "Retention & Compliance",
  ],
  tables: ["customization", "metadata", "Runtime Metadata"],
  fields: ["customization", "metadata", "Runtime Metadata"],
  forms: ["customization", "designers", "Designers"],
  views: ["customization", "designers", "Designers"],
  "action-bars": ["customization", "components", "Runtime Components"],
  widgets: ["customization", "components", "Runtime Components"],
  rules: ["customization", "components", "Runtime Components"],
  packages: ["customization", "packages", "Packages"],
  "publish-center": ["customization", "publishing", "Publishing"],
  features: ["general-setup", "modules", "Apps & Modules"],
  recruitment: ["general-setup", "modules", "Apps & Modules"],
  "desktop-agent": ["general-setup", "modules", "Apps & Modules"],
};

const routeKeys: Record<string, string> = {
  tenant: "tenant-profile",
  locations: "work-sites",
  "holiday-calendars": "holiday-calendars",
  "payroll-settings": "payroll-settings",
  "notification-email-templates": "templates",
  "notification-email-providers": "providers",
  "notification-email-logs": "delivery-logs",
  "audit-logs": "audit-events",
  tables: "modules",
  notifications: "rules",
};

const implementationRoutes: Record<string, string> = {
  "payroll-settings": "/settings/payroll/payroll-settings",
  notifications: "/settings/notifications/rules",
};

const timelineItems = new Set([
  "users",
  "roles",
  "approval-matrices",
  "audit-logs",
]);

function defaultPlacement(item: {
  key: string;
  groupKey: string;
  groupLabel: string;
}) {
  if (item.groupKey === "payroll")
    return ["payroll", "configuration", "Payroll Configuration"] as const;
  if (item.groupKey === "customization")
    return ["customization", "metadata", "Runtime Metadata"] as const;
  if (item.groupKey === "appearance")
    return ["appearance", "experience", "Workspace Experience"] as const;
  if (item.groupKey === "audit")
    return ["audit-compliance", "history", "Audit History"] as const;
  return ["general-setup", item.groupKey, item.groupLabel] as const;
}

const supplementalSettingsItems = [
  supplementalItem(
    "countries",
    "Countries",
    "Maintain the country catalog used by regional and employee configuration.",
    "globe-2",
  ),
  supplementalItem(
    "regions",
    "Regions",
    "Maintain reusable country-region configuration records.",
    "map-pinned",
  ),
  supplementalItem(
    "timezones",
    "Timezones",
    "Review supported tenant and work-location timezones.",
    "clock-3",
  ),
  supplementalItem(
    "currencies",
    "Currencies",
    "Review supported payroll and reporting currencies.",
    "banknote",
  ),
  supplementalItem(
    "fiscal-years",
    "Fiscal Years",
    "Configure effective fiscal-year boundaries.",
    "calendar-days",
  ),
  supplementalItem(
    "business-date-rules",
    "Business Date Rules",
    "Configure tenant business-date rollover and processing rules.",
    "calendar-clock",
  ),
  supplementalItem(
    "field-security",
    "Field Security",
    "Configure reusable field visibility and masking policies.",
    "shield-check",
  ),
  supplementalItem(
    "password-login-policies",
    "Password & Login Policies",
    "Configure password, session, and login governance rules.",
    "lock-keyhole",
  ),
  supplementalItem(
    "login-history",
    "Login History",
    "Review authentication activity and login outcomes.",
    "history",
  ),
  supplementalItem(
    "payroll-periods",
    "Payroll Periods",
    "Manage payroll processing periods and cutoff dates.",
    "calendar-days",
  ),
  supplementalItem(
    "salary-package-rules",
    "Salary Package Rules",
    "Configure reusable salary-package constraints and defaults.",
    "wallet",
  ),
  supplementalItem(
    "work-schedules",
    "Work Schedules",
    "Configure effective weekly Shift patterns and off days.",
    "calendar-clock",
  ),
  supplementalItem(
    "benefit-policies",
    "Benefit Policies",
    "Configure eligibility, payroll, tax, visibility, renewal, and approval behavior.",
    "badge-check",
    ["benefits.read", "benefits.manage"],
  ),
  supplementalItem(
    "loan-policies",
    "Loan Policies",
    "Configure loan limits, installments, interest, and settlement behavior.",
    "landmark",
    ["loans.read-all", "loans.create"],
  ),
  supplementalItem(
    "banks",
    "Banks",
    "Maintain the tenant bank lookup used by protected employee payroll accounts.",
    "building",
    ["employee-bank-accounts.read", "employee-bank-accounts.manage"],
  ),
  supplementalItem(
    "delegation-rules",
    "Delegation Rules",
    "Configure effective-dated approval delegation.",
    "user-cog",
  ),
  supplementalItem(
    "escalation-rules",
    "Escalation Rules",
    "Configure workflow escalation thresholds and targets.",
    "workflow",
  ),
  supplementalItem(
    "workflow-templates",
    "Workflow Templates",
    "Configure reusable workflow definitions.",
    "file-cog",
  ),
  supplementalItem(
    "retention-rules",
    "Retention Rules",
    "Configure effective retention and archival policies.",
    "history",
  ),
  supplementalItem(
    "fields",
    "Fields",
    "Design reusable module field metadata.",
    "columns-3",
    ["customization.columns.read", "customization.read"],
  ),
  supplementalItem(
    "forms",
    "Forms",
    "Design module forms and layouts.",
    "form-input",
    ["customization.forms.read", "customization.read"],
  ),
  supplementalItem(
    "views",
    "Views",
    "Design module list views and filters.",
    "layout-grid",
    ["customization.views.read", "customization.read"],
  ),
  supplementalItem(
    "action-bars",
    "Action Bars",
    "Manage runtime Action Bar metadata.",
    "list-tree",
    ["customization.read"],
  ),
  supplementalItem(
    "widgets",
    "Widgets",
    "Manage supported runtime Widget metadata.",
    "app-window",
    ["customization.read"],
  ),
  supplementalItem(
    "rules",
    "Rules",
    "Manage reusable runtime Rules.",
    "workflow",
    ["customization.read"],
  ),
  supplementalItem(
    "data-access-history",
    "Data Access History",
    "Review audited access to protected records.",
    "shield",
  ),
  supplementalItem(
    "compliance-exports",
    "Compliance Exports",
    "Prepare governed compliance export packages.",
    "file-stack",
  ),
] as const;

export const settingsRuntimeItems: readonly SettingsRuntimeItem[] = [
  ...flattenSettingsItems().filter((item) => item.key !== "access-center"),
  ...supplementalSettingsItems,
].map((item) => {
  const [category, group, groupLabel] =
    itemPlacement[item.key] ?? defaultPlacement(item);
  const [categoryLabel] = categoryDefinitions[category];
  const itemRouteKey = routeKeys[item.key] ?? item.key;
  const conciseRoute = `/settings/${category}/${itemRouteKey}`;
  const route = `/settings/${category}/${group}/${itemRouteKey}`;
  const adapter = getSettingsAdapter(item.key);
  const isReadOnly = adapter?.mode === "read-only";
  const isSpecialized = adapter?.mode === "specialized";
  const transfer = adapter?.transfer ?? {
    import: false,
    export: false,
    exportTemplate: false,
  };
  const supportsCreate = adapter?.routes.create ?? false;
  const supportsEdit = adapter?.routes.edit ?? false;
  const supportsDelete =
    adapter?.mode === "crud" &&
    adapter.softDelete &&
    Boolean(adapter.spec.permissions?.delete);

  return {
    ...item,
    category,
    categoryLabel,
    group,
    groupLabel,
    route,
    conciseRoute,
    legacyRoute: implementationRoutes[item.key] ?? item.href,
    dataSource: {
      adapterKey: adapter?.spec.moduleKey ?? `settings.${item.key}`,
      endpoint: adapter?.serverApiPath,
    },
    listView: {
      enabled: adapter?.mode !== "record",
      viewKey: `${item.key}.active`,
    },
    form: { enabled: !isSpecialized, formKey: `${item.key}.main` },
    actions: [
      ...(supportsCreate ? (["new"] as const) : []),
      ...(supportsEdit ? (["edit"] as const) : []),
      ...(supportsDelete ? (["delete"] as const) : []),
      "refresh",
      ...(transfer.import ? (["import"] as const) : []),
      ...(transfer.export ? (["export"] as const) : []),
      ...(transfer.exportTemplate ? (["export-template"] as const) : []),
      ...(!isReadOnly && !isSpecialized && supportsEdit
        ? (["save", "save-close"] as const)
        : []),
      "back",
    ],
    transfer,
    timeline: adapter?.timeline ?? timelineItems.has(item.key),
  };
});

const missingAdapterKeys = settingsRuntimeItems
  .filter((item) => !getSettingsAdapter(item.key))
  .map((item) => item.key);
if (missingAdapterKeys.length) {
  throw new Error(
    `Settings IA items missing runtime adapters: ${missingAdapterKeys.join(", ")}`,
  );
}

function supplementalItem(
  key: string,
  label: string,
  description: string,
  icon: string,
  requiredAnyPermissions: readonly string[] = ["settings.read"],
): VisibleSettingsNavItem {
  return {
    key,
    href: `/settings/${key}`,
    label,
    description,
    icon,
    keywords: [label.toLowerCase(), key],
    requiredAnyPermissions,
    groupKey: "runtime",
    groupLabel: "Settings Runtime",
    groupSummary: "Metadata-backed settings.",
  };
}

export const settingsRuntimeCategories: readonly SettingsRuntimeCategory[] =
  Object.entries(categoryDefinitions).map(
    ([categoryKey, [label, description]]) => {
      const categoryItems = settingsRuntimeItems.filter(
        (item) => item.category === categoryKey,
      );
      const groupKeys = [...new Set(categoryItems.map((item) => item.group))];
      return {
        key: categoryKey,
        label,
        description,
        route: `/settings/${categoryKey}`,
        groups: groupKeys.map((groupKey) => ({
          key: groupKey,
          label:
            categoryItems.find((item) => item.group === groupKey)?.groupLabel ??
            groupKey,
          description: `Manage ${categoryItems
            .filter((item) => item.group === groupKey)
            .map((item) => item.label)
            .join(", ")}.`,
          route: `/settings/${categoryKey}/${groupKey}`,
          items: categoryItems.filter((item) => item.group === groupKey),
        })),
      };
    },
  );

export function getSettingsRuntimeCategory(key: string) {
  return (
    settingsRuntimeCategories.find((category) => category.key === key) ?? null
  );
}

export function getSettingsRuntimeGroup(categoryKey: string, groupKey: string) {
  return (
    getSettingsRuntimeCategory(categoryKey)?.groups.find(
      (group) => group.key === groupKey,
    ) ?? null
  );
}

export function getSettingsRuntimeItem(categoryKey: string, itemKey: string) {
  return (
    settingsRuntimeItems.find(
      (item) =>
        item.category === categoryKey &&
        (item.key === itemKey || routeKeys[item.key] === itemKey),
    ) ?? null
  );
}

export function getSettingsRuntimeItemByPath(pathname: string) {
  const normalized = pathname.split(/[?#]/)[0]?.replace(/\/+$/, "") || "/";
  return (
    [...settingsRuntimeItems]
      .sort((a, b) => b.route.length - a.route.length)
      .find(
        (item) =>
          normalized === item.route ||
          normalized.startsWith(`${item.route}/`) ||
          normalized === item.conciseRoute ||
          normalized.startsWith(`${item.conciseRoute}/`) ||
          normalized === item.legacyRoute ||
          normalized.startsWith(`${item.legacyRoute}/`),
      ) ?? null
  );
}

export function resolveVisibleSettingsRuntime(
  permissionKeys: readonly string[],
  roleKeys: readonly string[],
) {
  return settingsRuntimeCategories
    .map((category) => ({
      ...category,
      groups: category.groups
        .map((group) => ({
          ...group,
          items: group.items.filter((item) =>
            canViewSettingsItem(permissionKeys, roleKeys, item),
          ),
        }))
        .filter((group) => group.items.length > 0),
    }))
    .filter((category) => category.groups.length > 0);
}
