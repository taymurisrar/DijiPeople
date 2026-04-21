import { ApiRequestError, apiRequestJson } from "@/lib/server-api";
import { getSessionUser } from "@/lib/auth";
import { EmployeeListResponse } from "../../employees/types";
import { AttendanceEntriesTable } from "../_components/attendance-entries-table";
import { AttendanceFilterBar } from "../_components/attendance-filter-bar";
import { AttendanceImportCard } from "../_components/attendance-import-card";
import { AttendanceIntegrationsCard } from "../_components/attendance-integrations-card";
import { ManualAttendanceForm } from "../_components/manual-attendance-form";
import { AttendancePagination } from "../_components/attendance-pagination";
import { AttendancePolicyCard } from "../_components/attendance-policy-card";
import { AttendanceSummaryStrip } from "../_components/attendance-summary-strip";
import { AttendanceViewSwitcher } from "../_components/attendance-view-switcher";
import {
  AttendanceIntegrationRecord,
  AttendanceListResponse,
  AttendanceLocationOption,
  AttendancePolicyRecord,
  AttendanceSummaryResponse,
  AttendanceView,
  TeamEmployeeOption,
} from "../types";

type TeamAttendancePageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function TeamAttendancePage({
  searchParams,
}: TeamAttendancePageProps) {
  const user = await getSessionUser();
  const params = normalizeSearchParams(await searchParams);
  const view = parseAttendanceView(params.view);
  const queryString = buildAttendanceQueryString(params);

  let attendance: AttendanceListResponse = emptyAttendanceResponse("team");
  let summary: AttendanceSummaryResponse = emptyAttendanceSummary(
    "team",
    view,
    params.dateFrom || new Date().toISOString().slice(0, 10),
  );
  let accessDenied = false;

  try {
    [attendance, summary] = await Promise.all([
      apiRequestJson<AttendanceListResponse>(
        `/attendance/team?${queryString || "pageSize=20"}`,
      ),
      apiRequestJson<AttendanceSummaryResponse>(
        `/attendance/team/summary?view=${view}&date=${
          params.dateFrom || new Date().toISOString().slice(0, 10)
        }`,
      ),
    ]);
  } catch (error) {
    if (error instanceof ApiRequestError && error.status === 403) {
      accessDenied = true;
    } else {
      throw error;
    }
  }

  const canManageAttendance =
    user?.permissionKeys.includes("attendance.manage") ?? false;
  const canImportAttendance =
    user?.permissionKeys.includes("attendance.import") ?? false;
  const canExportAttendance =
    user?.permissionKeys.includes("attendance.export") ?? false;
  const canManageIntegrations =
    user?.permissionKeys.includes("attendance.integration.manage") ?? false;

  const [teamEmployees, locations, policy, integrations] = await Promise.all([
    getEmployees(),
    apiRequestJson<AttendanceLocationOption[]>("/attendance/locations").catch(
      () => [],
    ),
    canManageAttendance
      ? apiRequestJson<AttendancePolicyRecord>("/attendance/policy")
      : Promise.resolve<AttendancePolicyRecord>({
          lateCheckInGraceMinutes: 0,
          lateCheckOutGraceMinutes: 0,
          requireOfficeLocationForOfficeMode: true,
          requireRemoteLocationForRemoteMode: false,
          allowRemoteWithoutLocation: true,
        }),
    canManageIntegrations
      ? apiRequestJson<AttendanceIntegrationRecord[]>("/attendance/integrations")
      : Promise.resolve([]),
  ]);

  if (accessDenied) {
    return (
      <main className="grid gap-6">
        <section className="rounded-[24px] border border-dashed border-border bg-surface p-10 text-center shadow-sm">
          <p className="text-sm uppercase tracking-[0.18em] text-muted">
            Team attendance access required
          </p>
          <h3 className="mt-3 text-3xl font-semibold text-foreground">
            Your current role cannot view team attendance.
          </h3>
          <p className="mt-3 text-muted">
            Managers, HR, and tenant admins need attendance visibility before
            the broader operational attendance view becomes available.
          </p>
        </section>
      </main>
    );
  }

  return (
    <main className="grid gap-6">
      <section className="flex flex-col gap-4 rounded-[28px] border border-border bg-[linear-gradient(135deg,rgba(255,255,255,0.95),rgba(236,248,255,0.9))] p-8 shadow-lg lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm uppercase tracking-[0.18em] text-muted">
            Team Attendance
          </p>
          <h3 className="mt-3 font-serif text-4xl text-foreground">
            Review, import, and export operational attendance cleanly.
          </h3>
          <p className="mt-3 max-w-3xl text-muted">
            This workspace keeps attendance practical for HR and managers, while
            staying ready for payroll exports, reporting, and future machine
            integrations.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <AttendanceViewSwitcher
            basePath="/dashboard/attendance/team"
            currentView={view}
            queryString={queryString}
          />
          {canExportAttendance ? (
            <a
              className="rounded-2xl border border-border px-5 py-3 text-sm font-medium text-muted transition hover:border-accent/30 hover:text-foreground"
              href={`/api/attendance/export?${queryString}`}
            >
              Export CSV
            </a>
          ) : null}
        </div>
      </section>

      <AttendanceSummaryStrip summary={summary} />
      <AttendanceFilterBar
        basePath="/dashboard/attendance/team"
        employees={teamEmployees}
        locations={locations}
        showEmployee
        showSource
      />

      {canManageAttendance ? (
        <ManualAttendanceForm employees={teamEmployees} locations={locations} />
      ) : null}

      <AttendanceEntriesTable entries={attendance.items} showEmployee />
      <AttendancePagination
        basePath="/dashboard/attendance/team"
        currentPage={attendance.meta.page}
        queryString={queryString}
        totalPages={attendance.meta.totalPages}
      />

      {canImportAttendance ? <AttendanceImportCard /> : null}
      {canManageAttendance ? <AttendancePolicyCard initialPolicy={policy} /> : null}
      {canManageIntegrations ? (
        <AttendanceIntegrationsCard integrations={integrations} />
      ) : null}
    </main>
  );
}

async function getEmployees(): Promise<TeamEmployeeOption[]> {
  const employees = await apiRequestJson<EmployeeListResponse>(
    "/employees?pageSize=100",
  );

  return employees.items.map((employee) => ({
    id: employee.id,
    employeeCode: employee.employeeCode,
    fullName: employee.fullName,
  }));
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
