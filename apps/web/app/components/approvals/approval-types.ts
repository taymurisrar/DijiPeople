export type ApprovalRequestItem = {
  id: string;
  moduleKey: string;
  entityType: string;
  entityId: string;
  requestNumber: string | null;
  title: string;
  status: string;
  submittedAtUtc: string | null;
  completedAtUtc: string | null;
  relatedRecordUrl: string;
  submittedByUser: { firstName: string; lastName: string; email: string };
  submittedForEmployee: { firstName: string; lastName: string; employeeCode: string } | null;
  currentStep: ApprovalStepItem | null;
  steps: ApprovalStepItem[];
};

export type ApprovalStepItem = {
  id: string;
  stepOrder: number;
  stepName: string;
  status: string;
  slaStatus: string;
  dueAtUtc: string | null;
  assignments: Array<{
    id: string;
    status: string;
    assignedToUser: { firstName: string; lastName: string; email: string } | null;
    assignedToRole: { name: string; key: string } | null;
  }>;
};

export type ApprovalsResponse = {
  items: ApprovalRequestItem[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};
