import {
  BillingInterval,
  BillingModel,
  DiscountType,
  PromotionDuration,
} from '@prisma/client';
import { calculatePromotionPreview } from './promotion-pricing';

describe('promotion pricing', () => {
  const base = {
    unitAmount: 30,
    purchasedSeats: 30,
    billingModel: BillingModel.PER_SEAT,
    billingInterval: BillingInterval.MONTH,
    currency: 'QAR',
  };

  it.each([
    [PromotionDuration.ONCE, null, 'First invoice'],
    [PromotionDuration.REPEATING, 3, 'First 3 months'],
    [PromotionDuration.FOREVER, null, 'Every invoice'],
  ])(
    'previews percentage discounts with %s duration',
    (duration, durationMonths, durationLabel) => {
      expect(
        calculatePromotionPreview({
          ...base,
          discountType: DiscountType.PERCENTAGE,
          percentOff: 20,
          duration,
          durationMonths,
        }),
      ).toMatchObject({
        regularInvoice: 900,
        discount: 180,
        firstInvoice: 720,
        afterPromotion: 900,
        durationLabel,
      });
    },
  );

  it('previews a fixed-amount discount', () => {
    expect(
      calculatePromotionPreview({
        ...base,
        billingModel: BillingModel.FLAT,
        unitAmount: 299,
        discountType: DiscountType.FLAT,
        amountOff: 100,
        duration: PromotionDuration.ONCE,
      }),
    ).toMatchObject({
      quantity: 1,
      regularInvoice: 299,
      discount: 100,
      firstInvoice: 199,
    });
  });

  it('does not describe an annual invoice as monthly instalments', () => {
    expect(
      calculatePromotionPreview({
        ...base,
        billingInterval: BillingInterval.YEAR,
        discountType: DiscountType.PERCENTAGE,
        percentOff: 15,
        duration: PromotionDuration.REPEATING,
        durationMonths: 3,
      }).durationLabel,
    ).toContain('annual invoice, not monthly instalments');
  });
});
