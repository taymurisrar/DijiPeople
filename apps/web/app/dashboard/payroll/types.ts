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
  }> | null;
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

export type PayrollCycleRecord = {
  id: string;
  tenantId: string;
  periodStart: string;
  periodEnd: string;
  runDate?: string | null;
  status: PayrollCycleStatus;
  createdAt: string;
  updatedAt: string;
  counts: {
    records: number;
  };
  records: PayrollRecord[];
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

