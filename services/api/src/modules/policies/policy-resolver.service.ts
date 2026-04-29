import { Injectable } from '@nestjs/common';
import { PolicyAssignmentScopeType, PolicyType } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';

export type ResolvePolicyInput = {
  tenantId: string;
  policyType: PolicyType;
  employeeId?: string | null;
  employeeLevelId?: string | null;
  departmentId?: string | null;
  businessUnitId?: string | null;
  organizationId?: string | null;
  effectiveDate: Date;
};

const SCOPE_ORDER: PolicyAssignmentScopeType[] = [
  PolicyAssignmentScopeType.EMPLOYEE,
  PolicyAssignmentScopeType.EMPLOYEE_LEVEL,
  PolicyAssignmentScopeType.DEPARTMENT,
  PolicyAssignmentScopeType.BUSINESS_UNIT,
  PolicyAssignmentScopeType.ORGANIZATION,
  PolicyAssignmentScopeType.TENANT,
];

@Injectable()
export class PolicyResolverService {
  constructor(private readonly prisma: PrismaService) {}

  async resolvePolicy(input: ResolvePolicyInput) {
    const candidates = buildScopeCandidates(input);

    if (candidates.length === 0) {
      return null;
    }

    const assignments = await this.prisma.policyAssignment.findMany({
      where: {
        tenantId: input.tenantId,
        isActive: true,
        OR: candidates.map((candidate) => ({
          scopeType: candidate.scopeType,
          scopeId: candidate.scopeId,
        })),
        policy: {
          tenantId: input.tenantId,
          policyType: input.policyType,
          status: 'ACTIVE',
          isActive: true,
          effectiveFrom: { lte: input.effectiveDate },
          OR: [
            { effectiveTo: null },
            { effectiveTo: { gte: input.effectiveDate } },
          ],
        },
      },
      include: { policy: true },
    });

    const ranked = assignments.sort((left, right) => {
      const leftScopeRank = SCOPE_ORDER.indexOf(left.scopeType);
      const rightScopeRank = SCOPE_ORDER.indexOf(right.scopeType);

      if (leftScopeRank !== rightScopeRank) {
        return leftScopeRank - rightScopeRank;
      }

      if (left.priority !== right.priority) {
        return right.priority - left.priority;
      }

      return right.policy.version - left.policy.version;
    });

    return ranked[0]?.policy ?? null;
  }
}

function buildScopeCandidates(input: ResolvePolicyInput) {
  const candidates: Array<{
    scopeType: PolicyAssignmentScopeType;
    scopeId: string | null;
  }> = [];

  if (input.employeeId) {
    candidates.push({
      scopeType: PolicyAssignmentScopeType.EMPLOYEE,
      scopeId: input.employeeId,
    });
  }

  if (input.employeeLevelId) {
    candidates.push({
      scopeType: PolicyAssignmentScopeType.EMPLOYEE_LEVEL,
      scopeId: input.employeeLevelId,
    });
  }

  if (input.departmentId) {
    candidates.push({
      scopeType: PolicyAssignmentScopeType.DEPARTMENT,
      scopeId: input.departmentId,
    });
  }

  if (input.businessUnitId) {
    candidates.push({
      scopeType: PolicyAssignmentScopeType.BUSINESS_UNIT,
      scopeId: input.businessUnitId,
    });
  }

  if (input.organizationId) {
    candidates.push({
      scopeType: PolicyAssignmentScopeType.ORGANIZATION,
      scopeId: input.organizationId,
    });
  }

  candidates.push({
    scopeType: PolicyAssignmentScopeType.TENANT,
    scopeId: null,
  });

  return candidates;
}
