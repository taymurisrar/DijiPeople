import { FEATURE_KEYS, PERMISSION_KEYS, ROLE_KEYS } from "@/lib/security-keys";
import {
  isVisibleByRules,
  type VisibilityRule,
} from "@/lib/runtime/visibility.resolver";
import type { VisibilityPlacement } from "@/lib/runtime/visibility-placement";
import { BusinessUnitAccessSummary } from "../_lib/business-unit-access";

export type DashboardNavItem = {
  hiddenForSelfService?: boolean;
  /*
   * The same declarative rules used on tabs, form sections, settings nav and
   * commands, so hiding a sidebar entry from a role, team, department,
   * business unit, organization or designation is written the same way here as
   * anywhere else.
   */
  visibilityRules?: readonly VisibilityRule[];
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
    href: "/",
    label: "Overview",
    description: "Platform summary and workspace status.",
  },
  {
    href: "/employees",
    label: "Employees",
    description: "Ready for employee records and org data.",
    requiredFeatureKey: FEATURE_KEYS.EMPLOYEES,
    requiresBusinessUnitScope: true,
    selfServiceHref: "/my-profile",
    selfServiceLabel: "My Profile",
  },
  {
    href: "/leaves",
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
    href: "/attendance",
    label: "Attendance",
    description: "Check-ins, daily entries, and team attendance visibility.",
    requiredFeatureKey: FEATURE_KEYS.ATTENDANCE,
    requiresBusinessUnitScope: true,
    requiredAnyPermissions: [PERMISSION_KEYS.ATTENDANCE_READ],
  },
  {
    href: "/timesheets",
    label: "Timesheets",
    description: "Weekly work logs and manager approval flow.",
    requiredFeatureKey: FEATURE_KEYS.TIMESHEETS,
    requiresBusinessUnitScope: true,
    requiredAnyPermissions: [PERMISSION_KEYS.TIMESHEETS_READ],
  },
  {
    href: "/projects",
    label: "Projects",
    description: "Project setup, staffing, and future utilization hooks.",
    requiredFeatureKey: FEATURE_KEYS.PROJECTS,
    requiresBusinessUnitScope: true,
    requiredAnyPermissions: [PERMISSION_KEYS.PROJECTS_READ],
  },
  {
    href: "/approvals",
    label: "Approvals",
    description: "Approval requests, step progress, and audit history.",
    requiredAnyPermissions: [
      PERMISSION_KEYS.APPROVALS_READ,
      PERMISSION_KEYS.APPROVALS_READ_OWN,
      PERMISSION_KEYS.APPROVALS_READ_ASSIGNED,
      PERMISSION_KEYS.APPROVALS_READ_TEAM,
      PERMISSION_KEYS.APPROVALS_MANAGE,
    ],
  },
  {
    href: "/customers",
    label: "Customers",
    description: "Client accounts and related delivery projects.",
    requiredFeatureKey: FEATURE_KEYS.PROJECTS,
    requiresBusinessUnitScope: true,
    requiredAnyPermissions: [PERMISSION_KEYS.CUSTOMERS_READ],
  },
  {
    href: "/reports",
    label: "Reports & Analytics",
    description:
      "Period-scoped, comparative analysis across workforce, attendance, leave, hiring and desktop activity, with a report library and builder.",
    hiddenForSelfService: true,
    requiresBusinessUnitScope: true,
    /*
     * `reports.read` is the key that actually gates the workspace — the API
     * requires it on every `/reporting` handler, so without it every page in
     * here renders an access-denied state.
     *
     * The four keys beneath it are kept because this entry predates the
     * reporting module and some roles were provisioned against them; removing
     * them would take the sidebar entry away from those roles in the same
     * release that gave them somewhere better to go. They are additive: this is
     * `requiredAnyPermissions`, and the API still refuses a caller who reaches
     * the page without `reports.read`. Navigation visibility is a usability
     * affordance, never a security control.
     */
    requiredAnyPermissions: [
      PERMISSION_KEYS.REPORTS_READ,
      PERMISSION_KEYS.EMPLOYEES_READ_ALL,
      "reports.leave-requests.read",
      "reports.attendance.read",
      PERMISSION_KEYS.RECRUITMENT_READ,
    ],
  },
  {
    href: "/payroll/cycles",
    label: "Payroll",
    description:
      "Payroll cycles, compensation setup, and draft payroll records.",
    hiddenForSelfService: true,
    requiredFeatureKey: FEATURE_KEYS.PAYROLL,
    requiresBusinessUnitScope: true,
    requiredAnyPermissions: [PERMISSION_KEYS.PAYROLL_READ],
  },
  {
    href: "/recruitment",
    label: "Recruitment",
    description: "Job openings, candidates, and pipeline tracking.",
    hiddenForSelfService: true,
    requiredFeatureKey: FEATURE_KEYS.RECRUITMENT,
    requiresBusinessUnitScope: true,
    requiredAnyPermissions: [PERMISSION_KEYS.RECRUITMENT_READ],
  },
  {
    href: "/onboarding",
    label: "Onboarding",
    description: "Template-driven new hire checklists and task progress.",
    hiddenForSelfService: true,
    requiredFeatureKey: FEATURE_KEYS.ONBOARDING,
    requiresBusinessUnitScope: true,
    requiredAnyPermissions: [PERMISSION_KEYS.ONBOARDING_READ],
  },
  {
    href: "/settings",
    label: "Settings",
    description: "Tenant configuration, feature toggles, and shared master data.",
    hiddenForSelfService: true,
    requiredAnyPermissions: [PERMISSION_KEYS.SETTINGS_READ],
  },
];

