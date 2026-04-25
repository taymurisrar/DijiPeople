import Link from "next/link";
import { getSessionUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { ApiRequestError, apiRequestJson } from "@/lib/server-api";
import { AccessDeniedState } from "../_components/access-denied-state";
import { getBusinessUnitAccessSummary, hasBusinessUnitScope } from "../_lib/business-unit-access";
import { AttendanceCheckWidget } from "./_components/attendance-check-widget";
import { AttendanceEntriesTable } from "./_components/attendance-entries-table";
import { AttendanceFilterBar } from "./_components/attendance-filter-bar";
import { AttendancePagination } from "./_components/attendance-pagination";
import { AttendanceSummaryStrip } from "./_components/attendance-summary-strip";
import { AttendanceViewSwitcher } from "./_components/attendance-view-switcher";
import {
  AttendanceListResponse,
  AttendanceLocationOption,
  AttendanceSummaryResponse,
  AttendanceView,
} from "./types";

type AttendancePageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function AttendancePage({
  searchParams,
}: AttendancePageProps) {
  const businessUnitAccess = await getBusinessUnitAccessSummary();

  if (!hasBusinessUnitScope(businessUnitAccess)) {
    return (
      <main className="grid gap-6">
        <AccessDeniedState
          description="Your current business-unit scope does not include attendance data."
          title="Attendance is unavailable for your current business unit access."
        />
      </main>
    );
  }

  const params = normalizeSearchParams(await searchParams);
  const view = parseAttendanceView(params.view);
  const today = formatLocalDate(new Date());
  const queryString = buildAttendanceQueryString(params);
  const sessionUser = await getSessionUser();
  const canViewTeamAttendance = hasPermission(
    sessionUser?.permissionKeys,
    "attendance.manage",
  );

  let history: AttendanceListResponse = emptyAttendanceResponse("mine");
  let todayEntries: AttendanceListResponse = emptyAttendanceResponse("mine");
  let activeEntry: AttendanceListResponse["items"][number] | null = null;
  let summary: AttendanceSummaryResponse = emptyAttendanceSummary("mine", view, today);
  let locations: AttendanceLocationOption[] = [];
  let attendanceUnavailableMessage: string | null = null;

  try {
    [history, todayEntries, activeEntry, summary, locations] = await Promise.all([
      apiRequestJson<AttendanceListResponse>(
        `/attendance/mine?${queryString || "pageSize=20"}`,
      ),
      apiRequestJson<AttendanceListResponse>(
        `/attendance/mine?dateFrom=${today}&dateTo=${today}&pageSize=1`,
      ),
      apiRequestJson<AttendanceListResponse["items"][number] | null>(
        "/attendance/mine/active",
      ),
      apiRequestJson<AttendanceSummaryResponse>(
        `/attendance/mine/summary?view=${view}&date=${params.dateFrom || today}`,
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

  const teamCount = canViewTeamAttendance ? await getTeamAttendanceCount(today) : 0;

  return (
    <main className="grid gap-6">
      <section className="flex flex-col gap-4 rounded-[28px] border border-border bg-[linear-gradient(135deg,rgba(255,255,255,0.95),rgba(240,248,255,0.9))] p-8 shadow-lg lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-3">
          <p className="text-sm uppercase tracking-[0.18em] text-muted">
            Attendance
          </p>
          <h3 className="font-serif text-4xl text-foreground">
            Manage your check-ins, history, and attendance patterns.
          </h3>
          <p className="max-w-3xl text-muted">
            Use day, week, and month views to understand your own attendance
            history while keeping office, remote, and future device-based
            records in the same flow.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <AttendanceViewSwitcher
            basePath="/dashboard/attendance"
            currentView={view}
            queryString={queryString}
          />
          {canViewTeamAttendance ? (
            <Link
              className="rounded-2xl border border-border px-5 py-3 text-sm font-medium text-muted transition hover:border-accent/30 hover:text-foreground"
              href="/dashboard/attendance/team"
            >
              Team entries today: {teamCount}
            </Link>
          ) : null}
        </div>
      </section>

      {attendanceUnavailableMessage ? (
        <section className="rounded-[24px] border border-border bg-surface p-6 shadow-sm">
          <p className="text-sm uppercase tracking-[0.18em] text-muted">
            Attendance setup needed
          </p>
          <h4 className="mt-3 text-2xl font-semibold text-foreground">
            Your user account is not linked to an employee record yet.
          </h4>
          <p className="mt-3 max-w-3xl text-muted">
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
          <AttendanceFilterBar
            basePath="/dashboard/attendance"
            locations={locations}
          />
          <AttendanceEntriesTable entries={history.items} />
          <AttendancePagination
            basePath="/dashboard/attendance"
            currentPage={history.meta.page}
            queryString={queryString}
            totalPages={history.meta.totalPages}
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
  if (!value) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, current]) => [
      key,
      Array.isArray(current) ? current[0] : current,
    ]),
  ) as Record<string, string | undefined>;
}

function buildAttendanceQueryString(params: Record<string, string | undefined>) {
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

  keys.forEach((key) => {
    const value = params[key];
    if (value) {
      query.set(key, value);
    }
  });

  return query.toString();
}

function parseAttendanceView(value?: string): AttendanceView {
  if (value === "day" || value === "month") {
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
