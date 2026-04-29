import { getSessionUser } from "@/lib/auth";
import { PERMISSION_KEYS, ROLE_KEYS } from "@/lib/security-keys";
import { DEFAULT_BRANDING_VALUES } from "@/app/components/branding/branding-defaults";
import { ApiRequestError, apiRequestJson } from "@/lib/server-api";
import type {
  ModuleViewOption,
  ModuleViewSelectorConfig,
} from "@/app/components/view-selector/types";
import { getCurrentEmployee } from "./_lib/current-employee";
import { EssDashboardContent } from "./_components/ess-dashboard-content";
import { AttendanceListResponse } from "./attendance/types";
import { LeaveRequestRecord } from "./leave/types";
import { TenantResolvedSettingsResponse } from "./settings/types";
import { TimesheetListResponse } from "./timesheets/types";

type DashboardPageProps = {
  searchParams?: Promise<{
    view?: string;
  }>;
};

export default async function DashboardPage({
  searchParams,
}: DashboardPageProps) {
  const user = await getSessionUser();

  if (!user) {
    return null;
  }
  const resolvedSearchParams = searchParams ? await searchParams : undefined;

  const currentEmployeeContext = await getCurrentEmployee(user);
  const employee = currentEmployeeContext.employee;
  const resolvedSettings = await getResolvedTenantSettings(user.permissionKeys);

  const [
    leaveRequests,
    attendanceSummary,
    timesheetSummary,
    productivitySummary,
  ] = await Promise.all([
    getMyLeaveRequests(user.permissionKeys),
    getAttendanceSummary(user.permissionKeys),
    getTimesheetSummary(
      user.permissionKeys,
      resolvedSettings?.system.defaultWeekStartDay ?? "MONDAY",
      resolvedSettings?.system.defaultRecordsPerPage ?? 12,
    ),
    getAgentProductivitySummary(),
  ]);

  const notifications = buildNotifications({
    attendanceSummary,
    employeeLinked: Boolean(employee),
    leaveRequests,
    notificationSettings: resolvedSettings?.notifications ?? null,
    timesheetSummary,
  });

  const dashboardViews = getDashboardViewSelectorConfig({
    //permissionKeys: user.permissionKeys,
    //roleKeys: user.roleKeys ?? [],
    selectedViewId: resolvedSearchParams?.view,
  });

  return (
    <div className="dp-theme-scope dp-dashboard-scope">
      <EssDashboardContent
        attendanceAvailable={attendanceSummary.available}
        currentAttendanceEntry={attendanceSummary.todayEntry}
        currentTimesheet={timesheetSummary.currentWeekTimesheet}
        dashboardViews={dashboardViews}
        employee={employee}
        leaveRequests={leaveRequests}
        notifications={notifications}
        productivitySummary={productivitySummary}
        timesheets={timesheetSummary.items}
        tenantContext={{
          companyDisplayName:
            resolvedSettings?.organization.companyDisplayName ||
            resolvedSettings?.branding.brandName ||
            DEFAULT_BRANDING_VALUES.brandName,
          dashboardGreeting:
            resolvedSettings?.branding.dashboardGreeting ||
            DEFAULT_BRANDING_VALUES.dashboardGreeting,
          employeePortalMessage:
            resolvedSettings?.branding.employeePortalMessage ||
            DEFAULT_BRANDING_VALUES.employeePortalMessage,
        }}
        user={{
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          permissionKeys: user.permissionKeys,
          roleLabel: user.roleKeys?.[0] ?? "Tenant User",
          tenantId: user.tenantId,
        }}
      />
    </div>
  );
}

type AgentProductivitySummary = {
  currentStatus: "ACTIVE" | "IDLE" | "AWAY" | "OFFLINE";
  lastSeenAt: string | null;
  todayActiveSeconds: number;
  todayIdleSeconds: number;
  todayAwaySeconds: number;
  utilizationPercent: number;
};

