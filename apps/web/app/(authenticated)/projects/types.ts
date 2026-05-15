export type ProjectStatus =
  | "DRAFT"
  | "PLANNING"
  | "ACTIVE"
  | "ON_HOLD"
  | "COMPLETED"
  | "CLOSED"
  | "CANCELLED";

export type ProjectAssignmentRecord = {
  id: string;
  employeeId: string;
  roleOnProject?: string | null;
  allocationPercent?: number | null;
  allocationHours?: number | null;
  allocationType?: "PERCENTAGE" | "HOURS";
  billableFlag: boolean;
  startDate?: string | null;
  endDate?: string | null;
  status?: "ACTIVE" | "INACTIVE";
  utilizationWarning?: string | null;
  employee: {
    id: string;
    employeeCode: string;
    firstName: string;
    lastName: string;
    preferredName?: string | null;
    fullName: string;
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

export type ProjectRecord = {
  id: string;
  tenantId: string;
  name: string;
  code?: string | null;
  description?: string | null;
  organizationId?: string | null;
  businessUnit?: { id: string; name: string; organizationId: string } | null;
  customer?: {
    id: string;
    name: string;
    code: string;
    industry?: string | null;
    status: string;
  } | null;
  timezone?: string | null;
  currencyCode?: string | null;
  billingType?: string;
  budgetHours?: number | null;
  budgetAmount?: number | null;
  budgetCurrencyCode?: string | null;
  consumedAmount?: number | null;
  burnRate?: number | null;
  plannedHours?: number | null;
  actualHours?: number | null;
  remainingHours?: number | null;
  projectHealth?: string;
  riskLevel?: string;
  priority?: string;
  deliveryStatus?: string;
  billingStatus?: string;
  allowTimesheets?: boolean;
  requireApproval?: boolean;
  approvalMode?: string;
  holidayCalendarId?: string | null;
  workScheduleId?: string | null;
  financials?: {
    budgetAmount?: number | null;
    consumedAmount?: number | null;
    burnRate?: number | null;
    plannedHours?: number | null;
    actualHours?: number | null;
    remainingHours?: number | null;
  };
  startDate?: string | null;
  endDate?: string | null;
  status: ProjectStatus;
  createdAt: string;
  updatedAt: string;
  assignedEmployees: ProjectAssignmentRecord[];
};

export type ProjectListResponse = {
  items: ProjectRecord[];
  meta: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
  filters: {
    search?: string | null;
    status?: ProjectStatus | null;
  };
};

export type AssignedProjectOption = {
  id: string;
  name: string;
  code?: string | null;
  status: ProjectStatus;
};
