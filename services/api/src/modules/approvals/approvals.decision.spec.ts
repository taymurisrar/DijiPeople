import {
  ApprovalAssignmentStatus,
  ApprovalRequestStatus,
  GenericApprovalStepStatus,
  SecurityAccessLevel,
  SecurityPrivilege,
} from '@prisma/client';
import { ConflictException, ForbiddenException } from '@nestjs/common';
import { ENTITY_KEYS } from '../../common/constants/rbac-matrix';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import {
  ApprovalDecisionRegistry,
  type ApprovalDecisionDelegate,
} from './approval-decision.registry';
import { ApprovalsService } from './approvals.service';

/*
 * The approvals inbox as a place where a decision is actually taken.
 *
 * Three defects are pinned here, all of them things the screen showed a user:
 *
 *  1. `detail()` never derived `currentStep` — only `list()` did — so the
 *     record page rendered an empty "Assigned To" for every approval.
 *  2. There was no action endpoint at all; Approve and Reject were
 *     `disabledBusinessCommand` stubs, greyed out for everyone.
 *  3. Once an endpoint exists it must not become a way around the owning
 *     module's permission gate, which is the BUG-2015 shape: approving was
 *     gated on *read* because the approve keys were consulted only for display.
 *
 * Every test here fails on the tree before the fix, checked by reverting.
 */

const TENANT = 'tenant-1';
const APPROVER = 'user-approver';
const REQUESTER = 'user-requester';
const APPROVAL_ID = '11111111-1111-4111-8111-111111111111';
const LEAVE_REQUEST_ID = '22222222-2222-4222-8222-222222222222';

function buildUser(
  overrides: Partial<AuthenticatedUser> & { userId?: string } = {},
): AuthenticatedUser {
  return {
    userId: APPROVER,
    tenantId: TENANT,
    email: 'approver@example.com',
    roleIds: [],
    roleKeys: [],
    permissionKeys: ['approvals.readAssigned'],
    ...overrides,
  } as AuthenticatedUser;
}

/** The privileges a leave approver actually carries, as the matrix stores them. */
function leaveApproverPrivileges() {
  return [
    {
      entityKey: ENTITY_KEYS.LEAVE_REQUESTS,
      privilege: SecurityPrivilege.APPROVE,
      accessLevel: SecurityAccessLevel.TEAM,
    },
    {
      entityKey: ENTITY_KEYS.LEAVE_REQUESTS,
      privilege: SecurityPrivilege.REJECT,
      accessLevel: SecurityAccessLevel.TEAM,
    },
  ];
}

function pendingLeaveApproval(overrides: Record<string, unknown> = {}) {
  return {
    id: APPROVAL_ID,
    tenantId: TENANT,
    moduleKey: 'leave',
    entityType: 'leaveRequest',
    entityId: LEAVE_REQUEST_ID,
    status: ApprovalRequestStatus.PENDING,
    submittedByUserId: REQUESTER,
    currentStepId: 'step-1',
    title: 'Taimur Israr - Annual Leave',
    steps: [
      {
        id: 'step-1',
        stepOrder: 1,
        status: GenericApprovalStepStatus.PENDING,
        assignments: [
          {
            id: 'assignment-1',
            assignedToUserId: APPROVER,
            status: ApprovalAssignmentStatus.PENDING,
          },
        ],
      },
    ],
    ...overrides,
  };
}

type ExecuteSpy = jest.Mock;

function buildLeaveDelegate(execute: ExecuteSpy): ApprovalDecisionDelegate {
  return {
    moduleKey: 'leave',
    entityTypes: ['leaveRequest'],
    requirements: {
      approve: {
        legacyKeys: ['leave-requests.approve'],
        rbac: [
          {
            entityKey: ENTITY_KEYS.LEAVE_REQUESTS,
            privilege: SecurityPrivilege.APPROVE,
          },
        ],
      },
      reject: {
        legacyKeys: ['leave-requests.reject'],
        rbac: [
          {
            entityKey: ENTITY_KEYS.LEAVE_REQUESTS,
            privilege: SecurityPrivilege.REJECT,
          },
        ],
      },
    },
    execute,
  };
}

function buildService(
  approval: Record<string, unknown> | null,
  delegate?: ApprovalDecisionDelegate,
) {
  const registry = new ApprovalDecisionRegistry();
  if (delegate) registry.register(delegate);

  const findFirst = jest.fn(async () => approval);
  const prisma = {
    approvalRequest: { findFirst, findMany: jest.fn(), count: jest.fn() },
  };

  return {
    findFirst,
    registry,
    service: new ApprovalsService(prisma as never, {} as never, registry),
  };
}

describe('ApprovalsService.detail', () => {
  it('derives currentStep, which only list() used to do', async () => {
    const { service } = buildService(pendingLeaveApproval());

    const { item } = await service.detail(
      buildUser({ permissionKeys: ['approvals.manage'] }),
      APPROVAL_ID,
    );

    // Before the fix this was `undefined`, and the record page rendered an
    // empty "Assigned To" because it read `approval.currentStep.assignments`.
    expect(item.currentStep).not.toBeUndefined();
    expect(item.currentStep?.id).toBe('step-1');
  });

  it('reports what the caller may do with the request', async () => {
    const { service } = buildService(
      pendingLeaveApproval(),
      buildLeaveDelegate(jest.fn()),
    );

    const { item } = await service.detail(
      buildUser({
        permissionKeys: ['approvals.readAssigned', 'leave-requests.approve'],
        rolePrivileges: leaveApproverPrivileges(),
      } as never),
      APPROVAL_ID,
    );

    expect(item.decision.canApprove).toBe(true);
    // Holding approve does not confer reject: the module declares them apart.
    expect(item.decision.canReject).toBe(false);
  });

  it('explains a module it does not decide instead of offering a dead button', async () => {
    const { service } = buildService(
      pendingLeaveApproval({ moduleKey: 'payroll', entityType: 'payrollRun' }),
    );

    const { item } = await service.detail(
      buildUser({ permissionKeys: ['approvals.manage'] }),
      APPROVAL_ID,
    );

    expect(item.decision.canApprove).toBe(false);
    expect(item.decision.reason).toContain('Payroll');
  });

  it('says a decided request is decided, not that it is unassigned', async () => {
    const { service } = buildService(
      pendingLeaveApproval({
        status: ApprovalRequestStatus.APPROVED,
        currentStepId: null,
      }),
      buildLeaveDelegate(jest.fn()),
    );

    const { item } = await service.detail(
      buildUser({ permissionKeys: ['approvals.manage'] }),
      APPROVAL_ID,
    );

    expect(item.decision.reason).toBe('This request is already approved.');
  });
});

