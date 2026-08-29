import {
  ApprovalActorType,
  ApprovalMode,
  ApprovalModuleKey,
  ApprovalScopeType,
  Prisma,
} from '@prisma/client';
import { ApprovalMatrixResolverService } from './approval-matrix-resolver.service';

describe('ApprovalMatrixResolverService', () => {
  it('resolves sequential steps and picks the most specific conditions per sequence', async () => {
    const repository = repositoryMock([
      matrix({ sequence: 1, approverType: ApprovalActorType.LINE_MANAGER }),
      matrix({
        id: 'generic-second',
        sequence: 2,
        approverType: ApprovalActorType.USER,
        approverUserId: 'generic-user',
      }),
      matrix({
        id: 'specific-second',
        sequence: 2,
        approverType: ApprovalActorType.ROLE,
        approverRoleId: 'finance-role',
        approvalMode: ApprovalMode.ALL,
        recordType: 'loanRequest',
        organizationId: 'org-1',
        businessUnitId: 'bu-1',
        departmentId: 'dept-1',
        employeeLevelId: 'level-1',
        loanPolicyId: 'policy-1',
        minimumAmount: new Prisma.Decimal(1000),
        maximumAmount: new Prisma.Decimal(5000),
      }),
    ]);
    repository.findActiveUsersByRoleId.mockResolvedValue([
      { id: 'finance-1' },
      { id: 'finance-2' },
    ]);
    const resolver = new ApprovalMatrixResolverService(repository as never);

    const route = await resolver.resolveApprovalRoute({
      tenantId: 'tenant-1',
      moduleKey: ApprovalModuleKey.LOAN_REQUEST,
      recordType: 'loanRequest',
      requesterEmployee: {
        id: 'employee-1',
        manager: { id: 'manager-employee', userId: 'manager-user' },
      },
      scopeContext: {
        organizationId: 'org-1',
        businessUnitId: 'bu-1',
        departmentId: 'dept-1',
        employeeLevelId: 'level-1',
        employeeId: 'employee-1',
      },
      conditionContext: { amount: 2500, loanPolicyId: 'policy-1' },
    });

    expect(route).toHaveLength(2);
    expect(route[0]).toEqual(
      expect.objectContaining({
        sequence: 1,
        candidateUserIds: ['manager-user'],
      }),
    );
    expect(route[1]).toEqual(
      expect.objectContaining({
        sequence: 2,
        approvalMode: ApprovalMode.ALL,
        candidateUserIds: ['finance-1', 'finance-2'],
      }),
    );
  });

  it('matches leave type and duration without hardcoding Leave in the resolver', async () => {
    const repository = repositoryMock([
      matrix({
        approverType: ApprovalActorType.USER,
        approverUserId: 'leave-approver',
        leaveTypeId: 'annual-leave',
        minimumDuration: new Prisma.Decimal(5),
        maximumDuration: new Prisma.Decimal(10),
      }),
    ]);
    const resolver = new ApprovalMatrixResolverService(repository as never);

    const route = await resolver.resolveApprovalRoute({
      tenantId: 'tenant-1',
      moduleKey: ApprovalModuleKey.LEAVE_REQUEST,
      recordType: 'leaveRequest',
      requesterEmployee: { id: 'employee-1' },
      conditionContext: { leaveTypeId: 'annual-leave', duration: 7 },
    });

    expect(route[0]?.candidateUserIds).toEqual(['leave-approver']);
  });

  it('supports claim type and legacy tenant scope while rejecting mismatches', async () => {
    const repository = repositoryMock([
      matrix({
        approverType: ApprovalActorType.USER,
        approverUserId: 'claim-approver',
        claimTypeId: 'travel-claim',
        currencyCode: 'QAR',
        scopeType: ApprovalScopeType.TENANT,
        scopeId: null,
      }),
    ]);
    const resolver = new ApprovalMatrixResolverService(repository as never);

    const matched = await resolver.resolveApprovalRoute({
      tenantId: 'tenant-1',
      moduleKey: ApprovalModuleKey.CLAIM_REQUEST,
      recordType: 'claimRequest',
      requesterEmployee: { id: 'employee-1' },
      conditionContext: {
        claimTypeIds: ['travel-claim', 'meal-claim'],
        currencyCode: 'qar',
      },
    });
    const missed = await resolver.resolveApprovalRoute({
      tenantId: 'tenant-1',
      moduleKey: ApprovalModuleKey.CLAIM_REQUEST,
      recordType: 'claimRequest',
      requesterEmployee: { id: 'employee-1' },
      conditionContext: {
        claimTypeId: 'travel-claim',
        currencyCode: 'USD',
      },
    });

    expect(matched).toHaveLength(1);
    expect(missed).toEqual([]);
  });

  it('uses the reporting-manager fallback only when the linked user is active', async () => {
    const repository = repositoryMock([]);
    repository.findUserById.mockResolvedValueOnce({ id: 'manager-user' });
    const resolver = new ApprovalMatrixResolverService(repository as never);

    const route = await resolver.resolveApprovalRoute({
      tenantId: 'tenant-1',
      moduleKey: ApprovalModuleKey.TIMESHEET,
      recordType: 'timesheetWeek',
      requesterEmployee: {
        id: 'employee-1',
        manager: { id: 'manager-employee', userId: 'manager-user' },
      },
      fallback: [{ type: 'REPORTING_MANAGER' }],
    });

    expect(repository.findUserById).toHaveBeenCalledWith(
      'tenant-1',
      'manager-user',
    );
    expect(route[0]?.candidateUserIds).toEqual(['manager-user']);
  });

  it('does not route approval to an inactive reporting-manager user', async () => {
    const repository = repositoryMock([]);
    repository.findUserById.mockResolvedValueOnce(null);
    const resolver = new ApprovalMatrixResolverService(repository as never);

    const route = await resolver.resolveApprovalRoute({
      tenantId: 'tenant-1',
      moduleKey: ApprovalModuleKey.TIMESHEET,
      recordType: 'timesheetWeek',
      requesterEmployee: {
        id: 'employee-1',
        manager: { id: 'manager-employee', userId: 'inactive-user' },
      },
      fallback: [{ type: 'REPORTING_MANAGER' }],
    });

    expect(route).toEqual([]);
  });

  it('resolves department and business-unit heads from structure ownership', async () => {
    const repository = repositoryMock([
      matrix({
        id: 'department-step',
        sequence: 1,
        approverType: ApprovalActorType.DEPARTMENT_HEAD,
        departmentId: 'dept-1',
      }),
      matrix({
        id: 'business-unit-step',
        sequence: 2,
        approverType: ApprovalActorType.BUSINESS_UNIT_HEAD,
        businessUnitId: 'bu-1',
      }),
    ]);
    repository.findDepartmentApproverUserId.mockResolvedValue('dept-head');
    repository.findBusinessUnitApproverUserId.mockResolvedValue('bu-head');
    const resolver = new ApprovalMatrixResolverService(repository as never);

    const route = await resolver.resolveApprovalRoute({
      tenantId: 'tenant-1',
      moduleKey: ApprovalModuleKey.LOAN_REQUEST,
      requesterEmployee: { id: 'employee-1' },
      scopeContext: { departmentId: 'dept-1', businessUnitId: 'bu-1' },
    });

    expect(route.map((step) => step.candidateUserIds)).toEqual([
      ['dept-head'],
      ['bu-head'],
    ]);
  });
  /*
   * BUG-1968 - the refusal has to say which step failed and what to configure.
   *
   * The strict policy is intentional and stays: a step nobody can approve would
   * strand the request. What was wrong is that the resolver stopped at the
   * first bad step and reported a bare sentence with no step number, so an
   * administrator fixed one, resubmitted, and met the next.
   */
  describe('BUG-1968 - unresolvable routes explain themselves', () => {
    async function refusalMessage(run: () => Promise<unknown>) {
      try {
        await run();
      } catch (error) {
        const response = (
          error as { getResponse: () => unknown }
        ).getResponse();
        return (response as { message: string }).message;
      }
      throw new Error('expected the route to be refused');
    }

    async function submitInto(matrices: unknown[]) {
      const repository = repositoryMock(matrices);
      // Nobody is assignable: no manager, no role holders, no department head.
      repository.findUserById.mockResolvedValue(null);
      repository.findActiveUsersByRoleId.mockResolvedValue([]);
      repository.findDepartmentApproverUserId.mockResolvedValue(null);
      const resolver = new ApprovalMatrixResolverService(repository as never);
      try {
        await resolver.resolveApprovalRoute({
          tenantId: 'tenant-1',
          moduleKey: ApprovalModuleKey.LEAVE_REQUEST,
          recordType: 'leaveRequest',
          requesterEmployee: { id: 'employee-1', manager: null },
          scopeContext: { employeeId: 'employee-1', departmentId: 'dept-1' },
          conditionContext: {},
        });
      } catch (error) {
        const response = (
          error as { getResponse: () => unknown }
        ).getResponse();
        return response as { code: string; message: string };
      }
      throw new Error('expected the route to be refused');
    }

    it('still refuses - the policy did not loosen', async () => {
      const response = await submitInto([
        matrix({ sequence: 1, approverType: ApprovalActorType.LINE_MANAGER }),
      ]);
      expect(response.code).toBe('APPROVAL_ROUTE_UNRESOLVED');
    });

    it('names the step and what to configure', async () => {
      const response = await submitInto([
        matrix({ sequence: 1, approverType: ApprovalActorType.LINE_MANAGER }),
      ]);
      expect(response.message).toContain('Step 1');
      expect(response.message).toContain('line manager');
      expect(response.message).toContain('Set a reporting manager');
      /*
       * The load-bearing assertion. The old message was exactly this sentence
       * and nothing else, so any test that merely looked for "manager" would
       * have passed against the live defect.
       */
      expect(response.message).not.toBe(
        'Approval route requires a reporting manager with a linked active user.',
      );
    });

    it('reports every unresolvable step, not just the first', async () => {
      const response = await submitInto([
        matrix({ sequence: 1, approverType: ApprovalActorType.LINE_MANAGER }),
        matrix({
          id: 'second',
          sequence: 2,
          approverType: ApprovalActorType.ROLE,
          approverRoleId: 'hr-role',
        }),
      ]);
      expect(response.message).toContain('2 steps');
      expect(response.message).toContain('Step 1');
      expect(response.message).toContain('Step 2');
      // The second step's own remedy, which the old code never reached.
      expect(response.message).toContain('no active users');
    });

    /*
     * Row 2 of the table in BUG-1968, and the row the record calls decisive.
     *
     * Sequence 1 resolves perfectly (a USER rule naming an active user) and
     * sequence 2 does not. The submission is still refused - that is the policy
     * the owner chose to keep, and it is what distinguishes "every step must
     * resolve" from "the first resolvable step wins". A fix that quietly made
     * this pass would have changed the product decision, not the message.
     */
    it('refuses when a later step cannot resolve, even though the first can', async () => {
      const repository = repositoryMock([
        matrix({
          sequence: 1,
          approverType: ApprovalActorType.USER,
          approverUserId: 'named-approver',
        }),
        matrix({
          id: 'hr-step',
          sequence: 2,
          approverType: ApprovalActorType.ROLE,
          approverRoleId: 'hr-role',
        }),
      ]);
      repository.findActiveUsersByRoleId.mockResolvedValue([]);
      const resolver = new ApprovalMatrixResolverService(repository as never);

      const message = await refusalMessage(() =>
        resolver.resolveApprovalRoute({
          tenantId: 'tenant-1',
          moduleKey: ApprovalModuleKey.LEAVE_REQUEST,
          recordType: 'leaveRequest',
          requesterEmployee: { id: 'employee-1', manager: null },
          scopeContext: { employeeId: 'employee-1' },
          conditionContext: {},
        }),
      );

      expect(message).toContain('Step 2');
      expect(message).toContain('a step');
      /*
       * Step 1 resolved, so it must not appear in the list of what to fix.
       * Naming every step whenever any step fails would send an administrator
       * to configure something that is already correct.
       */
      expect(message).not.toContain('Step 1');
    });

    it('leaves a resolvable route alone', async () => {
      const repository = repositoryMock([
        matrix({ sequence: 1, approverType: ApprovalActorType.LINE_MANAGER }),
      ]);
      const resolver = new ApprovalMatrixResolverService(repository as never);
      const route = await resolver.resolveApprovalRoute({
        tenantId: 'tenant-1',
        moduleKey: ApprovalModuleKey.LEAVE_REQUEST,
        recordType: 'leaveRequest',
        requesterEmployee: {
          id: 'employee-1',
          manager: { id: 'manager-employee', userId: 'manager-user' },
        },
        scopeContext: { employeeId: 'employee-1' },
        conditionContext: {},
      });
      expect(route).toHaveLength(1);
      expect(route[0].candidateUserIds).toEqual(['manager-user']);
    });
  });
});

