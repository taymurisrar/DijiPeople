import Link from "next/link";
import { ModuleViewSelector } from "@/app/components/view-selector/module-view-selector";
import type { ModuleViewSelectorConfig } from "@/app/components/view-selector/types";
import { EmployeeListItem } from "../employees/types";
import { AttendanceEntryRecord } from "../attendance/types";
import { LeaveRequestRecord } from "../leave/types";
import { TimesheetRecord } from "../timesheets/types";
import { EssQuickActions } from "./ess-quick-actions";

type EssDashboardContentProps = {
  attendanceAvailable: boolean;
  currentAttendanceEntry: AttendanceEntryRecord | null;
  currentTimesheet: TimesheetRecord | null;
  dashboardViews?: ModuleViewSelectorConfig;
  employee: EmployeeListItem | null;
  leaveRequests: LeaveRequestRecord[];
  notifications: Array<{
    id: string;
    title: string;
    detail: string;
    href?: string;
  }>;
  timesheets: TimesheetRecord[];
  tenantContext: {
    companyDisplayName: string;
    dashboardGreeting: string;
    employeePortalMessage: string;
  };
  user: {
    email: string;
    firstName: string;
    lastName: string;
    permissionKeys: string[];
    roleLabel: string;
    tenantId: string;
  };
};

