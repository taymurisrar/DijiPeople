import { ModuleViewSelector } from "@/app/components/view-selector/module-view-selector";
import { getSessionUser } from "@/lib/auth";
import {
  getTableViews,
  withFallbackViews,
} from "@/lib/customization-views";
import { hasPermission } from "@/lib/permissions";
import { hasElevatedTenantRole } from "@/lib/elevated-roles";
import { PERMISSION_KEYS } from "@/lib/security-keys";
import { ApiRequestError, apiRequestJson } from "@/lib/server-api";
import { AccessDeniedState } from "../_components/access-denied-state";
import {
  getBusinessUnitAccessSummary,
  hasBusinessUnitScope,
} from "../_lib/business-unit-access";
import { AttendanceCheckWidget } from "./_components/attendance-check-widget";
import { AttendanceCommandBar } from "./_components/attendance-command-bar";
import { AttendanceSummaryStrip } from "./_components/attendance-summary-strip";
import { AttendanceTable } from "./_components/attendance-table";
import {
  AttendanceListResponse,
  AttendanceLocationOption,
  AttendanceSummaryResponse,
  AttendanceView,
} from "./types";
import { getCurrentEmployee } from "../_lib/current-employee";

type AttendancePageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function AttendancePage({
  searchParams,
}: AttendancePageProps) {
  const businessUnitAccess = await getBusinessUnitAccessSummary();

  if (!hasBusinessUnitScope(businessUnitAccess)) {
    return (
      <main className="dp-theme-scope dp-attendance-scope grid gap-6">
        <AccessDeniedState
          description="Your current business-unit scope does not include attendance data."
          title="Attendance is unavailable for your current business unit access."
        />
      </main>
    );
  }

  const params = normalizeSearchParams(await searchParams);
  const view = parseAttendanceView(params.view);
  const selectedViewKey = params.tableView ?? params.viewKey;
  const today = formatLocalDate(new Date());

  const sessionUser = await getSessionUser();
  const currentEmployeeContext = sessionUser
    ? await getCurrentEmployee(sessionUser)
    : { employee: null, isReportingManager: false };
  const isElevated = hasElevatedTenantRole(sessionUser?.roleKeys);
  const canViewTeamAttendance =
    isElevated ||
    hasPermission(sessionUser?.permissionKeys, PERMISSION_KEYS.ATTENDANCE_MANAGE) ||
    currentEmployeeContext.isReportingManager;
  const effectiveSelectedViewKey =
    selectedViewKey || (canViewTeamAttendance ? "allAttendance" : "myAttendance");
  const queryString = buildAttendanceQueryString(
    params,
    effectiveSelectedViewKey,
    today,
  );
  const listEndpoint =
    canViewTeamAttendance && effectiveSelectedViewKey !== "myAttendance"
      ? "/attendance/team"
      : "/attendance/mine";
  const summaryEndpoint = canViewTeamAttendance
    ? "/attendance/team/summary"
    : "/attendance/mine/summary";

  let history: AttendanceListResponse = emptyAttendanceResponse("mine");
  let todayEntries: AttendanceListResponse = emptyAttendanceResponse("mine");
  let activeEntry: AttendanceListResponse["items"][number] | null = null;
  let summary: AttendanceSummaryResponse = emptyAttendanceSummary(
    "mine",
    view,
    today,
  );
  let locations: AttendanceLocationOption[] = [];
  let attendanceUnavailableMessage: string | null = null;
  const canCreateAttendance =
    isElevated ||
    hasPermission(sessionUser?.permissionKeys, PERMISSION_KEYS.ATTENDANCE_MANAGE);
  const canExportAttendance = hasPermission(
    sessionUser?.permissionKeys,
    PERMISSION_KEYS.ATTENDANCE_EXPORT,
  );
  const publishedViewsPromise = getTableViews("attendance");

  try {
    [history, todayEntries, activeEntry, summary, locations] =
      await Promise.all([
        apiRequestJson<AttendanceListResponse>(
          `${listEndpoint}?${queryString || "pageSize=20"}`,
        ),
        apiRequestJson<AttendanceListResponse>(
          `${listEndpoint}?dateFrom=${today}&dateTo=${today}&pageSize=1`,
        ),
        canViewTeamAttendance
          ? Promise.resolve(null)
          : apiRequestJson<AttendanceListResponse["items"][number] | null>(
              "/attendance/mine/active",
            ),
        apiRequestJson<AttendanceSummaryResponse>(
          `${summaryEndpoint}?view=${view}&date=${params.dateFrom || today}`,
        ),
        apiRequestJson<AttendanceLocationOption[]>("/attendance/locations"),
      ]);
  } catch (error) {
    if (error instanceof ApiRequestError && error.status === 400) {
      attendanceUnavailableMessage = error.message;
    } else {
      throw error;
    }
  }

  const [publishedViews] = await Promise.all([
    publishedViewsPromise,
    canViewTeamAttendance ? getTeamAttendanceCount(today) : Promise.resolve(0),
  ]);

  const attendanceViews = withFallbackViews("attendance", publishedViews, [
    {
      id: "myAttendance",
      viewKey: "myAttendance",
      tableKey: "attendance",
      name: "My Attendance",
      type: "system",
      isDefault: !canViewTeamAttendance,
      columnsJson: {
        columns: [
          { columnKey: "attendanceDate" },
          { columnKey: "attendanceMode" },
          { columnKey: "checkIn" },
          { columnKey: "checkOut" },
          { columnKey: "duration" },
          { columnKey: "status" },
          { columnKey: "location" },
        ],
      },
      sortingJson: [{ columnKey: "attendanceDate", direction: "desc" }],
    },
    {
      id: "allAttendance",
      viewKey: "allAttendance",
      tableKey: "attendance",
      name: "All Attendance",
      type: "system",
      isDefault: canViewTeamAttendance,
      columnsJson: {
        columns: [
          { columnKey: "employee" },
          { columnKey: "attendanceDate" },
          { columnKey: "attendanceMode" },
          { columnKey: "checkIn" },
          { columnKey: "checkOut" },
          { columnKey: "duration" },
          { columnKey: "status" },
          { columnKey: "location" },
        ],
      },
      sortingJson: [{ columnKey: "attendanceDate", direction: "desc" }],
    },
    {
      id: "today",
      viewKey: "today",
      tableKey: "attendance",
      name: "Today",
      type: "system",
      isDefault: false,
      columnsJson: {
        columns: [
          { columnKey: "attendanceDate" },
          { columnKey: "attendanceMode" },
          { columnKey: "checkIn" },
          { columnKey: "status" },
          { columnKey: "location" },
        ],
      },
      filtersJson: { dateFrom: today, dateTo: today },
      sortingJson: [{ columnKey: "attendanceDate", direction: "desc" }],
    },
    {
      id: "thisWeek",
      viewKey: "thisWeek",
      tableKey: "attendance",
      name: "This Week",
      type: "system",
      isDefault: false,
      columnsJson: {
        columns: [
          { columnKey: "attendanceDate" },
          { columnKey: "checkIn" },
          { columnKey: "checkOut" },
          { columnKey: "duration" },
          { columnKey: "status" },
        ],
      },
      sortingJson: [{ columnKey: "attendanceDate", direction: "desc" }],
    },
    {
      id: "missingCheckOut",
      viewKey: "missingCheckOut",
      tableKey: "attendance",
      name: "Missing Check Out",
      type: "system",
      isDefault: false,
      columnsJson: {
        columns: [
          { columnKey: "attendanceDate" },
          { columnKey: "attendanceMode" },
          { columnKey: "checkIn" },
          { columnKey: "checkOut" },
          { columnKey: "duration" },
          { columnKey: "status" },
          { columnKey: "location" },
        ],
      },
      filtersJson: { status: "MISSED_CHECK_OUT" },
      sortingJson: [{ columnKey: "attendanceDate", direction: "desc" }],
    },
    buildAttendanceStatusView("lateCheckIn", "Late Check In", "LATE"),
    {
      id: "teamAttendance",
      viewKey: "teamAttendance",
      tableKey: "attendance",
      name: "Team Attendance",
      type: "system",
      isDefault: false,
      columnsJson: {
        columns: [
          { columnKey: "employee" },
          { columnKey: "attendanceDate" },
          { columnKey: "attendanceMode" },
          { columnKey: "checkIn" },
          { columnKey: "checkOut" },
          { columnKey: "duration" },
          { columnKey: "status" },
          { columnKey: "location" },
        ],
      },
      sortingJson: [{ columnKey: "attendanceDate", direction: "desc" }],
    },
  ]);

  const selectedView =
    attendanceViews.find((item) => item.viewKey === selectedViewKey) ??
    attendanceViews.find((item) => item.isDefault) ??
    attendanceViews[0] ??
    null;

  const visibleColumnKeys = selectedView?.columnsJson
    ? (
      (selectedView.columnsJson as {
        columns?: Array<{ columnKey?: string }>;
      }).columns ?? []
    )
      .map((column) => column.columnKey)
      .filter((columnKey): columnKey is string => Boolean(columnKey))
    : undefined;

  return (
    <main className="dp-theme-scope dp-attendance-scope grid gap-6">
      <ModuleViewSelector
        configureHref="/settings/customization/tables/attendance"
        enabled
        selectedViewId={selectedView?.viewKey ?? ""}
        views={attendanceViews}
      />

      <AttendanceCommandBar
        canCreateAttendance={canCreateAttendance}
        canDeleteAttendance={false}
        canShareAttendance={false}
        canAssignAttendance={false}
        canImportAttendance={false}
        canExportAttendance={canExportAttendance}
      />

      {attendanceUnavailableMessage ? (
        <section className="rounded-[24px] border border-dashed border-border bg-surface p-10 text-center shadow-sm">
          <p className="text-sm uppercase tracking-[0.18em] text-muted">
            Attendance setup needed
          </p>
          <h4 className="mt-3 text-2xl font-semibold text-foreground">
            No employee record is linked to your user account.
          </h4>
          <p className="mx-auto mt-3 max-w-2xl text-muted">
            {attendanceUnavailableMessage}
          </p>
        </section>
      ) : (
        <>
          <AttendanceCheckWidget
            activeEntry={activeEntry}
            locations={locations}
            todayEntry={todayEntries.items[0] ?? null}
          />

          <AttendanceSummaryStrip summary={summary} />

          <AttendanceTable
            entries={history.items}
            formatting={{
              dateFormat: "MM/dd/yyyy",
              locale: "en-US",
              timezone: "UTC",
            }}
            pagination={{
              page: history.meta.page,
              pageSize: history.meta.pageSize,
              totalItems: history.meta.total,
              pathname: "/attendance",
              searchParams: {
                ...params,
                tableView: selectedView?.viewKey,
              },
            }}
            visibleColumnKeys={visibleColumnKeys}
            showEmployee={
              canViewTeamAttendance && selectedView?.viewKey !== "myAttendance"
            }
          />
        </>
      )}
    </main>
  );
}

