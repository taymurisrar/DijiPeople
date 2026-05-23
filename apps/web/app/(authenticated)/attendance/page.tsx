import { ModuleViewSelector } from "@/app/components/view-selector/module-view-selector";
import { getSessionUser } from "@/lib/auth";
import {
  getTableViews,
  withFallbackViews,
} from "@/lib/customization-views";
import { hasPermission, isSelfServiceUser } from "@/lib/permissions";
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
  const params = normalizeSearchParams(await searchParams);
  const today = formatLocalDate(new Date());

  const sessionUser = await getSessionUser();
  const hasAttendanceRead = hasPermission(
    sessionUser?.permissionKeys,
    PERMISSION_KEYS.ATTENDANCE_READ,
  );
  const selfServiceAttendance = isSelfServiceUser(sessionUser?.permissionKeys);
  const businessUnitAccess = await getBusinessUnitAccessSummary();

  if (!hasAttendanceRead) {
    return (
      <main className="dp-theme-scope dp-attendance-scope grid gap-6">
        <AccessDeniedState
          description="Your role does not include attendance self-service access."
          title="Attendance is unavailable for your account."
        />
      </main>
    );
  }

  if (!selfServiceAttendance && !hasBusinessUnitScope(businessUnitAccess)) {
    return (
      <main className="dp-theme-scope dp-attendance-scope grid gap-6">
        <AccessDeniedState
          description="Your current business-unit scope does not include attendance data."
          title="Attendance is unavailable for your current business unit access."
        />
      </main>
    );
  }

  const currentEmployeeContext = sessionUser
    ? await getCurrentEmployee()
    : { employee: null, isReportingManager: false };
  const isElevated = hasElevatedTenantRole(sessionUser?.roleKeys);
  const canViewTeamAttendance =
    isElevated ||
    hasPermission(sessionUser?.permissionKeys, PERMISSION_KEYS.ATTENDANCE_MANAGE) ||
    hasPermission(sessionUser?.permissionKeys, PERMISSION_KEYS.ATTENDANCE_READ_ALL) ||
    hasPermission(sessionUser?.permissionKeys, PERMISSION_KEYS.ATTENDANCE_READ_TEAM) ||
    currentEmployeeContext.isReportingManager;
  const canOverrideAttendance =
    isElevated ||
    hasPermission(sessionUser?.permissionKeys, PERMISSION_KEYS.ATTENDANCE_OVERRIDE) ||
    hasPermission(sessionUser?.permissionKeys, PERMISSION_KEYS.ATTENDANCE_MANAGE) ||
    hasPermission(sessionUser?.permissionKeys, PERMISSION_KEYS.ATTENDANCE_UPDATE);
  const requestedViewKey =
    params.tableView ??
    params.viewKey ??
    (isAttendanceSystemViewKey(params.view) ? params.view : undefined);
  const selectedViewKey = selfServiceAttendance
    ? normalizeSelfServiceAttendanceViewKey(requestedViewKey)
    : requestedViewKey;
  const view = parseAttendanceView(params.view, selectedViewKey);
  const effectiveSelectedViewKey =
    selectedViewKey ||
    (selfServiceAttendance
      ? "thisWeek"
      : canViewTeamAttendance
        ? "allAttendance"
        : "myAttendance");
  const queryString = buildAttendanceQueryString(
    params,
    effectiveSelectedViewKey,
    today,
  );
  const listEndpoint =
    canViewTeamAttendance &&
    effectiveSelectedViewKey !== "myAttendance" &&
    !selfServiceAttendance
      ? `/attendance/team?scope=${
          effectiveSelectedViewKey === "teamAttendance" ? "team" : "all"
        }`
      : "/attendance/mine";
  const summaryEndpoint =
    canViewTeamAttendance &&
    effectiveSelectedViewKey !== "myAttendance" &&
    !selfServiceAttendance
      ? `/attendance/team/summary?scope=${
          effectiveSelectedViewKey === "teamAttendance" ? "team" : "all"
        }`
      : "/attendance/mine/summary";

  let history: AttendanceListResponse = emptyAttendanceResponse("mine");
  let myTodayEntries: AttendanceListResponse = emptyAttendanceResponse("mine");
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
    [history, myTodayEntries, activeEntry, summary, locations] =
      await Promise.all([
        apiRequestJson<AttendanceListResponse>(
          withQueryString(listEndpoint, queryString || "pageSize=20"),
        ),
        apiRequestJson<AttendanceListResponse>(
          `/attendance/mine?dateFrom=${today}&dateTo=${today}&pageSize=1`,
        ),
        apiRequestJson<AttendanceListResponse["items"][number] | null>(
          "/attendance/mine/active",
        ),
        apiRequestJson<AttendanceSummaryResponse>(
          withQueryString(
            summaryEndpoint,
            `view=${view}&date=${params.dateFrom || today}`,
          ),
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

  const attendanceViews = filterAttendanceViewsForRole(
    withFallbackViews("attendance", publishedViews, [
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
      id: "thisMonth",
      viewKey: "thisMonth",
      tableKey: "attendance",
      name: "This Month",
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
  ]),
    selfServiceAttendance,
  );

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
        configureHref={
          selfServiceAttendance
            ? undefined
            : "/settings/customization/tables/attendance"
        }
        enabled
        selectedViewId={selectedView?.viewKey ?? ""}
        paramName="tableView"
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
            todayEntry={myTodayEntries.items[0] ?? null}
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
            canOverrideAttendance={canOverrideAttendance}
            showEmployee={
              !selfServiceAttendance &&
              canViewTeamAttendance &&
              selectedView?.viewKey !== "myAttendance"
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
      `/attendance/team?scope=all&dateFrom=${today}&dateTo=${today}&pageSize=100`,
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
  ];

  for (const key of keys) {
    const value = params[key];
    if (value) query.set(key, value);
  }

  if (
    params.view === "day" ||
    params.view === "week" ||
    params.view === "month"
  ) {
    query.set("view", params.view);
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
      return { dateFrom: today, dateTo: today, view: "day" };
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
        view: "week",
      };
    }
    case "thisMonth": {
      const firstDay = new Date(`${today}T00:00:00`);
      firstDay.setDate(1);
      const lastDay = new Date(firstDay);
      lastDay.setMonth(firstDay.getMonth() + 1, 0);
      return {
        dateFrom: formatLocalDate(firstDay),
        dateTo: formatLocalDate(lastDay),
        view: "month",
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

function withQueryString(endpoint: string, queryString: string) {
  return `${endpoint}${endpoint.includes("?") ? "&" : "?"}${queryString}`;
}

function isAttendanceSystemViewKey(value?: string) {
  return Boolean(
    value &&
      [
        "myAttendance",
        "allAttendance",
        "today",
        "thisWeek",
        "thisMonth",
        "missingCheckOut",
        "lateCheckIn",
        "teamAttendance",
      ].includes(value),
  );
}

function normalizeSelfServiceAttendanceViewKey(value?: string) {
  return value === "thisWeek" || value === "thisMonth" || value === "today"
    ? value
    : undefined;
}

function filterAttendanceViewsForRole<
  T extends {
    viewKey: string;
    id: string;
    type: string;
    isDefault?: boolean;
  },
>(views: T[], selfServiceAttendance: boolean) {
  if (!selfServiceAttendance) {
    return views;
  }

  const allowed = new Set(["today", "thisWeek", "thisMonth"]);
  const filtered = views
    .filter((view) => view.type === "system" && allowed.has(view.viewKey))
    .map((view) => ({
      ...view,
      isDefault: view.viewKey === "today",
    }));

  const existing = new Set(filtered.map((view) => view.viewKey));
  const requiredViews = ["today", "thisWeek", "thisMonth"] as const;

  return [
    ...filtered,
    ...requiredViews
      .filter((viewKey) => !existing.has(viewKey))
      .map((viewKey) => buildSelfServiceAttendanceView(viewKey) as unknown as T),
  ];
}

function buildSelfServiceAttendanceView(
  viewKey: "today" | "thisWeek" | "thisMonth",
) {
  const labels = {
    today: "Today",
    thisWeek: "This Week",
    thisMonth: "This Month",
  };

  return {
    id: viewKey,
    viewKey,
    tableKey: "attendance",
    name: labels[viewKey],
    type: "system" as const,
    isDefault: viewKey === "today",
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
  };
}

function parseAttendanceView(
  value?: string,
  selectedViewKey?: string,
): AttendanceView {
  if (value === "day" || value === "week" || value === "month") {
    return value;
  }

  if (selectedViewKey === "today") {
    return "day";
  }

  if (selectedViewKey === "thisMonth") {
    return "month";
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
