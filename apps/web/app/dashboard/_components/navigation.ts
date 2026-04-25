import { BusinessUnitAccessSummary } from "../_lib/business-unit-access";

export type DashboardNavItem = {
  hiddenForSelfService?: boolean;
  href: string;
  label: string;
  requiredAnyPermissions?: string[];
  requiredFeatureKey?: string;
  requiresBusinessUnitScope?: boolean;
  selfServiceHref?: string;
  selfServiceLabel?: string;
  description: string;
};

export const dashboardNavItems: DashboardNavItem[] = [
  {
    href: "/dashboard",
    label: "Overview",
    description: "Platform summary and workspace status.",
  },
  {
    href: "/dashboard/employees",
    label: "Employees",
    description: "Ready for employee records and org data.",
    requiredFeatureKey: "employees",
    requiresBusinessUnitScope: true,
    selfServiceHref: "/dashboard/profile",
    selfServiceLabel: "My Profile",
  },
  {
    href: "/dashboard/leave",
    label: "Leave",
    description: "Requests, approvals, and policy-driven workflows.",
    requiredFeatureKey: "leave",
    requiresBusinessUnitScope: true,
    requiredAnyPermissions: ["leave-requests.read", "leaves.read"],
  },
  {
    href: "/dashboard/attendance",
    label: "Attendance",
    description: "Check-ins, daily entries, and team attendance visibility.",
    requiredFeatureKey: "attendance",
    requiresBusinessUnitScope: true,
    requiredAnyPermissions: ["attendance.read"],
  },
  {
    href: "/dashboard/timesheets",
    label: "Timesheets",
    description: "Weekly work logs and manager approval flow.",
    requiredFeatureKey: "timesheets",
    requiresBusinessUnitScope: true,
    requiredAnyPermissions: ["timesheets.read"],
  },
  {
    href: "/dashboard/projects",
    label: "Projects",
    description: "Project setup, staffing, and future utilization hooks.",
    requiredFeatureKey: "projects",
    requiresBusinessUnitScope: true,
    requiredAnyPermissions: ["projects.read"],
  },
  {
    href: "/dashboard/reports",
    label: "Reports",
    description:
      "Practical tenant summaries across workforce, leave, attendance, and hiring.",
    hiddenForSelfService: true,
    requiresBusinessUnitScope: true,
    requiredAnyPermissions: [
      "employees.read.all",
      "reports.leave-requests.read",
      "reports.attendance.read",
      "recruitment.read",
    ],
  },
  {
    href: "/dashboard/payroll/cycles",
    label: "Payroll",
    description:
      "Payroll cycles, compensation setup, and draft payroll records.",
    hiddenForSelfService: true,
    requiredFeatureKey: "payroll",
    requiresBusinessUnitScope: true,
    requiredAnyPermissions: ["payroll.read"],
  },
  {
    href: "/dashboard/recruitment",
    label: "Recruitment",
    description: "Job openings, candidates, and pipeline tracking.",
    hiddenForSelfService: true,
    requiredFeatureKey: "recruitment",
    requiresBusinessUnitScope: true,
    requiredAnyPermissions: ["recruitment.read"],
  },
  {
    href: "/dashboard/onboarding",
    label: "Onboarding",
    description: "Template-driven new hire checklists and task progress.",
    hiddenForSelfService: true,
    requiredFeatureKey: "onboarding",
    requiresBusinessUnitScope: true,
    requiredAnyPermissions: ["onboarding.read"],
  },
  {
    href: "/dashboard/settings",
    label: "Settings",
    description: "Tenant configuration, feature toggles, and shared master data.",
    hiddenForSelfService: true,
    requiredAnyPermissions: ["settings.read"],
  },
];

type ResolveVisibleDashboardNavItemsInput = {
  businessUnitAccess?: BusinessUnitAccessSummary | null;
  enabledFeatureKeys: string[] | null;
  isReportingManager: boolean;
  isSelfService: boolean;
  permissionKeys: string[];
  roleKeys?: string[];
};

export function resolveVisibleDashboardNavItems(
  input: ResolveVisibleDashboardNavItemsInput,
) {
  return dashboardNavItems.flatMap((item) => {
    if (
      item.requiresBusinessUnitScope &&
      (input.businessUnitAccess?.accessibleBusinessUnitIds.length ?? 0) === 0
    ) {
      return [];
    }

    const hasRequiredFeature =
      !item.requiredFeatureKey ||
      !input.enabledFeatureKeys ||
      input.enabledFeatureKeys.includes(item.requiredFeatureKey);

    if (!hasRequiredFeature) {
      return [];
    }

    const isEmployeesItem = item.href === "/dashboard/employees";

    if (isEmployeesItem) {
      const canReadEmployees =
        input.permissionKeys.includes("employees.read") ||
        input.permissionKeys.includes("employees.read.all") ||
        (input.roleKeys ?? []).includes("system-admin");

      if (input.isSelfService && !input.isReportingManager) {
        return [
          {
            ...item,
            href: item.selfServiceHref ?? "/dashboard/profile",
            label: item.selfServiceLabel ?? "My Profile",
          },
        ];
      }

      if (input.isReportingManager || canReadEmployees) {
        return [item];
      }

      return [];
    }

    if (item.hiddenForSelfService && input.isSelfService) {
      return [];
    }

    const hasRequiredPermission =
      !item.requiredAnyPermissions?.length ||
      item.requiredAnyPermissions.some((permissionKey) =>
        input.permissionKeys.includes(permissionKey),
      );

    if (!hasRequiredPermission) {
      return [];
    }

    return [item];
  });
}
