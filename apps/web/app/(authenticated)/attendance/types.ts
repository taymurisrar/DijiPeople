export const ATTENDANCE_VIEW_OPTIONS = ["day", "week", "month"] as const;
export type AttendanceView = (typeof ATTENDANCE_VIEW_OPTIONS)[number];

export const ATTENDANCE_STATUS_OPTIONS = [
  "CHECKED_IN",
  "CHECKED_OUT",
  "PRESENT",
  "LATE",
  "ABSENT",
  "HALF_DAY",
  "MISSED_CHECK_OUT",
  "ON_LEAVE",
] as const;
export type AttendanceEntryStatus = (typeof ATTENDANCE_STATUS_OPTIONS)[number];

export const ATTENDANCE_MODE_OPTIONS = [
  "OFFICE",
  "REMOTE",
  "HYBRID",
  "MACHINE",
  "MANUAL",
] as const;
export type AttendanceMode = (typeof ATTENDANCE_MODE_OPTIONS)[number];

export const ATTENDANCE_SOURCE_OPTIONS = [
  "WEB",
  "MANUAL",
  "SYSTEM",
  "IMPORT",
  "MACHINE",
  "INTEGRATION",
] as const;
export type AttendanceEntrySource = (typeof ATTENDANCE_SOURCE_OPTIONS)[number];

export type AttendanceEntryRecord = {
  id: string;
  tenantId: string;
  employeeId: string;
  workScheduleId?: string | null;
  shiftTemplateId?: string | null;
  officeLocationId?: string | null;
  importedBatchId?: string | null;
  attendanceDate: string;
  date: string;
  checkInAt?: string | null;
  checkOutAt?: string | null;
  checkIn?: string | null;
  checkOut?: string | null;
  attendanceMode: AttendanceMode;
  status: AttendanceEntryStatus;
  source: AttendanceEntrySource;
  checkInSource?: AttendanceEntrySource | null;
  checkOutSource?: AttendanceEntrySource | null;
  checkInNote?: string | null;
  checkOutNote?: string | null;
  workSummary?: string | null;
  notes?: string | null;
  remoteLatitude?: number | null;
  remoteLongitude?: number | null;
  remoteAddressText?: string | null;
  checkInAddressText?: string | null;
  checkOutAddressText?: string | null;
  checkInLatitude?: number | null;
  checkInLongitude?: number | null;
  checkInLocation?: string | null;
  checkInLocationAccuracy?: number | null;
  checkInLocationCapturedAt?: string | null;
  checkOutLatitude?: number | null;
  checkOutLongitude?: number | null;
  checkOutLocation?: string | null;
  checkOutLocationAccuracy?: number | null;
  checkOutLocationCapturedAt?: string | null;
  isLateCheckIn: boolean;
  isLateCheckOut: boolean;
  lateCheckInMinutes?: number | null;
  lateCheckOutMinutes?: number | null;
  machineDeviceId?: string | null;
  durationMinutes?: number | null;
  durationLabel?: string | null;
  createdAt: string;
  updatedAt: string;
  employee: {
    id: string;
    employeeCode: string;
    firstName: string;
    lastName: string;
    preferredName?: string | null;
    fullName: string;
    managerEmployeeId?: string | null;
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
    manager: {
      id: string;
      employeeCode: string;
      firstName: string;
      lastName: string;
      preferredName?: string | null;
    } | null;
    location?: {
      id: string;
      name: string;
      code?: string | null;
      city?: string | null;
      state?: string | null;
      country?: string | null;
      timezone?: string | null;
    } | null;
  };
  officeLocation: {
    id: string;
    name: string;
    code?: string | null;
    city: string;
    state: string;
    country: string;
    timezone?: string | null;
  } | null;
  workSite?: {
    id: string;
    name: string;
    code?: string | null;
    city?: string | null;
    state?: string | null;
    country?: string | null;
    timezone?: string | null;
  } | null;
  workSchedule: {
    id: string;
    name: string;
    weeklyWorkDays: string[];
    standardStartTime: string;
    standardEndTime: string;
    graceMinutes?: number | null;
    isDefault: boolean;
  } | null;
  shift: {
    id: string;
    name: string;
    code: string;
    timezone: string;
    startTime: string;
    endTime: string;
  } | null;
  importedBatch: {
    id: string;
    fileName: string;
    status: string;
    importedAt?: string | null;
  } | null;
  canCurrentUserEdit: boolean;
  canCurrentUserCheckOut: boolean;
  checkOutBlockedReason?: string | null;
  isCurrentUsersEntry: boolean;
};

export type AttendanceListResponse = {
  items: AttendanceEntryRecord[];
  data?: AttendanceEntryRecord[];
  meta: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
  pagination?: {
    page: number;
    pageSize: number;
    total: number;
    totalItems?: number;
    totalPages: number;
  };
  summary?: AttendanceSummaryResponse["totals"];
  filters: {
    search?: string | null;
    dateFrom?: string | null;
    dateTo?: string | null;
    status?: AttendanceEntryStatus | null;
    attendanceMode?: AttendanceMode | null;
    source?: AttendanceEntrySource | null;
    employeeId?: string | null;
    departmentId?: string | null;
    officeLocationId?: string | null;
    sortField?: string | null;
    sortDirection?: "asc" | "desc" | null;
    scope: "mine" | "team" | "tenant";
  };
};

export type AttendanceSummaryResponse = {
  scope: "mine" | "team" | "tenant";
  view: AttendanceView;
  anchorDate: string;
  totals: {
    entries: number;
    present: number;
    late: number;
    remote: number;
    office: number;
    missedCheckout: number;
    workedMinutes: number;
    workedLabel?: string;
  };
  buckets: Array<{
    key: string;
    label: string;
    attendanceDate: string;
    entryCount: number;
    presentCount: number;
    lateCount: number;
    remoteCount: number;
    officeCount: number;
    missedCheckoutCount: number;
    workedMinutes: number;
    workedLabel?: string;
  }>;
};

export type TeamEmployeeOption = {
  id: string;
  employeeCode: string;
  fullName: string;
};

export type AttendanceLocationOption = {
  id: string;
  name: string;
  code?: string | null;
  city: string;
  state: string;
  country: string;
  timezone?: string | null;
};

export type AttendancePolicyRecord = {
  lateCheckInGraceMinutes: number;
  lateCheckOutGraceMinutes: number;
  requireOfficeLocationForOfficeMode: boolean;
  requireRemoteLocationForRemoteMode: boolean;
  allowRemoteWithoutLocation: boolean;
};

export type AttendanceIntegrationRecord = {
  id: string;
  name: string;
  integrationType: string;
  description?: string | null;
  endpointUrl?: string | null;
  username?: string | null;
  configJson?: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type AttendanceImportResult = {
  batchId: string;
  fileName: string;
  totalRows: number;
  successCount: number;
  failedCount: number;
  rowErrors: Array<{
    row: number;
    message: string;
  }>;
};
