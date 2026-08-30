import { BadRequestException, NotFoundException } from '@nestjs/common';
import { SubscriptionStatus, TenantStatus } from '@prisma/client';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { TenantControlPlaneService } from './tenant-control-plane.service';

const admin = {
  userId: 'platform-user-1',
  tenantId: 'platform',
  email: 'ops@dijipeople.com',
  roleIds: [],
  roleKeys: [],
  permissionKeys: [],
  platform: { id: 'platform-user-1', role: 'PLATFORM_ADMIN', status: 'ACTIVE' },
} as unknown as AuthenticatedUser;

const tenantRow = {
  id: 'tenant-1',
  name: 'Maseer Group',
  displayName: 'Maseer Group',
  legalName: null,
  slug: 'maseer',
  tenantCode: 'MAS-000001',
  status: TenantStatus.SUSPENDED,
  subStatus: null,
  customerAccountId: 'customer-1',
  ownerUserId: 'owner-1',
  createdAt: new Date(),
  updatedAt: new Date(),
};

function build(subscription: Record<string, unknown> | null) {
  const prisma = {
    tenant: { findUnique: jest.fn().mockResolvedValue(tenantRow) },
    subscription: {
      findUnique: jest.fn().mockResolvedValue(subscription),
      update: jest.fn(
        ({ data }: { where: unknown; data: Record<string, unknown> }) =>
          Promise.resolve({
            ...subscription,
            ...data,
            plan: { id: 'plan-1', key: 'starter', name: 'Starter' },
          }),
      ),
    },
    platformUser: { findUnique: jest.fn().mockResolvedValue(null) },
  };
  const service = new TenantControlPlaneService(
    prisma as never,
    {} as never, // access
    {} as never, // modules
    {} as never, // apps
    {} as never, // operations
    {} as never, // domains
    { log: jest.fn() } as never, // audit
    { record: jest.fn() } as never, // platform events
    {} as never, // tenant settings resolver
  );
  return { service, prisma };
}

const liveSubscription = {
  id: 'sub-1',
  status: SubscriptionStatus.ACTIVE,
  endDate: null,
  autoRenew: true,
  stripeSubscriptionId: null,
  plan: { id: 'plan-1', key: 'starter', name: 'Starter' },
};

/**
 * Cancellation is the gate in front of decommissioning and erasure. Before it
 * existed as its own operation the only route to it was a subscription editor
 * that also demanded a plan and a price, which made "cancel so I can retire this
 * tenant" unreachable — and left erasure permanently blocked.
 */
describe('TenantControlPlaneService.cancelSubscription', () => {
  it('cancels a live subscription and stops it renewing', async () => {
    const { service, prisma } = build(liveSubscription);

    const result = await service.cancelSubscription(admin, 'tenant-1', {
      reason: 'Contract terminated.',
    });

    expect(prisma.subscription.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'sub-1' },
        data: expect.objectContaining({
          status: SubscriptionStatus.CANCELLED,
          autoRenew: false,
          renewalDate: null,
        }) as Record<string, unknown>,
      }),
    );
    expect(result.success).toBe(true);
    expect(result.requiresStripeAction).toBe(false);
  });

  it('records the end date and cancellation date together', async () => {
    const { service, prisma } = build(liveSubscription);
    await service.cancelSubscription(admin, 'tenant-1', {
      reason: 'Contract terminated.',
      effectiveAt: '2026-09-01T00:00:00.000Z',
    });
    const data = prisma.subscription.update.mock.calls[0][0].data;
    expect(data.endDate).toEqual(new Date('2026-09-01T00:00:00.000Z'));
    expect(data.canceledAt).toEqual(new Date('2026-09-01T00:00:00.000Z'));
  });

  it('refuses to cancel a subscription that is already cancelled', async () => {
    const { service } = build({
      ...liveSubscription,
      status: SubscriptionStatus.CANCELLED,
    });
    await expect(
      service.cancelSubscription(admin, 'tenant-1', { reason: 'Again.' }),
    ).rejects.toThrow(/already cancelled/);
  });

  it('treats both spellings of cancelled as cancelled', async () => {
    const { service } = build({
      ...liveSubscription,
      status: SubscriptionStatus.CANCELED,
    });
    await expect(
      service.cancelSubscription(admin, 'tenant-1', { reason: 'Again.' }),
    ).rejects.toThrow(/already cancelled/);
  });

  it('refuses a Stripe-backed cancellation until the caller acknowledges Stripe', async () => {
    const { service, prisma } = build({
      ...liveSubscription,
      stripeSubscriptionId: 'sub_stripe_123',
    });
    await expect(
      service.cancelSubscription(admin, 'tenant-1', { reason: 'Terminated.' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.subscription.update).not.toHaveBeenCalled();
  });

  it('says what still has to happen in Stripe once acknowledged', async () => {
    const { service } = build({
      ...liveSubscription,
      stripeSubscriptionId: 'sub_stripe_123',
    });
    const result = await service.cancelSubscription(admin, 'tenant-1', {
      reason: 'Terminated.',
      acknowledgeStripeSubscription: true,
    });
    expect(result.requiresStripeAction).toBe(true);
    expect(result.message).toContain('sub_stripe_123');
  });

  it('reports a tenant with no subscription rather than silently succeeding', async () => {
    const { service } = build(null);
    await expect(
      service.cancelSubscription(admin, 'tenant-1', { reason: 'Terminated.' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
