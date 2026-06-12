import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { InboxService } from './inbox.service';

describe('InboxService leave record access', () => {
  const user: AuthenticatedUser = {
    userId: 'manager-user',
    tenantId: 'tenant-1',
    email: 'manager@example.com',
    roleIds: ['manager-role'],
    roleKeys: ['manager'],
    permissionKeys: ['inbox.read', 'leave-requests.read'],
  };
  const notification = {
    moduleKey: 'leave',
    relatedEntityType: 'leaveRequest',
    relatedEntityId: 'leave-1',
    metadata: {},
  };
  let leaveRequestFindFirst: jest.Mock;
  let approvalAssignmentFindFirst: jest.Mock;
  let service: InboxService;

  beforeEach(() => {
    leaveRequestFindFirst = jest.fn();
    approvalAssignmentFindFirst = jest.fn();
    service = new InboxService({
      leaveRequest: { findFirst: leaveRequestFindFirst },
      approvalAssignment: { findFirst: approvalAssignmentFindFirst },
    } as never);
  });

  it('allows a manager to open a direct report leave notification', async () => {
    leaveRequestFindFirst.mockResolvedValue({
      employee: {
        userId: 'employee-user',
        manager: { userId: user.userId },
      },
      approvalSteps: [],
    });

    await expect(canOpen(service, user, notification)).resolves.toBe(true);
    expect(approvalAssignmentFindFirst).not.toHaveBeenCalled();
  });

  it('allows an explicitly assigned approver to open the leave notification', async () => {
    leaveRequestFindFirst.mockResolvedValue({
      employee: { userId: 'employee-user', manager: null },
      approvalSteps: [{ approverUserId: user.userId }],
    });

    await expect(
      canOpen(
        service,
        { ...user, permissionKeys: ['inbox.read', 'leave-requests.approve'] },
        notification,
      ),
    ).resolves.toBe(true);
  });

  it('denies an unrelated leave record', async () => {
    leaveRequestFindFirst.mockResolvedValue({
      employee: { userId: 'employee-user', manager: null },
      approvalSteps: [],
    });
    approvalAssignmentFindFirst.mockResolvedValue(null);

    await expect(canOpen(service, user, notification)).resolves.toBe(false);
  });
});

describe('InboxService open lifecycle', () => {
  const user: AuthenticatedUser = {
    userId: 'employee-user',
    tenantId: 'tenant-1',
    email: 'employee@example.com',
    roleIds: [],
    roleKeys: ['employee'],
    permissionKeys: ['inbox.read'],
  };

  it('returns a stable missing state for a stale notification id', async () => {
    const service = new InboxService({
      notification: { findFirst: jest.fn().mockResolvedValue(null) },
    } as never);

    await expect(service.open(user, 'stale-id')).resolves.toEqual({
      state: 'RECORD_NOT_FOUND',
      navigationTarget: null,
      notification: null,
    });
  });

  it('opens an owned notification and remains safe when opened again', async () => {
    const notification = {
      id: 'notification-1',
      tenantId: user.tenantId,
      recipientUserId: user.userId,
      moduleKey: null,
      relatedEntityType: null,
      relatedEntityId: null,
      metadata: {},
      status: 'UNREAD',
      readAtUtc: null,
      targetUrl: '/inbox',
      routeName: null,
      expiresAtUtc: null,
    };
    const update = jest.fn().mockResolvedValue(notification);
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const create = jest.fn().mockResolvedValue({});
    const service = new InboxService({
      notification: {
        findFirst: jest
          .fn()
          .mockResolvedValueOnce(notification)
          .mockResolvedValueOnce({
            ...notification,
            status: 'READ',
            readAtUtc: new Date(),
          }),
        update,
      },
      notificationRecipient: { updateMany },
      notificationInteractionLog: { create },
      $transaction: jest.fn(async (operations: unknown[]) =>
        Promise.all(operations),
      ),
    } as never);

    await expect(service.open(user, notification.id)).resolves.toMatchObject({
      state: 'OK',
      navigationTarget: '/inbox',
    });
    await expect(service.open(user, notification.id)).resolves.toMatchObject({
      state: 'OK',
      navigationTarget: '/inbox',
    });
    expect(update).toHaveBeenCalledTimes(2);
    expect(updateMany).toHaveBeenCalledTimes(2);
    expect(create).toHaveBeenCalledTimes(2);
  });
});

function canOpen(
  service: InboxService,
  user: AuthenticatedUser,
  notification: {
    moduleKey: string;
    relatedEntityType: string;
    relatedEntityId: string;
    metadata: object;
  },
) {
  return (
    service as unknown as {
      canOpenRelatedRecord: (
        currentUser: AuthenticatedUser,
        currentNotification: typeof notification,
      ) => Promise<boolean>;
    }
  ).canOpenRelatedRecord(user, notification);
}
