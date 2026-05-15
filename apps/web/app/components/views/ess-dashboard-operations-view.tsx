import { EssQuickActions } from "@/app/(authenticated)/_components/ess-quick-actions";
import {
  DashboardPriorityList,
  ModuleViewSelectorBlock,
  StatusCard,
} from "./shared";
import { formatProductivityDetail } from "./formatters";
import type {
  EssDashboardComputedState,
  EssDashboardViewModel,
} from "./types";

export function EssDashboardOperationsView({
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
    user,
  } = props;

  return (
    <main className="grid gap-5 lg:gap-6">
      <ModuleViewSelectorBlock dashboardViews={dashboardViews} />

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

      <section className="grid gap-4 xl:grid-cols-[1fr_1fr]">
        <article className="rounded-[24px] border border-border bg-surface p-6 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted">
            Quick actions
          </p>
          <h3 className="mt-1 text-xl font-semibold text-foreground">
            Daily actions
          </h3>

          <div className="mt-5">
            <EssQuickActions
              canCheckIn={attendanceAvailable && currentAttendanceEntry === null}
              canCheckOut={currentAttendanceEntry?.canCurrentUserCheckOut ?? false}
              canRequestLeave={user.permissionKeys.includes(
                "leave-requests.create",
              )}
              canSubmitTimesheet={currentTimesheet?.canCurrentUserSubmit ?? false}
              canUpdateProfile={Boolean(employee)}
              timesheetPeriodStart={currentTimesheet?.periodStart ?? null}
            />
          </div>
        </article>

        <article className="rounded-[24px] border border-border bg-surface p-6 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted">
            Priority items
          </p>
          <h3 className="mt-1 text-xl font-semibold text-foreground">
            Operational follow-up
          </h3>

          <DashboardPriorityList items={state.priorityItems} />
        </article>
      </section>
    </main>
  );
}