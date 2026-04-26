import Link from "next/link";
import { getSessionUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { ApiRequestError, apiRequestJson } from "@/lib/server-api";
import { EmployeeListResponse } from "../employees/types";
import { TenantResolvedSettingsResponse } from "../settings/types";
import { AccessDeniedState } from "../_components/access-denied-state";
import { getBusinessUnitAccessSummary, hasBusinessUnitScope } from "../_lib/business-unit-access";
import { TimesheetFilterBar } from "./_components/timesheet-filter-bar";
import { TimesheetMONTHLYEditor } from "./_components/timesheet-monthly-editor";
import { TimesheetMonthsTable } from "./_components/timesheet-months-table";
import { TimesheetTemplateExportButton } from "./_components/timesheet-template-export-button";
import { TimesheetTemplateImportButton } from "./_components/timesheet-template-import-button";
import { TimesheetListResponse, TimesheetRecord } from "./types";

type BusinessUnitOption = {
  id: string;
  name: string;
};

type TimesheetsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function TimesheetsPage({
  searchParams,
}: TimesheetsPageProps) {
  const businessUnitAccess = await getBusinessUnitAccessSummary();
  const user = await getSessionUser();
  const canReadAllTimesheets = hasPermission(user?.permissionKeys, "timesheets.read.all");
  const canReadTeamTimesheets = hasPermission(user?.permissionKeys, "timesheets.read.team");
  const canReviewTimesheets = canReadTeamTimesheets || canReadAllTimesheets;

  if (!hasBusinessUnitScope(businessUnitAccess)) {
    return (
      <main className="grid gap-6">
        <AccessDeniedState
          description="Your current business-unit scope does not include timesheet records."
          title="Timesheets are unavailable for your current business unit access."
        />
      </main>
    );
  }

  const params = await searchParams;
  const now = new Date();
  const year = Number(getSearchParam(params.year) || now.getFullYear());
  const month = Number(getSearchParam(params.month) || now.getMonth() + 1);
  const page = Number(getSearchParam(params.page) || 1);
  const pageSize = Number(getSearchParam(params.pageSize) || 12);

  let monthlyTimesheet: TimesheetRecord | null = null;
  let history: TimesheetListResponse = emptyHistory();
  let employees: EmployeeListResponse | null = null;
  let businessUnits: BusinessUnitOption[] = [];
  let resolvedSettings: TenantResolvedSettingsResponse | null = null;
  let unavailableMessage: string | null = null;

  try {
    [monthlyTimesheet, history, resolvedSettings, employees, businessUnits] = await Promise.all([
      apiRequestJson<TimesheetRecord>(
        `/timesheets/mine/monthly?year=${year}&month=${month}`,
      ),
      apiRequestJson<TimesheetListResponse>(
        `/timesheets/mine?${buildTimesheetQuery(params, { page, pageSize })}`,
      ),
      apiRequestJson<TenantResolvedSettingsResponse>("/tenant-settings/resolved"),
      apiRequestJson<EmployeeListResponse>("/employees?pageSize=100"),
      apiRequestJson<BusinessUnitOption[]>("/business-units"),
    ]);
  } catch (error) {
    if (error instanceof ApiRequestError && error.status === 400) {
      unavailableMessage = error.message;
    } else {
      throw error;
    }
  }

  return (
    <main className="grid gap-6">
      <section className="flex flex-col gap-4 rounded-[28px] border border-border bg-[linear-gradient(135deg,rgba(255,255,255,0.95),rgba(243,248,255,0.9))] p-8 shadow-lg lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-3">
          <p className="text-sm uppercase tracking-[0.18em] text-muted">
            Timesheets
          </p>
          <h3 className="font-serif text-4xl text-foreground">
            Monthly timesheets for payroll-ready review.
          </h3>
          <p className="max-w-3xl text-muted">
            Work days, weekends, holidays, required notes, and submission rules
            follow tenant timesheet settings.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <MonthSwitcher month={month} year={year} />
          <TimesheetTemplateExportButton
            businessUnits={businessUnitOptions(businessUnits)}
            canReadAll={canReadAllTimesheets}
            canReadTeam={canReadTeamTimesheets}
            month={month}
            year={year}
          />
          <TimesheetTemplateImportButton
            businessUnits={businessUnitOptions(businessUnits)}
            canReadAll={canReadAllTimesheets}
            canReadTeam={canReadTeamTimesheets}
            month={month}
            year={year}
          />
          {canReviewTimesheets ? (
            <Link
              className="rounded-2xl border border-border px-5 py-3 text-sm font-medium text-muted transition hover:border-accent/30 hover:text-foreground"
              href="/dashboard/timesheets/approvals"
            >
              Manager approvals
            </Link>
          ) : null}
        </div>
      </section>

      {unavailableMessage ? (
        <section className="rounded-[24px] border border-border bg-surface p-6 shadow-sm">
          <p className="text-sm uppercase tracking-[0.18em] text-muted">
            Timesheet setup needed
          </p>
          <h4 className="mt-3 text-2xl font-semibold text-foreground">
            Your user account is not linked to an employee record yet.
          </h4>
          <p className="mt-3 max-w-3xl text-muted">{unavailableMessage}</p>
        </section>
      ) : monthlyTimesheet ? (
        <TimesheetMONTHLYEditor
          settings={resolvedSettings?.timesheets}
          timesheet={monthlyTimesheet}
        />
      ) : null}

      <section className="rounded-[24px] border border-border bg-surface p-6 shadow-sm">
        <p className="text-sm uppercase tracking-[0.18em] text-muted">
          Timesheet Months
        </p>
        <h4 className="mt-2 text-2xl font-semibold text-foreground">
          Filter, sort, and reopen monthly records
        </h4>
        <div className="mt-5">
          <TimesheetFilterBar
            basePath="/dashboard/timesheets"
            businessUnits={businessUnitOptions(businessUnits)}
            departments={departmentOptions(employees)}
          />
        </div>
        <TimesheetMonthsTable
          basePath="/dashboard/timesheets"
          response={history}
          searchParams={searchParamsForPagination(params)}
        />
      </section>
    </main>
  );
}

function MonthSwitcher({ month, year }: { month: number; year: number }) {
  const prev = new Date(year, month - 2, 1);
  const next = new Date(year, month, 1);

  return (
    <div className="flex items-center gap-3">
      <Link
        className="rounded-2xl border border-border px-4 py-3 text-sm font-medium text-foreground transition hover:border-accent/30 hover:text-accent"
        href={`/dashboard/timesheets?year=${prev.getFullYear()}&month=${prev.getMonth() + 1}`}
      >
        Previous
      </Link>
      <div className="rounded-2xl border border-border bg-white/80 px-4 py-3 text-sm font-medium text-foreground">
        {monthLabel(month, year)}
      </div>
      <Link
        className="rounded-2xl border border-border px-4 py-3 text-sm font-medium text-foreground transition hover:border-accent/30 hover:text-accent"
        href={`/dashboard/timesheets?year=${next.getFullYear()}&month=${next.getMonth() + 1}`}
      >
        Next
      </Link>
    </div>
  );
}

function monthLabel(month: number, year: number) {
  return new Date(year, month - 1, 1).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
}

function emptyHistory(): TimesheetListResponse {
  return {
    items: [],
    meta: {
      page: 1,
      pageSize: 12,
      total: 0,
      totalPages: 1,
    },
    filters: {
      year: null,
      month: null,
      employeeId: null,
      status: null,
      scope: "mine",
    },
  };
}

function buildTimesheetQuery(
  params: Record<string, string | string[] | undefined>,
  defaults: { page: number; pageSize: number },
) {
  const query = new URLSearchParams();
  [
    "year",
    "month",
    "status",
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
  query.set("page", String(defaults.page));
  query.set("pageSize", String(defaults.pageSize));
  return query.toString();
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

function searchParamsForPagination(params: Record<string, string | string[] | undefined>) {
  const result: Record<string, string | undefined> = {};
  Object.entries(params).forEach(([key, value]) => {
    result[key] = getSearchParam(value) || undefined;
  });
  return result;
}

function getSearchParam(value?: string | string[]) {
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }

  return value ?? "";
}
