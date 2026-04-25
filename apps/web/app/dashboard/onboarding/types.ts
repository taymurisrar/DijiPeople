export type OnboardingStatus =
  | "DRAFT"
  | "NOT_STARTED"
  | "IN_PROGRESS"
  | "AWAITING_CANDIDATE_INPUT"
  | "READY_FOR_CONVERSION"
  | "BLOCKED"
  | "COMPLETED"
  | "Cancelled";

export type OnboardingTaskStatus =
  | "PENDING"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "Cancelled";

export type OnboardingTemplateRecord = {
  id: string;
  tenantId: string;
  name: string;
  description?: string | null;
  taskBlueprints: Array<{
    title: string;
    description?: string | null;
    dueOffsetDays?: number | null;
    assignedUserId?: string | null;
  }>;
  isDefault: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type EmployeeOnboardingRecord = {
  id: string;
  tenantId: string;
  candidateId?: string | null;
  employeeId?: string | null;
  templateId?: string | null;
  title: string;
  status: OnboardingStatus;
  ownerUserId?: string | null;
  startDate?: string | null;
  dueDate?: string | null;
  plannedJoiningDate?: string | null;
  readyForConversionAt?: string | null;
  targetDepartmentId?: string | null;
  targetDesignationId?: string | null;
  targetLocationId?: string | null;
  targetReportingManagerEmployeeId?: string | null;
  targetWorkEmail?: string | null;
  completedAt?: string | null;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
  candidate: {
    id: string;
    firstName: string;
    lastName: string;
    fullName: string;
    email: string;
    phone: string;
    currentStatus: string;
    nationalityCountryId?: string | null;
    nationality?: string | null;
    currentCountryId?: string | null;
    currentStateProvinceId?: string | null;
    currentCityId?: string | null;
    currentCountry?: string | null;
    currentStateProvince?: string | null;
    currentCity?: string | null;
  } | null;
  employee: {
    id: string;
    employeeCode: string;
    firstName: string;
    lastName: string;
    fullName: string;
    employmentStatus: string;
  } | null;
  template: {
    id: string;
    name: string;
    description?: string | null;
    isDefault: boolean;
  } | null;
  tasks: Array<{
    id: string;
    code?: string | null;
    checklistGroup?: string | null;
    title: string;
    description?: string | null;
    assignedUserId?: string | null;
    dueDate?: string | null;
    completedAt?: string | null;
    status: OnboardingTaskStatus;
    notes?: string | null;
    isRequired: boolean;
    sortOrder: number;
    assignedUser: {
      id: string;
      firstName: string;
      lastName: string;
      fullName: string;
      email: string;
    } | null;
  }>;
  progress: {
    totalTasks: number;
    completedTasks: number;
    requiredTasks: number;
    completedRequiredTasks: number;
    percent: number;
  };
  readiness: {
    isReadyForConversion: boolean;
    blockers: string[];
  };
};

export type OnboardingListResponse = {
  items: EmployeeOnboardingRecord[];
  meta: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
  filters: {
    search: string | null;
    status: OnboardingStatus | null;
  };
};