export function EssDashboardContent({
  attendanceAvailable,
  currentAttendanceEntry,
  currentTimesheet,
  dashboardViews,
  employee,
  leaveRequests,
  notifications,
  timesheets,
  tenantContext,
  user,
}: EssDashboardContentProps) {
  const dashboardGreeting =
    tenantContext.dashboardGreeting?.trim() ||
    `Hello, ${user.firstName}`;
  const pendingLeaveCount = leaveRequests.filter(
    (request) => request.status === "PENDING",
  ).length;

  const approvedLeaveCount = leaveRequests.filter(
    (request) => request.status === "APPROVED",
  ).length;

  const totalTimesheetHours = timesheets.reduce(
    (total, timesheet) => total + timesheet.totalHours,
    0,
  );

  const todaysAttendanceValue = currentAttendanceEntry?.status ?? "Not checked in";
  const todaysAttendanceDetail = attendanceAvailable
    ? currentAttendanceEntry?.checkIn
      ? `Checked in at ${formatTime(currentAttendanceEntry.checkIn)}`
      : "No attendance recorded for today"
    : "Attendance will appear once your employee profile is linked";

  const currentTimesheetValue = currentTimesheet?.status ?? "No active period";
  const currentTimesheetDetail = currentTimesheet
    ? `${currentTimesheet.totalHours} hour(s) logged`
    : `${totalTimesheetHours} hour(s) in available periods`;

  const priorityItems = buildPriorityItems({
    attendanceAvailable,
    currentAttendanceEntry,
    currentTimesheet,
    employee,
    pendingLeaveCount,
    notifications,
  });

  const selectedViewId = dashboardViews?.selectedViewId ?? "ess-overview";

  if (selectedViewId === "admin-workbench") {
    return (
      <main className="grid gap-5 lg:gap-6">
        <ModuleViewSelectorBlock dashboardViews={dashboardViews} />

        <section className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
          <article className="rounded-[24px] border border-border bg-[linear-gradient(135deg,var(--dp-card-gradient-start,rgba(255,255,255,0.96)),var(--dp-card-gradient-end,rgba(214,244,238,0.7)))] p-6 shadow-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted">
                  Admin workbench
                </p>
                <h2 className="mt-2 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
                  {dashboardGreeting}
                </h2>
                <p className="mt-2 text-sm text-muted sm:text-base">
                  Centralized view for day-to-day follow-up across employee self-service data.
                </p>
              </div>

              <Link
                href="/dashboard/profile"
                className="inline-flex h-fit rounded-2xl border border-border bg-white px-4 py-2.5 text-sm font-medium text-foreground transition hover:border-accent/30 hover:text-accent"
              >
                My profile
              </Link>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <MiniStat label="Attendance" value={todaysAttendanceValue} />
              <MiniStat label="Pending leave" value={`${pendingLeaveCount}`} />
              <MiniStat label="Timesheet" value={currentTimesheetValue} />
              <MiniStat
                label="Employee"
                value={employee?.employeeCode ?? "Not linked"}
              />
            </div>
          </article>

          <article className="rounded-[24px] border border-border bg-surface p-6 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted">
              Notifications
            </p>
            <h3 className="mt-1 text-xl font-semibold text-foreground">
              Immediate attention
            </h3>

            {notifications.length === 0 ? (
              <EmptyState message="No immediate alerts right now." />
            ) : (
              <div className="mt-5 grid gap-3">
                {notifications.map((notification) => (
                  <div
                    key={notification.id}
                    className="rounded-2xl border border-border bg-white px-4 py-4"
                  >
                    <p className="text-sm font-semibold text-foreground">
                      {notification.title}
                    </p>
                    <p className="mt-1 text-sm text-muted">{notification.detail}</p>
                    {notification.href ? (
                      <Link
                        href={notification.href}
                        className="mt-3 inline-flex text-sm font-medium text-accent transition hover:text-accent-strong"
                      >
                        Open
                      </Link>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
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
            value={todaysAttendanceValue}
            detail={todaysAttendanceDetail}
          />
          <StatusCard
            title="Leave requests"
            value={`${pendingLeaveCount} pending`}
            detail={`${approvedLeaveCount} approved request(s)`}
          />
          <StatusCard
            title="Current timesheet"
            value={currentTimesheetValue}
            detail={currentTimesheetDetail}
          />
          <StatusCard
            title="Employment"
            value={employee?.employmentStatus ?? "User only"}
            detail={
              employee
                ? `${employee.department?.name ?? "No department"} · ${employee.designation?.name ?? "No designation"}`
                : "Employee profile not linked yet"
            }
          />
        </section>

        <section className="grid gap-4 xl:grid-cols-[1fr_0.9fr]">
          <article className="rounded-[24px] border border-border bg-surface p-6 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted">
              Priority items
            </p>
            <h3 className="mt-1 text-xl font-semibold text-foreground">
              What to do next
            </h3>

            {priorityItems.length === 0 ? (
              <EmptyState message="You are all caught up for now." />
            ) : (
              <div className="mt-5 grid gap-3">
                {priorityItems.map((item) => (
                  <div
                    key={item.id}
                    className="rounded-2xl border border-border bg-white px-4 py-4"
                  >
                    <p className="text-sm font-semibold text-foreground">{item.title}</p>
                    <p className="mt-1 text-sm text-muted">{item.detail}</p>
                    {item.href ? (
                      <Link
                        href={item.href}
                        className="mt-3 inline-flex text-sm font-medium text-accent transition hover:text-accent-strong"
                      >
                        Open
                      </Link>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
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
                    value={formatDate(employee.hireDate)}
                  />
                </div>
              </div>
            ) : (
              <EmptyState message="Your account is active, but no employee record is linked yet." />
            )}
          </article>
        </section>
      </main>
    );
  }

  if (selectedViewId === "operations-focus") {
    return (
      <main className="grid gap-5 lg:gap-6">
        <ModuleViewSelectorBlock dashboardViews={dashboardViews} />

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatusCard
            title="Today’s attendance"
            value={todaysAttendanceValue}
            detail={todaysAttendanceDetail}
          />
          <StatusCard
            title="Leave requests"
            value={`${pendingLeaveCount} pending`}
            detail={`${approvedLeaveCount} approved request(s)`}
          />
          <StatusCard
            title="Current timesheet"
            value={currentTimesheetValue}
            detail={currentTimesheetDetail}
          />
          <StatusCard
            title="Employment"
            value={employee?.employmentStatus ?? "User only"}
            detail={
              employee
                ? `${employee.department?.name ?? "No department"} · ${employee.designation?.name ?? "No designation"}`
                : "Employee profile not linked yet"
            }
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
                canRequestLeave={user.permissionKeys.includes("leave-requests.create")}
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

            {priorityItems.length === 0 ? (
              <EmptyState message="You are all caught up for now." />
            ) : (
              <div className="mt-5 grid gap-3">
                {priorityItems.map((item) => (
                  <div
                    key={item.id}
                    className="rounded-2xl border border-border bg-white px-4 py-4"
                  >
                    <p className="text-sm font-semibold text-foreground">{item.title}</p>
                    <p className="mt-1 text-sm text-muted">{item.detail}</p>
                    {item.href ? (
                      <Link
                        href={item.href}
                        className="mt-3 inline-flex text-sm font-medium text-accent transition hover:text-accent-strong"
                      >
                        Open
                      </Link>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </article>
        </section>
      </main>
    );
  }

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
                {dashboardGreeting}
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
            <MiniStat label="Attendance" value={todaysAttendanceValue} />
            <MiniStat label="Leave" value={`${pendingLeaveCount} pending`} />
            <MiniStat label="Timesheet" value={currentTimesheetValue} />
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
          value={todaysAttendanceValue}
          detail={todaysAttendanceDetail}
        />
        <StatusCard
          title="Leave requests"
          value={`${pendingLeaveCount} pending`}
          detail={`${approvedLeaveCount} approved request(s)`}
        />
        <StatusCard
          title="Current timesheet"
          value={currentTimesheetValue}
          detail={currentTimesheetDetail}
        />
        <StatusCard
          title="Employment"
          value={employee?.employmentStatus ?? "User only"}
          detail={
            employee
              ? `${employee.department?.name ?? "No department"} · ${employee.designation?.name ?? "No designation"}`
              : "Employee profile not linked yet"
          }
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

          {priorityItems.length === 0 ? (
            <EmptyState message="You are all caught up for now." />
          ) : (
            <div className="mt-5 grid gap-3">
              {priorityItems.map((item) => (
                <div
                  key={item.id}
                  className="rounded-2xl border border-border bg-white px-4 py-4"
                >
                  <p className="text-sm font-semibold text-foreground">{item.title}</p>
                  <p className="mt-1 text-sm text-muted">{item.detail}</p>
                  {item.href ? (
                    <Link
                      href={item.href}
                      className="mt-3 inline-flex text-sm font-medium text-accent transition hover:text-accent-strong"
                    >
                      Open
                    </Link>
                  ) : null}
                </div>
              ))}
            </div>
          )}
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
                  value={formatDate(employee.hireDate)}
                />
              </div>
            </div>
          ) : (
            <EmptyState message="Your account is active, but no employee record is linked yet." />
          )}
        </article>
      </section>
    </main>
  );
}

function ModuleViewSelectorBlock({
  dashboardViews,
}: {
  dashboardViews?: ModuleViewSelectorConfig;
}) {
  if (!dashboardViews?.enabled) {
    return null;
  }

  return (
    <section className="rounded-[24px] border border-border bg-surface px-4 py-2 shadow-sm">
      <ModuleViewSelector {...dashboardViews} />
    </section>
  );
}

function buildPriorityItems({
  attendanceAvailable,
  currentAttendanceEntry,
  currentTimesheet,
  employee,
  pendingLeaveCount,
  notifications,
}: {
  attendanceAvailable: boolean;
  currentAttendanceEntry: AttendanceEntryRecord | null;
  currentTimesheet: TimesheetRecord | null;
  employee: EmployeeListItem | null;
  pendingLeaveCount: number;
  notifications: Array<{
    id: string;
    title: string;
    detail: string;
    href?: string;
  }>;
}) {
  const items: Array<{
    id: string;
    title: string;
    detail: string;
    href?: string;
  }> = [];

  if (!employee) {
    items.push({
      id: "priority:employee-link",
      title: "Employee record not linked",
      detail: "Your HR team needs to complete your employee setup.",
    });
  }

  if (attendanceAvailable && !currentAttendanceEntry) {
    items.push({
      id: "priority:attendance-checkin",
      title: "You have not checked in yet",
      detail: "Record your attendance for today.",
      href: "/dashboard/attendance",
    });
  }

  if (currentTimesheet?.canCurrentUserSubmit) {
    items.push({
      id: "priority:timesheet-submit",
      title: "Timesheet ready to submit",
      detail: "Review and submit your current timesheet.",
      href: "/dashboard/timesheets",
    });
  }

  if (pendingLeaveCount > 0) {
    items.push({
      id: "priority:leave-pending",
      title: "Leave request pending",
      detail: `${pendingLeaveCount} request(s) still in progress.`,
      href: "/dashboard/leave",
    });
  }

  notifications.slice(0, 2).forEach((notification) => {
    items.push({
      ...notification,
      id: `notification:${notification.id}`,
    });
  });

  return items.slice(0, 4);
}

function StatusCard({
  detail,
  title,
  value,
}: {
  detail: string;
  title: string;
  value: string;
}) {
  return (
    <article className="rounded-[20px] border border-border bg-surface-strong p-5 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted">
        {title}
      </p>
      <h4 className="mt-3 text-xl font-semibold text-foreground">{value}</h4>
      <p className="mt-2 text-sm text-muted">{detail}</p>
    </article>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border bg-white px-4 py-3">
      <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted">
        {label}
      </p>
      <p className="mt-1 text-sm font-semibold text-foreground">{value}</p>
    </div>
  );
}

function CompactInfo({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border bg-white px-4 py-3">
      <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted">
        {label}
      </p>
      <p className="mt-1 text-sm font-medium text-foreground">{value}</p>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="mt-5 rounded-2xl border border-dashed border-border bg-white/80 p-6 text-sm text-muted">
      {message}
    </div>
  );
}

function formatDate(value?: string | null) {
  if (!value) {
    return "Not set";
  }

  return new Date(value).toLocaleDateString();
}

function formatTime(value: string) {
  return new Date(value).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}
