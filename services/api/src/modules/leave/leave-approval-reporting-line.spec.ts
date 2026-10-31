import { ForbiddenException } from '@nestjs/common';
import { SecurityAccessLevel, SecurityPrivilege } from '@prisma/client';
import { ENTITY_KEYS } from '../../common/constants/rbac-matrix';
import { LeaveService } from './leave.service';

/**
 * DP-QA-018. A manager's scope is a business unit, so every manager could approve
 * every employee's leave in it. Deciding a request one is not the assigned
 * approver of now needs organisation-wide authority (HR) or a reporting line.
 */
const TENANT = 'tenant-1';
const REQUESTER_EMP = 'emp-requester';

function leaveRequest() {
  return {
    id: 'lr-1',
    tenantId: TENANT,
    employeeId: REQUESTER_EMP,
    status: 'PENDING',
    totalDays: 1,
    employee: { id: REQUESTER_EMP, userId: 'requester-user' },
    approvalSteps: [
      {
        id: 'step-1',
        stepOrder: 1,
        status: 'PENDING',
        approverUserId: 'someone-else',
        approvalMode: 'ANY_ONE',
        approvalGroupKey: null,
      },
    ],
  };
}

function user(level: SecurityAccessLevel, userId: string) {
  return {
    userId,
    tenantId: TENANT,
    roleIds: [],
    roleKeys: ['manager'],
    permissionKeys: ['leave-requests.approve', 'leave-requests.reject'],
    rolePrivileges: [SecurityPrivilege.APPROVE, SecurityPrivilege.REJECT].map(
      (privilege) => ({
        entityKey: ENTITY_KEYS.LEAVE_REQUESTS,
        privilege,
        accessLevel: level,
      }),
    ),
  };
}

