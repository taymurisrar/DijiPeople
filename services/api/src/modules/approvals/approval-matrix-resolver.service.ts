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

    /*
     * BUG-1968 - every step is attempted, and the refusal names all of them.
     *
     * The policy is unchanged, deliberately: a chain with a step nobody can
     * approve is a misconfiguration, and submitting into it would leave a
     * request stuck with no route out.
     *
     * What changed is that this used to throw on the **first** unresolvable
     * step, so an administrator fixed one, resubmitted, and met the next - with
     * a message that never said which step it belonged to, or what to do. A
     * fresh tenant satisfies neither of its two seeded steps, so the module was
     * unusable and the error said only "Approval route requires a reporting
     * manager with a linked active user."
     */
    const route: ResolvedApprovalStep[] = [];
    const unresolved: string[] = [];
    for (const matrix of selected) {
      try {
        route.push(await this.resolveApprovers(input, matrix));
      } catch (error) {
        if (!(error instanceof BadRequestException)) throw error;
        unresolved.push(
          `Step ${matrix.sequence} (${this.humanizeApproverType(matrix.approverType)}): ${this.remediation(this.messageOf(error))}`,
        );
      }
    }

    if (unresolved.length) {
      const heading =
        unresolved.length === 1
          ? 'This request cannot be submitted because its approval route has a step nobody can approve.'
          : `This request cannot be submitted because its approval route has ${unresolved.length} steps nobody can approve.`;
      throw new BadRequestException({
        code: 'APPROVAL_ROUTE_UNRESOLVED',
        message: [
          heading,
          '',
          ...unresolved,
          '',
          'Ask an administrator to configure the approvers above, or to edit the approval matrix for this module, then submit again.',
        ].join('\n'),
      });
    }

    return mergeResolvedSteps(route);
  }

  /*
   * What the administrator has to *do*, keyed off the refusal each step raised.
   *
   * Derived from the thrown message rather than from a new error type per step
   * on purpose: the six refusals in `resolveApprovers` are the single list of
   * what can go wrong, and a parallel enum would be a second list to drift from
   * the first. The fallback returns the original message, so a refusal added
   * later degrades to today's behaviour instead of losing its text.
   */
  private remediation(message: string): string {
    if (/reporting manager/i.test(message))
      return 'the requester has no manager, or their manager has no active user account. Set a reporting manager on the employee record.';
    if (/department head/i.test(message))
      return 'the department has no active head or owner with a linked user. Set one on the department.';
    if (/business-unit head/i.test(message))
      return 'the business unit has no active head or owner with a linked user. Set one on the business unit.';
    if (/user approver without a selected user/i.test(message))
      return 'the step names a specific user but none is selected. Choose one, or change the approver type.';
    if (/role approver without a selected role/i.test(message))
      return 'the step names a role but none is selected. Choose one, or change the approver type.';
    if (/role has no active users/i.test(message))
      return 'the named role has no active users. Assign somebody to it, or point the step at a different approver.';
    return message;
  }

  private humanizeApproverType(approverType: ApprovalActorType): string {
    return approverType.toLowerCase().replace(/_/g, ' ');
  }

  /*
   * A `BadRequestException` built from a string carries it on `.message`; one
   * built from an object carries the object on `getResponse()`. Every refusal
   * in `resolveApprovers` uses the string form today, but reading only
   * `.message` would silently yield "Bad Request Exception" if one were changed.
   */
  private messageOf(error: BadRequestException): string {
    const response = error.getResponse();
    if (typeof response === 'string') return response;
    const message = (response as { message?: unknown }).message;
    if (typeof message === 'string') return message;
    return error.message;
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
      const managerUser = managerUserId
        ? await this.repository.findUserById(input.tenantId, managerUserId)
        : null;
      if (!managerUser) {
        throw new BadRequestException(
          'Approval route requires a reporting manager with a linked active user.',
        );
      }
      return {
        matrixId: matrix.id,
        sequence: matrix.sequence,
        approverType: ApprovalActorType.LINE_MANAGER,
        approvalMode: matrix.approvalMode,
        approverUserId: managerUser.id,
        approvalGroupKey: groupKey,
        candidateUserIds: [managerUser.id],
      };
    }
    if (matrix.approverType === ApprovalActorType.DEPARTMENT_HEAD) {
      const departmentId =
        matrix.departmentId ?? input.scopeContext?.departmentId;
      const userId = departmentId
        ? await this.repository.findDepartmentApproverUserId(
            input.tenantId,
            departmentId,
          )
        : null;
      if (!userId) {
        throw new BadRequestException(
          'Approval route requires an active department head or department owner with a linked user.',
        );
      }
      return {
        matrixId: matrix.id,
        sequence: matrix.sequence,
        approverType: ApprovalActorType.DEPARTMENT_HEAD,
        approvalMode: matrix.approvalMode,
        approverUserId: userId,
        approvalGroupKey: groupKey,
        candidateUserIds: [userId],
      };
    }
    if (matrix.approverType === ApprovalActorType.BUSINESS_UNIT_HEAD) {
      const businessUnitId =
        matrix.businessUnitId ?? input.scopeContext?.businessUnitId;
      const userId = businessUnitId
        ? await this.repository.findBusinessUnitApproverUserId(
            input.tenantId,
            businessUnitId,
          )
        : null;
      if (!userId) {
        throw new BadRequestException(
          'Approval route requires an active business-unit head or owner with a linked user.',
        );
      }
      return {
        matrixId: matrix.id,
        sequence: matrix.sequence,
        approverType: ApprovalActorType.BUSINESS_UNIT_HEAD,
        approvalMode: matrix.approvalMode,
        approverUserId: userId,
        approvalGroupKey: groupKey,
        candidateUserIds: [userId],
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
      `${matrix.approverType} approval routing is not supported by the active workflow resolver.`,
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
      const user = userId
        ? await this.repository.findUserById(input.tenantId, userId)
        : null;
      return user
        ? {
            sequence: 1,
            approverType: ApprovalActorType.LINE_MANAGER,
            approvalMode: ApprovalMode.ANY_ONE,
            approverUserId: user.id,
            approvalGroupKey: `${input.moduleKey}:1:fallback-manager`,
            candidateUserIds: [user.id],
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
