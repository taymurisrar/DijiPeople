import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { LeaveRepository } from './leave.repository';

/**
 * Which leave policy governs an employee, right now.
 *
 * Extracted from `LeaveService` when entitlement allocation was built
 * (EXECPLAN-0026), because allocation has to answer exactly the question the
 * balance gate answers, and answering it twice is how the two drift apart. It
 * is its own injectable rather than a method one service calls on the other,
 * because `LeaveService` calls the entitlement service and the entitlement
 * service needs this — sharing it through either of them would be a cycle.
 *
 * Behaviour is unchanged from the original private method; only its home moved.
 */

export const LeavePolicyScopes = {
  TENANT: 'TENANT',
  ORGANIZATION: 'ORGANIZATION',
  BUSINESS_UNIT: 'BUSINESS_UNIT',
  DEPARTMENT: 'DEPARTMENT',
  EMPLOYEE_LEVEL: 'EMPLOYEE_LEVEL',
  EMPLOYEE: 'EMPLOYEE',
} as const;

export type PolicyScopedEmployee = {
  id: string;
  departmentId?: string | null;
  businessUnitId?: string | null;
  employeeLevelId?: string | null;
};

@Injectable()
export class LeavePolicyResolverService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly leaveRepository: LeaveRepository,
  ) {}

  async resolveApplicableLeavePolicy(
    tenantId: string,
    employee: PolicyScopedEmployee,
    at: Date,
  ) {
    const assignments =
      await this.leaveRepository.findActiveLeavePolicyAssignments(tenantId, at);
    const businessUnit = employee.businessUnitId
      ? await this.prisma.businessUnit.findFirst({
          where: { id: employee.businessUnitId, tenantId },
          select: { organizationId: true },
        })
      : null;

    const specificity = [
      { scopeType: LeavePolicyScopes.EMPLOYEE, scopeId: employee.id, rank: 6 },
      {
        scopeType: LeavePolicyScopes.EMPLOYEE_LEVEL,
        scopeId: employee.employeeLevelId,
        rank: 5,
      },
      {
        scopeType: LeavePolicyScopes.DEPARTMENT,
        scopeId: employee.departmentId,
        rank: 4,
      },
      {
        scopeType: LeavePolicyScopes.BUSINESS_UNIT,
        scopeId: employee.businessUnitId,
        rank: 3,
      },
      {
        scopeType: LeavePolicyScopes.ORGANIZATION,
        scopeId: businessUnit?.organizationId,
        rank: 2,
      },
      { scopeType: LeavePolicyScopes.TENANT, scopeId: null, rank: 1 },
    ];

    const matches = assignments
      .filter((assignment) => assignment.leavePolicy?.isActive)
      .map((assignment) => {
        const matchedScope = specificity.find(
          (scope) =>
            assignment.scopeType === scope.scopeType &&
            (scope.scopeType === LeavePolicyScopes.TENANT ||
              assignment.scopeId === scope.scopeId),
        );

        return matchedScope ? { assignment, rank: matchedScope.rank } : null;
      })
      /*
       * A type predicate rather than `filter(Boolean)`: the latter removes the
       * nulls at runtime and leaves them in the type, so every read in the
       * comparator below was on a possibly-null value. TypeScript said so as
       * soon as the `any` came off the Prisma client.
       */
      .filter((match): match is NonNullable<typeof match> => match !== null)
      .sort((left, right) => {
        if (left.rank !== right.rank) return right.rank - left.rank;
        if (left.assignment.priority !== right.assignment.priority) {
          return right.assignment.priority - left.assignment.priority;
        }

        return (
          right.assignment.effectiveFrom.getTime() -
          left.assignment.effectiveFrom.getTime()
        );
      });

    return matches[0]?.assignment.leavePolicy ?? null;
  }
}
