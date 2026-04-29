export type PayrollCalendarRecord = {
  id: string;
  tenantId: string;
  businessUnitId?: string | null;
  name: string;
  frequency: "MONTHLY" | "SEMI_MONTHLY" | "BIWEEKLY" | "WEEKLY";
  timezone: string;
  currencyCode: string;
  isDefault: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type PayrollPeriodRecord = {
  id: string;
  tenantId: string;
  payrollCalendarId: string;
  name: string;
  periodStart: string;
  periodEnd: string;
  cutoffDate?: string | null;
  paymentDate?: string | null;
  status:
    | "OPEN"
    | "INPUT_CLOSED"
    | "PROCESSING"
    | "APPROVED"
    | "PAID"
    | "LOCKED";
  payrollCalendar?: PayrollCalendarRecord;
};

export type PayrollRunRecord = {
  id: string;
  tenantId: string;
  payrollPeriodId: string;
  runNumber: number;
  status:
    | "DRAFT"
    | "CALCULATING"
    | "CALCULATED"
    | "REVIEWED"
    | "APPROVED"
    | "PAID"
    | "LOCKED"
    | "FAILED";
  calculatedAt?: string | null;
  lockedAt?: string | null;
  notes?: string | null;
  payrollPeriod?: PayrollPeriodRecord;
  employees?: PayrollRunEmployeeRecord[];
  exceptions?: PayrollExceptionRecord[];
};

export type PayrollRunEmployeeRecord = {
  id: string;
  employeeId: string;
  status: string;
  currencyCode: string;
  grossEarnings: string;
  totalDeductions: string;
  totalTaxes: string;
  totalReimbursements: string;
  employerContributions: string;
  netPay: string;
  employee?: {
    id: string;
    employeeCode: string;
    firstName: string;
    lastName: string;
  };
  lineItems: PayrollRunLineItemRecord[];
};

export type PayrollRunLineItemRecord = {
  id: string;
  category: string;
  sourceType?: string | null;
  sourceId?: string | null;
  label: string;
  quantity?: string | null;
  rate?: string | null;
  amount: string;
  currencyCode: string;
  payComponent?: { code: string; name: string } | null;
};

export type PayrollExceptionRecord = {
  id: string;
  employeeId?: string | null;
  severity: "INFO" | "WARNING" | "ERROR" | "BLOCKER";
  errorType: string;
  message: string;
  isResolved: boolean;
  employee?: {
    employeeCode: string;
    firstName: string;
    lastName: string;
  } | null;
};

export type PayslipRecord = {
  id: string;
  tenantId: string;
  payrollRunId: string;
  payrollRunEmployeeId: string;
  employeeId: string;
  payslipNumber: string;
  status: "DRAFT" | "GENERATED" | "PUBLISHED" | "VOID";
  currencyCode: string;
  grossEarnings: string;
  totalDeductions: string;
  totalTaxes: string;
  totalReimbursements: string;
  employerContributions: string;
  netPay: string;
  generatedAt?: string | null;
  publishedAt?: string | null;
  voidedAt?: string | null;
  voidReason?: string | null;
  employee?: {
    id: string;
    employeeCode: string;
    firstName: string;
    lastName: string;
    email?: string | null;
  };
  payrollRun?: PayrollRunRecord;
  lineItems: PayslipLineItemRecord[];
  eventLogs?: PayslipEventLogRecord[];
};

export type PayslipLineItemRecord = {
  id: string;
  category: string;
  label: string;
  quantity?: string | null;
  rate?: string | null;
  amount: string;
  currencyCode: string;
  displayOrder: number;
  displayOnPayslip: boolean;
  payComponent?: {
    id: string;
    code: string;
    name: string;
    componentType: string;
  } | null;
};

export type PayslipEventLogRecord = {
  id: string;
  eventType:
    | "GENERATED"
    | "REGENERATED"
    | "PUBLISHED"
    | "VOIDED"
    | "VIEWED"
    | "DOWNLOADED";
  actorUserId?: string | null;
  message?: string | null;
  createdAt: string;
};
