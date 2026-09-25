import { PartnerStatus } from '@prisma/client';
import { PartnerExperienceService } from './partner-experience.service';

/*
 * BUG-3551. `partner-experience.service.ts` never called `AuditService.log()`
 * — inquiry qualify/reject, onboarding review and partner activation were
 * written only to `PartnerTimeline` and email, never to the platform audit
 * trail. This suite pins that each admin-driven mutation now reaches it, with
 * `tenantId: 'platform'`.
 */

const admin = {
  userId: 'admin-1',
  tenantId: 'platform',
  email: 'admin@example.test',
  roleIds: [],
  roleKeys: [],
  permissionKeys: ['partners.manage'],
  platform: { id: 'admin-1', role: 'SUPER_ADMIN', status: 'ACTIVE' },
} as never;

const tenantUser = {
  userId: 'tenant-user',
  tenantId: 'tenant-a',
  roleIds: [],
  roleKeys: [],
  permissionKeys: ['partners.read', 'partners.manage'],
} as never;

function service(prisma: Record<string, unknown>, auditLog = jest.fn()) {
  const instance = new PartnerExperienceService(
    prisma as never,
    {} as never,
    { sendEmail: jest.fn() } as never,
    { record: jest.fn() } as never,
    { resolvePublished: jest.fn(async () => null), acknowledge: jest.fn() } as never,
    { log: auditLog } as never,
  );
  return { instance, auditLog };
}

describe('PartnerExperienceService — cross-tenant authorization', () => {
  it('refuses a tenant user on every platform-admin method, even one carrying partners.manage', async () => {
    const { instance } = service({});
    await expect(instance.listInquiries(tenantUser)).rejects.toThrow(
      'Platform access is required.',
    );
    await expect(
      instance.qualifyInquiry(tenantUser, 'inquiry-1', {} as never),
    ).rejects.toThrow('Platform access is required.');
  });
});

describe('PartnerExperienceService — audit coverage', () => {
  it('audits qualifying an inquiry into an approved partner', async () => {
    const { instance, auditLog } = service({
      partnerInquiry: {
        findUnique: jest.fn(async () => ({
          id: 'inquiry-1',
          status: 'NEW',
          partnerId: 'partner-1',
          type: 'COMPANY',
          companyName: 'Acme',
          contactFirstName: 'A',
          contactLastName: 'B',
          email: 'a@example.test',
        })),
        update: jest.fn(async () => ({})),
      },
      platformSetting: { findUnique: jest.fn(async () => null) },
      partner: {
        update: jest.fn(async () => ({
          id: 'partner-1',
          email: 'a@example.test',
          status: PartnerStatus.APPROVED_AWAITING_AGREEMENT,
          assignedToUserId: null,
        })),
      },
      partnerTimeline: { create: jest.fn(async () => ({})) },
      platformUser: { findMany: jest.fn(async () => []) },
      $transaction: jest.fn(async (callback: (tx: unknown) => unknown) =>
        callback({
          partner: {
            update: jest.fn(async () => ({
              id: 'partner-1',
              email: 'a@example.test',
              status: PartnerStatus.APPROVED_AWAITING_AGREEMENT,
              assignedToUserId: null,
            })),
          },
          partnerInquiry: { update: jest.fn(async () => ({})) },
          partnerTimeline: { create: jest.fn(async () => ({})) },
        }),
      ),
    });

    await instance.qualifyInquiry(admin, 'inquiry-1', {
      notes: 'ok',
    } as never);

    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'platform',
        actorUserId: 'admin-1',
        action: 'PARTNER_APPLICATION_APPROVED',
        entityType: 'Partner',
      }),
    );
  });

  it('audits rejecting an inquiry', async () => {
    const { instance, auditLog } = service({
      partnerInquiry: {
        findUnique: jest.fn(async () => ({
          id: 'inquiry-1',
          status: 'NEW',
          partnerId: null,
          email: 'a@example.test',
        })),
      },
      $transaction: jest.fn(async (callback: (tx: unknown) => unknown) =>
        callback({
          partnerInquiry: {
            update: jest.fn(async () => ({ status: 'REJECTED' })),
          },
          partner: { update: jest.fn() },
          partnerTimeline: { create: jest.fn() },
        }),
      ),
    });

    await instance.rejectInquiry(admin, 'inquiry-1', { notes: 'no' } as never);

    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'platform',
        action: 'PARTNER_APPLICATION_REJECTED',
        entityType: 'PartnerInquiry',
      }),
    );
  });

  it('audits an onboarding review decision', async () => {
    const prisma = {
      partnerOnboardingApplication: {
        findUnique: jest.fn(async () => ({
          id: 'application-1',
          status: 'SUBMITTED',
          submittedAt: new Date(),
          partnerId: 'partner-1',
          partner: {
            status: PartnerStatus.ONBOARDING_IN_PROGRESS,
            email: 'a@example.test',
          },
        })),
        update: jest.fn(async () => ({})),
      },
      partner: { update: jest.fn(async () => ({})) },
      $transaction: jest.fn(async (ops: unknown[]) => Promise.all(ops as never)),
    };
    const { instance, auditLog } = service(prisma);

    await instance.reviewOnboarding(admin, 'application-1', 'approve', {
      notes: 'looks good',
    } as never);

    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'platform',
        action: 'PARTNER_ONBOARDING_APPROVE',
        entityType: 'PartnerOnboardingApplication',
      }),
    );
  });

  it('audits partner-lead review decisions', async () => {
    const prisma = {
      partnerLeadReview: {
        findUnique: jest.fn(async () => ({
          id: 'review-1',
          status: 'SUBMITTED',
          partner: { email: 'a@example.test' },
          lead: { companyName: 'Acme' },
        })),
        update: jest.fn(async () => ({})),
      },
    };
    const { instance, auditLog } = service(prisma);

    await instance.reviewPartnerLead(admin, 'review-1', 'reject', {
      notes: 'not qualified',
    } as never);

    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'platform',
        action: 'PARTNER_LEAD_REVIEW_REJECT',
        entityType: 'PartnerLeadReview',
        entityId: 'review-1',
      }),
    );
  });
});
