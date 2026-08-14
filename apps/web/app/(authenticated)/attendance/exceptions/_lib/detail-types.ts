/**
 * The exception detail shape.
 *
 * Coordinates are deliberately absent. They are fetched separately, behind
 * `attendance.locationEvidence.read`, so a type that cannot hold them is one
 * more thing standing between a position and a page every manager can open.
 */

export type AttendanceExceptionDetail = {
  id: string;
  type: string;
  status: string;
  severity: string;
  message: string;
  detail: unknown;
  attendanceDate: string;
  detectedAt: string;
  resolvedAt: string | null;
  resolvedById: string | null;
  resolutionNote: string | null;
  resolutionSource: string | null;
  employee: {
    id: string;
    employeeCode: string | null;
    name: string;
    configuredWorkMode: string | null;
  };
  workSite: { id: string; name: string } | null;
  attendanceDay: {
    status: string;
    locked: boolean;
    lockedAt: string | null;
    lockReason: string | null;
    derivedWorkMode: string | null;
    scheduledMinutes: number;
    workedMinutes: number;
    officeMinutes: number;
    remoteMinutes: number;
    fieldMinutes: number;
    breakMinutes: number;
    lateMinutes: number;
    earlyDepartureMinutes: number;
    earlyArrivalMinutes: number;
    extraMinutes: number;
    approvedOvertimeMinutes: number;
    firstCheckInAt: string | null;
    lastCheckOutAt: string | null;
    isHoliday: boolean;
    isWeekend: boolean;
    isOffDay: boolean;
    onLeave: boolean;
    lastReconciledAt: string | null;
    shift: {
      id: string;
      name: string;
      startTime: string;
      endTime: string;
      lateGraceMinutes: number;
      earlyExitGraceMinutes: number;
    } | null;
  } | null;
  sessions: Array<{
    id: string;
    sequence: number;
    startedAt: string;
    endedAt: string | null;
    durationMinutes: number | null;
    workMode: string;
    workSiteId: string | null;
    workSiteName: string | null;
    startSource: string;
    endSource: string | null;
    status: string;
    isBreak: boolean;
    isAdjusted: boolean;
  }>;
  leave: {
    id: string;
    typeName: string | null;
    startDate: string;
    endDate: string;
    totalDays: number | null;
  } | null;
  linkedCorrection: {
    id: string;
    requestNumber: string;
    correctionType: string;
    status: string;
    reason: string;
    requestedBy: string | null;
    approver: string | null;
    decisionNote: string | null;
    decidedAt: string | null;
  } | null;
  corrections: Array<{
    id: string;
    requestNumber: string;
    correctionType: string;
    status: string;
    reason: string;
    createdAtUtc: string;
  }>;
  /** Whether this type has coordinates, and whether the caller may see them. */
  locationEvidence: { relevant: boolean; viewable: boolean };
  history: Array<{ at: string; label: string; detail: string | null }>;
};

/** One recorded location decision. Only ever fetched on demand. */
export type LocationEvidenceRow = {
  id: string;
  capturedAt: string;
  action: string;
  captureSource: string;
  latitude: number | null;
  longitude: number | null;
  accuracyMeters: number | null;
  distanceMeters: number | null;
  insideGeofence: boolean | null;
  geofenceRadiusMeters: number | null;
  effectiveAccuracyLimitMeters: number | null;
  outcome: string;
  reasonCode: string;
  resolvedWorkMode: string | null;
  matchedWorkSite: { id: string; name: string } | null;
  ipAddress: string | null;
};
