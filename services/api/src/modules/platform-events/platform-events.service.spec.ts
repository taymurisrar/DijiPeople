import { PlatformEventSource } from '@prisma/client';
import { PlatformEventsService } from './platform-events.service';

describe('PlatformEventsService.notifications', () => {
  const user = {
    platform: { id: 'pu-1', role: 'SUPER_ADMIN', status: 'ACTIVE' },
    permissionKeys: ['monitoring.read'],
  } as never;

  it('resolves tenant and customer labels in one query each and collapses repeats', async () => {
    const at = (m: number) => new Date(Date.now() - m * 60000);
    const row = (id: string, m: number) => ({
      id,
      eventCode: 'TENANT_PROVISIONING_RETRIED',
      result: 'FAILED',
      occurredAt: at(m),
      entityType: 'Tenant',
      entityId: 'ten-1',
      tenantId: 'ten-1',
      customerAccountId: 'cust-1',
      metadata: null,
    });
    const tenantFind = jest.fn(async () => [
      { id: 'ten-1', name: 'Acme Ltd', slug: 'acme' },
    ]);
    const customerFind = jest.fn(async () => [
      { id: 'cust-1', companyName: 'Acme Holdings' },
    ]);
    const service = new PlatformEventsService({
      platformUser: {
        findUnique: jest.fn(async () => ({ notificationsReadAt: null })),
      },
      platformEvent: {
        findMany: jest.fn(async () => [row('a', 1), row('b', 3), row('c', 5)]),
      },
      tenant: { findMany: tenantFind },
      customerAccount: { findMany: customerFind },
    } as never);

    const feed = await service.notifications(user, { limit: 10 });

    expect(tenantFind).toHaveBeenCalledTimes(1);
    expect(customerFind).toHaveBeenCalledTimes(1);
    expect(feed.items).toHaveLength(1);
    expect(feed.items[0].count).toBe(3);
    expect(feed.items[0].title).toBe('Provisioning retry failed for Acme Ltd');
    expect(feed.items[0].context).toBe('Acme Ltd (acme) · Acme Holdings');
    expect(feed.unreadCount).toBe(1);
  });

  it('still returns notifications when label lookup fails', async () => {
    const service = new PlatformEventsService({
      platformUser: {
        findUnique: jest.fn(async () => ({ notificationsReadAt: null })),
      },
      platformEvent: {
        findMany: jest.fn(async () => [
          {
            id: 'a',
            eventCode: 'LEAD_CONVERSION_BLOCKED',
            result: 'FAILED',
            occurredAt: new Date(),
            entityType: 'Lead',
            entityId: 'lead-1',
            tenantId: 'ten-1',
            customerAccountId: null,
            metadata: null,
          },
        ]),
      },
      tenant: {
        findMany: jest.fn(async () => {
          throw new Error('db down');
        }),
      },
      customerAccount: { findMany: jest.fn() },
    } as never);

    const feed = await service.notifications(user);
    expect(feed.items).toHaveLength(1);
    expect(feed.items[0].actionRequired).toBe(true);
  });
});

describe('PlatformEventsService', () => {
  it('normalizes event codes and removes sensitive metadata', async () => {
    const create = jest.fn().mockImplementation(({ data }) => data);
    const service = new PlatformEventsService({
      platformEvent: { create },
    } as never);

    await service.record({
      eventCode: ' agreement signed ',
      source: PlatformEventSource.API,
      correlationId: 'request-123',
      metadata: {
        contractId: 'contract-1',
        accessToken: 'must-not-be-stored',
        nested: { password: 'must-not-be-stored', status: 'complete' },
      },
    });

    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        eventCode: 'AGREEMENT_SIGNED',
        correlationId: 'request-123',
        metadata: {
          contractId: 'contract-1',
          nested: { status: 'complete' },
        },
      }),
    });
  });
});
