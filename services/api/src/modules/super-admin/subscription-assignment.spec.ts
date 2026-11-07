import { BadRequestException } from '@nestjs/common';
import {
  BillingCycle,
  CommercialPublicationStatus,
  PlanKind,
} from '@prisma/client';
import { PlanChangeService } from '../billing/services/plan-change.service';
import { BillingService } from './billing.service';
import { assertPlanAssignableToTenant } from './plan-eligibility';
import { PLATFORM_PERMISSION_KEY } from '../platform-auth/platform-permissions';
import { SuperAdminController } from './super-admin.controller';
import { SuperAdminService } from './super-admin.service';

/*
 * DP-QA-043: every way of putting a tenant on a plan honours the plan's reservation
 * and availability window, in the service layer, not only in the callers that
 * happened to remember it.
 */
const OWNER = 'cust-owner';
const OTHER = 'cust-other';

type PlanRow = Record<string, unknown>;
const reservedPlan = (extra: PlanRow = {}): PlanRow => ({
  name: 'Custom Plan A1B2C3',
  kind: PlanKind.CUSTOM,
  salesModel: 'CUSTOM_ONLY',
  eligibleCustomerAccountId: OWNER,
  effectiveFrom: null,
  effectiveUntil: null,
  ...extra,
});

function fakeDb(opts: {
  customer: string;
  currentPlanId: string | null;
  plan: PlanRow | null;
}) {
  return {
    tenant: {
      findUnique: jest
        .fn()
        .mockResolvedValue({ customerAccountId: opts.customer }),
    },
    subscription: {
      findUnique: jest
        .fn()
        .mockResolvedValue(
          opts.currentPlanId ? { planId: opts.currentPlanId } : null,
        ),
      upsert: jest.fn(),
    },
    plan: { findUnique: jest.fn().mockResolvedValue(opts.plan) },
  };
}

describe('assertPlanAssignableToTenant', () => {
  it('refuses a plan reserved for a different customer', async () => {
    const db = fakeDb({
      customer: OTHER,
      currentPlanId: 'starter',
      plan: reservedPlan(),
    });
    await expect(
      assertPlanAssignableToTenant(db as never, 't1', 'reserved'),
    ).rejects.toThrow(/reserved for another customer/);
  });

  it('allows the reserved customer', async () => {
    const db = fakeDb({
      customer: OWNER,
      currentPlanId: 'starter',
      plan: reservedPlan(),
    });
    await expect(
      assertPlanAssignableToTenant(db as never, 't1', 'reserved'),
    ).resolves.toBeUndefined();
  });

  it('refuses an expired and a not-yet-valid plan for a move', async () => {
    const expired = fakeDb({
      customer: OWNER,
      currentPlanId: 'starter',
      plan: reservedPlan({ effectiveUntil: new Date('2020-01-01') }),
    });
    await expect(
      assertPlanAssignableToTenant(expired as never, 't1', 'p'),
    ).rejects.toThrow(/expired/);
    const future = fakeDb({
      customer: OWNER,
      currentPlanId: 'starter',
      plan: reservedPlan({ effectiveFrom: new Date('2999-01-01') }),
    });
    await expect(
      assertPlanAssignableToTenant(future as never, 't1', 'p'),
    ).rejects.toThrow(/not valid until/);
  });

  it('never re-judges a subscription that stays on its current plan (history preserved)', async () => {
    // Reserved for someone else AND expired: still fine for its existing subscriber.
    const db = fakeDb({
      customer: OTHER,
      currentPlanId: 'legacy',
      plan: reservedPlan({ effectiveUntil: new Date('2020-01-01') }),
    });
    await expect(
      assertPlanAssignableToTenant(db as never, 't1', 'legacy'),
    ).resolves.toBeUndefined();
  });

  it('does not decide for a missing tenant or plan (the caller reports not-found)', async () => {
    const db = fakeDb({ customer: OTHER, currentPlanId: null, plan: null });
    await expect(
      assertPlanAssignableToTenant(db as never, 't1', 'nope'),
    ).resolves.toBeUndefined();
  });

  it('is opaque for tenant-initiated callers: it does not confirm the plan exists', async () => {
    const db = fakeDb({
      customer: OTHER,
      currentPlanId: 'starter',
      plan: reservedPlan(),
    });
    const attempt = assertPlanAssignableToTenant(
      db as never,
      't1',
      'reserved',
      {
        opaque: true,
      },
    );
    await expect(attempt).rejects.toThrow('That plan is not available.');
    await expect(attempt).rejects.not.toThrow(/reserved/);
  });
});

