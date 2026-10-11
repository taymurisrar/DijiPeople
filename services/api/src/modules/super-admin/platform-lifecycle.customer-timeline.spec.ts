import { NotFoundException } from '@nestjs/common';
import { PlatformLifecycleService } from './platform-lifecycle.service';

/*
 * The customer Timeline tab was empty because it queried the operator's own
 * tenant under the entity type "Customers". These pin the replacement: it reads
 * the places a customer's history actually lives, in one ordered list, and it
 * never lets a snapshot payload out.
 */
function build(overrides: Record<string, unknown> = {}) {
  const prisma = {
    customerAccount: {
      findUnique: jest.fn(async () => ({
        id: 'cust-1',
        companyName: 'Acme Holdings',
        leadId: 'lead-1',
      })),
    },
    tenant: {
      findMany: jest.fn(async () => [
        { id: 'ten-1', name: 'Acme Ltd', slug: 'acme' },
      ]),
    },
    customerOnboarding: { findMany: jest.fn(async () => [{ id: 'onb-1' }]) },
    contract: { findMany: jest.fn(async () => [{ id: 'con-1' }]) },
    platformEvent: {
      findMany: jest.fn(async () => [
        {
          id: 'evt-1',
          eventCode: 'TENANT_PROVISIONING_REQUESTED',
          result: 'PENDING',
          occurredAt: new Date('2026-10-01T10:00:00.000Z'),
          entityType: 'Tenant',
          entityId: 'ten-1',
          tenantId: 'ten-1',
          customerAccountId: 'cust-1',
          actorType: 'PLATFORM_USER',
          actorId: 'pu-1',
          metadata: { requestedDomain: 'acme.example.com', email: 'x@y.z' },
        },
      ]),
    },
    platformAuditLog: {
      findMany: jest.fn(async () => [
        {
          id: 'aud-1',
          action: 'PLATFORM_CUSTOMER_UPDATED',
          entityType: 'CustomerAccount',
          entityId: 'cust-1',
          createdAt: new Date('2026-10-02T09:00:00.000Z'),
          beforeSnapshot: { status: 'LEAD', contactEmail: 'old@secret.test' },
          afterSnapshot: {
            status: 'ACTIVE',
            contactEmail: 'new@secret.test',
            passwordHash: 'abc',
          },
          platformActorUser: {
            firstName: 'Sara',
            lastName: 'Ops',
            email: 's@x.test',
          },
        },
      ]),
    },
    platformUser: {
      findMany: jest.fn(async () => [
        { id: 'pu-1', firstName: 'Omar', lastName: 'Admin', email: 'o@x.test' },
      ]),
    },
    ...overrides,
  };
  const none = {} as never;
  const service = new PlatformLifecycleService(
    prisma as never,
    none,
    none,
    none,
    none,
    none,
    none,
    none,
    none,
    none,
    none,
  );
  return { service, prisma };
}

describe('PlatformLifecycleService.customerTimeline', () => {
  it('merges events and audit rows, newest first', async () => {
    const { service } = build();
    const { items } = await service.customerTimeline('cust-1');

    expect(items.map((item) => item.id)).toEqual(['aud-1', 'evt-1']);
    expect(items[1].title).toBe('Provisioning started for Acme Ltd');
    expect(items[1].actorName).toBe('Omar Admin');
    expect(items[1].link).toBe('/tenants/ten-1');
    expect(items[0].actorName).toBe('Sara Ops');
  });

  it('queries every linked source with the customer, tenants, contracts and lead', async () => {
    const { service, prisma } = build();
    await service.customerTimeline('cust-1');

    const eventWhere = JSON.stringify(
      (prisma.platformEvent.findMany.mock.calls[0] as unknown[])[0],
    );
    expect(eventWhere).toContain('customerAccountId');
    expect(eventWhere).toContain('ten-1');
    expect(eventWhere).toContain('con-1');
    expect(eventWhere).toContain('lead-1');
    const auditWhere = JSON.stringify(
      (prisma.platformAuditLog.findMany.mock.calls[0] as unknown[])[0],
    );
    expect(auditWhere).toContain('CustomerOnboarding');
    expect(auditWhere).toContain('onb-1');
  });

  it('names changed fields but never returns snapshot values', async () => {
    const { service } = build();
    const { items } = await service.customerTimeline('cust-1');
    const audit = items.find((item) => item.id === 'aud-1')!;

    expect(audit.description).toBe('Changed: status, contactEmail');
    const serialised = JSON.stringify(items);
    expect(serialised).not.toContain('secret.test');
    expect(serialised).not.toContain('passwordHash');
    expect(serialised).not.toContain('x@y.z');
    expect(serialised).not.toContain('Snapshot');
  });

  it('returns 404 for an unknown customer', async () => {
    const { service } = build({
      customerAccount: { findUnique: jest.fn(async () => null) },
    });
    await expect(service.customerTimeline('nope')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('caps the page and reports a cursor when more remain', async () => {
    const many = Array.from({ length: 3 }, (_, i) => ({
      id: `evt-${i}`,
      eventCode: 'LEAD_SUBMITTED',
      result: 'SUCCEEDED',
      occurredAt: new Date(`2026-10-0${i + 1}T10:00:00.000Z`),
      entityType: 'Lead',
      entityId: 'lead-1',
      tenantId: null,
      customerAccountId: 'cust-1',
      actorType: 'PUBLIC_VISITOR',
      actorId: null,
      metadata: null,
    }));
    const { service } = build({
      platformEvent: { findMany: jest.fn(async () => many) },
      platformAuditLog: { findMany: jest.fn(async () => []) },
    });
    const page = await service.customerTimeline('cust-1', { limit: 2 });

    expect(page.items).toHaveLength(2);
    expect(page.nextCursor).toBe(page.items[1].occurredAt);
    expect(page.items[0].actorName).toBe('Customer');
  });
});
