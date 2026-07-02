import {
  ApprovalActorType,
  ApprovalMode,
  ApprovalModuleKey,
  ApprovalScopeType,
} from '@prisma/client';

export type ApprovalRequesterContext = {
  id: string;
  userId?: string | null;
  managerEmployeeId?: string | null;
  manager?: { id: string; userId: string | null } | null;
  departmentId?: string | null;
  businessUnitId?: string | null;
  employeeLevelId?: string | null;
};

export type ApprovalScopeContext = {
  organizationId?: string | null;
  businessUnitId?: string | null;
  departmentId?: string | null;
  employeeLevelId?: string | null;
  employeeId?: string | null;
};

export type ApprovalConditionContext = {
  amount?: number | string | null;
  duration?: number | string | null;
  leaveTypeId?: string | null;
  leavePolicyId?: string | null;
  claimTypeId?: string | null;
  claimTypeIds?: string[];
  loanPolicyId?: string | null;
  currencyCode?: string | null;
  values?: Record<string, unknown>;
};

export type ApprovalFallback =
  | { type: 'REPORTING_MANAGER' }
  | { type: 'ROLE'; roleKey: string };

export type ResolveApprovalRouteInput = {
  tenantId: string;
  moduleKey: ApprovalModuleKey;
  recordType?: string | null;
  effectiveAt?: Date;
  requesterEmployee: ApprovalRequesterContext;
  scopeContext?: ApprovalScopeContext;
  conditionContext?: ApprovalConditionContext;
  fallback?: ApprovalFallback[];
};

export type ResolvedApprovalStep = {
  matrixId?: string;
  sequence: number;
  approverType: ApprovalActorType;
  approvalMode: ApprovalMode;
  approverRoleId?: string | null;
  approverUserId?: string | null;
  approvalGroupKey: string;
  candidateUserIds: string[];
};

export type ApprovalMatrixScope = {
  scopeType: ApprovalScopeType;
  scopeId: string | null;
};
