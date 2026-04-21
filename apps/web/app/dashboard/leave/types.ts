export type LeaveRequestStatus =
  | "PENDING"
  | "APPROVED"
  | "REJECTED"
  | "CANCELLED";

export type ApprovalActorType = "MANAGER" | "HR";

export type LeaveTypeOption = {
  id: string;
  name: string;
  code: string;
  category: string;
  requiresApproval: boolean;
  isPaid: boolean;
};

export type LeaveApprovalStep = {
  id: string;
  stepOrder: number;
  approverType: ApprovalActorType;
  approverUserId?: string | null;
  status: string;
  actedAt?: string | null;
  comments?: string | null;
  approverUser?: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
  } | null;
};

export type LeaveRequestRecord = {
  id: string;
  tenantId: string;
  employeeId: string;
  leaveTypeId: string;
  startDate: string;
  endDate: string;
  totalDays: string;
  reason?: string | null;
  status: LeaveRequestStatus;
  attachmentRequired: boolean;
  attachmentReference?: string | null;
  documents?: Array<{
    id: string;
    documentType: {
      id: string;
      key?: string | null;
      name: string;
    } | null;
    documentCategory: {
      id: string;
      code?: string | null;
      name: string;
    } | null;
    title?: string | null;
    originalFileName: string;
    mimeType?: string | null;
    sizeInBytes?: number | null;
    uploadedByUser: {
      id: string;
      firstName: string;
      lastName: string;
      fullName: string;
      email: string;
    } | null;
    createdAt: string;
    viewPath: string;
    downloadPath: string;
  }>;
  createdAt: string;
  updatedAt: string;
  employee: {
    id: string;
    employeeCode: string;
    firstName: string;
    lastName: string;
    preferredName?: string | null;
    fullName: string;
  };
  leaveType: LeaveTypeOption;
  approvalSteps: LeaveApprovalStep[];
  pendingStep?: {
    id: string;
    stepOrder: number;
    approverType: ApprovalActorType;
    approverUserId?: string | null;
  } | null;
  canCurrentUserApprove: boolean;
  canCurrentUserReject: boolean;
  canCurrentUserCancel: boolean;
};

export type LeaveRequestFormValues = {
  leaveTypeId: string;
  startDate: string;
  endDate: string;
  reason: string;
};