/**
 * A tenant's saved change to one entry, keyed by that entry's href.
 *
 * Only the properties a tenant actually changed are present; anything absent
 * keeps the code default, which is what lets a new module ship to every tenant
 * without a customization step.
 */
export type DashboardNavOverride = {
  itemKey: string;
  isHidden?: boolean;
  label?: string | null;
  sortOrder?: number | null;
  visibilityRules?: readonly VisibilityRule[] | null;
};

type ResolveVisibleDashboardNavItemsInput = {
  businessUnitAccess?: BusinessUnitAccessSummary | null;
  enabledFeatureKeys: string[] | null;
  isReportingManager: boolean;
  isSelfService: boolean;
  permissionKeys: string[];
  roleKeys?: string[];
  overrides?: readonly DashboardNavOverride[] | null;
  /*
   * Where the viewer sits in the organization, for the in-team /
   * in-department / in-business-unit style rules. Without it those operators
   * have nothing to match against and fail closed, which reads as "the rule
   * hides this from everyone" rather than "the app never told the rule who
   * the viewer is".
   */
  placement?: VisibilityPlacement | null;
};

/**
 * Lays a tenant's overrides over the code-defined list.
 *
 * Overrides never add entries: one naming an href the code no longer ships is
 * ignored, so removing a module from the product cannot leave a dead link in a
 * tenant's sidebar. Order falls back to the code order for anything the tenant
 * did not explicitly place, so a newly shipped entry lands in its intended slot
 * rather than at the top.
 */
export function applyDashboardNavOverrides(
  items: readonly DashboardNavItem[],
  overrides: readonly DashboardNavOverride[] | null | undefined,
): DashboardNavItem[] {
  if (!overrides?.length) return [...items];

  const byKey = new Map(overrides.map((entry) => [entry.itemKey, entry]));

  return items
    .map((item, codeIndex) => {
      const override = byKey.get(item.href);
      return { item, override, codeIndex };
    })
    .filter(({ override }) => !override?.isHidden)
    .sort((left, right) => {
      const leftOrder = left.override?.sortOrder;
      const rightOrder = right.override?.sortOrder;
      if (typeof leftOrder === "number" && typeof rightOrder === "number") {
        return leftOrder - rightOrder || left.codeIndex - right.codeIndex;
      }
      /* An explicitly placed entry outranks one left at its code position. */
      if (typeof leftOrder === "number") return -1;
      if (typeof rightOrder === "number") return 1;
      return left.codeIndex - right.codeIndex;
    })
    .map(({ item, override }) => {
      if (!override) return item;
      return {
        ...item,
        label: override.label?.trim() ? override.label.trim() : item.label,
        /*
         * Tenant rules replace the code rules rather than adding to them, so an
         * administrator can widen an entry the product shipped narrow. The
         * permission and feature checks below are untouched by this and remain
         * the real access boundary.
         */
        visibilityRules: override.visibilityRules?.length
          ? override.visibilityRules
          : item.visibilityRules,
      };
    });
}

