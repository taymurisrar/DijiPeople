export type TimesheetStatus =
  | "NOT_STARTED"
  | "DRAFT"
  | "IN_PROGRESS"
  | "SUBMITTED"
  | "PENDING_APPROVAL"
  | "PARTIALLY_APPROVED"
  | "APPROVED"
  | "REJECTED"
  | "OVERDUE"
  | "PAYROLL_READY"
  | "PAYROLL_PROCESSED"
  | "LOCKED"
  | "NOT_REQUIRED"
  | "AUTO_COMPLETED"
  | "EXCEPTION"
  | "CANCELLED";

export type TimesheetWeekStatus =
  | "NOT_AVAILABLE"
  | "NOT_STARTED"
  | "OPEN"
  | "DRAFT"
  | "INCOMPLETE"
  | "READY_TO_SUBMIT"
  | "SUBMITTED"
  | "PENDING_APPROVAL"
  | "PARTIALLY_APPROVED"
  | "APPROVED"
  | "REJECTED"
  | "REOPENING_REQUESTED"
  | "REOPENED"
  | "OVERDUE"
  | "PAYROLL_READY"
  | "PAYROLL_PROCESSED"
  | "LOCKED"
  | "CANCELLED";

export type TimesheetWeekEntry = {
  id: string;
  projectId?: string | null;
  project?: { id: string; name: string; code?: string | null } | null;
  projectAssignmentId?: string | null;
  taskId?: string | null;
  activityTypeId?: string | null;
  workLocationId?: string | null;
  costCenterId?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  hours: number;
  billable: boolean;
  notes?: string | null;
  activityCode?: string | null;
  source: string;
  approvalStatus: string;
  payrollCategory?: string | null;
  integrationReference?: string | null;
};

export type TimesheetDay = {
  id: string;
  date: string;
  dayOfWeek: string;
  dayType: string;
  dayTypeSource: string;
  expectedHours: number;
  availableHours: number;
  enteredHours: number;
  attendanceHours: number;
  attendanceEntryId?: string | null;
  attendanceCheckIn?: string | null;
  attendanceCheckOut?: string | null;
  attendanceMode?: string | null;
  attendanceStatus?: string | null;
  approvedLeaveHours: number;
  holidayName?: string | null;
  leaveTypeName?: string | null;
  isWeekend: boolean;
  isHoliday: boolean;
  isApprovedLeave: boolean;
  isLocked: boolean;
  lockReason?: string | null;
  completionStatus: string;
  varianceMinutes: number;
  varianceStatus: string;
  version: number;
  entries: TimesheetWeekEntry[];
};

export type TimesheetWeek = {
  id: string;
  weekNumber: number;
  startDate: string;
  endDate: string;
  status: TimesheetWeekStatus;
  submissionDeadline?: string | null;
  lateSubmissionOverrideAt?: string | null;
  lateSubmissionOverrideReason?: string | null;
  submittedAt?: string | null;
  approvalRequestId?: string | null;
  requiredHours: number;
  enteredHours: number;
  leaveHours: number;
  holidayHours: number;
  weekendHours: number;
  billableHours: number;
  nonBillableHours: number;
  overtimeHours: number;
  lockStatus: string;
  rejectionReason?: string | null;
  approvalVersion: number;
  payrollEligibility: boolean;
  version: number;
  canEdit: boolean;
  canSubmit: boolean;
  canOverrideLateSubmission?: boolean;
  canApprove?: boolean;
  canReject?: boolean;
  canWithdraw?: boolean;
  reopeningRequests: Array<{
    id: string;
    status: string;
    reason: string;
    requestedAt: string;
    approvalRequestId?: string | null;
    approverUserId?: string | null;
    approvedAt?: string | null;
    rejectedAt?: string | null;
    decisionReason?: string | null;
    canDecide?: boolean;
  }>;
  days: TimesheetDay[];
};

export type TimesheetEntryType = "ON_WORK" | "ON_LEAVE" | "WEEKEND" | "HOLIDAY";

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
  projectId?: string | null;
  project?: {
    id: string;
    name: string;
    code?: string | null;
  } | null;
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
  completionPercentage: number;
  requiredHours: number;
  enteredHours: number;
  approvedLeaveHours: number;
  holidayHours: number;
  weekendHours: number;
  billableHours: number;
  nonBillableHours: number;
  overtimeHours: number;
  payrollStatus: string;
  payrollBlockers: string[];
  lockStatus: string;
  policyId?: string | null;
  policyVersion?: number | null;
  settings?: {
    allowCopyPreviousWeek: boolean;
    attendanceIntegrationMode: string;
    requireProject: boolean;
    allowLateSubmission: boolean;
    allowPayrollLateSubmissionOverride: boolean;
  };
  version: number;
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
  weeks: TimesheetWeek[];
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
