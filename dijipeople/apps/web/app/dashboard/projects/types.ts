export type ProjectStatus =
  | "PLANNING"
  | "ACTIVE"
  | "ON_HOLD"
  | "COMPLETED"
  | "CANCELLED";

export type ProjectAssignmentRecord = {
  id: string;
  employeeId: string;
  roleOnProject?: string | null;
  allocationPercent?: number | null;
  billableFlag: boolean;
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