async function getTeamAttendanceCount(today: string) {
  try {
    const attendance = await apiRequestJson<AttendanceListResponse>(
      `/attendance/team?dateFrom=${today}&dateTo=${today}&pageSize=100`,
    );

    return attendance.items.length;
  } catch (error) {
    if (error instanceof ApiRequestError && error.status === 403) {
      return 0;
    }

    throw error;
  }
}

function normalizeSearchParams(
  value: Record<string, string | string[] | undefined> | undefined,
) {
  if (!value) return {};

  return Object.fromEntries(
    Object.entries(value).map(([key, current]) => [
      key,
      Array.isArray(current) ? current[0] : current,
    ]),
  ) as Record<string, string | undefined>;
}

function buildAttendanceQueryString(
  params: Record<string, string | undefined>,
  selectedViewKey: string,
  today: string,
) {
  const query = new URLSearchParams();

  const keys = [
    "search",
    "dateFrom",
    "dateTo",
    "status",
    "attendanceMode",
    "source",
    "employeeId",
    "officeLocationId",
    "sortField",
    "sortDirection",
    "page",
    "pageSize",
    "view",
  ];

  for (const key of keys) {
    const value = params[key];
    if (value) query.set(key, value);
  }

  const preset = getAttendanceViewPreset(selectedViewKey, today);
  for (const [key, value] of Object.entries(preset)) {
    if (value && !query.has(key)) {
      query.set(key, value);
    }
  }

  return query.toString();
}

