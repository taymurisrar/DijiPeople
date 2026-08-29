import { NotificationStatus } from '@prisma/client';
import { NotificationsRepository } from './notifications.repository';

/**
 * BUG-2016 — resolving the action-required notifications that point at a record
 * whose state no longer admits the action.
 *
 * The mechanics are asserted here rather than in the leave module because the
 * gap is not leave's: timesheets, claims, loans and business trips raise the
 * same kind of row and settle the same way.
 *
 * Two tables have to be written for the row to actually leave the queue, which
 * is the part a looser test would miss. `NotificationRecipient` is what the
 * inbox listing and the unread badge read; `Notification.status` is what
 * `findActiveNotificationByDedupeKey` reads, so leaving it `UNREAD` would
 * suppress the next legitimate notification for the same record.
 */

const TENANT_ID = 'tenant-1';

function buildPrisma(outstandingIds: readonly string[]) {
  return {
    notification: {
      findMany: jest
        .fn()
        .mockResolvedValue(outstandingIds.map((id) => ({ id }))),
      updateMany: jest.fn().mockResolvedValue({ count: outstandingIds.length }),
    },
    notificationRecipient: {
      updateMany: jest.fn().mockResolvedValue({ count: outstandingIds.length }),
    },
  };
}

describe('NotificationsRepository.resolveActionRequiredNotificationsForRecord', () => {
  it('retires the recipient rows and the notifications together', async () => {
    const prisma = buildPrisma(['notification-1', 'notification-2']);
    const repository = new NotificationsRepository(prisma as never);

    const result =
      await repository.resolveActionRequiredNotificationsForRecord({
        tenantId: TENANT_ID,
        relatedEntityType: 'leaveRequest',
        relatedEntityId: 'leave-request-1',
      });

    expect(result).toEqual({ resolved: 2 });

    // Only outstanding rows that asked for an action, and only this tenant's.
    expect(prisma.notification.findMany).toHaveBeenCalledWith({
      where: {
        tenantId: TENANT_ID,
        relatedEntityType: 'leaveRequest',
        relatedEntityId: 'leave-request-1',
        requiresAction: true,
        status: { in: [NotificationStatus.UNREAD, NotificationStatus.READ] },
      },
      select: { id: true },
    });

    const recipientWrites =
      prisma.notificationRecipient.updateMany.mock.calls.map(
        ([argument]) => argument as Record<string, never>,
      );

    /*
     * `readAt` is filled only where it was empty: a recipient who had already
     * read the row keeps the time they read it, which is the whole reason this
     * is two statements rather than one.
     */
    const readWrite = recipientWrites.find(
      (call) => (call.where as Record<string, unknown>).readAt === null,
    );
    expect(readWrite).toBeDefined();
    expect(Object.keys(readWrite?.data as object)).toEqual(['readAt']);

    const retireWrite = recipientWrites.find(
      (call) =>
        (call.data as Record<string, unknown>).status ===
        NotificationStatus.ACTIONED,
    );
    expect(retireWrite).toBeDefined();
    expect((retireWrite?.where as Record<string, unknown>).tenantId).toBe(
      TENANT_ID,
    );
    // `archivedAt` is what removes the row from the default inbox view; status
    // alone drops it from the unread count but leaves it on screen.
    expect(
      (retireWrite?.data as Record<string, unknown>).archivedAt,
    ).toBeInstanceOf(Date);

    expect(prisma.notification.updateMany).toHaveBeenCalledWith({
      where: {
        tenantId: TENANT_ID,
        id: { in: ['notification-1', 'notification-2'] },
      },
      data: { status: NotificationStatus.ACTIONED },
    });
  });

  it('writes nothing when the record has no outstanding request for action', async () => {
    const prisma = buildPrisma([]);
    const repository = new NotificationsRepository(prisma as never);

    const result =
      await repository.resolveActionRequiredNotificationsForRecord({
        tenantId: TENANT_ID,
        relatedEntityType: 'leaveRequest',
        relatedEntityId: 'leave-request-1',
      });

    expect(result).toEqual({ resolved: 0 });
    expect(prisma.notificationRecipient.updateMany).not.toHaveBeenCalled();
    expect(prisma.notification.updateMany).not.toHaveBeenCalled();
  });
});
