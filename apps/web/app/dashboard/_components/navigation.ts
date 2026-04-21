export type DashboardNavItem = {
  hiddenForSelfService?: boolean;
  href: string;
  label: string;
  requiredAnyPermissions?: string[];
  requiredFeatureKey?: string;
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
    selfServiceHref: "/dashboard/profile",
    selfServiceLabel: "My Profile",
  },
  {
    href: "/dashboard/leave",
    label: "Leave",
    description: "Requests, approvals, and policy-driven workflows.",
    requiredFeatureKey: "leave",
    requiredAnyPermissions: ["leave-requests.read", "leaves.read"],
  },
  {
    href: "/dashboard/attendance",
    label: "Attendance",
    description: "Check-ins, daily entries, and team attendance visibility.",
    requiredFeatureKey: "attendance",
    requiredAnyPermissions: ["attendance.read"],
  },
  {
    href: "/dashboard/timesheets",
    label: "Timesheets",
    description: "Weekly work logs and manager approval flow.",
    requiredFeatureKey: "timesheets",
    requiredAnyPermissions: ["timesheets.read"],
  },
  {
    href: "/dashboard/projects",
    label: "Projects",
    description: "Project setup, staffing, and future utilization hooks.",
    requiredFeatureKey: "projects",
    requiredAnyPermissions: ["projects.read"],
  },
  {
    href: "/dashboard/reports",
    label: "Reports",
    description:
      "Practical tenant summaries across workforce, leave, attendance, and hiring.",
    hiddenForSelfService: true,
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
    requiredAnyPermissions: ["payroll.read"],
  },
  {
    href: "/dashboard/recruitment",
    label: "Recruitment",
    description: "Job openings, candidates, and pipeline tracking.",
    hiddenForSelfService: true,
    requiredFeatureKey: "recruitment",
    requiredAnyPermissions: ["recruitment.read"],
  },
  {
    href: "/dashboard/onboarding",
    label: "Onboarding",
    description: "Template-driven new hire checklists and task progress.",
    hiddenForSelfService: true,
    requiredFeatureKey: "onboarding",
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
  enabledFeatureKeys: string[] | null;
  isReportingManager: boolean;
  isSelfService: boolean;
  permissionKeys: string[];
};

export function resolveVisibleDashboardNavItems(
  input: ResolveVisibleDashboardNavItemsInput,
) {
  return dashboardNavItems.flatMap((item) => {
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
        input.permissionKeys.includes("employees.read.all");

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
