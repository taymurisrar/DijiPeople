/**
 * What the caller may do with one approval, decided by the API from the module
 * that raised it, the caller's permissions in that module, and whether the
 * pending step is theirs. `reason` is what the command bar shows when nothing
 * is possible, so it is written for the person reading it.
 */
export type ApprovalDecisionCapability = {
  canApprove: boolean;
  canReject: boolean;
  canCancel: boolean;
  reason: string | null;
};

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
  decision: ApprovalDecisionCapability;
  submittedByUser: {
    firstName: string;
    lastName: string;
    email: string;
  } | null;
  submittedForEmployee: {
    firstName: string;
    lastName: string;
    employeeCode: string;
  } | null;
  currentStep: ApprovalStepItem | null;
  steps: ApprovalStepItem[];
};

export type ApprovalActionItem = {
  id: string;
  actionType: string;
  comment: string | null;
  actionAtUtc: string | null;
  actionByUser: {
    firstName: string;
    lastName: string;
    email: string;
  } | null;
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
    assignedToUser: {
      firstName: string;
      lastName: string;
      email: string;
    } | null;
    assignedToRole: { name: string; key: string } | null;
  }>;
};

/**
 * `GET /approvals/:id` wraps its payload in `item`; `GET /approvals` does not
 * wrap its list. That asymmetry is the whole of BUG-2695 — the detail page was
 * typed as the bare record and read `approval.title` straight off the envelope,
 * so every field on the screen was `undefined`. The envelope is modelled here
 * so the compiler will not let that be written again.
 */
export type ApprovalDetailResponse = {
  item: ApprovalRequestItem & {
    actions: ApprovalActionItem[];
    steps: Array<ApprovalStepItem & { actions?: ApprovalActionItem[] }>;
  };
};

export type ApprovalsResponse = {
  items: ApprovalRequestItem[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};
