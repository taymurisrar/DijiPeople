import { LeaveService } from './leave.service';

/**
 * BUG-2016 — a settled leave request must stop asking anyone to approve it.
 *
 * Submitting raises an action-required notification for the approver. Every
 * terminal transition — cancel, approve, reject — left it exactly where it was:
 * unread, priority 1, "Leave request needs approval", pointing at a record in a
 * state nobody can act on, and counted by the dashboard badge. The delivery half
 * of the notification machinery was sound; the resolution half did not exist.
 *
 * These assert the call rather than the database write, because the write is
 * the notifications module's and is covered in its own repository spec. What
 * belongs to leave is that each of the three transitions makes the call, with
 * the related record that the notification was keyed on.
 */

const TENANT_ID = 'tenant-1';
const APPROVER_USER_ID = 'manager-user';
const REQUESTER_USER_ID = 'employee-user';
const LEAVE_REQUEST_ID = 'leave-request-1';

function buildLeaveRequest(
  status: string,
  stepStatus: string,
): Record<string, unknown> {
  return {
    id: LEAVE_REQUEST_ID,
    tenantId: TENANT_ID,
    employeeId: 'employee-1',
    leaveTypeId: 'leave-type-1',
    startDate: new Date('2026-09-07'),
    endDate: new Date('2026-09-09'),
    totalDays: 3,
    reason: 'Family event',
    status,
    attachmentRequired: false,
    attachmentReference: null,
    createdAt: new Date('2026-09-01'),
    updatedAt: new Date('2026-09-02'),
    createdById: REQUESTER_USER_ID,
    documentLinks: [],
    employee: {
      id: 'employee-1',
      employeeCode: 'EMP-0001',
      firstName: 'Test',
      lastName: 'Requester',
      preferredName: null,
      userId: REQUESTER_USER_ID,
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
        status: stepStatus,
        actedAt: null,
        comments: null,
        createdAt: new Date('2026-09-01'),
        approverUser: null,
      },
    ],
  };
}

describe('BUG-2016 — a terminal leave transition resolves its approval notification', () => {
  let leaveRepository: {
    findLeaveRequestById: jest.Mock;
    updateLeaveRequest: jest.Mock;
    updateLeaveApprovalStep: jest.Mock;
  };
  let notificationsService: { emit: jest.Mock; resolveActionRequired: jest.Mock };
  let employeesRepository: { findByUserIdAndTenant: jest.Mock };
  let service: LeaveService;

  beforeEach(() => {
    leaveRepository = {
      findLeaveRequestById: jest.fn(),
      updateLeaveRequest: jest.fn(),
      updateLeaveApprovalStep: jest.fn(),
    };
    notificationsService = {
      emit: jest.fn().mockResolvedValue({ created: 0, items: [] }),
      resolveActionRequired: jest.fn().mockResolvedValue({ resolved: 1 }),
    };
    employeesRepository = { findByUserIdAndTenant: jest.fn() };

    const prisma = {
      $transaction: jest.fn(),
      approvalRequest: {
        upsert: jest.fn().mockResolvedValue({ id: 'approval-request-1' }),
        update: jest.fn().mockResolvedValue({}),
      },
      approvalStep: {
        upsert: jest.fn().mockResolvedValue({ id: 'generic-step-1' }),
        findFirst: jest.fn().mockResolvedValue(null),
      },
      approvalAssignment: {
        upsert: jest.fn().mockResolvedValue({}),
        findFirst: jest.fn().mockResolvedValue(null),
      },
      approvalAction: { create: jest.fn().mockResolvedValue({}) },
    };

    service = new LeaveService(
      prisma as never,
      leaveRepository as never,
      employeesRepository as never,
      {} as never,
      { log: jest.fn() } as never,
      { resolveApprovalRoute: jest.fn() } as never,
      notificationsService as never,
      {} as never,
      {} as never,
    );
  });

  it('resolves the approver notification when the employee cancels', async () => {
    leaveRepository.findLeaveRequestById
      .mockResolvedValueOnce(buildLeaveRequest('PENDING', 'PENDING'))
      .mockResolvedValueOnce(buildLeaveRequest('CANCELLED', 'CANCELLED'));
    employeesRepository.findByUserIdAndTenant.mockResolvedValue({
      id: 'employee-1',
    });

    await service.cancelLeaveRequest(
      {
        tenantId: TENANT_ID,
        userId: REQUESTER_USER_ID,
        roleKeys: [],
        permissionKeys: [],
      } as never,
      LEAVE_REQUEST_ID,
      {},
    );

    expect(notificationsService.resolveActionRequired).toHaveBeenCalledWith({
      tenantId: TENANT_ID,
      relatedEntityType: 'leaveRequest',
      relatedEntityId: LEAVE_REQUEST_ID,
    });
  });

  it.each([
    ['approve', 'APPROVED'],
    ['reject', 'REJECTED'],
  ])('resolves the approver notification on %s', async (action, settled) => {
    leaveRepository.findLeaveRequestById
      .mockResolvedValueOnce(buildLeaveRequest('PENDING', 'PENDING'))
      .mockResolvedValueOnce(buildLeaveRequest(settled, settled));

    const approver = {
      tenantId: TENANT_ID,
      userId: APPROVER_USER_ID,
      roleKeys: [],
      permissionKeys: [],
    } as never;

    if (action === 'approve') {
      await service.approveLeaveRequest(approver, LEAVE_REQUEST_ID, {});
    } else {
      await service.rejectLeaveRequest(approver, LEAVE_REQUEST_ID, {});
    }

    expect(notificationsService.resolveActionRequired).toHaveBeenCalledWith({
      tenantId: TENANT_ID,
      relatedEntityType: 'leaveRequest',
      relatedEntityId: LEAVE_REQUEST_ID,
    });

    /*
     * Order is load-bearing. The outcome notification for the employee is
     * emitted after the approver's request for action is retired, so a
     * resolution keyed on the same related record cannot swallow the row it was
     * meant to leave behind.
     */
    const resolvedAt =
      notificationsService.resolveActionRequired.mock.invocationCallOrder[0];
    const emittedAt = notificationsService.emit.mock.invocationCallOrder[0];
    expect(resolvedAt).toBeLessThan(emittedAt);
  });
});
