import Link from "next/link";
import { ApiRequestError, apiRequestJson } from "@/lib/server-api";
import { TimesheetManagerReviewPanel } from "../_components/timesheet-manager-review-panel";
import { TimesheetListResponse, TimesheetRecord, TimesheetStatus } from "../types";

type TimesheetApprovalsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function TimesheetApprovalsPage({
  searchParams,
}: TimesheetApprovalsPageProps) {
  const params = await searchParams;
  const now = new Date();
  const year = Number(getSearchParam(params.year) || now.getFullYear());
  const month = Number(getSearchParam(params.month) || now.getMonth() + 1);
  const status = (getSearchParam(params.status) || "SUBMITTED") as TimesheetStatus;
  const timesheetId = getSearchParam(params.timesheetId);

  let response: TimesheetListResponse = {
    items: [],
    meta: { page: 1, pageSize: 50, total: 0, totalPages: 1 },
    filters: { year, month, employeeId: null, status, scope: "team" },
  };
  let selectedTimesheet: TimesheetRecord | null = null;
  let accessDenied = false;

  try {
    response = await apiRequestJson<TimesheetListResponse>(
      `/timesheets/team?status=${status}&year=${year}&month=${month}&pageSize=50`,
    );

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
          <p className="mt-3 text-muted">
            Reporting managers can review direct reports, and HR or admins can
            review broader tenant submissions.
          </p>
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
              Review monthly timesheets for your team.
            </h3>
            <p className="mt-3 max-w-3xl text-muted">
              Open a submitted sheet to see the full daily breakdown, summary,
              and any submission notes before reviewing.
            </p>
          </div>
          <MonthSwitcher month={month} status={status} year={year} />
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[0.36fr_0.64fr]">
        <section className="rounded-[24px] border border-border bg-surface p-6 shadow-sm">
          <p className="text-sm uppercase tracking-[0.18em] text-muted">Queue</p>
          <h4 className="mt-2 text-2xl font-semibold text-foreground">
            Submitted timesheets
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
                  href={`/dashboard/timesheets/approvals?year=${year}&month=${month}&status=${status}&timesheetId=${timesheet.id}`}
                >
                  <p className="font-medium text-foreground">
                    {timesheet.employee.fullName}
                  </p>
                  <p className="mt-1 text-sm text-muted">
                    {monthLabel(timesheet.month, timesheet.year)} • {timesheet.status}
                  </p>
                  <p className="mt-2 text-sm text-muted">
                    {timesheet.summary.totalWorkDays} work day(s) •{" "}
                    {timesheet.summary.totalLeaveDays} leave day(s)
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
  const current = new Date(year, month - 1, 1);
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
