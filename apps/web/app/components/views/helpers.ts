import type {
  EssDashboardComputedState,
  EssDashboardViewModel,
  PriorityItem,
} from "./types";
import { formatDashboardTime } from "./formatters";

export function buildEssDashboardState(
  props: EssDashboardViewModel,
): EssDashboardComputedState {
  const {
    attendanceAvailable,
    currentAttendanceEntry,
    currentTimesheet,
    employee,
    leaveRequests,
    notifications,
    tenantContext,
    timesheets,
    user,
  } = props;

  const dashboardGreeting =
    tenantContext.dashboardGreeting?.trim() || `Hello, ${user.firstName}`;

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

  const todaysAttendanceValue =
    currentAttendanceEntry?.status ?? "Not checked in";

  const todaysAttendanceDetail = attendanceAvailable
    ? currentAttendanceEntry?.checkIn
      ? `Checked in at ${formatDashboardTime(currentAttendanceEntry.checkIn)}`
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

  return {
    dashboardGreeting,
    pendingLeaveCount,
    approvedLeaveCount,
    totalTimesheetHours,
    todaysAttendanceValue,
    todaysAttendanceDetail,
    currentTimesheetValue,
    currentTimesheetDetail,
    priorityItems,
  };
}

function buildPriorityItems({
  attendanceAvailable,
  currentAttendanceEntry,
  currentTimesheet,
  employee,
  pendingLeaveCount,
  notifications,
}: Pick<
  EssDashboardViewModel,
  | "attendanceAvailable"
  | "currentAttendanceEntry"
  | "currentTimesheet"
  | "employee"
  | "notifications"
> & {
  pendingLeaveCount: number;
}) {
  const items: PriorityItem[] = [];

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