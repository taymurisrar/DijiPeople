export type PayrollCycleStatus =
  | "DRAFT"
  | "PROCESSING"
  | "REVIEW"
  | "FINALIZED";

export type PayrollRecordStatus =
  | "DRAFT"
  | "REVIEWED"
  | "FINALIZED";

export type PayFrequency =
  | "MONTHLY"
  | "SEMI_MONTHLY"
  | "BI_WEEKLY"
  | "WEEKLY";

export type PayrollRecord = {
  id: string;
  employeeId: string;
  payrollCycleId: string;
  gross: string;
  deductions: string;
  net: string;
  status: PayrollRecordStatus;
  lineItems?: Array<{
    code: string;
    label: string;
    type: string;
    amount: string;
    payFrequency?: PayFrequency;
    quantity?: number;
    sourceTimesheetIds?: string[];
  }> | null;
  sourceTimesheetIds?: string[] | null;
  timesheetSummary?: PayrollTimesheetSummary | null;
  adjustments?: unknown[] | null;
  createdAt: string;
  updatedAt: string;
  employee: {
    id: string;
    employeeCode: string;
    firstName: string;
    lastName: string;
    preferredName?: string | null;
    fullName: string;
    employmentStatus: string;
    department: {
      id: string;
      name: string;
      code?: string | null;
    } | null;
    designation: {
      id: string;
      name: string;
      level?: string | null;
    } | null;
    businessUnit?: {
      id: string;
      name: string;
    } | null;
  };
};

export type PayrollCycleRecord = {
  id: string;
  tenantId: string;
  businessUnitId?: string | null;
  processingCycleId?: string | null;
  periodStart: string;
  periodEnd: string;
  runDate?: string | null;
  status: PayrollCycleStatus;
  createdAt: string;
  updatedAt: string;
  counts: {
    records: number;
  };
  businessUnit?: {
    id: string;
    name: string;
    type?: string;
  } | null;
  processingCycle?: {
    id: string;
    name: string;
    status: string;
    cycleType: string;
  } | null;
  records: PayrollRecord[];
};

export type PayrollTimesheetSummary = {
  timesheetIds: string[];
  sourceTimesheetIds: string[];
  totalWorkDays: number;
  totalLeaveDays: number;
  totalHolidayDays: number;
  totalWeekendDays: number;
  totalWeekendWorkDays: number;
  totalWeekendWorkHours: number;
  totalHours: number;
  notes: string[];
  flags: string[];
  projects: Array<{ id: string; code?: string | null; name: string }>;
};

export type PayrollPreviewEmployee = {
  employee: PayrollRecord["employee"] & {
    email?: string | null;
  };
  compensation: {
    id: string;
    basicSalary: string;
    payFrequency: PayFrequency;
    currency: string;
    effectiveDate: string;
  } | null;
  timesheetSummary: PayrollTimesheetSummary | null;
  reason?: string;
  calculatedPayroll?: {
    gross: string;
    deductions: string;
    net: string;
    currency: string;
  };
  lineItems?: PayrollRecord["lineItems"];
  flags?: string[];
};

export type PayrollGenerationPreview = {
  cycle: {
    id: string;
    periodStart: string;
    periodEnd: string;
    status: PayrollCycleStatus;
  };
  settings: {
    payrollGenerationSource: string;
    requireApprovedTimesheetsForPayroll: boolean;
    includeLeavesInPayrollSummary: boolean;
    includeHolidaysInPayrollSummary: boolean;
    includeWeekendWorkInPayrollSummary: boolean;
  };
  summary: {
    employeesInScope: number;
    eligibleEmployees: number;
    missingTimesheets: number;
    blockedEmployees: number;
    approvedTimesheets: number;
    existingRecords: number;
  };
  eligibleEmployees: PayrollPreviewEmployee[];
  missingTimesheets: PayrollPreviewEmployee[];
  blockedEmployees: PayrollPreviewEmployee[];
};

export type PayrollCycleListResponse = {
  items: PayrollCycleRecord[];
  meta: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
  filters: {
    status: PayrollCycleStatus | null;
  };
};

export type EmployeeCompensationRecord = {
  id: string;
  tenantId: string;
  employeeId: string;
  basicSalary: string;
  payFrequency: PayFrequency;
  effectiveDate: string;
  endDate?: string | null;
  currency: string;
  createdAt: string;
  updatedAt: string;
  employee: {
    id: string;
    employeeCode: string;
    firstName: string;
    lastName: string;
    preferredName?: string | null;
    fullName: string;
    employmentStatus: string;
    department: {
      id: string;
      name: string;
      code?: string | null;
    } | null;
    designation: {
      id: string;
      name: string;
      level?: string | null;
    } | null;
  };
};
