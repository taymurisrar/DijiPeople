import {
  AttendanceSummary,
  HeadcountSummary,
  LeaveSummary,
  RecruitmentSummary,
} from "../types";
import { ReportBarList } from "./report-bar-list";
import { ReportStatCard } from "./report-stat-card";

type ReportsOverviewProps = {
  attendanceSummary: AttendanceSummary | null;
  headcountSummary: HeadcountSummary | null;
  leaveSummary: LeaveSummary | null;
  recruitmentSummary: RecruitmentSummary | null;
};

export function ReportsOverview({
  attendanceSummary,
  headcountSummary,
  leaveSummary,
  recruitmentSummary,
}: ReportsOverviewProps) {
  const sections = [
    headcountSummary && (
      <section key="headcount" className="grid gap-6">
        <div>
          <p className="text-sm uppercase tracking-[0.18em] text-muted">
            Workforce
          </p>
          <h2 className="mt-2 font-serif text-3xl text-foreground">
            Headcount Summary
          </h2>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <ReportStatCard
            label="Total employees"
            tone="accent"
            value={headcountSummary.totalEmployees}
          />
          <ReportStatCard
            label="Active"
            value={headcountSummary.statuses.active}
          />
          <ReportStatCard
            label="Probation"
            value={headcountSummary.statuses.probation}
          />
          <ReportStatCard
            label="Notice / Terminated"
            value={
              headcountSummary.statuses.notice +
              headcountSummary.statuses.terminated
            }
          />
        </div>
        <ReportBarList
          emptyLabel="No department-linked employee data yet."
          items={headcountSummary.departments.map((item) => ({
            label: item.departmentName,
            value: item.count,
          }))}
          title="Employees by Department"
        />
      </section>
    ),
    leaveSummary && (
      <section key="leave" className="grid gap-6">
        <div>
          <p className="text-sm uppercase tracking-[0.18em] text-muted">
            Leave
          </p>
          <h2 className="mt-2 font-serif text-3xl text-foreground">
            Leave Summary
          </h2>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <ReportStatCard
            label="Total requests"
            tone="accent"
            value={leaveSummary.totalRequests}
          />
          <ReportStatCard
            label="Pending"
            value={leaveSummary.statuses.pending}
          />
          <ReportStatCard
            label="Approved"
            value={leaveSummary.statuses.approved}
          />
          <ReportStatCard
            label="Rejected / Cancelled"
            value={
              leaveSummary.statuses.rejected + leaveSummary.statuses.cancelled
            }
          />
        </div>
        <ReportBarList
          emptyLabel="Leave request activity will appear here once requests are submitted."
          items={leaveSummary.leaveTypes.map((item) => ({
            label: item.leaveTypeName,
            value: item.count,
          }))}
          title="Requests by Leave Type"
        />
      </section>
    ),
    attendanceSummary && (
      <section key="attendance" className="grid gap-6">
        <div>
          <p className="text-sm uppercase tracking-[0.18em] text-muted">
            Attendance
          </p>
          <h2 className="mt-2 font-serif text-3xl text-foreground">
            Attendance Summary
          </h2>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <ReportStatCard
            label="Entries today"
            tone="accent"
            value={attendanceSummary.today.totalEntries}
          />
          <ReportStatCard
            label="Present"
            value={attendanceSummary.today.statuses.present}
          />
          <ReportStatCard
            label="Late"
            value={attendanceSummary.today.statuses.late}
          />
          <ReportStatCard
            label="Exceptions"
            value={
              attendanceSummary.today.statuses.absent +
              attendanceSummary.today.statuses.halfDay +
              attendanceSummary.today.statuses.missedCheckOut
            }
          />
        </div>
        <ReportBarList
          emptyLabel="Recent attendance activity will appear here once check-ins are recorded."
          items={attendanceSummary.daily.map((item) => ({
            label: item.date,
            value: item.total,
          }))}
          title="Entries Over the Last 7 Days"
        />
      </section>
    ),
    recruitmentSummary && (
      <section key="recruitment" className="grid gap-6">
        <div>
          <p className="text-sm uppercase tracking-[0.18em] text-muted">
            Hiring
          </p>
          <h2 className="mt-2 font-serif text-3xl text-foreground">
            Recruitment Summary
          </h2>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <ReportStatCard
            label="Open jobs"
            tone="accent"
            value={recruitmentSummary.jobs.open}
          />
          <ReportStatCard
            label="On hold"
            value={recruitmentSummary.jobs.onHold}
          />
          <ReportStatCard
            label="Offers"
            value={recruitmentSummary.candidates.offer}
          />
          <ReportStatCard
            label="Hired"
            value={recruitmentSummary.candidates.hired}
          />
        </div>
        <ReportBarList
          emptyLabel="Application stage data will appear here once candidates enter the pipeline."
          items={recruitmentSummary.applicationsByStage.map((item) => ({
            label: item.stage,
            value: item.count,
          }))}
          title="Applications by Stage"
        />
      </section>
    ),
  ].filter(Boolean);

  if (sections.length === 0) {
    return (
      <section className="rounded-[28px] border border-dashed border-border bg-white p-10 text-center shadow-sm">
        <h2 className="font-serif text-3xl text-foreground">No report access yet</h2>
        <p className="mt-3 text-sm text-muted">
          This workspace will populate as soon as your role has access to one or
          more reporting summaries.
        </p>
      </section>
    );
  }

  return <div className="grid gap-8">{sections}</div>;
}
