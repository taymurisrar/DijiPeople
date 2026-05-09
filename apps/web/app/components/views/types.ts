import type { ModuleViewSelectorConfig } from "@/app/components/view-selector/types";
import type { EmployeeListItem } from "@/app/dashboard/employees/types";
import type { AttendanceEntryRecord } from "@/app/dashboard/attendance/types";
import type { LeaveRequestRecord } from "@/app/dashboard/leave/types";
import type { TimesheetRecord } from "@/app/dashboard/timesheets/types";

export type DashboardNotification = {
  id: string;
  title: string;
  detail: string;
  href?: string;
};

export type ProductivitySummary = {
  currentStatus: "ACTIVE" | "IDLE" | "AWAY" | "OFFLINE";
  lastSeenAt: string | null;
  todayActiveSeconds: number;
  todayIdleSeconds: number;
  todayAwaySeconds: number;
  utilizationPercent: number;
} | null;

export type EssDashboardUser = {
  email: string;
  firstName: string;
  lastName: string;
  permissionKeys: string[];
  roleLabel: string;
  tenantId: string;
};

export type EssTenantContext = {
  companyDisplayName: string;
  dashboardGreeting: string;
  employeePortalMessage: string;
};

export type EssDashboardViewModel = {
  attendanceAvailable: boolean;
  currentAttendanceEntry: AttendanceEntryRecord | null;
  currentTimesheet: TimesheetRecord | null;
  dashboardViews?: ModuleViewSelectorConfig;
  employee: EmployeeListItem | null;
  leaveRequests: LeaveRequestRecord[];
  notifications: DashboardNotification[];
  productivitySummary: ProductivitySummary;
  timesheets: TimesheetRecord[];
  tenantContext: EssTenantContext;
  user: EssDashboardUser;
};

export type PriorityItem = {
  id: string;
  title: string;
  detail: string;
  href?: string;
};

export type EssDashboardComputedState = {
  dashboardGreeting: string;
  pendingLeaveCount: number;
  approvedLeaveCount: number;
  totalTimesheetHours: number;
  todaysAttendanceValue: string;
  todaysAttendanceDetail: string;
  currentTimesheetValue: string;
  currentTimesheetDetail: string;
  priorityItems: PriorityItem[];
};