import { BadRequestException, Injectable } from '@nestjs/common';
import {
  ApprovalActorType,
  ApprovalMode,
  ApprovalScopeType,
  Prisma,
} from '@prisma/client';
import {
  ApprovalFallback,
  ResolveApprovalRouteInput,
  ResolvedApprovalStep,
} from './approval-matrix.contracts';
import {
  ApprovalMatrixRepository,
  ApprovalMatrixWithApprovers,
} from './approval-matrix.repository';

@Injectable()
export class ApprovalMatrixResolverService {
  constructor(private readonly repository: ApprovalMatrixRepository) {}

  async resolveApprovalRoute(
    input: ResolveApprovalRouteInput,
  ): Promise<ResolvedApprovalStep[]> {
    input = await this.hydrateScope(input);
    const matrices = await this.repository.findForResolution(
      input.tenantId,
      input.moduleKey,
      input.effectiveAt ?? new Date(),
    );
    const matches = matrices
      .filter((matrix) => this.matches(matrix, input))
      .map((matrix) => ({ matrix, specificity: this.specificity(matrix) }));
    const selected = [...new Set(matches.map((match) => match.matrix.sequence))]
      .sort((left, right) => left - right)
      .flatMap((sequence) => {
        const candidates = matches.filter(
          (match) => match.matrix.sequence === sequence,
        );
        const maximumSpecificity = Math.max(
          ...candidates.map((match) => match.specificity),
        );
        return candidates
          .filter((match) => match.specificity === maximumSpecificity)
          .map((match) => match.matrix);
      });

    if (!selected.length) {
      return this.resolveFallback(input);
    }

    const route: ResolvedApprovalStep[] = [];
    for (const matrix of selected) {
      route.push(await this.resolveApprovers(input, matrix));
    }
    return mergeResolvedSteps(route);
  }

  private async hydrateScope(input: ResolveApprovalRouteInput) {
    if (
      input.scopeContext?.organizationId ||
      !input.scopeContext?.businessUnitId
    )
      return input;
    const businessUnit = await this.repository.findBusinessUnitOrganizationId(
      input.tenantId,
      input.scopeContext.businessUnitId,
    );
    return {
      ...input,
      scopeContext: {
        ...input.scopeContext,
        organizationId: businessUnit?.organizationId ?? null,
      },
    };
  }

  private matches(
    matrix: ApprovalMatrixWithApprovers,
    input: ResolveApprovalRouteInput,
  ) {
    const scope = input.scopeContext ?? {};
    const condition = input.conditionContext ?? {};
    if (matrix.recordType && matrix.recordType !== input.recordType)
      return false;
    if (matrix.organizationId && matrix.organizationId !== scope.organizationId)
      return false;
    if (matrix.businessUnitId && matrix.businessUnitId !== scope.businessUnitId)
      return false;
    if (matrix.departmentId && matrix.departmentId !== scope.departmentId)
      return false;
    if (
      matrix.employeeLevelId &&
      matrix.employeeLevelId !== scope.employeeLevelId
    )
      return false;
    if (matrix.leaveTypeId && matrix.leaveTypeId !== condition.leaveTypeId)
      return false;
    if (
      matrix.leavePolicyId &&
      matrix.leavePolicyId !== condition.leavePolicyId
    )
      return false;
    if (
      matrix.claimTypeId &&
      matrix.claimTypeId !== condition.claimTypeId &&
      !condition.claimTypeIds?.includes(matrix.claimTypeId)
    )
      return false;
    if (matrix.loanPolicyId && matrix.loanPolicyId !== condition.loanPolicyId)
      return false;
    if (
      matrix.currencyCode &&
      matrix.currencyCode !== condition.currencyCode?.trim().toUpperCase()
    )
      return false;
    if (
      !matchesRange(
        condition.amount,
        matrix.minimumAmount,
        matrix.maximumAmount,
      )
    )
      return false;
    if (
      !matchesRange(
        condition.duration,
        matrix.minimumDuration,
        matrix.maximumDuration,
      )
    )
      return false;
    if (!matchesJsonConditions(matrix.conditions, condition.values))
      return false;
    return this.matchesLegacyScope(matrix, input);
  }

