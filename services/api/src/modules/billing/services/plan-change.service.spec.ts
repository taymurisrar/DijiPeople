import { Prisma } from '@prisma/client';
import { PlanChangeService } from './plan-change.service';

/**
 * EXECPLAN-0037 / BUG-3331 — `PlanChangeService` had zero test coverage
 * before this and zero callers in the running application
 * (`applyDueChanges` still has none outside
 * `subscription-change-sweeper.worker.ts`, added alongside this). These pin
 * the two things this plan added: the Stripe-facing sync on an UPGRADE, and
 * the proration quote — never a second arithmetic rule, only Stripe's own
 * preview endpoint or a clearly-labelled estimate.
 */

const FROM_PLAN = { id: 'plan-from', name: 'Starter' };
const TO_PLAN = { id: 'plan-to', name: 'Growth', isActive: true };

function buildPrisma(overrides: Partial<Record<string, unknown>> = {}) {
  const subscription = {
    id: 'sub-1',
    planId: FROM_PLAN.id,
    planPriceId: 'price-current',
    renewalDate: null,
    currentPeriodEnd: null,
    stripeSubscriptionId: 'sub_live_1',
    stripeSubscriptionItemId: 'si_live_1',
    purchasedSeats: 10,
    currency: 'USD',
    finalPrice: new Prisma.Decimal(100),
    ...((overrides.subscription as Record<string, unknown>) ?? {}),
  };

  return {
    subscription: {
      findFirst: jest.fn().mockResolvedValue(subscription),
    },
    plan: {
      findUniqueOrThrow: jest.fn().mockResolvedValue(FROM_PLAN),
      findUnique: jest.fn(({ where }: { where: { id: string } }) =>
        Promise.resolve(
          where.id === FROM_PLAN.id
            ? { ...FROM_PLAN, isActive: true }
            : TO_PLAN,
        ),
      ),
    },
    planPrice: {
      /*
       * Two unrelated callers share this one mock: `resolveDirection`
       * resolves the CURRENT price's baseline (currency/cycle/market), and
       * `tryApplyToStripe` resolves the TARGET price's `stripePriceId`. A
       * single fixed return value would make one of those two calls wrong,
       * silently — this dispatches on the requested id instead, the same way
       * the real table would.
       */
      findUnique: jest.fn(({ where }: { where: { id: string } }) => {
        if (where.id === 'price-target') {
          return Promise.resolve({ stripePriceId: 'price_target_live' });
        }
        return Promise.resolve({
          unitAmount: new Prisma.Decimal(10),
          currency: 'USD',
          billingCycle: 'MONTHLY',
          marketId: 'market-1',
        });
      }),
      findFirst: jest.fn().mockResolvedValue({
        id: 'price-target',
        unitAmount: new Prisma.Decimal(20),
      }),
      findUniqueOrThrow: jest.fn().mockResolvedValue({
        unitAmount: new Prisma.Decimal(20),
        billingModel: 'PER_SEAT',
        includedSeats: 0,
        stripePriceId: 'price_target_live',
      }),
    },
    planFeature: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    $transaction: jest.fn(async (work: (tx: unknown) => Promise<unknown>) =>
      work({
        planChangeRequest: {
          updateMany: jest.fn(),
          create: jest.fn().mockResolvedValue({ id: 'request-1' }),
          update: jest.fn(),
        },
        subscription: { update: jest.fn() },
      }),
    ),
  };
}

function buildStripe(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    client: {
      subscriptions: {
        update: jest.fn().mockResolvedValue({}),
      },
      invoices: {
        createPreview: jest.fn().mockResolvedValue({
          amount_due: 1500,
          total: 1500,
        }),
      },
    },
    ...overrides,
  };
}

function buildService(
  prisma: ReturnType<typeof buildPrisma>,
  stripe: ReturnType<typeof buildStripe>,
) {
  const outbox = { emit: jest.fn() };
  const audit = { log: jest.fn() };
  const service = new PlanChangeService(
    prisma as never,
    outbox as never,
    stripe as never,
    audit as never,
  );
  return { service, outbox, audit };
}

