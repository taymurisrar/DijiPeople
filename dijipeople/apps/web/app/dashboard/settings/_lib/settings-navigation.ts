import { hasAnyPermission } from "@/lib/permissions";

export type SettingsNavItem = {
  href: string;
  label: string;
  shortLabel?: string;
  description: string;
  badge?: string;
  icon?: string;
  keywords?: readonly string[];
  requiredAnyPermissions?: readonly string[];
};

export type SettingsNavGroup = {
  key: string;
  label: string;
  summary: string;
  icon?: string;
  items: readonly SettingsNavItem[];
};

function canViewItem(
  permissionKeys: string[],
  requiredAnyPermissions?: readonly string[],
) {
  if (!requiredAnyPermissions?.length) return true;
  return hasAnyPermission(permissionKeys, requiredAnyPermissions);
}

export const settingsNavGroups: readonly SettingsNavGroup[] = [
  {
    key: "organization",
    label: "Organization",
    summary:
      "Core company structure, identity, and workforce master data.",
    icon: "building-2",
    items: [
      {
        href: "/dashboard/settings/tenant",
        label: "Company Profile",
        shortLabel: "Profile",
        description:
          "Business identity, timezone, currency, and tenant-level basics.",
        icon: "building",
        keywords: ["company", "tenant", "timezone", "currency"],
        requiredAnyPermissions: ["settings.read"],
      },
      {
        href: "/dashboard/settings/locations",
        label: "Locations",
        description:
          "Office sites, address details, and location-level working context.",
        icon: "map-pinned",
        keywords: ["branches", "offices", "locations"],
        requiredAnyPermissions: ["locations.read"],
      },
      {
        href: "/dashboard/settings/departments",
        label: "Departments",
        description:
          "Department structure used across employees, approvals, and reporting.",
        icon: "network",
        keywords: ["departments", "teams"],
        requiredAnyPermissions: ["departments.read"],
      },
      {
        href: "/dashboard/settings/designations",
        label: "Designations",
        description:
          "Job titles, role levels, and designation master records.",
        icon: "badge-check",
        keywords: ["titles", "levels", "positions"],
        requiredAnyPermissions: ["designations.read"],
      },
    ],
  },
  {
    key: "people",
    label: "People",
    summary:
      "Employee defaults, workforce controls, and people-related operational rules.",
    icon: "users",
    items: [
      {
        href: "/dashboard/settings/employees",
        label: "Employee Settings",
        shortLabel: "Employees",
        description:
          "Employee codes, onboarding defaults, work modes, and reporting rules.",
        icon: "user-cog",
        keywords: ["employees", "employee code", "onboarding defaults"],
        requiredAnyPermissions: ["settings.read", "employees.read"],
      },
    ],
  },
  {
    key: "access-control",
    label: "Roles & Access",
    summary:
      "User access, role definitions, and permission visibility across the tenant.",
    icon: "shield-check",
    items: [
      {
        href: "/dashboard/settings/access/roles",
        label: "Roles",
        description:
          "Create and maintain tenant roles with grouped permissions.",
        icon: "shield",
        keywords: ["roles", "security roles"],
        requiredAnyPermissions: ["roles.read"],
      },
      {
        href: "/dashboard/settings/access/permissions",
        label: "Permissions",
        description:
          "Review the permission catalog by module and action.",
        icon: "key-round",
        keywords: ["permissions", "actions", "access matrix"],
        requiredAnyPermissions: ["permissions.read"],
      },
      {
        href: "/dashboard/settings/access/users",
        label: "Users & Access",
        shortLabel: "Users",
        description:
          "Manage tenant users, ownership, role assignment, and effective access.",
        icon: "user-lock",
        keywords: ["users", "access", "ownership"],
        requiredAnyPermissions: ["users.read"],
      },
    ],
  },
  {
    key: "time-leave",
    label: "Leave & Attendance",
    summary:
      "Policies and operational rules for time off, attendance, and timesheets.",
    icon: "calendar-clock",
    items: [
      {
        href: "/dashboard/settings/leave-types",
        label: "Leave Types",
        description:
          "Leave categories, paid or unpaid behavior, and request settings.",
        icon: "calendar-days",
        keywords: ["leave", "absence", "types"],
        requiredAnyPermissions: ["leave-types.read"],
      },
      {
        href: "/dashboard/settings/leave-policies",
        label: "Leave Policies",
        description:
          "Accruals, carry forward, eligibility, and supporting document rules.",
        icon: "file-check",
        keywords: ["policies", "accrual", "carry forward"],
        requiredAnyPermissions: ["leave-policies.read"],
      },
      {
        href: "/dashboard/settings/approval-matrices",
        label: "Approval Matrix",
        description:
          "Approval routing for leave and manager or HR decision flows.",
        icon: "git-branch",
        keywords: ["approvals", "routing", "matrix"],
        requiredAnyPermissions: ["leave-policies.read"],
      },
      {
        href: "/dashboard/settings/attendance",
        label: "Attendance & Timesheets",
        shortLabel: "Attendance",
        description:
          "Weekend rules, grace periods, shift schedules, and submission controls.",
        icon: "clock-3",
        keywords: ["attendance", "timesheets", "grace time", "schedule"],
        requiredAnyPermissions: [
          "settings.read",
          "attendance.read",
          "timesheets.read",
        ],
      },
    ],
  },
  {
    key: "payroll",
    label: "Payroll",
    summary:
      "Compensation defaults, payroll rules, and salary processing preferences.",
    icon: "wallet",
    items: [
      {
        href: "/dashboard/settings/payroll",
        label: "Payroll Settings",
        shortLabel: "Payroll",
        description:
          "Pay frequency, compensation defaults, and payroll preferences.",
        icon: "banknote",
        keywords: ["salary", "payroll", "pay frequency"],
        requiredAnyPermissions: ["settings.read", "payroll.read"],
      },
    ],
  },
  {
    key: "talent",
    label: "Recruitment & Onboarding",
    summary:
      "Hiring pipeline defaults, onboarding flow, and candidate conversion setup.",
    icon: "briefcase-business",
    items: [
      {
        href: "/dashboard/settings/recruitment",
        label: "Recruitment & Onboarding",
        shortLabel: "Recruitment",
        description:
          "Candidate stages, onboarding steps, and candidate-to-employee defaults.",
        icon: "user-plus",
        keywords: ["recruitment", "onboarding", "candidate stages"],
        requiredAnyPermissions: [
          "settings.read",
          "recruitment.read",
          "onboarding.read",
        ],
      },
    ],
  },
  {
    key: "documents",
    label: "Documents",
    summary:
      "Document categories, validation rules, and file governance settings.",
    icon: "folder-open",
    items: [
      {
        href: "/dashboard/settings/documents",
        label: "Document Rules",
        shortLabel: "Documents",
        description:
          "Document categories, storage rules, and file validation controls.",
        icon: "file-stack",
        keywords: ["documents", "files", "validation", "storage"],
        requiredAnyPermissions: ["settings.read", "documents.read"],
      },
    ],
  },
  {
    key: "notifications-branding",
    label: "Notifications & Branding",
    summary:
      "Communication defaults, email behavior, and tenant visual identity.",
    icon: "bell-ring",
    items: [
      {
        href: "/dashboard/settings/notifications",
        label: "Notifications",
        description:
          "Notification toggles, template behavior, and communication defaults.",
        icon: "bell",
        keywords: ["notifications", "email", "templates"],
        requiredAnyPermissions: ["settings.read"],
      },
      {
        href: "/dashboard/settings/branding",
        label: "Logo & Theme",
        shortLabel: "Branding",
        description:
          "Logo, theme, and portal identity details for the tenant.",
        icon: "palette",
        keywords: ["branding", "logo", "theme"],
        requiredAnyPermissions: ["settings.read"],
      },
    ],
  },
{
  key: "customizations",
  label: "Customizations",
  summary:
    "Manage tenant-specific views, branding, theme colors, labels, and configurable content across the platform.",
  icon: "palette",
  items: [
    {
      href: "/dashboard/settings/views",
      label: "Views",
      shortLabel: "Views",
      description:
        "Create and manage system and custom views for modules like dashboard, employees, leave, attendance, recruitment, and more.",
      icon: "layout-grid",
      keywords: [
        "views",
        "custom views",
        "system views",
        "filters",
        "columns",
        "sorting",
        "dashboard views",
        "module views",
      ],
      requiredAnyPermissions: ["settings.read"],
    },
    {
      href: "/dashboard/settings/branding",
      label: "Branding",
      shortLabel: "Branding",
      description:
        "Configure tenant identity including logo, company visuals, platform name, favicon, and portal branding assets.",
      icon: "badge-check",
      keywords: [
        "branding",
        "logo",
        "identity",
        "portal name",
        "favicon",
        "company profile",
      ],
      requiredAnyPermissions: ["settings.read"],
    },
    {
      href: "/dashboard/settings/theme",
      label: "Theme & Colors",
      shortLabel: "Theme",
      description:
        "Define primary, accent, surface, text, and status colors to match the tenant’s visual identity across the platform.",
      icon: "palette",
      keywords: [
        "theme",
        "colors",
        "primary color",
        "accent color",
        "ui theme",
        "dark mode",
        "light mode",
      ],
      requiredAnyPermissions: ["settings.read"],
    },
    {
      href: "/dashboard/settings/content",
      label: "Content & Labels",
      shortLabel: "Content",
      description:
        "Control tenant-specific wording, page copy, welcome content, empty states, help text, and configurable labels shown in the app.",
      icon: "file-text",
      keywords: [
        "content",
        "labels",
        "copy",
        "text",
        "wording",
        "empty states",
        "help text",
        "portal content",
      ],
      requiredAnyPermissions: ["settings.read"],
    },
    {
      href: "/dashboard/settings/navigation",
      label: "Navigation & Menu",
      shortLabel: "Navigation",
      description:
        "Configure menu visibility, grouping, ordering, and tenant-specific navigation experience for different roles or modules.",
      icon: "panel-left",
      keywords: [
        "navigation",
        "menu",
        "sidebar",
        "menu order",
        "role navigation",
        "module visibility",
      ],
      requiredAnyPermissions: ["settings.read"],
    },
    {
      href: "/dashboard/settings/dashboard",
      label: "Dashboard Experience",
      shortLabel: "Dashboard",
      description:
        "Configure dashboard widgets, default views, quick actions, banners, and role-based landing experience for users.",
      icon: "monitor-smartphone",
      keywords: [
        "dashboard",
        "widgets",
        "landing page",
        "default dashboard",
        "quick actions",
        "role-based dashboard",
      ],
      requiredAnyPermissions: ["settings.read"],
    },
    {
      href: "/dashboard/settings/templates",
      label: "Templates",
      shortLabel: "Templates",
      description:
        "Manage reusable UI and content templates such as announcements, onboarding cards, banners, and tenant-specific page sections.",
      icon: "copy",
      keywords: [
        "templates",
        "cards",
        "banners",
        "announcements",
        "reusable content",
        "ui templates",
      ],
      requiredAnyPermissions: ["settings.read"],
    },
  ],
},
  {
    key: "system",
    label: "System & Audit",
    summary:
      "Tenant-wide preferences, feature access, and change visibility.",
    icon: "settings-2",
    items: [
      {
        href: "/dashboard/settings/system",
        label: "System Preferences",
        shortLabel: "Preferences",
        description:
          "Date formats, time formats, UI defaults, and tenant-wide preferences.",
        icon: "sliders-horizontal",
        keywords: ["preferences", "date format", "ui defaults"],
        requiredAnyPermissions: ["settings.read"],
      },
      {
        href: "/dashboard/settings/features",
        label: "Feature Access",
        shortLabel: "Features",
        description:
          "Enable or restrict tenant features based on plan and operations.",
        icon: "toggle-right",
        keywords: ["features", "modules", "enablement"],
        requiredAnyPermissions: ["settings.read"],
      },
      {
        href: "/dashboard/settings/audit",
        label: "Audit Logs",
        shortLabel: "Audit",
        description:
          "Review critical setting changes, role changes, and audit events.",
        icon: "history",
        keywords: ["audit", "logs", "history"],
        requiredAnyPermissions: ["audit.read"],
      },
    ],
  },
] as const;

export function resolveVisibleSettingsGroups(permissionKeys: string[]) {
  return settingsNavGroups
    .map((group) => {
      const visibleItems = group.items.filter((item) =>
        canViewItem(permissionKeys, item.requiredAnyPermissions),
      );

      return {
        ...group,
        items: visibleItems,
      };
    })
    .filter((group) => group.items.length > 0);
}

export function findSettingsItemByPath(pathname: string) {
  for (const group of settingsNavGroups) {
    for (const item of group.items) {
      if (pathname === item.href || pathname.startsWith(`${item.href}/`)) {
        return { group, item };
      }
    }
  }

  return null;
}

export function flattenVisibleSettingsItems(permissionKeys: string[]) {
  return resolveVisibleSettingsGroups(permissionKeys).flatMap((group) =>
    group.items.map((item) => ({
      ...item,
      groupKey: group.key,
      groupLabel: group.label,
      groupSummary: group.summary,
    })),
  );
}