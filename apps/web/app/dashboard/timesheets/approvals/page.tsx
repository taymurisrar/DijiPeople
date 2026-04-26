import Link from "next/link";
import { ApiRequestError, apiRequestJson } from "@/lib/server-api";
import { EmployeeListResponse } from "../../employees/types";
import { getBusinessUnitAccessSummary, shouldEnforceSelfScope } from "../../_lib/business-unit-access";
import { TimesheetFilterBar } from "../_components/timesheet-filter-bar";
import { TimesheetManagerReviewPanel } from "../_components/timesheet-manager-review-panel";
import { TimesheetListResponse, TimesheetRecord, TimesheetStatus } from "../types";

type BusinessUnitOption = {
  id: string;
  name: string;
};

type TimesheetApprovalsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function TimesheetApprovalsPage({
  searchParams,
}: TimesheetApprovalsPageProps) {
  const businessUnitAccess = await getBusinessUnitAccessSummary();

  if (shouldEnforceSelfScope(businessUnitAccess)) {
    return (
      <main className="grid gap-6">
        <section className="rounded-[24px] border border-dashed border-border bg-surface p-10 text-center shadow-sm">
          <p className="text-sm uppercase tracking-[0.18em] text-muted">
            Self scope active
          </p>
          <h3 className="mt-3 text-3xl font-semibold text-foreground">
            Timesheet approvals are not available at your current business-unit access level.
          </h3>
          <p className="mt-3 text-muted">
            Your access is scoped to your own records only.
          </p>
        </section>
      </main>
    );
  }

  const params = await searchParams;
  const now = new Date();
  const year = Number(getSearchParam(params.year) || now.getFullYear());
  const month = Number(getSearchParam(params.month) || now.getMonth() + 1);
  const status = (getSearchParam(params.status) || "SUBMITTED") as TimesheetStatus;
  const timesheetId = getSearchParam(params.timesheetId);
  const page = Number(getSearchParam(params.page) || 1);
  const pageSize = Number(getSearchParam(params.pageSize) || 12);

  let response: TimesheetListResponse = {
    items: [],
    meta: { page, pageSize, total: 0, totalPages: 1 },
    filters: { year, month, employeeId: null, status, scope: "team" },
  };
  let employees: EmployeeListResponse | null = null;
  let businessUnits: BusinessUnitOption[] = [];
  let selectedTimesheet: TimesheetRecord | null = null;
  let accessDenied = false;

  try {
    [response, employees, businessUnits] = await Promise.all([
      apiRequestJson<TimesheetListResponse>(
        `/timesheets/team?${buildTimesheetQuery(params, { month, page, pageSize, status, year })}`,
      ),
      apiRequestJson<EmployeeListResponse>("/employees?pageSize=100"),
      apiRequestJson<BusinessUnitOption[]>("/business-units"),
    ]);

    const selectedId = timesheetId || response.items[0]?.id;
    if (selectedId) {
      selectedTimesheet = await apiRequestJson<TimesheetRecord>(
        `/timesheets/team/${selectedId}`,
      );
    }
  } catch (error) {
    if (error instanceof ApiRequestError && error.status === 403) {
      accessDenied = true;
    } else {
      throw error;
    }
  }

  if (accessDenied) {
    return (
      <main className="grid gap-6">
        <section className="rounded-[24px] border border-dashed border-border bg-surface p-10 text-center shadow-sm">
          <p className="text-sm uppercase tracking-[0.18em] text-muted">
            Approval access required
          </p>
          <h3 className="mt-3 text-3xl font-semibold text-foreground">
            Your current role cannot review submitted timesheets.
          </h3>
        </section>
      </main>
    );
  }

  return (
    <main className="grid gap-6">
      <section className="rounded-[28px] border border-border bg-[linear-gradient(135deg,rgba(255,255,255,0.95),rgba(237,248,255,0.9))] p-8 shadow-lg">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.18em] text-muted">
              Timesheet Approvals
            </p>
            <h3 className="mt-3 font-serif text-4xl text-foreground">
              Review submitted monthly timesheets.
            </h3>
            <p className="mt-3 max-w-3xl text-muted">
              Filter by month, status, employee, manager, and department, then
              open a submitted record for daily review.
            </p>
          </div>
          <MonthSwitcher month={month} status={status} year={year} />
        </div>
      </section>

      <TimesheetFilterBar
        basePath="/dashboard/timesheets/approvals"
        businessUnits={businessUnitOptions(businessUnits)}
        departments={departmentOptions(employees)}
        employees={employeeOptions(employees)}
        managers={managerOptions(employees)}
        showEmployee
        showManager
      />

      <div className="grid gap-6 xl:grid-cols-[0.36fr_0.64fr]">
        <section className="rounded-[24px] border border-border bg-surface p-6 shadow-sm">
          <p className="text-sm uppercase tracking-[0.18em] text-muted">Queue</p>
          <h4 className="mt-2 text-2xl font-semibold text-foreground">
            Timesheet records
          </h4>

          {response.items.length === 0 ? (
            <p className="mt-4 text-sm text-muted">
              No timesheets match this review filter.
            </p>
          ) : (
            <div className="mt-5 grid gap-3">
              {response.items.map((timesheet) => (
                <Link
                  key={timesheet.id}
                  className={`rounded-2xl border px-4 py-4 transition ${
                    selectedTimesheet?.id === timesheet.id
                      ? "border-accent bg-accent-soft/40"
                      : "border-border bg-white/80 hover:border-accent/30"
                  }`}
                  href={`/dashboard/timesheets/approvals?${queueHref(params, timesheet.id)}`}
                >
                  <p className="font-medium text-foreground">
                    {timesheet.employee.fullName}
                  </p>
                  <p className="mt-1 text-sm text-muted">
                    {monthLabel(timesheet.month, timesheet.year)} - {timesheet.status}
                  </p>
                  <p className="mt-2 text-sm text-muted">
                    {timesheet.summary.totalWorkDays} work day(s),{" "}
                    {timesheet.summary.totalLeaveDays} leave day(s),{" "}
                    {timesheet.summary.totalHours.toFixed(2)} hrs
                  </p>
                </Link>
              ))}
            </div>
          )}
        </section>

        {selectedTimesheet ? (
          <TimesheetManagerReviewPanel timesheet={selectedTimesheet} />
        ) : (
          <section className="rounded-[24px] border border-dashed border-border bg-surface p-10 text-center shadow-sm">
            <p className="text-sm uppercase tracking-[0.18em] text-muted">
              Select a timesheet
            </p>
            <h4 className="mt-3 text-2xl font-semibold text-foreground">
              Pick a submitted record from the review queue.
            </h4>
          </section>
        )}
      </div>
    </main>
  );
}

