import { NotificationStatus } from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ENTITY_KEYS } from '../../common/constants/rbac-matrix';
import {
  REQUIRED_PERMISSIONS_KEY,
  REQUIRED_RBAC_PERMISSIONS_KEY,
} from '../../common/decorators/require-permissions.decorator';
import { InAppDeliveryLogQueryDto } from './dto';
import { NotificationsController } from './notifications.controller';
import { NOTIFICATION_PERMISSION_KEYS } from './notifications.constants';
import {
  inAppDeliveryLogSelect,
  NotificationsRepository,
} from './notifications.repository';
import { NotificationsService } from './notifications.service';

/*
 * ITEM-0182 — the Delivery Logs screen shows in-app notifications, not only
 * email.
 *
 * Three things make a tenant-wide log safe, and each is pinned:
 * - the query is scoped to the caller's tenant;
 * - it never projects what a notification said (its body, payload or
 *   metadata can carry links meant for one person — BUG-3137 is the email-log
 *   version of that leak);
 * - the route is guarded exactly as the email log is, in both permission
 *   systems.
 */

function buildRepository() {
  const findMany = jest.fn(async () => [
    {
      id: 'recipient-1',
      status: NotificationStatus.READ,
      deliveredAt: new Date('2026-09-10T08:00:00Z'),
      readAt: new Date('2026-09-10T09:00:00Z'),
      createdAt: new Date('2026-09-10T08:00:00Z'),
      notification: { title: 'Leave approved', eventCode: 'LEAVE_APPROVED' },
      user: {
        firstName: 'Rania',
        lastName: 'Haddad',
        email: 'rania@acme.test',
      },
    },
  ]);
  const count = jest.fn(async () => 1);
  const repository = new NotificationsRepository({
    notificationRecipient: { findMany, count },
  } as never);
  return { repository, findMany, count };
}

describe('tenant in-app delivery log query', () => {
  it("filters on the caller's tenant", async () => {
    const { repository, findMany, count } = buildRepository();

    await repository.listTenantInAppDeliveryLogs('tenant-1', {
      search: 'rania',
      page: 2,
      pageSize: 10,
    });

    const [args] = findMany.mock.calls[0] as unknown as [
      { where: { tenantId: string }; skip: number; take: number },
    ];
    expect(args.where.tenantId).toBe('tenant-1');
    expect(args.skip).toBe(10);
    expect(args.take).toBe(10);
    const [countArgs] = count.mock.calls[0] as unknown as [
      { where: { tenantId: string } },
    ];
    expect(countArgs.where.tenantId).toBe('tenant-1');
  });

  it('selects no notification content', async () => {
    const { repository, findMany } = buildRepository();

    await repository.listTenantInAppDeliveryLogs('tenant-1', {});

    const [args] = findMany.mock.calls[0] as unknown as [
      { select: typeof inAppDeliveryLogSelect },
    ];
    expect(args.select).toBe(inAppDeliveryLogSelect);
    expect(
      Object.keys(inAppDeliveryLogSelect.notification.select).sort(),
    ).toEqual(['eventCode', 'title']);
    expect(Object.keys(inAppDeliveryLogSelect.user.select).sort()).toEqual([
      'email',
      'firstName',
      'lastName',
    ]);
  });
});

describe('NotificationsService.listInAppDeliveryLogs', () => {
  it('flattens rows and passes the tenant from the session, never the query', async () => {
    const { repository } = buildRepository();
    const spy = jest.spyOn(repository, 'listTenantInAppDeliveryLogs');
    const service = Object.create(
      NotificationsService.prototype,
    ) as NotificationsService;
    Object.assign(service, { notificationsRepository: repository });

    const result = await service.listInAppDeliveryLogs(
      { tenantId: 'tenant-1', userId: 'user-1' } as never,
      plainToInstance(InAppDeliveryLogQueryDto, { page: '1', pageSize: '25' }),
    );

    expect(spy.mock.calls[0]?.[0]).toBe('tenant-1');
    expect(result).toMatchObject({ page: 1, pageSize: 25, total: 1 });
    expect(result.items).toEqual([
      {
        id: 'recipient-1',
        title: 'Leave approved',
        eventCode: 'LEAVE_APPROVED',
        recipient: 'rania@acme.test',
        recipientName: 'Rania Haddad',
        status: NotificationStatus.READ,
        deliveredAt: new Date('2026-09-10T08:00:00Z'),
        readAt: new Date('2026-09-10T09:00:00Z'),
        createdAt: new Date('2026-09-10T08:00:00Z'),
      },
    ]);
  });
});

describe('InAppDeliveryLogQueryDto', () => {
  /*
   * The settings runtime list sends `page` and `pageSize` as query strings
   * (settingsListApiPath). The global pipe forbids unknown fields, so this is
   * the seam that turns a working screen into a 400 (BUG-2043).
   */
  it('accepts exactly what the settings runtime list sends', async () => {
    const dto = plainToInstance(InAppDeliveryLogQueryDto, {
      page: '2',
      pageSize: '50',
    });
    await expect(
      validate(dto, { whitelist: true, forbidNonWhitelisted: true }),
    ).resolves.toEqual([]);
  });

  it('refuses a tenantId supplied by the client', async () => {
    const dto = plainToInstance(InAppDeliveryLogQueryDto, {
      tenantId: 'other-tenant',
    });
    const errors = await validate(dto, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });
    expect(errors.map((error) => error.property)).toContain('tenantId');
  });
});

describe('GET notifications/in-app-delivery-logs guards', () => {
  const handler = Object.getOwnPropertyDescriptor(
    NotificationsController.prototype,
    'listInAppDeliveryLogs',
  )?.value as object;
  const emailHandler = Object.getOwnPropertyDescriptor(
    NotificationsController.prototype,
    'listDeliveryLogs',
  )?.value as object;

  it('declares the legacy permission the email log uses', () => {
    expect(Reflect.getMetadata(REQUIRED_PERMISSIONS_KEY, handler)).toEqual([
      NOTIFICATION_PERMISSION_KEYS.NOTIFICATION_LOGS_READ,
    ]);
  });

  it('declares the same matrix privilege as the email log', () => {
    const matrix = Reflect.getMetadata(REQUIRED_RBAC_PERMISSIONS_KEY, handler);
    expect(matrix).toBeDefined();
    expect(matrix).toEqual(
      Reflect.getMetadata(REQUIRED_RBAC_PERMISSIONS_KEY, emailHandler),
    );
    expect(JSON.stringify(matrix)).toContain(ENTITY_KEYS.REPORTS);
  });
});
