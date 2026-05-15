export type TimesheetStatus = "DRAFT" | "SUBMITTED" | "APPROVED" | "REJECTED";

export type TimesheetEntryType =
  | "ON_WORK"
  | "ON_LEAVE"
  | "WEEKEND"
  | "HOLIDAY";

export type TimesheetDayRecord = {
  id: string;
  employeeId: string;
  date: string;
  dayOfWeek: string;
  entryType: TimesheetEntryType | null;
  isWeekend: boolean;
  isHoliday: boolean;
  hoursWorked: number;
  note?: string | null;
  leaveRequestId?: string | null;
  leaveRequest?: {
    id: string;
    status: string;
    leaveType: {
      id: string;
      name: string;
    };
  } | null;
  createdAt: string;
  updatedAt: string;
};

export type TimesheetRecord = {
  id: string;
  tenantId: string;
  employeeId: string;
  year: number;
  month: number;
  periodStart: string;
  periodEnd: string;
  status: TimesheetStatus;
  submittedAt?: string | null;
  approvedAt?: string | null;
  rejectedAt?: string | null;
  reviewedAt?: string | null;
  submittedNote?: string | null;
  reviewNote?: string | null;
  comments?: string | null;
  createdAt: string;
  updatedAt: string;
  totalHours: number;
  summary: {
    totalWorkDays: number;
    totalLeaveDays: number;
    totalWeekendDays: number;
    totalHolidayDays: number;
    totalHours: number;
    incompleteDays: string[];
  };
  employee: {
    id: string;
    employeeCode: string;
    firstName: string;
    lastName: string;
    preferredName?: string | null;
    fullName: string;
    department?: {
      id: string;
      code?: string | null;
      name: string;
    } | null;
    location?: {
      id: string;
      name: string;
    } | null;
    businessUnit?: {
      id: string;
      name: string;
    } | null;
    reportingManager: {
      id: string;
      employeeCode: string;
      firstName: string;
      lastName: string;
    } | null;
  };
  approverUser: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
  } | null;
  entries: TimesheetDayRecord[];
  canCurrentUserSubmit: boolean;
  canCurrentUserApprove: boolean;
  canCurrentUserReject: boolean;
  canCurrentUserEdit: boolean;
};

export type TimesheetListResponse = {
  items: TimesheetRecord[];
  meta: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
  filters: {
    year?: number | null;
    month?: number | null;
    employeeId?: string | null;
    status?: TimesheetStatus | null;
    scope: "mine" | "team" | "tenant";
  };
};