function MonthSwitcher({
  month,
  status,
  year,
}: {
  month: number;
  status: string;
  year: number;
}) {
  const prev = new Date(year, month - 2, 1);
  const next = new Date(year, month, 1);

  return (
    <div className="flex items-center gap-3">
      <Link
        className="rounded-2xl border border-border px-4 py-3 text-sm font-medium text-foreground transition hover:border-accent/30 hover:text-accent"
        href={`/dashboard/timesheets/approvals?year=${prev.getFullYear()}&month=${prev.getMonth() + 1}&status=${status}`}
      >
        Previous
      </Link>
      <div className="rounded-2xl border border-border bg-white/80 px-4 py-3 text-sm font-medium text-foreground">
        {monthLabel(month, year)}
      </div>
      <Link
        className="rounded-2xl border border-border px-4 py-3 text-sm font-medium text-foreground transition hover:border-accent/30 hover:text-accent"
        href={`/dashboard/timesheets/approvals?year=${next.getFullYear()}&month=${next.getMonth() + 1}&status=${status}`}
      >
        Next
      </Link>
    </div>
  );
}

function buildTimesheetQuery(
  params: Record<string, string | string[] | undefined>,
  defaults: {
    month: number;
    page: number;
    pageSize: number;
    status: string;
    year: number;
  },
) {
  const query = new URLSearchParams();
  query.set("year", String(defaults.year));
  query.set("month", String(defaults.month));
  query.set("status", defaults.status);
  query.set("page", String(defaults.page));
  query.set("pageSize", String(defaults.pageSize));
  [
    "employeeId",
    "managerEmployeeId",
    "departmentId",
    "businessUnitId",
    "sortField",
    "sortDirection",
  ].forEach((key) => {
    const value = getSearchParam(params[key]);
    if (value) query.set(key, value);
  });
  return query.toString();
}

function queueHref(params: Record<string, string | string[] | undefined>, timesheetId: string) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    const normalized = getSearchParam(value);
    if (normalized && key !== "timesheetId") query.set(key, normalized);
  });
  query.set("timesheetId", timesheetId);
  return query.toString();
}

function employeeOptions(employees: EmployeeListResponse | null) {
  return (
    employees?.items.map((employee) => ({
      id: employee.id,
      label: employee.fullName,
    })) ?? []
  );
}

function managerOptions(employees: EmployeeListResponse | null) {
  const managers = new Map<string, string>();
  employees?.items.forEach((employee) => {
    if (employee.manager) {
      managers.set(employee.manager.id, employee.manager.fullName);
    }
  });
  return Array.from(managers, ([id, label]) => ({ id, label }));
}

function departmentOptions(employees: EmployeeListResponse | null) {
  const departments = new Map<string, string>();
  employees?.items.forEach((employee) => {
    if (employee.department) {
      departments.set(employee.department.id, employee.department.name);
    }
  });
  return Array.from(departments, ([id, label]) => ({ id, label }));
}

function businessUnitOptions(businessUnits: BusinessUnitOption[]) {
  return businessUnits.map((businessUnit) => ({
    id: businessUnit.id,
    label: businessUnit.name,
  }));
}

function monthLabel(month: number, year: number) {
  return new Date(year, month - 1, 1).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
}

function getSearchParam(value?: string | string[]) {
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }

  return value ?? "";
}