function getDashboardViewSelectorConfig({
  selectedViewId,
}: {
  selectedViewId?: string;
}): ModuleViewSelectorConfig {
  // TEMPORARY:
  // keeping views visible for all users until role-based access is finalized
  const views = getAvailableDashboardViews();

  const defaultView = views.find((view) => view.isDefault) ??
    views[0] ?? {
      id: "ess-overview",
      name: "My dashboard",
      type: "system" as const,
    };

  const resolvedSelectedView =
    views.find((view) => view.id === selectedViewId)?.id ?? defaultView.id;

  return {
    enabled: true,
    selectedViewId: resolvedSelectedView,
    views,
    configureHref: "/dashboard/settings?tab=dashboard-views",
    paramName: "view",
    title: "Dashboard views",
  };
}
function getAvailableDashboardViews(): ModuleViewOption[] {
  return [
    {
      id: "ess-overview",
      name: "My dashboard",
      type: "system",
      description: "Default employee self-service dashboard.",
      isDefault: true,
    },
    {
      id: "admin-workbench",
      name: "Admin workbench",
      type: "system",
      description:
        "Admin-first view with alerts, actions, and employee context.",
    },
    {
      id: "operations-focus",
      name: "Operations focus",
      type: "system",
      description: "Condensed operational view for daily follow-up.",
    },

    // temporary custom view placeholder
    {
      id: "custom:my-priority-view",
      name: "My priority view",
      type: "custom",
      description: "Example custom dashboard layout.",
    },
  ];
}
async function getDashboardViews(): Promise<ModuleViewOption[]> {
  try {
    const response = await apiRequestJson<
      Array<{
        id: string;
        slug: string;
        name: string;
        type: "system" | "custom";
        isDefault: boolean;
        configJson?: {
          meta?: {
            description?: string;
          };
        };
      }>
    >("/module-views?moduleKey=dashboard");

    return response.map((view) => ({
      id: view.slug,
      name: view.name,
      type: view.type,
      isDefault: view.isDefault,
      description: view.configJson?.meta?.description,
    }));
  } catch {
    return [
      {
        id: "ess-overview",
        name: "My dashboard",
        type: "system",
        description: "Default employee self-service dashboard.",
        isDefault: true,
      },
    ];
  }
}

function isSystemAdmin({
  permissionKeys,
  roleKeys,
}: {
  permissionKeys: string[];
  roleKeys: string[];
}) {
  const normalizedRoleKeys = roleKeys.map((role) => role.toLowerCase());

  return (
    normalizedRoleKeys.includes("system admin") ||
    normalizedRoleKeys.includes(ROLE_KEYS.SYSTEM_ADMIN) ||
    normalizedRoleKeys.includes("system_administrator") ||
    normalizedRoleKeys.includes("administrator") ||
    permissionKeys.includes("settings.manage") ||
    permissionKeys.includes("settings.write") ||
    permissionKeys.includes("dashboard-views.manage")
  );
}

async function getMyLeaveRequests(permissionKeys: string[]) {
  if (!permissionKeys.includes(PERMISSION_KEYS.LEAVE_REQUESTS_READ)) {
    return [];
  }

  try {
    return await apiRequestJson<LeaveRequestRecord[]>("/leave-requests/mine");
  } catch (error) {
    if (error instanceof ApiRequestError && error.status === 403) {
      return [];
    }

    throw error;
  }
}

async function getAttendanceSummary(permissionKeys: string[]) {
  if (!permissionKeys.includes(PERMISSION_KEYS.ATTENDANCE_READ)) {
    return {
      available: false,
      todayEntry: null,
    };
  }

  const today = new Date().toISOString().slice(0, 10);

  try {
    const response = await apiRequestJson<AttendanceListResponse>(
      `/attendance/mine?dateFrom=${today}&dateTo=${today}&pageSize=1`,
    );

    return {
      available: true,
      todayEntry: response.items[0] ?? null,
    };
  } catch (error) {
    if (
      error instanceof ApiRequestError &&
      (error.status === 400 || error.status === 403)
    ) {
      return {
        available: false,
        todayEntry: null,
      };
    }

    throw error;
  }
}

