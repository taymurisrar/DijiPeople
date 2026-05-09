import Link from "next/link";
import { EssQuickActions } from "@/app/dashboard/_components/ess-quick-actions";
import {
  CompactInfo,
  DashboardEmptyState,
  DashboardPriorityList,
  MiniStat,
  ModuleViewSelectorBlock,
  StatusCard,
} from "./shared";
import {
  formatDashboardDate,
  formatProductivityDetail,
} from "./formatters";
import type {
  EssDashboardComputedState,
  EssDashboardViewModel,
} from "./types";

export function EssDashboardOverviewView({
  state,
  props,
}: {
  state: EssDashboardComputedState;
  props: EssDashboardViewModel;
}) {
  const {
    attendanceAvailable,
    currentAttendanceEntry,
    currentTimesheet,
    dashboardViews,
    employee,
    productivitySummary,
    tenantContext,
    user,
  } = props;

  return (
    <main className="grid gap-5 lg:gap-6">
      <ModuleViewSelectorBlock dashboardViews={dashboardViews} />

      <section className="grid gap-4 xl:grid-cols-[1.25fr_0.75fr]">
        <article className="rounded-[24px] border border-border bg-[linear-gradient(135deg,var(--dp-card-gradient-start,rgba(255,255,255,0.96)),var(--dp-card-gradient-end,rgba(214,244,238,0.7)))] p-6 shadow-sm">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted">
                Employee Self Service
              </p>
              <h2 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
                {state.dashboardGreeting}
              </h2>
              <p className="text-sm text-muted sm:text-base">
                {tenantContext.employeePortalMessage?.trim()
                  ? tenantContext.employeePortalMessage
                  : `Here is what needs your attention today at ${tenantContext.companyDisplayName}.`}
              </p>
            </div>

            <Link
              href="/dashboard/profile"
              className="inline-flex h-fit rounded-2xl border border-border bg-white px-4 py-2.5 text-sm font-medium text-foreground transition hover:border-accent/30 hover:text-accent"
            >
              My profile
            </Link>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <MiniStat label="Attendance" value={state.todaysAttendanceValue} />
            <MiniStat label="Leave" value={`${state.pendingLeaveCount} pending`} />
            <MiniStat label="Timesheet" value={state.currentTimesheetValue} />
          </div>
        </article>

        <article className="rounded-[24px] border border-border bg-surface p-6 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted">
            My account
          </p>

          <div className="mt-4 grid gap-3">
            <CompactInfo label="Email" value={user.email} />
            <CompactInfo label="Role" value={user.roleLabel} />
            <CompactInfo
              label="Employee ID"
              value={employee?.employeeCode ?? "Not linked"}
            />
          </div>
        </article>
      </section>

      <EssQuickActions
        canCheckIn={attendanceAvailable && currentAttendanceEntry === null}
        canCheckOut={currentAttendanceEntry?.canCurrentUserCheckOut ?? false}
        canRequestLeave={user.permissionKeys.includes("leave-requests.create")}
        canSubmitTimesheet={currentTimesheet?.canCurrentUserSubmit ?? false}
        canUpdateProfile={Boolean(employee)}
        timesheetPeriodStart={currentTimesheet?.periodStart ?? null}
      />

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatusCard
          title="Today’s attendance"
          value={state.todaysAttendanceValue}
          detail={state.todaysAttendanceDetail}
        />
        <StatusCard
          title="Leave requests"
          value={`${state.pendingLeaveCount} pending`}
          detail={`${state.approvedLeaveCount} approved request(s)`}
        />
        <StatusCard
          title="Current timesheet"
          value={state.currentTimesheetValue}
          detail={state.currentTimesheetDetail}
        />
        <StatusCard
          title="Employment"
          value={employee?.employmentStatus ?? "User only"}
          detail={
            employee
              ? `${employee.department?.name ?? "No department"} · ${
                  employee.designation?.name ?? "No designation"
                }`
              : "Employee profile not linked yet"
          }
        />
        <StatusCard
          title="Desktop agent"
          value={productivitySummary?.currentStatus ?? "Not connected"}
          detail={formatProductivityDetail(productivitySummary)}
        />
      </section>

      <section className="grid gap-4 xl:grid-cols-[1fr_0.9fr]">
        <article className="rounded-[24px] border border-border bg-surface p-6 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted">
                Priority items
              </p>
              <h3 className="mt-1 text-xl font-semibold text-foreground">
                What to do next
              </h3>
            </div>
          </div>

          <DashboardPriorityList items={state.priorityItems} />
        </article>

        <article className="rounded-[24px] border border-border bg-surface p-6 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted">
                Employment details
              </p>
              <h3 className="mt-1 text-xl font-semibold text-foreground">
                My record
              </h3>
            </div>

            <Link
              href="/dashboard/profile"
              className="text-sm font-medium text-accent transition hover:text-accent-strong"
            >
              View
            </Link>
          </div>

          {employee ? (
            <div className="mt-5 grid gap-4">
              <div>
                <h4 className="text-lg font-semibold text-foreground">
                  {employee.fullName}
                </h4>
                <p className="mt-1 text-sm text-muted">
                  {employee.employeeCode} · {employee.workEmail ?? user.email}
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <CompactInfo
                  label="Department"
                  value={employee.department?.name ?? "Not assigned"}
                />
                <CompactInfo
                  label="Designation"
                  value={employee.designation?.name ?? "Not assigned"}
                />
                <CompactInfo
                  label="Manager"
                  value={
                    employee.manager
                      ? `${employee.manager.firstName} ${employee.manager.lastName}`
                      : "Not assigned"
                  }
                />
                <CompactInfo
                  label="Hire date"
                  value={formatDashboardDate(employee.hireDate)}
                />
              </div>
            </div>
          ) : (
            <DashboardEmptyState message="Your account is active, but no employee record is linked yet." />
          )}
        </article>
      </section>
    </main>
  );
}