  private matchesLegacyScope(
    matrix: ApprovalMatrixWithApprovers,
    input: ResolveApprovalRouteInput,
  ) {
    if (!matrix.scopeType) return true;
    if (matrix.scopeType === ApprovalScopeType.TENANT) return !matrix.scopeId;
    const scope = input.scopeContext ?? {};
    const values: Partial<
      Record<ApprovalScopeType, string | null | undefined>
    > = {
      [ApprovalScopeType.ORGANIZATION]: scope.organizationId,
      [ApprovalScopeType.BUSINESS_UNIT]: scope.businessUnitId,
      [ApprovalScopeType.DEPARTMENT]: scope.departmentId,
      [ApprovalScopeType.EMPLOYEE_LEVEL]: scope.employeeLevelId,
      [ApprovalScopeType.EMPLOYEE]: scope.employeeId,
    };
    return Boolean(
      matrix.scopeId && values[matrix.scopeType] === matrix.scopeId,
    );
  }

  private specificity(matrix: ApprovalMatrixWithApprovers) {
    return [
      matrix.recordType,
      matrix.organizationId,
      matrix.businessUnitId,
      matrix.departmentId,
      matrix.employeeLevelId,
      matrix.leaveTypeId,
      matrix.leavePolicyId,
      matrix.claimTypeId,
      matrix.loanPolicyId,
      matrix.currencyCode,
      matrix.minimumAmount,
      matrix.maximumAmount,
      matrix.minimumDuration,
      matrix.maximumDuration,
      matrix.scopeType && matrix.scopeType !== ApprovalScopeType.TENANT
        ? matrix.scopeId
        : null,
      matrix.conditions,
    ].filter((value) => value !== null && value !== undefined).length;
  }

  private async resolveApprovers(
    input: ResolveApprovalRouteInput,
    matrix: ApprovalMatrixWithApprovers,
  ): Promise<ResolvedApprovalStep> {
    const groupKey = `${input.moduleKey}:${matrix.sequence}:${matrix.approverType}:${matrix.id}`;
    if (
      matrix.approverType === ApprovalActorType.LINE_MANAGER ||
      matrix.approverType === ApprovalActorType.MANAGER ||
      matrix.approverType === ApprovalActorType.REQUEST_OWNER_MANAGER
    ) {
      const managerUserId = input.requesterEmployee.manager?.userId;
      if (!managerUserId) {
        throw new BadRequestException(
          'Approval route requires a reporting manager with a linked active user.',
        );
      }
      return {
        matrixId: matrix.id,
        sequence: matrix.sequence,
        approverType: ApprovalActorType.LINE_MANAGER,
        approvalMode: matrix.approvalMode,
        approverUserId: managerUserId,
        approvalGroupKey: groupKey,
        candidateUserIds: [managerUserId],
      };
    }
    if (matrix.approverType === ApprovalActorType.USER) {
      if (!matrix.approverUserId) {
        throw new BadRequestException(
          'Approval route is configured for a user approver without a selected user.',
        );
      }
      return {
        matrixId: matrix.id,
        sequence: matrix.sequence,
        approverType: matrix.approverType,
        approvalMode: matrix.approvalMode,
        approverUserId: matrix.approverUserId,
        approvalGroupKey: groupKey,
        candidateUserIds: [matrix.approverUserId],
      };
    }
    if (
      matrix.approverType === ApprovalActorType.ROLE ||
      matrix.approverType === ApprovalActorType.HR
    ) {
      const role = matrix.approverRoleId
        ? { id: matrix.approverRoleId }
        : matrix.approverType === ApprovalActorType.HR
          ? await this.repository.findRoleByKey(input.tenantId, 'hr')
          : null;
      if (!role) {
        throw new BadRequestException(
          'Approval route is configured for a role approver without a selected role.',
        );
      }
      const users = await this.repository.findActiveUsersByRoleId(
        input.tenantId,
        role.id,
      );
      if (!users.length) {
        throw new BadRequestException(
          'Approval route role has no active users assigned.',
        );
      }
      return {
        matrixId: matrix.id,
        sequence: matrix.sequence,
        approverType: ApprovalActorType.ROLE,
        approvalMode: matrix.approvalMode,
        approverRoleId: role.id,
        approvalGroupKey: groupKey,
        candidateUserIds: users.map((user) => user.id),
      };
    }
    throw new BadRequestException(
      `${matrix.approverType} approval routing is not resolvable because the required head/owner relationship is not configured.`,
    );
  }