async function getTimesheetSummary(
  permissionKeys: string[],
  weekStartDay: string,
  defaultRecordsPerPage: number,
) {
  if (!permissionKeys.includes(PERMISSION_KEYS.TIMESHEETS_READ)) {
    return {
      items: [],
      currentWeekTimesheet: null,
    };
  }

  try {
    const pageSize = Math.max(12, defaultRecordsPerPage || 12);
    const response = await apiRequestJson<TimesheetListResponse>(
      `/timesheets/mine?pageSize=${pageSize}`,
    );
    const weekStart = getWeekStart(new Date(), weekStartDay);

    return {
      items: response.items,
      currentWeekTimesheet:
        response.items.find(
          (item) => item.periodStart.slice(0, 10) === weekStart,
        ) ?? null,
    };
  } catch (error) {
    if (
      error instanceof ApiRequestError &&
      (error.status === 400 || error.status === 403)
    ) {
      return {
        items: [],
        currentWeekTimesheet: null,
      };
    }

    throw error;
  }
}

async function getAgentProductivitySummary(): Promise<AgentProductivitySummary | null> {
  try {
    return await apiRequestJson<AgentProductivitySummary>(
      "/agent/me/productivity",
    );
  } catch (error) {
    if (
      error instanceof ApiRequestError &&
      (error.status === 400 || error.status === 403 || error.status === 404)
    ) {
      return null;
    }

    throw error;
  }
}

function buildNotifications({
  attendanceSummary,
  employeeLinked,
  leaveRequests,
  notificationSettings,
  timesheetSummary,
}: {
  attendanceSummary: {
    available: boolean;
    todayEntry: AttendanceListResponse["items"][number] | null;
  };
  employeeLinked: boolean;
  leaveRequests: LeaveRequestRecord[];
  notificationSettings: TenantResolvedSettingsResponse["notifications"] | null;
  timesheetSummary: {
    items: TimesheetRecordSummary[];
    currentWeekTimesheet: TimesheetRecordSummary | null;
  };
}) {
  const notifications: Array<{
    id: string;
    title: string;
    detail: string;
    href?: string;
  }> = [];

  if (!employeeLinked) {
    notifications.push({
      id: "employee-link",
      title: "Employee record not linked",
      detail:
        "Ask your administrator to link this account to an employee record so self-service flows work fully.",
      href: "/dashboard/profile",
    });
  }

  if (
    notificationSettings?.inAppEnabled !== false &&
    attendanceSummary.available &&
    attendanceSummary.todayEntry === null
  ) {
    notifications.push({
      id: "attendance-pending",
      title: "Attendance pending",
      detail: "You have not checked in for today yet.",
      href: "/dashboard/attendance",
    });
  }

  if (
    notificationSettings?.timesheetReminderEnabled !== false &&
    timesheetSummary.currentWeekTimesheet?.canCurrentUserSubmit
  ) {
    notifications.push({
      id: "timesheet-ready",
      title: "Timesheet ready to submit",
      detail: `You have logged ${timesheetSummary.currentWeekTimesheet.totalHours} hours for the current week.`,
      href: "/dashboard/timesheets",
    });
  }

  const latestLeaveRequest = leaveRequests[0];
  if (latestLeaveRequest) {
    notifications.push({
      id: `leave-${latestLeaveRequest.id}`,
      title: "Latest leave request update",
      detail: `${latestLeaveRequest.leaveType.name} is currently ${latestLeaveRequest.status.toLowerCase()}.`,
      href: "/dashboard/leave",
    });
  }

  return notifications.slice(0, 4);
}

function getWeekStart(date: Date, weekStartDay: string) {
  const normalized = new Date(date);
  normalized.setHours(0, 0, 0, 0);

  const day = normalized.getDay();
  const startDayMap: Record<string, number> = {
    SUNDAY: 0,
    MONDAY: 1,
    SATURDAY: 6,
  };

  const startDay = startDayMap[weekStartDay.toUpperCase()] ?? 1;
  const diff = (day - startDay + 7) % 7;
  normalized.setDate(normalized.getDate() - diff);

  return normalized.toISOString().slice(0, 10);
}

type TimesheetRecordSummary = TimesheetListResponse["items"][number];

async function getResolvedTenantSettings(permissionKeys: string[]) {
  if (!permissionKeys.includes(PERMISSION_KEYS.SETTINGS_READ)) {
    return null;
  }

  try {
    return await apiRequestJson<TenantResolvedSettingsResponse>(
      "/tenant-settings/resolved",
    );
  } catch {
    return null;
  }
}