describe('leave decisions outside the assigned approver (DP-QA-018)', () => {
  const reached = new Error('reached the decision transaction');

  function build(directReports: Record<string, string[]>) {
    const transaction = jest.fn().mockRejectedValue(reached);
    const prisma = {
      $transaction: transaction,
      employee: {
        findFirst: jest.fn().mockResolvedValue({ id: REQUESTER_EMP }),
      },
    };
    const employeesRepository = {
      findByUserIdAndTenant: jest.fn(async (_t: string, userId: string) => ({
        id: `emp-of-${userId}`,
      })),
      findByIdAndTenant: jest.fn().mockResolvedValue(null),
      findDirectReports: jest.fn(async (_t: string, managerId: string) =>
        (directReports[managerId] ?? []).map((id) => ({ id })),
      ),
    };
    const repo = {
      findLeaveRequestById: jest.fn().mockResolvedValue(leaveRequest()),
    };
    const service = new LeaveService(
      prisma as never,
      repo as never,
      employeesRepository as never,
      {} as never,
      { log: jest.fn() } as never,
      { resolveApprovalRoute: jest.fn() } as never,
      { emit: jest.fn() } as never,
      {} as never,
      {} as never,
    );
    return { service, transaction };
  }

  const approve = (service: LeaveService, who: ReturnType<typeof user>) =>
    service.approveLeaveRequest(who as never, 'lr-1', {});

  it('refuses a business-unit manager who is not in the requester reporting line', async () => {
    const { service, transaction } = build({});
    await expect(
      approve(
        service,
        user(SecurityAccessLevel.PARENT_CHILD_BUSINESS_UNIT, 'mgr-user'),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(transaction).not.toHaveBeenCalled();
  });

  it('refuses a manager whose own reports are a different branch', async () => {
    const { service, transaction } = build({
      'emp-of-mgr-user': ['emp-other'],
    });
    await expect(
      approve(service, user(SecurityAccessLevel.BUSINESS_UNIT, 'mgr-user')),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(transaction).not.toHaveBeenCalled();
  });

  it('allows the direct manager', async () => {
    const { service, transaction } = build({
      'emp-of-mgr-user': [REQUESTER_EMP],
    });
    await expect(
      approve(service, user(SecurityAccessLevel.BUSINESS_UNIT, 'mgr-user')),
    ).rejects.toBe(reached);
    expect(transaction).toHaveBeenCalled();
  });

  it('allows a manager further up the line', async () => {
    const { service } = build({
      'emp-of-mgr-user': ['emp-middle'],
      'emp-middle': [REQUESTER_EMP],
    });
    await expect(
      approve(service, user(SecurityAccessLevel.BUSINESS_UNIT, 'mgr-user')),
    ).rejects.toBe(reached);
  });

  it('allows an organisation-wide decider (HR) without a reporting line', async () => {
    const { service } = build({});
    await expect(
      approve(service, user(SecurityAccessLevel.ORGANIZATION, 'hr-user')),
    ).rejects.toBe(reached);
  });

  it('still refuses a user who lacks the approve permission entirely', async () => {
    const { service, transaction } = build({
      'emp-of-mgr-user': [REQUESTER_EMP],
    });
    const who = {
      ...user(SecurityAccessLevel.ORGANIZATION, 'mgr-user'),
      permissionKeys: [] as string[],
    };
    await expect(approve(service, who)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(transaction).not.toHaveBeenCalled();
  });

  it('refuses the requester even with organisation-wide authority', async () => {
    const { service } = build({});
    await expect(
      approve(
        service,
        user(SecurityAccessLevel.ORGANIZATION, 'requester-user'),
      ),
    ).rejects.toThrow('You cannot approve or reject your own leave request.');
  });
});

/**
 * DP-QA-019 and DP-QA-020 share this harness: the service is built with stubs and
 * the interesting behaviour is which collaborator calls are made, in order.
 */
describe('approved leave cancellation (DP-QA-019)', () => {
  const future = new Date(Date.now() + 10 * 86_400_000);
  const past = new Date(Date.now() - 10 * 86_400_000);

  function approved(startDate: Date, ownerUserId = 'owner-user') {
    return {
      ...leaveRequest(),
      status: 'APPROVED',
      startDate,
      endDate: startDate,
      totalDays: 2,
      leaveTypeId: 'type-1',
      leaveType: { consumesBalance: true, isPaid: true },
      reason: 'trip',
      employee: { id: REQUESTER_EMP, userId: ownerUserId },
      approvalSteps: [],
    };
  }

  function build(request: ReturnType<typeof approved>, removedRows = 1) {
    const tx = {
      leaveConsumptionRecord: {
        deleteMany: jest.fn().mockResolvedValue({ count: removedRows }),
      },
      leaveBalance: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    };
    const prisma = {
      employee: {
        findFirst: jest.fn().mockResolvedValue({ id: REQUESTER_EMP }),
      },
      $transaction: jest.fn(async (cb: (t: typeof tx) => Promise<unknown>) =>
        cb(tx),
      ),
    };
    const repo = {
      findLeaveRequestById: jest.fn().mockResolvedValue(request),
      updateLeaveRequest: jest.fn().mockResolvedValue(undefined),
      updateLeaveApprovalStep: jest.fn(),
    };
    const employees = {
      findByUserIdAndTenant: jest.fn(async (_t: string, userId: string) => ({
        id: userId === 'owner-user' ? REQUESTER_EMP : `emp-of-${userId}`,
      })),
      findByIdAndTenant: jest.fn().mockResolvedValue(null),
      findDirectReports: jest.fn().mockResolvedValue([]),
    };
    const service = new LeaveService(
      prisma as never,
      repo as never,
      employees as never,
      {} as never,
      { log: jest.fn() } as never,
      { resolveApprovalRoute: jest.fn() } as never,
      { emit: jest.fn(), resolveActionRequired: jest.fn() } as never,
      {} as never,
      {} as never,
    );
    jest
      .spyOn(service as never, 'mapLeaveRequest' as never)
      .mockReturnValue({} as never);
    return { service, tx, repo, prisma };
  }

  const owner = {
    userId: 'owner-user',
    tenantId: TENANT,
    roleIds: [],
    roleKeys: ['employee'],
    permissionKeys: [],
  };
  const hr = user(SecurityAccessLevel.ORGANIZATION, 'hr-user');

  it('lets the owner withdraw approved leave that has not started, returning the balance', async () => {
    const { service, tx, repo } = build(approved(future));
    await service.cancelLeaveRequest(owner as never, 'lr-1', {});

    expect(repo.updateLeaveRequest).toHaveBeenCalledWith(
      TENANT,
      'lr-1',
      expect.objectContaining({ status: 'CANCELLED' }),
      tx,
    );
    expect(tx.leaveConsumptionRecord.deleteMany).toHaveBeenCalled();
    expect(tx.leaveBalance.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          totalUsed: { decrement: 2 },
          totalRemaining: { increment: 2 },
        }) as unknown,
      }),
    );
  });

  it('refuses the owner once the leave has started', async () => {
    const { service, repo } = build(approved(past));
    await expect(
      service.cancelLeaveRequest(owner as never, 'lr-1', {}),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(repo.updateLeaveRequest).not.toHaveBeenCalled();
  });

  it('lets HR revoke started leave but requires a reason', async () => {
    const { service, repo } = build(approved(past));
    await expect(
      service.cancelLeaveRequest(hr as never, 'lr-1', {}),
    ).rejects.toThrow('A reason is required to cancel approved leave.');
    expect(repo.updateLeaveRequest).not.toHaveBeenCalled();

    await service.cancelLeaveRequest(hr as never, 'lr-1', {
      reason: 'Approved in error',
    });
    expect(repo.updateLeaveRequest).toHaveBeenCalled();
  });

  it('refuses a manager outside the reporting line', async () => {
    const { service } = build(approved(future));
    await expect(
      service.cancelLeaveRequest(
        user(SecurityAccessLevel.BUSINESS_UNIT, 'mgr-user') as never,
        'lr-1',
        { reason: 'x' },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('does not touch the balance when the request never consumed any', async () => {
    const { service, tx } = build(approved(future), 0);
    await service.cancelLeaveRequest(owner as never, 'lr-1', {});
    expect(tx.leaveBalance.updateMany).not.toHaveBeenCalled();
  });

  it('still refuses a rejected or already cancelled request', async () => {
    const request = { ...approved(future), status: 'REJECTED' };
    const { service } = build(request);
    await expect(
      service.cancelLeaveRequest(owner as never, 'lr-1', {}),
    ).rejects.toThrow(
      'Only pending or approved leave requests can be cancelled.',
    );
  });
});