  private async resolveFallback(input: ResolveApprovalRouteInput) {
    for (const fallback of input.fallback ?? []) {
      const step = await this.resolveFallbackStep(input, fallback);
      if (step) return [step];
    }
    return [];
  }

  private async resolveFallbackStep(
    input: ResolveApprovalRouteInput,
    fallback: ApprovalFallback,
  ): Promise<ResolvedApprovalStep | null> {
    if (fallback.type === 'REPORTING_MANAGER') {
      const userId = input.requesterEmployee.manager?.userId;
      return userId
        ? {
            sequence: 1,
            approverType: ApprovalActorType.LINE_MANAGER,
            approvalMode: ApprovalMode.ANY_ONE,
            approverUserId: userId,
            approvalGroupKey: `${input.moduleKey}:1:fallback-manager`,
            candidateUserIds: [userId],
          }
        : null;
    }
    const role = await this.repository.findRoleByKey(
      input.tenantId,
      fallback.roleKey,
    );
    if (!role) return null;
    const users = await this.repository.findActiveUsersByRoleId(
      input.tenantId,
      role.id,
    );
    return users.length
      ? {
          sequence: 1,
          approverType: ApprovalActorType.ROLE,
          approvalMode: ApprovalMode.ANY_ONE,
          approverRoleId: role.id,
          approvalGroupKey: `${input.moduleKey}:1:fallback-role:${role.id}`,
          candidateUserIds: users.map((user) => user.id),
        }
      : null;
  }
}

function matchesRange(
  value: number | string | null | undefined,
  minimum: Prisma.Decimal | null,
  maximum: Prisma.Decimal | null,
) {
  if (!minimum && !maximum) return true;
  if (value === null || value === undefined) return false;
  const decimal = new Prisma.Decimal(value);
  return (
    (!minimum || decimal.gte(minimum)) && (!maximum || decimal.lte(maximum))
  );
}

function matchesJsonConditions(
  configured: Prisma.JsonValue | null,
  values: Record<string, unknown> | undefined,
) {
  if (!configured) return true;
  if (!isRecord(configured)) return false;
  if (!values) return false;
  return Object.entries(configured).every(
    ([key, expected]) =>
      JSON.stringify(values[key]) === JSON.stringify(expected),
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function mergeResolvedSteps(steps: ResolvedApprovalStep[]) {
  return [...new Set(steps.map((step) => step.sequence))]
    .sort((left, right) => left - right)
    .map((sequence) => {
      const group = steps.filter((step) => step.sequence === sequence);
      const modes = new Set(group.map((step) => step.approvalMode));
      if (modes.size !== 1) {
        throw new BadRequestException(
          `Approval matrix sequence ${sequence} mixes ANY_ONE and ALL modes.`,
        );
      }
      const roleIds = [
        ...new Set(
          group
            .map((step) => step.approverRoleId)
            .filter((value): value is string => Boolean(value)),
        ),
      ];
      return {
        ...group[0],
        approverRoleId: roleIds.length === 1 ? roleIds[0] : null,
        approverUserId: null,
        approvalGroupKey: group.map((step) => step.approvalGroupKey).join('|'),
        candidateUserIds: [
          ...new Set(group.flatMap((step) => step.candidateUserIds)),
        ],
      } as ResolvedApprovalStep;
    });
}
