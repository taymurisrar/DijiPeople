import { BadRequestException, Injectable } from '@nestjs/common';
import { LeaveRepository } from './leave.repository';

const ApprovalActors = {
  LINE_MANAGER: 'LINE_MANAGER',
  ROLE: 'ROLE',
  USER: 'USER',
  MANAGER: 'MANAGER',
  HR: 'HR',
} as const;

const ApprovalModes = {
  ANY_ONE: 'ANY_ONE',
  ALL: 'ALL',
} as const;

const ApprovalModules = {
  LEAVE_REQUEST: 'LEAVE_REQUEST',
} as const;

const ApprovalScopes = {
  TENANT: 'TENANT',
  ORGANIZATION: 'ORGANIZATION',
  BUSINESS_UNIT: 'BUSINESS_UNIT',
  DEPARTMENT: 'DEPARTMENT',
  EMPLOYEE_LEVEL: 'EMPLOYEE_LEVEL',
  EMPLOYEE: 'EMPLOYEE',
} as const;

type ApprovalActorValue = (typeof ApprovalActors)[keyof typeof ApprovalActors];
type ApprovalModeValue = (typeof ApprovalModes)[keyof typeof ApprovalModes];
type ApprovalModuleValue = string;

type RequesterContext = {
  id: string;
  userId?: string | null;
  managerEmployeeId?: string | null;
  manager?: { id: string; userId: string | null } | null;
  departmentId?: string | null;
  businessUnitId?: string | null;
  employeeLevelId?: string | null;
};

type ResolveApprovalRouteInput = {
  tenantId: string;
  moduleKey: ApprovalModuleValue;
  requesterEmployee: RequesterContext;
  leavePolicyId?: string | null;
  leaveTypeId?: string | null;
  scopeContext?: {
    organizationId?: string | null;
    businessUnitId?: string | null;
    departmentId?: string | null;
    employeeLevelId?: string | null;
    employeeId?: string | null;
  };
};

export type ResolvedApprovalStep = {
  sequence: number;
  approverType: ApprovalActorValue;
  approvalMode: ApprovalModeValue;
  approverRoleId?: string | null;
  approverUserId?: string | null;
  approvalGroupKey: string;
  candidateUserIds: string[];
};

@Injectable()
export class ApprovalResolverService {
  constructor(private readonly leaveRepository: LeaveRepository) {}

  async resolveApprovalRoute(input: ResolveApprovalRouteInput) {
    const matrices = await this.leaveRepository.findApprovalMatricesForResolver(
      input.tenantId,
      input.moduleKey,
    );

    const matchedMatrices = this.pickMostSpecificMatrices(matrices, input);
    const source =
      matchedMatrices.length > 0
        ? matchedMatrices
        : await this.resolveLeaveFallback(input);

    const route: ResolvedApprovalStep[] = [];

    for (const matrix of source) {
      const approvalMode = matrix.approvalMode ?? ApprovalModes.ANY_ONE;
      const approverType = matrix.approverType;
      const approvalGroupKey = `${input.moduleKey}:${matrix.sequence}:${approverType}:${matrix.id ?? 'fallback'}`;

      if (
        approverType === ApprovalActors.LINE_MANAGER ||
        approverType === ApprovalActors.MANAGER
      ) {
        const managerUserId = input.requesterEmployee.manager?.userId;
        if (!managerUserId) {
          throw new BadRequestException(
            'Approval route requires a line manager, but no manager user is linked to this employee.',
          );
        }

        route.push({
          sequence: matrix.sequence,
          approverType: ApprovalActors.LINE_MANAGER,
          approvalMode,
          approverUserId: managerUserId,
          approvalGroupKey,
          candidateUserIds: [managerUserId],
        });
        continue;
      }

      if (approverType === ApprovalActors.USER) {
        if (!matrix.approverUserId) {
          throw new BadRequestException(
            'Approval route is configured for a user approver without a selected user.',
          );
        }

        route.push({
          sequence: matrix.sequence,
          approverType,
          approvalMode,
          approverUserId: matrix.approverUserId,
          approvalGroupKey,
          candidateUserIds: [matrix.approverUserId],
        });
        continue;
      }

      if (
        approverType === ApprovalActors.ROLE ||
        approverType === ApprovalActors.HR
      ) {
        const roleId =
          matrix.approverRoleId ??
          (approverType === ApprovalActors.HR
            ? (await this.leaveRepository.findRoleByKey(input.tenantId, 'hr'))
                ?.id
            : null);

        if (!roleId) {
          throw new BadRequestException(
            'Approval route is configured for a role approver without a selected role.',
          );
        }

        const candidates = await this.leaveRepository.findActiveUsersByRoleId(
          input.tenantId,
          roleId,
        );

        if (candidates.length === 0) {
          throw new BadRequestException(
            'Approval route role has no active users assigned.',
          );
        }

        route.push({
          sequence: matrix.sequence,
          approverType: ApprovalActors.ROLE,
          approvalMode,
          approverRoleId: roleId,
          approvalGroupKey,
          candidateUserIds: candidates.map((user) => user.id),
        });
        continue;
      }

      throw new BadRequestException(
        `${approverType} approval routing is not resolvable yet.`,
      );
    }

    return route.sort((a, b) => a.sequence - b.sequence);
  }

