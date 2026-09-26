import { DiscountType, PromotionScope } from '@prisma/client';
import { evaluatePromotion } from './promotion-pricing';

describe('evaluatePromotion — coupons DijiPeople prices itself', () => {
  const now = new Date('2026-09-26T12:00:00Z');
  const promotion = {
    isActive: true,
    discountType: DiscountType.PERCENTAGE,
    percentOff: 20,
    amountOff: null,
    currency: null,
    scope: PromotionScope.GLOBAL,
    planId: null,
    planPriceId: null,
    customerAccountId: null,
    startsAt: new Date('2026-01-01T00:00:00Z'),
    redeemBy: null,
    maximumRedemptions: null,
    redemptionCount: 0,
  };
  const purchase = {
    planId: 'plan-pro',
    planPriceId: 'price-pro-pkr-month',
    customerAccountId: 'cust-1',
    currency: 'PKR',
    subtotal: 25_000,
    now,
  };

  it('takes a percentage off the subtotal', () => {
    expect(evaluatePromotion(promotion, purchase)).toEqual({
      ok: true,
      discount: 5_000,
    });
  });

  it('takes a fixed amount off in its own currency', () => {
    expect(
      evaluatePromotion(
        {
          ...promotion,
          discountType: DiscountType.FLAT,
          percentOff: null,
          amountOff: 5_000,
          currency: 'pkr',
        },
        purchase,
      ),
    ).toEqual({ ok: true, discount: 5_000 });
  });

  it('never lets a fixed discount push the total below zero', () => {
    expect(
      evaluatePromotion(
        {
          ...promotion,
          discountType: DiscountType.FLAT,
          percentOff: null,
          amountOff: 99_999,
          currency: 'PKR',
        },
        purchase,
      ),
    ).toEqual({ ok: true, discount: 25_000 });
  });

  // PKR 5,000 off reaching a USD invoice as $5,000 is the failure this guards.
  it('refuses a fixed discount in another currency', () => {
    expect(
      evaluatePromotion(
        {
          ...promotion,
          discountType: DiscountType.FLAT,
          percentOff: null,
          amountOff: 5_000,
          currency: 'PKR',
        },
        { ...purchase, currency: 'USD', subtotal: 300 },
      ),
    ).toEqual({ ok: false, reason: 'CURRENCY_MISMATCH' });
  });

  it('refuses an expired promotion', () => {
    expect(
      evaluatePromotion(
        { ...promotion, redeemBy: new Date('2026-09-01T00:00:00Z') },
        purchase,
      ),
    ).toEqual({ ok: false, reason: 'EXPIRED' });
  });

  it('refuses a promotion that has not started', () => {
    expect(
      evaluatePromotion(
        { ...promotion, startsAt: new Date('2026-10-01T00:00:00Z') },
        purchase,
      ),
    ).toEqual({ ok: false, reason: 'NOT_STARTED' });
  });

  it('refuses an inactive promotion', () => {
    expect(
      evaluatePromotion({ ...promotion, isActive: false }, purchase),
    ).toEqual({ ok: false, reason: 'INACTIVE' });
  });

  it('refuses a promotion whose redemptions are used up', () => {
    expect(
      evaluatePromotion(
        { ...promotion, maximumRedemptions: 3, redemptionCount: 3 },
        purchase,
      ),
    ).toEqual({ ok: false, reason: 'EXHAUSTED' });
  });

  it('applies a plan-scoped promotion only to that plan', () => {
    const planScoped = {
      ...promotion,
      scope: PromotionScope.PLAN,
      planId: 'plan-pro',
    };
    expect(evaluatePromotion(planScoped, purchase).ok).toBe(true);
    expect(
      evaluatePromotion(planScoped, { ...purchase, planId: 'plan-starter' }),
    ).toEqual({ ok: false, reason: 'NOT_ELIGIBLE' });
  });

  it('applies a price-scoped promotion only to that price', () => {
    expect(
      evaluatePromotion(
        {
          ...promotion,
          scope: PromotionScope.PRICE,
          planPriceId: 'price-pro-pkr-year',
        },
        purchase,
      ),
    ).toEqual({ ok: false, reason: 'NOT_ELIGIBLE' });
  });
});