export function resolveVisibleDashboardNavItems(
  input: ResolveVisibleDashboardNavItemsInput,
) {
  const privilegedRoleKeys = new Set<string>([
    ROLE_KEYS.GLOBAL_ADMIN,
    ROLE_KEYS.SYSTEM_ADMIN,
    ROLE_KEYS.SYSTEM_CUSTOMIZER,
  ]);
  const hasPrivilegedSidebar =
    !input.isSelfService &&
    (input.roleKeys ?? []).some((roleKey) => privilegedRoleKeys.has(roleKey));

  const visibility = {
    principal: {
      roleKeys: input.roleKeys ?? [],
      permissionKeys: input.permissionKeys ?? [],
      ...input.placement,
      /*
       * Access-derived business units win over the employee record's single
       * placement: a manager spanning several units should match a rule about
       * any of them.
       */
      businessUnitIds:
        input.businessUnitAccess?.accessibleBusinessUnitIds ??
        input.placement?.businessUnitIds,
    },
  };

  const items = applyDashboardNavOverrides(dashboardNavItems, input.overrides);

  return items.flatMap((item) => {
    /*
     * Checked ahead of the privileged shortcut below: an explicit rule is a
     * deliberate instruction, and an admin bypass would make it unenforceable.
     */
    if (!isVisibleByRules(item, visibility)) {
      return [];
    }

    /*
     * Also ahead of the privileged shortcut, and for a stronger reason than the
     * rules above (BUG-1952). A plan entitlement is a commercial boundary, not a
     * permission: a tenant administrator legitimately bypasses their own
     * tenant's permission model and cannot bypass their own tenant's contract.
     * This shortcut used to sit above the check, which is why every Starter
     * tenant's administrator was offered Timesheets, Projects, Payroll,
     * Recruitment and Onboarding — five modules that plan does not sell.
     *
     * A null `enabledFeatureKeys` still allows, deliberately. It means the
     * availability fetch failed, so there is no server decision to mirror, and
     * blanking a whole sidebar on a transient error is a worse failure than
     * offering a link whose endpoint answers TENANT_FEATURE_NOT_ENTITLED. The
     * API is the boundary now; this is the convenience layered on top of it.
     */
    const hasRequiredFeature =
      !item.requiredFeatureKey ||
      !input.enabledFeatureKeys ||
      input.enabledFeatureKeys.includes(item.requiredFeatureKey);

    if (!hasRequiredFeature) {
      return [];
    }

    if (hasPrivilegedSidebar) {
      return [item];
    }

    if (item.href === "/") {
      const roles = input.roleKeys ?? [];
      if (roles.includes(ROLE_KEYS.CEO)) return [{ ...item, href: "/executive/dashboard", label: "Executive Dashboard" }];
      if (roles.includes(ROLE_KEYS.HR)) return [{ ...item, href: "/hr/dashboard", label: "HR Dashboard" }];
      if (roles.includes(ROLE_KEYS.MANAGER) || input.isReportingManager) return [{ ...item, href: "/manager/dashboard", label: "Manager Dashboard" }];
      if (input.isSelfService) return [{ ...item, href: "/me/dashboard", label: "My Dashboard" }];
    }

    if (
      item.requiresBusinessUnitScope &&
      (input.businessUnitAccess?.accessibleBusinessUnitIds.length ?? 0) === 0
    ) {
      return [];
    }


    const isEmployeesItem = item.href === "/employees";

    if (isEmployeesItem) {
      const canReadEmployees =
        input.permissionKeys.includes(PERMISSION_KEYS.EMPLOYEES_READ) ||
        input.permissionKeys.includes(PERMISSION_KEYS.EMPLOYEES_READ_ALL) ||
        (input.roleKeys ?? []).includes(ROLE_KEYS.SYSTEM_ADMIN);

      if (input.isSelfService && !input.isReportingManager) {
        return [
          {
            ...item,
            href: item.selfServiceHref ?? "/my-profile",
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