function matrix(overrides: Record<string, unknown> = {}) {
  return {
    id: 'matrix-1',
    tenantId: 'tenant-1',
    moduleKey: ApprovalModuleKey.LOAN_REQUEST,
    name: 'Matrix',
    recordType: null,
    leaveTypeId: null,
    leavePolicyId: null,
    claimTypeId: null,
    loanPolicyId: null,
    currencyCode: null,
    organizationId: null,
    businessUnitId: null,
    departmentId: null,
    employeeLevelId: null,
    minimumAmount: null,
    maximumAmount: null,
    minimumDuration: null,
    maximumDuration: null,
    effectiveFrom: null,
    effectiveTo: null,
    conditions: null,
    sequence: 1,
    approverType: ApprovalActorType.USER,
    approverRoleId: null,
    approverUserId: 'approver-1',
    approvalMode: ApprovalMode.ANY_ONE,
    scopeType: null,
    scopeId: null,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdById: null,
    updatedById: null,
    approverRole: null,
    approverUser: null,
    leaveType: null,
    leavePolicy: null,
    ...overrides,
  } as never;
}

function repositoryMock(matrices: unknown[]) {
  return {
    findForResolution: jest.fn().mockResolvedValue(matrices),
    findRoleByKey: jest.fn(),
    findActiveUsersByRoleId: jest.fn(),
    findUserById: jest
      .fn()
      .mockImplementation((_tenantId: string, userId: string) => ({
        id: userId,
      })),
    findBusinessUnitOrganizationId: jest.fn(),
    findDepartmentApproverUserId: jest.fn(),
    findBusinessUnitApproverUserId: jest.fn(),
  };
}