describe('PlanChangeService — Stripe sync on requestChange', () => {
  it('updates the Stripe subscription item for a Stripe-backed UPGRADE', async () => {
    const prisma = buildPrisma();
    const stripe = buildStripe();
    const { service } = buildService(prisma, stripe);

    const result = await service.requestChange({
      tenantId: 'tenant-1',
      toPlanId: TO_PLAN.id,
    });

    expect(stripe.client.subscriptions.update).toHaveBeenCalledWith(
      'sub_live_1',
      expect.objectContaining({
        items: [
          expect.objectContaining({
            id: 'si_live_1',
            quantity: 10,
          }),
        ],
        proration_behavior: 'create_prorations',
      }),
    );
    expect(result.stripeSyncPending).toBe(false);
  });

  it('skips Stripe entirely for a subscription with no stripeSubscriptionId', async () => {
    const prisma = buildPrisma({
      subscription: {
        stripeSubscriptionId: null,
        stripeSubscriptionItemId: null,
      },
    });
    const stripe = buildStripe();
    const { service } = buildService(prisma, stripe);

    const result = await service.requestChange({
      tenantId: 'tenant-1',
      toPlanId: TO_PLAN.id,
    });

    expect(stripe.client.subscriptions.update).not.toHaveBeenCalled();
    expect(result.stripeSyncPending).toBe(false);
  });

  it('reports stripeSyncPending rather than throwing when Stripe fails', async () => {
    const prisma = buildPrisma();
    const stripe = buildStripe({
      client: {
        subscriptions: {
          update: jest.fn().mockRejectedValue(new Error('Stripe is down')),
        },
        invoices: {
          createPreview: jest.fn().mockResolvedValue({ amount_due: 0 }),
        },
      },
    });
    const { service } = buildService(prisma, stripe);

    const result = await service.requestChange({
      tenantId: 'tenant-1',
      toPlanId: TO_PLAN.id,
    });

    expect(result.stripeSyncPending).toBe(true);
    expect(result.direction).toBeDefined();
  });

  it('does not call Stripe for a DOWNGRADE — it is scheduled, not applied', async () => {
    const prisma = buildPrisma();
    // The target price is cheaper than the current one.
    prisma.planPrice.findFirst = jest.fn().mockResolvedValue({
      id: 'price-target',
      unitAmount: new Prisma.Decimal(1),
    });
    const stripe = buildStripe();
    const { service } = buildService(prisma, stripe);

    await service.requestChange({ tenantId: 'tenant-1', toPlanId: TO_PLAN.id });

    expect(stripe.client.subscriptions.update).not.toHaveBeenCalled();
  });

  it('logs an audit entry for the plan change', async () => {
    const prisma = buildPrisma();
    const stripe = buildStripe();
    const { service, audit } = buildService(prisma, stripe);

    await service.requestChange({
      tenantId: 'tenant-1',
      toPlanId: TO_PLAN.id,
      requestedByUserId: 'user-1',
    });

    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-1',
        actorUserId: 'user-1',
        action: 'TENANT_PLAN_CHANGE_REQUESTED',
        entityType: 'Subscription',
      }),
      expect.anything(),
    );
  });
});

describe('PlanChangeService.preview — the money quote', () => {
  it('asks Stripe for the proration on an UPGRADE', async () => {
    const prisma = buildPrisma();
    const stripe = buildStripe();
    const { service } = buildService(prisma, stripe);

    const preview = await service.preview('tenant-1', TO_PLAN.id);

    expect(stripe.client.invoices.createPreview).toHaveBeenCalled();
    expect(preview.quote.estimated).toBe(false);
    expect(preview.quote.prorationNow).toBe(15); // 1500 minor units -> 15.00 major
  });

  it('never asks Stripe for a DOWNGRADE quote, and charges nothing now', async () => {
    const prisma = buildPrisma();
    prisma.planPrice.findFirst = jest.fn().mockResolvedValue({
      id: 'price-target',
      unitAmount: new Prisma.Decimal(1),
    });
    prisma.planPrice.findUniqueOrThrow = jest.fn().mockResolvedValue({
      unitAmount: new Prisma.Decimal(1),
      billingModel: 'PER_SEAT',
      includedSeats: 0,
      stripePriceId: 'price_target_live',
    });
    const stripe = buildStripe();
    const { service } = buildService(prisma, stripe);

    const preview = await service.preview('tenant-1', TO_PLAN.id);

    expect(preview.direction).toBe('DOWNGRADE');
    expect(stripe.client.invoices.createPreview).not.toHaveBeenCalled();
    expect(preview.quote.prorationNow).toBe(0);
  });

  it('falls back to an estimate, clearly labelled, with no live Stripe object', async () => {
    const prisma = buildPrisma({
      subscription: {
        stripeSubscriptionId: null,
        stripeSubscriptionItemId: null,
      },
    });
    const stripe = buildStripe();
    const { service } = buildService(prisma, stripe);

    const preview = await service.preview('tenant-1', TO_PLAN.id);

    expect(stripe.client.invoices.createPreview).not.toHaveBeenCalled();
    expect(preview.quote.estimated).toBe(true);
  });

  it('does not disagree in sign with an upgrade quote for the same fixture pair', async () => {
    const prisma = buildPrisma();
    const stripe = buildStripe();
    const { service } = buildService(prisma, stripe);

    const upgrade = await service.preview('tenant-1', TO_PLAN.id);
    expect(upgrade.quote.prorationNow).toBeGreaterThanOrEqual(0);
  });
});

describe('PlanChangeService.load — same-plan cycle change (BUG-3331 requirement 6)', () => {
  it('refuses a same-plan request naming no price and no cycle change', async () => {
    const prisma = buildPrisma();
    const stripe = buildStripe();
    const { service } = buildService(prisma, stripe);

    await expect(service.preview('tenant-1', FROM_PLAN.id)).rejects.toThrow(
      /already on/,
    );
  });

  it('accepts a same-plan request naming a different price (a cycle change)', async () => {
    const prisma = buildPrisma();
    const stripe = buildStripe();
    prisma.planPrice.findFirst = jest.fn().mockResolvedValue({
      id: 'price-annual',
      unitAmount: new Prisma.Decimal(200),
    });
    const { service } = buildService(prisma, stripe);

    const preview = await service.preview(
      'tenant-1',
      FROM_PLAN.id,
      'price-annual',
    );

    expect(preview.direction).toBe('UPGRADE');
  });
});