describe('ApprovalsService.decide', () => {
  it('dispatches to the owning module rather than moving the mirror', async () => {
    const execute = jest.fn(async () => ({}));
    const { service } = buildService(
      pendingLeaveApproval(),
      buildLeaveDelegate(execute),
    );
    const user = buildUser({
      permissionKeys: ['approvals.readAssigned', 'leave-requests.approve'],
      rolePrivileges: leaveApproverPrivileges(),
    } as never);

    await service.decide(user, APPROVAL_ID, 'approve', 'Looks fine');

    /*
     * The load-bearing assertion of the whole feature. `ApprovalRequest` is a
     * mirror; `LeaveApprovalStep` is authoritative. Writing the approval row
     * here would show APPROVED on this screen while the leave request stayed
     * PENDING with no balance consumed.
     */
    expect(execute).toHaveBeenCalledWith({
      action: 'approve',
      user,
      entityId: LEAVE_REQUEST_ID,
      comment: 'Looks fine',
    });
  });

  it('refuses a caller without the owning module permission', async () => {
    const execute = jest.fn();
    const { service } = buildService(
      pendingLeaveApproval(),
      buildLeaveDelegate(execute),
    );

    /*
     * The escalation this endpoint could have introduced: reaching a leave
     * approval through /approvals must demand `leave-requests.approve` exactly
     * as POST /leave-requests/:id/approve does. This caller can read the inbox
     * and is the assigned approver, and still may not decide.
     */
    await expect(
      service.decide(
        buildUser({ permissionKeys: ['approvals.manage'] }),
        APPROVAL_ID,
        'approve',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(execute).not.toHaveBeenCalled();
  });

  it('refuses an action the module does not expose here', async () => {
    const execute = jest.fn();
    const { service } = buildService(
      pendingLeaveApproval(),
      buildLeaveDelegate(execute),
    );

    // The stub delegate declares approve and reject, not cancel.
    await expect(
      service.decide(
        buildUser({
          permissionKeys: ['approvals.manage'],
          roleKeys: ['global-admin'],
        }),
        APPROVAL_ID,
        'cancel',
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(execute).not.toHaveBeenCalled();
  });

  it('refuses a module with no delegate, naming it', async () => {
    const { service } = buildService(
      pendingLeaveApproval({ moduleKey: 'payroll', entityType: 'payrollRun' }),
    );

    await expect(
      service.decide(
        buildUser({
          permissionKeys: ['approvals.manage'],
          roleKeys: ['global-admin'],
        }),
        APPROVAL_ID,
        'approve',
      ),
    ).rejects.toThrow(/Payroll/);
  });

  it('refuses a request that is no longer pending', async () => {
    const execute = jest.fn();
    const { service } = buildService(
      pendingLeaveApproval({ status: ApprovalRequestStatus.REJECTED }),
      buildLeaveDelegate(execute),
    );

    await expect(
      service.decide(
        buildUser({
          permissionKeys: ['approvals.manage'],
          roleKeys: ['global-admin'],
        }),
        APPROVAL_ID,
        'approve',
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(execute).not.toHaveBeenCalled();
  });

  it('scopes the lookup by tenant and caller reach, not by id alone', async () => {
    const { service, findFirst } = buildService(
      pendingLeaveApproval(),
      buildLeaveDelegate(jest.fn(async () => ({}))),
    );

    await service
      .decide(
        buildUser({
          permissionKeys: ['approvals.readAssigned', 'leave-requests.approve'],
          rolePrivileges: leaveApproverPrivileges(),
        } as never),
        APPROVAL_ID,
        'approve',
      )
      .catch(() => undefined);

    const where = findFirst.mock.calls[0][0].where as Record<string, unknown>;
    expect(where.tenantId).toBe(TENANT);
    // `relevantScope` for a non-manage caller — an id on its own must not reach
    // an approval the caller cannot see.
    expect(where.OR).toEqual([
      { submittedByUserId: APPROVER },
      { assignments: { some: { assignedToUserId: APPROVER } } },
    ]);
  });
});

describe('ApprovalDecisionRegistry', () => {
  it('matches module and entity type case-insensitively', () => {
    const registry = new ApprovalDecisionRegistry();
    const delegate = buildLeaveDelegate(jest.fn());
    registry.register(delegate);

    // 'TimesheetWeek' vs 'timesheetWeek' has already drifted once in this
    // repository, so the lookup does not depend on which spelling won.
    expect(registry.resolve('Leave', 'LeaveRequest')).toBe(delegate);
  });

  it('refuses a second delegate for the same record type', () => {
    const registry = new ApprovalDecisionRegistry();
    registry.register(buildLeaveDelegate(jest.fn()));

    expect(() => registry.register(buildLeaveDelegate(jest.fn()))).toThrow(
      /already registered/,
    );
  });
});