function getAttendanceViewPreset(selectedViewKey: string, today: string) {
  switch (selectedViewKey) {
    case "today":
      return { dateFrom: today, dateTo: today };
    case "thisWeek": {
      const anchor = new Date(`${today}T00:00:00`);
      const day = anchor.getDay();
      const mondayOffset = day === 0 ? -6 : 1 - day;
      const monday = new Date(anchor);
      monday.setDate(anchor.getDate() + mondayOffset);
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      return {
        dateFrom: formatLocalDate(monday),
        dateTo: formatLocalDate(sunday),
      };
    }
    case "missingCheckOut":
      return { status: "MISSED_CHECK_OUT" };
    case "lateCheckIn":
      return { status: "LATE" };
    default:
      return {};
  }
}

function buildAttendanceStatusView(id: string, name: string, status: string) {
  return {
    id,
    viewKey: id,
    tableKey: "attendance",
    name,
    type: "system" as const,
    isDefault: false,
    filtersJson: { status },
    columnsJson: {
      columns: [
        { columnKey: "employee" },
        { columnKey: "attendanceDate" },
        { columnKey: "attendanceMode" },
        { columnKey: "checkIn" },
        { columnKey: "checkOut" },
        { columnKey: "duration" },
        { columnKey: "status" },
        { columnKey: "location" },
      ],
    },
    sortingJson: [{ columnKey: "attendanceDate", direction: "desc" }],
  };
}

function parseAttendanceView(value?: string): AttendanceView {
  if (value === "day" || value === "week" || value === "month") {
    return value;
  }

  return "week";
}

function emptyAttendanceResponse(
  scope: AttendanceListResponse["filters"]["scope"],
): AttendanceListResponse {
  return {
    items: [],
    meta: {
      page: 1,
      pageSize: 20,
      total: 0,
      totalPages: 1,
    },
    filters: {
      scope,
    },
  };
}

function emptyAttendanceSummary(
  scope: AttendanceSummaryResponse["scope"],
  view: AttendanceView,
  anchorDate: string,
): AttendanceSummaryResponse {
  return {
    scope,
    view,
    anchorDate,
    totals: {
      entries: 0,
      present: 0,
      late: 0,
      remote: 0,
      office: 0,
      missedCheckout: 0,
      workedMinutes: 0,
    },
    buckets: [],
  };
}

function formatLocalDate(value: Date) {
  const year = value.getFullYear();
  const month = `${value.getMonth() + 1}`.padStart(2, "0");
  const day = `${value.getDate()}`.padStart(2, "0");

  return `${year}-${month}-${day}`;
}
