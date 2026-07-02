export type AttendanceCorrectionStatus =
  | "DRAFT"
  | "SUBMITTED"
  | "PENDING_APPROVAL"
  | "APPROVED"
  | "REJECTED"
  | "RETURNED"
  | "CANCELLED";

export type AttendanceCorrectionRequest = {
  id: string;
  tenantId: string;
  attendanceEntryId: string | null;
  employeeId: string;
  requestedByUserId: string;
  requestNumber: string;
  correctionType: string;
  originalCheckInAtUtc: string | null;
  originalCheckOutAtUtc: string | null;
  requestedCheckInAtUtc: string | null;
  requestedCheckOutAtUtc: string | null;
  reason: string;
  status: AttendanceCorrectionStatus;
  submittedAtUtc: string | null;
  approvedAtUtc: string | null;
  rejectedAtUtc: string | null;
  actionComment: string | null;
  createdAtUtc: string;
  updatedAtUtc: string;
  employeeName: string;
  canEdit: boolean;
  canApprove: boolean;
  canReject: boolean;
  relatedRecordUrl: string;
  employee: {
    id: string;
    employeeCode: string | null;
    firstName: string;
    lastName: string;
    preferredName: string | null;
  };
  requestedByUser: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    email: string;
  };
  actionedByUser?: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    email: string;
  } | null;
  attendanceEntry?: {
    id: string;
    date: string;
    checkIn: string | null;
    checkOut: string | null;
    status: string;
  } | null;
  approval?: {
    id: string;
    status: string;
    currentStepId: string | null;
    steps: Array<{
      id: string;
      stepName: string;
      stepOrder: number;
      status: string;
      dueAtUtc: string | null;
      slaStatus: string;
      assignments: Array<{
        id: string;
        status: string;
        assignedToUser?: {
          firstName: string | null;
          lastName: string | null;
          email: string;
        } | null;
      }>;
      actions: Array<ApprovalAction>;
    }>;
    actions: Array<ApprovalAction>;
  } | null;
};

export type ApprovalAction = {
  id: string;
  actionType: string;
  comment: string | null;
  actionAtUtc: string;
  actionByUser: {
    firstName: string | null;
    lastName: string | null;
    email: string;
  };
};

export type AttendanceCorrectionListResponse = {
  items: AttendanceCorrectionRequest[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};