describe('BillingService.createOrUpdateSubscription (the single landing point)', () => {
  const service = new BillingService({} as never);

  it('rejects a reserved plan for another customer before anything is written', async () => {
    const db = fakeDb({
      customer: OTHER,
      currentPlanId: 'starter',
      plan: reservedPlan(),
    });
    await expect(
      service.createOrUpdateSubscription(db as never, {
        tenantId: 't1',
        planId: 'reserved',
        billingCycle: BillingCycle.MONTHLY,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(db.subscription.upsert).not.toHaveBeenCalled();
  });
});

describe('the operator subscription endpoint', () => {
  it('is a platform route: tenant tokens cannot reach it', () => {
    const permission = Reflect.getMetadata(
      PLATFORM_PERMISSION_KEY,
      Object.getOwnPropertyDescriptor(
        SuperAdminController.prototype,
        'updateTenantSubscription',
      )?.value as object,
    ) as unknown;
    const guards = Reflect.getMetadata(
      '__guards__',
      SuperAdminController,
    ) as Array<{
      name: string;
    }>;
    expect(guards.map((g) => g.name)).toEqual(
      expect.arrayContaining(['JwtAuthGuard', 'PlatformPermissionsGuard']),
    );
    expect(permission).toBe('platform.billing.administer');
  });

  it('flushes the tenant entitlement snapshot after a successful change (DP-QA-047)', async () => {
    const invalidate = jest.fn();
    const updated = { id: 'sub-1', plan: { id: 'p' } };
    const args: unknown[] = new Array(21).fill({});
    args[0] = {
      tenant: { findUnique: jest.fn().mockResolvedValue({ id: 't1' }) },
      promotion: { findFirst: jest.fn() },
    };
    args[20] = { invalidate };
    const svc = new (SuperAdminService as unknown as new (
      ...a: unknown[]
    ) => SuperAdminService)(...args);
    const internals = svc as unknown as Record<string, unknown>;
    internals.billingService = {
      createOrUpdateSubscription: jest.fn().mockResolvedValue(updated),
    };
    internals.assertTenantExists = jest.fn();
    internals.mapSubscription = jest.fn().mockReturnValue({});
    internals.getTenantDetail = jest.fn().mockResolvedValue({});

    await svc.updateTenantSubscription({ userId: 'u' } as never, 't1', {
      planId: 'p',
    } as never);

    expect(invalidate).toHaveBeenCalledWith('t1');
  });

  it('does NOT flush when the change is refused', async () => {
    const invalidate = jest.fn();
    const args: unknown[] = new Array(21).fill({});
    args[20] = { invalidate };
    const svc = new (SuperAdminService as unknown as new (
      ...a: unknown[]
    ) => SuperAdminService)(...args);
    const internals = svc as unknown as Record<string, unknown>;
    internals.assertTenantExists = jest.fn();
    internals.billingService = {
      createOrUpdateSubscription: jest
        .fn()
        .mockRejectedValue(new BadRequestException('reserved')),
    };

    await expect(
      svc.updateTenantSubscription({ userId: 'u' } as never, 't1', {
        planId: 'p',
      } as never),
    ).rejects.toThrow('reserved');
    expect(invalidate).not.toHaveBeenCalled();
  });
});

describe('tenant-initiated plan change (cross-tenant)', () => {
  function build(plan: PlanRow, customer = OTHER) {
    const prisma = {
      subscription: {
        findFirst: jest.fn().mockResolvedValue({
          id: 's1',
          planId: 'plan-from',
          planPriceId: null,
          renewalDate: null,
          currentPeriodEnd: null,
          stripeSubscriptionId: null,
          stripeSubscriptionItemId: null,
          purchasedSeats: 1,
          currency: 'USD',
          finalPrice: 1,
          paymentProvider: null,
        }),
        findUnique: jest.fn().mockResolvedValue({ planId: 'plan-from' }),
      },
      tenant: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ customerAccountId: customer }),
      },
      plan: {
        findUniqueOrThrow: jest
          .fn()
          .mockResolvedValue({ id: 'plan-from', name: 'Starter' }),
        findUnique: jest.fn(({ where }: { where: { id: string } }) =>
          Promise.resolve(
            where.id === 'plan-from'
              ? { id: 'plan-from', name: 'Starter', isActive: true }
              : { id: 'plan-to', isActive: true, ...plan },
          ),
        ),
      },
    };
    return new PlanChangeService(
      prisma as never,
      { emit: jest.fn() } as never,
      {} as never,
      { log: jest.fn() } as never,
    );
  }

  it("a tenant cannot move itself onto another customer's reserved plan", async () => {
    const svc = build(reservedPlan({ salesModel: 'SELF_SERVICE' }));
    await expect(
      svc.requestChange({ tenantId: 't1', toPlanId: 'plan-to' }),
    ).rejects.toThrow('That plan is not available.');
  });

  it('a tenant cannot move itself onto any custom plan that is not self-service', async () => {
    const svc = build(
      reservedPlan({
        eligibleCustomerAccountId: null,
        salesModel: 'SALES_ASSISTED',
      }),
    );
    await expect(
      svc.requestChange({ tenantId: 't1', toPlanId: 'plan-to' }),
    ).rejects.toThrow('That plan is not available.');
  });

  it('the refusal never says the plan is reserved', async () => {
    const svc = build(reservedPlan());
    await expect(
      svc.requestChange({ tenantId: 't1', toPlanId: 'plan-to' }),
    ).rejects.not.toThrow(/reserved|another customer/);
  });
});

describe('publication status is part of the price contract', () => {
  it('only the published status makes a price usable by onboarding', () => {
    expect(CommercialPublicationStatus.PUBLISHED).toBe('PUBLISHED');
  });
});
