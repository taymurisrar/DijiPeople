import {
  BillingInterval,
  BillingModel,
  StripeEnvironment,
  StripeSyncStatus,
} from '@prisma/client';
import {
  calculateSeatPricing,
  buildRecurringCheckoutLineItem,
  deriveCheckoutReadiness,
} from './billing-seat-pricing';

describe('per-seat monthly pricing', () => {
  const price = {
    billingModel: BillingModel.PER_SEAT,
    billingInterval: BillingInterval.MONTH,
    unitAmount: 2500,
    currency: 'PKR',
    minimumSeats: 5,
    maximumSeats: 100,
    includedSeats: 0,
  };

  it('calculates purchased, used, available and monthly charge', () => {
    expect(calculateSeatPricing(price, 7, 4)).toEqual({
      purchasedSeats: 7,
      usedSeats: 4,
      availableSeats: 3,
      includedSeats: 0,
      billableSeats: 7,
      pricePerSeat: 2500,
      estimatedMonthlyCharge: 17500,
      currency: 'PKR',
    });
  });

  it('enforces minimum and maximum purchased seats', () => {
    expect(() => calculateSeatPricing(price, 4)).toThrow('at least 5');
    expect(() => calculateSeatPricing(price, 101)).toThrow('cannot exceed 100');
  });

  it('requires verified monthly licensed per-seat Stripe data', () => {
    const readiness = deriveCheckoutReadiness(
      {
        ...price,
        isActive: true,
        effectiveFrom: new Date('2026-01-01T00:00:00Z'),
        stripeProductId: 'prod_test',
        stripePriceId: 'price_test',
        stripeEnvironment: StripeEnvironment.TEST,
        stripeSyncStatus: StripeSyncStatus.SYNCED,
        stripeActive: true,
        stripeUsageType: 'licensed',
        stripeRecurringInterval: 'month',
        stripeVerifiedAt: new Date('2026-01-01T00:00:00Z'),
      },
      StripeEnvironment.TEST,
      new Date('2026-08-02T00:00:00Z'),
    );
    expect(readiness).toEqual({ checkoutReady: true, reasons: [] });
  });

  it('uses purchased seat quantity as Stripe Checkout quantity', () => {
    expect(
      buildRecurringCheckoutLineItem('price_test', 7, BillingModel.PER_SEAT),
    ).toEqual({
      price: 'price_test',
      quantity: 7,
    });
  });

  it.each([
    [BillingModel.FLAT, BillingInterval.MONTH, 'month'],
    [BillingModel.FLAT, BillingInterval.YEAR, 'year'],
    [BillingModel.PER_SEAT, BillingInterval.YEAR, 'year'],
  ])(
    'supports %s %s recurring checkout',
    (billingModel, billingInterval, stripeInterval) => {
      const readiness = deriveCheckoutReadiness(
        {
          ...price,
          billingModel,
          billingInterval,
          isActive: true,
          effectiveFrom: new Date('2026-01-01T00:00:00Z'),
          stripeProductId: 'prod_test',
          stripePriceId: 'price_test',
          stripeEnvironment: StripeEnvironment.TEST,
          stripeSyncStatus: StripeSyncStatus.SYNCED,
          stripeActive: true,
          stripeUsageType: 'licensed',
          stripeRecurringInterval: stripeInterval,
          stripeVerifiedAt: new Date('2026-01-01T00:00:00Z'),
        },
        StripeEnvironment.TEST,
        new Date('2026-08-02T00:00:00Z'),
      );
      expect(readiness).toEqual({ checkoutReady: true, reasons: [] });
    },
  );

  it('always sends a quantity of one for flat prices', () => {
    expect(
      buildRecurringCheckoutLineItem('price_flat', 30, BillingModel.FLAT),
    ).toEqual({ price: 'price_flat', quantity: 1 });
  });
});
