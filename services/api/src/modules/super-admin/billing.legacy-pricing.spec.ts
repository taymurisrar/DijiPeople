import { BadRequestException } from '@nestjs/common';
import {
  BillingCycle,
  BillingModel,
  CommercialPublicationStatus,
} from '@prisma/client';
import { BillingService } from './billing.service';

/**
 * REGRESSION — BUG-0027.
 *
 * `calculateSubscriptionPricing` used to fall back to `Plan.annualBasePrice` /
 * `Plan.monthlyBasePrice` when no PlanPrice resolved:
 *
 *     const basePrice = planPrice
 *       ? Number(planPrice.unitAmount) * quantity
 *       : billingCycle === BillingCycle.ANNUAL
 *         ? Number(plan.annualBasePrice)
 *         : Number(plan.monthlyBasePrice);
 *
 * That value was written straight into `Subscription.basePrice` and
 * `finalPrice` by `upsertSubscription`, so the legacy columns were an
 * independent pricing authority in a real money path — and the seed created
 * plans with no PlanPrice at all, so the fallback was the *normal* path rather
 * than an edge case.
 *
 * These tests pin the two halves of the fix: the legacy columns are never read,
 * and a plan with no published price fails closed instead of billing a number
 * nobody chose.
 */
describe('BillingService — legacy pricing must not be authoritative', () => {
  const LEGACY_MONTHLY = 199;
  const LEGACY_ANNUAL = 1990;
  const AUTHORITATIVE_UNIT = 15;

  function buildService(planPrice: unknown) {
    const prisma = {
      plan: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'plan-1',
          key: 'starter',
          // Deliberately non-zero and deliberately different from the
          // authoritative price, so a fallback would be visible in the result.
          monthlyBasePrice: LEGACY_MONTHLY,
          annualBasePrice: LEGACY_ANNUAL,
          currency: 'USD',
        }),
      },
      planPrice: {
        findFirst: jest.fn().mockResolvedValue(planPrice),
      },
    };

    return {
      service: new BillingService(prisma as never),
      prisma,
    };
  }

  const publishedPrice = {
    id: 'price-1',
    planId: 'plan-1',
    billingCycle: BillingCycle.MONTHLY,
    billingModel: BillingModel.PER_SEAT,
    currency: 'USD',
    unitAmount: AUTHORITATIVE_UNIT,
    minimumSeats: 1,
    maximumSeats: null,
    includedSeats: 0,
    publicationStatus: CommercialPublicationStatus.PUBLISHED,
    isActive: true,
  };

  it('prices from the published PlanPrice, never the legacy plan columns', async () => {
    const { service } = buildService(publishedPrice);

    const pricing = await service.calculateSubscriptionPricing({
      planId: 'plan-1',
      purchasedSeats: 10,
      billingCycle: BillingCycle.MONTHLY,
    });

    expect(pricing.basePrice).toBe(AUTHORITATIVE_UNIT * 10);
    expect(pricing.basePrice).not.toBe(LEGACY_MONTHLY);
    expect(pricing.finalPrice).toBe(AUTHORITATIVE_UNIT * 10);
  });

  it('refuses to price a plan that has no published price', async () => {
    const { service } = buildService(null);

    await expect(
      service.calculateSubscriptionPricing({
        planId: 'plan-1',
        purchasedSeats: 10,
        billingCycle: BillingCycle.MONTHLY,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('names the plan and cycle so an operator knows what to configure', async () => {
    const { service } = buildService(null);

    await expect(
      service.calculateSubscriptionPricing({
        planId: 'plan-1',
        billingCycle: BillingCycle.ANNUAL,
        currency: 'usd',
      }),
    ).rejects.toThrow(/starter.*annual.*USD/is);
  });

  it('never returns the legacy annual amount, even for an annual cycle', async () => {
    const { service } = buildService(null);

    // The old code returned Number(plan.annualBasePrice) here — 1990.
    await expect(
      service.calculateSubscriptionPricing({
        planId: 'plan-1',
        billingCycle: BillingCycle.ANNUAL,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('only considers published, in-force prices when resolving', async () => {
    const { service, prisma } = buildService(publishedPrice);

    await service.calculateSubscriptionPricing({
      planId: 'plan-1',
      purchasedSeats: 5,
      billingCycle: BillingCycle.MONTHLY,
    });

    const where = prisma.planPrice.findFirst.mock.calls[0][0].where;
    expect(where.publicationStatus).toBe(CommercialPublicationStatus.PUBLISHED);
    expect(where.isActive).toBe(true);
    expect(where.effectiveFrom).toHaveProperty('lte');
    // effectiveTo is either open-ended or still in the future.
    expect(where.OR).toEqual([
      { effectiveTo: null },
      { effectiveTo: { gt: expect.any(Date) } },
    ]);
  });

  it('orders by effective date so a future version cannot displace the current one', async () => {
    const { service, prisma } = buildService(publishedPrice);

    await service.calculateSubscriptionPricing({
      planId: 'plan-1',
      purchasedSeats: 5,
      billingCycle: BillingCycle.MONTHLY,
    });

    expect(prisma.planPrice.findFirst.mock.calls[0][0].orderBy).toEqual([
      { effectiveFrom: 'desc' },
      { version: 'desc' },
    ]);
  });
});
