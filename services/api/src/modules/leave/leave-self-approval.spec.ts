import { ForbiddenException } from '@nestjs/common';
import { ROLE_KEYS } from '../../common/constants/rbac-matrix';
import { LeaveService } from './leave.service';

/**
 * BUG-1970 — an elevated tenant role could approve its own leave request.
 *
 * `canUserActOnStep` answered the elevated-role question before the
 * self-requester question, so a global-admin or system-admin who submitted a
 * request was reported as the assigned approver of their own pending step.
 * `processLeaveRequestDecision` then short-circuited on that answer and never
 * reached `canOverrideLeaveDecision`, which *does* bar the requester first — so
 * the correctly ordered check was unreachable rather than redundant.
 *
 * The record (BUG-1970) was filed from code reading with no live reproduction,
 * because the tenant state needed to produce one was itself blocked. This file
 * is the verification as well as the regression: every case below except the
 * two negative controls fails against the previous ordering.
 *
 * Asserted through the public surface rather than by reaching for the private
 * method, because the defect was never in the helper alone — it was in what the
 * caller did with the helper's answer.
 */

const TENANT_ID = 'tenant-1';
const ADMIN_USER_ID = 'admin-user';
const APPROVER_USER_ID = 'manager-user';

type LeaveRequestFixture = ReturnType<typeof buildLeaveRequest>;

function buildLeaveRequest(requesterUserId: string) {
  return {
    id: 'leave-request-1',
    tenantId: TENANT_ID,
    employeeId: 'employee-1',
    leaveTypeId: 'leave-type-1',
    startDate: new Date('2026-09-07'),
    endDate: new Date('2026-09-09'),
    totalDays: 3,
    reason: 'Family event',
    status: 'PENDING',
    attachmentRequired: false,
    attachmentReference: null,
    createdAt: new Date('2026-09-01'),
    updatedAt: new Date('2026-09-01'),
    createdById: requesterUserId,
    documentLinks: [],
    employee: {
      id: 'employee-1',
      employeeCode: 'EMP-0001',
      firstName: 'Test',
      lastName: 'Requester',
      preferredName: null,
      userId: requesterUserId,
    },
    leaveType: { id: 'leave-type-1', name: 'Annual Leave' },
    approvalSteps: [
      {
        id: 'step-1',
        stepOrder: 1,
        approverType: 'USER',
        approverUserId: APPROVER_USER_ID,
        approverRoleId: null,
        approvalMode: 'ANY_ONE',
        approvalGroupKey: null,
        resolvedApproverType: null,
        status: 'PENDING',
        actedAt: null,
        comments: null,
        approverUser: null,
      },
    ],
  };
}

function buildUser(userId: string, roleKeys: readonly string[]) {
  return {
    userId,
    tenantId: TENANT_ID,
    roleIds: [],
    roleKeys,
    permissionKeys: ['leave-requests.read'],
  };
}

describe('BUG-1970 — the self-approval prohibition outranks the elevated-role bypass', () => {
  let service: LeaveService;
  let leaveRepository: {
    findLeaveRequestById: jest.Mock;
    updateLeaveApprovalStep: jest.Mock;
    updateLeaveRequest: jest.Mock;
  };
  let prisma: { $transaction: jest.Mock };

  function useLeaveRequest(fixture: LeaveRequestFixture) {
    leaveRepository.findLeaveRequestById.mockResolvedValue(fixture);
  }

  beforeEach(() => {
    leaveRepository = {
      findLeaveRequestById: jest.fn(),
      updateLeaveApprovalStep: jest.fn(),
      updateLeaveRequest: jest.fn(),
    };
    prisma = { $transaction: jest.fn() };

    service = new LeaveService(
      prisma as never,
      leaveRepository as never,
      { findByUserIdAndTenant: jest.fn() } as never,
      {} as never,
      { log: jest.fn() } as never,
      { resolveApprovalRoute: jest.fn() } as never,
      { emit: jest.fn() } as never,
      {} as never,
      {} as never,
    );
  });

  it.each([ROLE_KEYS.GLOBAL_ADMIN, ROLE_KEYS.SYSTEM_ADMIN])(
    'refuses %s approving their own leave request',
    async (roleKey) => {
      useLeaveRequest(buildLeaveRequest(ADMIN_USER_ID));

      await expect(
        service.approveLeaveRequest(
          buildUser(ADMIN_USER_ID, [roleKey]) as never,
          'leave-request-1',
          {},
        ),
      ).rejects.toThrow(
        new ForbiddenException(
          'You cannot approve or reject your own leave request.',
        ),
      );

      /*
       * The load-bearing half. Under the previous ordering the call did not
       * throw here at all — it fell through into the decision transaction, so
       * asserting only on the message would have passed against a version that
       * merely reworded a later failure.
       */
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(leaveRepository.updateLeaveApprovalStep).not.toHaveBeenCalled();
      expect(leaveRepository.updateLeaveRequest).not.toHaveBeenCalled();
    },
  );

  it.each([ROLE_KEYS.GLOBAL_ADMIN, ROLE_KEYS.SYSTEM_ADMIN])(
    'refuses %s rejecting their own leave request',
    async (roleKey) => {
      useLeaveRequest(buildLeaveRequest(ADMIN_USER_ID));

      await expect(
        service.rejectLeaveRequest(
          buildUser(ADMIN_USER_ID, [roleKey]) as never,
          'leave-request-1',
          {},
        ),
      ).rejects.toThrow(ForbiddenException);

      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(leaveRepository.updateLeaveApprovalStep).not.toHaveBeenCalled();
    },
  );

  it('does not offer the approve or reject action on the requester own record', async () => {
    useLeaveRequest(buildLeaveRequest(ADMIN_USER_ID));

    const record = await service.getLeaveRequest(
      buildUser(ADMIN_USER_ID, [ROLE_KEYS.GLOBAL_ADMIN]) as never,
      'leave-request-1',
    );

    /*
     * The same predicate the endpoint uses, read through the record payload the
     * screen renders. Both were `true` before the reordering, which is how the
     * button appeared in the first place.
     */
    expect(record.canCurrentUserApprove).toBe(false);
    expect(record.canCurrentUserReject).toBe(false);
  });

  it('still lets an elevated role act on somebody else request', async () => {
    useLeaveRequest(buildLeaveRequest('other-user'));

    const record = await service.getLeaveRequest(
      buildUser(ADMIN_USER_ID, [ROLE_KEYS.GLOBAL_ADMIN]) as never,
      'leave-request-1',
    );

    // The negative control: the fix must narrow self-approval only. An elevated
    // role widens which records may be actioned, and that is unchanged.
    expect(record.canCurrentUserApprove).toBe(true);
    expect(record.canCurrentUserReject).toBe(true);
  });

  it('still lets the assigned approver act without an elevated role', async () => {
    useLeaveRequest(buildLeaveRequest('other-user'));

    const record = await service.getLeaveRequest(
      buildUser(APPROVER_USER_ID, []) as never,
      'leave-request-1',
    );

    expect(record.canCurrentUserApprove).toBe(true);
  });
});
