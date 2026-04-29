import { FEATURE_KEYS, PERMISSION_KEYS, ROLE_KEYS } from "@/lib/security-keys";
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
    requiredFeatureKey: FEATURE_KEYS.EMPLOYEES,
    requiresBusinessUnitScope: true,
    selfServiceHref: "/dashboard/profile",
    selfServiceLabel: "My Profile",
  },
  {
    href: "/dashboard/leave",
    label: "Leave",
    description: "Requests, approvals, and policy-driven workflows.",
    requiredFeatureKey: FEATURE_KEYS.LEAVE,
    requiresBusinessUnitScope: true,
    requiredAnyPermissions: [
      PERMISSION_KEYS.LEAVE_REQUESTS_READ,
      PERMISSION_KEYS.LEAVES_READ,
    ],
  },
  {
    href: "/dashboard/attendance",
    label: "Attendance",
    description: "Check-ins, daily entries, and team attendance visibility.",
    requiredFeatureKey: FEATURE_KEYS.ATTENDANCE,
    requiresBusinessUnitScope: true,
    requiredAnyPermissions: [PERMISSION_KEYS.ATTENDANCE_READ],
  },
  {
    href: "/dashboard/timesheets",
    label: "Timesheets",
    description: "Weekly work logs and manager approval flow.",
    requiredFeatureKey: FEATURE_KEYS.TIMESHEETS,
    requiresBusinessUnitScope: true,
    requiredAnyPermissions: [PERMISSION_KEYS.TIMESHEETS_READ],
  },
  {
    href: "/dashboard/projects",
    label: "Projects",
    description: "Project setup, staffing, and future utilization hooks.",
    requiredFeatureKey: FEATURE_KEYS.PROJECTS,
    requiresBusinessUnitScope: true,
    requiredAnyPermissions: [PERMISSION_KEYS.PROJECTS_READ],
  },
  {
    href: "/dashboard/reports",
    label: "Reports",
    description:
      "Practical tenant summaries across workforce, leave, attendance, and hiring.",
    hiddenForSelfService: true,
    requiresBusinessUnitScope: true,
    requiredAnyPermissions: [
      PERMISSION_KEYS.EMPLOYEES_READ_ALL,
      "reports.leave-requests.read",
      "reports.attendance.read",
      PERMISSION_KEYS.RECRUITMENT_READ,
    ],
  },
  {
    href: "/dashboard/payroll/cycles",
    label: "Payroll",
    description:
      "Payroll cycles, compensation setup, and draft payroll records.",
    hiddenForSelfService: true,
    requiredFeatureKey: FEATURE_KEYS.PAYROLL,
    requiresBusinessUnitScope: true,
    requiredAnyPermissions: [PERMISSION_KEYS.PAYROLL_READ],
  },
  {
    href: "/dashboard/recruitment",
    label: "Recruitment",
    description: "Job openings, candidates, and pipeline tracking.",
    hiddenForSelfService: true,
    requiredFeatureKey: FEATURE_KEYS.RECRUITMENT,
    requiresBusinessUnitScope: true,
    requiredAnyPermissions: [PERMISSION_KEYS.RECRUITMENT_READ],
  },
  {
    href: "/dashboard/onboarding",
    label: "Onboarding",
    description: "Template-driven new hire checklists and task progress.",
    hiddenForSelfService: true,
    requiredFeatureKey: FEATURE_KEYS.ONBOARDING,
    requiresBusinessUnitScope: true,
    requiredAnyPermissions: [PERMISSION_KEYS.ONBOARDING_READ],
  },
  {
    href: "/dashboard/customization",
    label: "Customization",
    description: "Metadata setup for tables, columns, views, and forms.",
    hiddenForSelfService: true,
    requiredAnyPermissions: [PERMISSION_KEYS.CUSTOMIZATION_READ],
  },
  {
    href: "/dashboard/settings",
    label: "Settings",
    description: "Tenant configuration, feature toggles, and shared master data.",
    hiddenForSelfService: true,
    requiredAnyPermissions: [PERMISSION_KEYS.SETTINGS_READ],
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
        input.permissionKeys.includes(PERMISSION_KEYS.EMPLOYEES_READ) ||
        input.permissionKeys.includes(PERMISSION_KEYS.EMPLOYEES_READ_ALL) ||
        (input.roleKeys ?? []).includes(ROLE_KEYS.SYSTEM_ADMIN);

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
