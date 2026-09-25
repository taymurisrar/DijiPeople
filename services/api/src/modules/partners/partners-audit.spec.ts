import { PartnerType } from '@prisma/client';
import { PartnersService } from './partners.service';
import type { AuditService } from '../audit/audit.service';

/*
 * BUG-3551. `partners.service.ts` never called `AuditService.log()` — every
 * create, update and lifecycle transition was written only to
 * `PartnerTimeline`, a partner-scoped table with a free-text `eventType` that
 * the platform's general audit views never read. `leads.service.ts`, the
 * sibling commercial funnel, has audited its mutations from the start; this
 * suite pins that partner mutations now reach the same place, with the same
 * `tenantId: 'platform'` routing to `PlatformAuditLog`, and that the snapshot
 * carries no secret fields (`Partner` has none, but `applicationSnapshot` —
 * the raw original submission — is deliberately left out of the snapshot).
 */

function prismaStub(overrides: Record<string, unknown> = {}) {
  return {
    partner: {
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({
        id: 'partner-new',
        code: 'PTR-1',
        status: 'DRAFT',
        accountStatus: 'NOT_PROVISIONED',
        defaultCommissionRate: 0,
        ...data,
      })),
      update: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({
        id: 'partner-1',
        code: 'PTR-1',
        status: 'DRAFT',
        accountStatus: 'NOT_PROVISIONED',
        defaultCommissionRate: 0,
        ...data,
      })),
      findFirst: jest.fn(async () => null),
      findMany: jest.fn(async () => []),
      findUnique: jest.fn(async () => ({
        id: 'partner-1',
        code: 'PTR-1',
        status: 'DRAFT',
        accountStatus: 'NOT_PROVISIONED',
        currencyCode: 'USD',
        defaultCommissionRate: 0,
        email: 'existing@example.test',
        companyName: 'Existing Co',
        type: PartnerType.COMPANY,
        leads: [],
        agreements: [],
        commissions: [],
        inquiries: [],
        onboardingApplications: [],
        portalUsers: [],
        referralLinks: [],
        attributedCustomers: [],
        attributedTenants: [],
        timeline: [],
      })),
    },
    platformSetting: { findUnique: jest.fn(async () => null) },
    $transaction: jest.fn(async (ops: unknown[]) => Promise.all(ops as never)),
    partnerTimeline: { create: jest.fn(async () => ({})) },
    partnerInquiry: { updateMany: jest.fn(async () => ({ count: 0 })) },
    ...overrides,
  } as never;
}

describe('PartnersService — audit coverage', () => {
  it('audits partner creation to the platform log', async () => {
    const auditLog = jest.fn<
      Promise<unknown>,
      Parameters<AuditService['log']>
    >();
    const prisma = prismaStub();
    const service = new PartnersService(prisma, { log: auditLog } as never);

    await service.create(
      {
        type: PartnerType.COMPANY,
        companyName: 'Acme Inc',
        displayName: 'Acme',
        email: 'acme@example.test',
        defaultCommissionRate: 5,
      } as never,
      'actor-1',
    );

    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'platform',
        actorUserId: 'actor-1',
        action: 'PARTNER_CREATED',
        entityType: 'Partner',
      }),
    );
    const snapshot = auditLog.mock.calls[0][0].afterSnapshot;
    expect(snapshot).not.toHaveProperty('applicationSnapshot');
  });

  it('audits partner update with a before/after snapshot', async () => {
    const auditLog = jest.fn<
      Promise<unknown>,
      Parameters<AuditService['log']>
    >();
    const prisma = prismaStub();
    const service = new PartnersService(prisma, { log: auditLog } as never);

    await service.update(
      'partner-1',
      {
        type: PartnerType.COMPANY,
        companyName: 'Existing Co',
        displayName: 'Existing',
        email: 'existing@example.test',
        defaultCommissionRate: 10,
      } as never,
      'actor-1',
    );

    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'PARTNER_UPDATED',
        tenantId: 'platform',
        beforeSnapshot: expect.objectContaining({ id: 'partner-1' }) as unknown,
        afterSnapshot: expect.any(Object) as unknown,
      }),
    );
  });

  it('audits a lifecycle transition, naming the action and the actor', async () => {
    const auditLog = jest.fn();
    const prisma = prismaStub({
      partner: {
        findUnique: jest.fn(async () => ({
          id: 'partner-1',
          status: 'INQUIRY',
          accountStatus: 'NOT_PROVISIONED',
          displayName: 'Existing',
          currencyCode: 'USD',
          defaultCommissionRate: 0,
          type: PartnerType.COMPANY,
          leads: [],
          agreements: [],
          commissions: [],
          inquiries: [],
          onboardingApplications: [],
          portalUsers: [],
          referralLinks: [],
          attributedCustomers: [],
          attributedTenants: [],
          timeline: [],
        })),
        update: jest.fn(async () => ({})),
      },
    });
    const service = new PartnersService(prisma, { log: auditLog } as never);

    await service.lifecycleAction('partner-1', 'actor-1', {
      action: 'start-review',
    } as never);

    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'platform',
        actorUserId: 'actor-1',
        action: 'PARTNER_START_REVIEW',
        entityType: 'Partner',
        entityId: 'partner-1',
      }),
    );
  });
});