  private pickMostSpecificMatrices(
    matrices: Awaited<
      ReturnType<LeaveRepository['findApprovalMatricesForResolver']>
    >,
    input: ResolveApprovalRouteInput,
  ) {
    const scopes = this.buildScopeMatches(input);
    const candidates = [
      matrices.filter(
        (matrix) =>
          matrix.leavePolicyId === input.leavePolicyId &&
          matrix.leaveTypeId === input.leaveTypeId &&
          Boolean(input.leavePolicyId) &&
          Boolean(input.leaveTypeId),
      ),
      matrices.filter(
        (matrix) =>
          matrix.leavePolicyId === input.leavePolicyId &&
          matrix.leaveTypeId === null &&
          Boolean(input.leavePolicyId),
      ),
      matrices.filter(
        (matrix) =>
          matrix.leaveTypeId === input.leaveTypeId &&
          matrix.leavePolicyId === null &&
          Boolean(input.leaveTypeId),
      ),
      matrices.filter((matrix) =>
        scopes.some(
          (scope) =>
            matrix.scopeType === scope.scopeType &&
            matrix.scopeId === scope.scopeId,
        ),
      ),
      matrices.filter(
        (matrix) =>
          matrix.leavePolicyId === null &&
          matrix.leaveTypeId === null &&
          matrix.scopeType === null &&
          matrix.scopeId === null,
      ),
    ];

    return candidates.find((group) => group.length > 0) ?? [];
  }

  private buildScopeMatches(input: ResolveApprovalRouteInput) {
    const context = input.scopeContext ?? {};

    return [
      { scopeType: ApprovalScopes.EMPLOYEE, scopeId: context.employeeId },
      {
        scopeType: ApprovalScopes.EMPLOYEE_LEVEL,
        scopeId: context.employeeLevelId,
      },
      { scopeType: ApprovalScopes.DEPARTMENT, scopeId: context.departmentId },
      {
        scopeType: ApprovalScopes.BUSINESS_UNIT,
        scopeId: context.businessUnitId,
      },
      {
        scopeType: ApprovalScopes.ORGANIZATION,
        scopeId: context.organizationId,
      },
      { scopeType: ApprovalScopes.TENANT, scopeId: null },
    ].filter(
      (scope) => scope.scopeType === ApprovalScopes.TENANT || scope.scopeId,
    );
  }

  private async resolveLeaveFallback(input: ResolveApprovalRouteInput) {
    if (input.moduleKey !== ApprovalModules.LEAVE_REQUEST) {
      return [];
    }

    if (input.requesterEmployee.manager?.userId) {
      return [
        {
          id: 'fallback-line-manager',
          sequence: 1,
          approverType: ApprovalActors.LINE_MANAGER,
          approverRoleId: null,
          approverUserId: null,
          approvalMode: ApprovalModes.ANY_ONE,
        },
      ];
    }

    const hrRole = await this.leaveRepository.findRoleByKey(
      input.tenantId,
      'hr',
    );

    if (hrRole) {
      return [
        {
          id: 'fallback-hr-role',
          sequence: 1,
          approverType: ApprovalActors.ROLE,
          approverRoleId: hrRole.id,
          approverUserId: null,
          approvalMode: ApprovalModes.ANY_ONE,
        },
      ];
    }

    throw new BadRequestException(
      'No approval matrix is configured and no line manager or HR role fallback could be resolved.',
    );
  }
}
