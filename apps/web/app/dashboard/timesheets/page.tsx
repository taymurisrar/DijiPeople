import Link from "next/link";
import { ApiRequestError, apiRequestJson } from "@/lib/server-api";
import { AccessDeniedState } from "../_components/access-denied-state";
import { getBusinessUnitAccessSummary, hasBusinessUnitScope } from "../_lib/business-unit-access";
import { TimesheetMONTHLYEditor } from "./_components/timesheet-monthly-editor";
import { TimesheetListResponse, TimesheetRecord } from "./types";

type TimesheetsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function TimesheetsPage({
  searchParams,
}: TimesheetsPageProps) {
  const businessUnitAccess = await getBusinessUnitAccessSummary();

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

  let monthlyTimesheet: TimesheetRecord | null = null;
  let history: TimesheetListResponse = emptyHistory();
  let unavailableMessage: string | null = null;

  try {
    [monthlyTimesheet, history] = await Promise.all([
      apiRequestJson<TimesheetRecord>(
        `/timesheets/mine/monthly?year=${year}&month=${month}`,
      ),
      apiRequestJson<TimesheetListResponse>("/timesheets/mine?pageSize=12"),
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
            Fill your full monthly timesheet in one structured view.
          </h3>
          <p className="max-w-3xl text-muted">
            Weekends and holidays are system-driven, weekdays must be resolved,
            and submissions move through reporting-manager approval.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <MonthSwitcher month={month} year={year} />
          <Link
            className="rounded-2xl border border-border px-5 py-3 text-sm font-medium text-muted transition hover:border-accent/30 hover:text-foreground"
            href="/dashboard/timesheets/approvals"
          >
            Manager approvals
          </Link>
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
        <TimesheetMONTHLYEditor timesheet={monthlyTimesheet} />
      ) : null}

      <section className="rounded-[24px] border border-border bg-surface p-6 shadow-sm">
        <p className="text-sm uppercase tracking-[0.18em] text-muted">
          History
        </p>
        <h4 className="mt-2 text-2xl font-semibold text-foreground">
          Recent monthly timesheets
        </h4>

        {history.items.length === 0 ? (
          <p className="mt-4 text-sm text-muted">
            Your submitted and draft timesheets will appear here.
          </p>
        ) : (
          <div className="mt-5 grid gap-3">
            {history.items.map((timesheet) => (
              <div
                key={timesheet.id}
                className="rounded-2xl border border-border bg-white/80 px-5 py-4"
              >
                <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="font-medium text-foreground">
                      {monthLabel(timesheet.month, timesheet.year)}
                    </p>
                    <p className="mt-1 text-sm text-muted">
                      {timesheet.status} • {timesheet.summary.totalWorkDays} work
                      day(s) • {timesheet.summary.totalLeaveDays} leave day(s)
                    </p>
                  </div>
                  <Link
                    className="text-sm font-medium text-accent hover:text-accent-strong"
                    href={`/dashboard/timesheets?year=${timesheet.year}&month=${timesheet.month}`}
                  >
                    Open
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
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

function getSearchParam(value?: string | string[]) {
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }

  return value ?? "";
}
