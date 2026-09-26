import {
  BillingInterval,
  DiscountType,
  Prisma,
  PromotionDuration,
  SubscriptionStatus,
} from '@prisma/client';
import {
  addBillingInterval,
  checkoutBlockReason,
  parseInvoicePurpose,
  periodBoundaryTransition,
  renewalDiscount,
  renewalPeriod,
  settlementMismatch,
} from './managed-billing.rules';

const at = (iso: string) => new Date(iso);

describe('managed billing rules', () => {
  describe('addBillingInterval', () => {
    it('adds a calendar month', () => {
      expect(
        addBillingInterval(at('2026-09-15T10:00:00Z'), BillingInterval.MONTH),
      ).toEqual(at('2026-10-15T10:00:00Z'));
    });

    it('clamps a day the next month does not have', () => {
      expect(
        addBillingInterval(at('2026-01-31T00:00:00Z'), BillingInterval.MONTH),
      ).toEqual(at('2026-02-28T00:00:00Z'));
    });

    it('adds a year for an annual price', () => {
      expect(
        addBillingInterval(at('2028-02-29T00:00:00Z'), BillingInterval.YEAR),
      ).toEqual(at('2029-02-28T00:00:00Z'));
    });
  });

  describe('settlementMismatch — only the amount asked for is credited', () => {
    const expected = {
      amount: new Prisma.Decimal('25000.00'),
      currency: 'PKR',
    };

    it('accepts the exact amount and currency', () => {
      expect(
        settlementMismatch(expected, { amount: '25000.00', currency: 'pkr' }),
      ).toBeNull();
    });

    it('refuses a different amount', () => {
      expect(
        settlementMismatch(expected, { amount: '2500.00', currency: 'PKR' }),
      ).toBe('AMOUNT_MISMATCH');
    });

    it('refuses a different currency even for the same number', () => {
      expect(
        settlementMismatch(expected, { amount: '25000.00', currency: 'USD' }),
      ).toBe('CURRENCY_MISMATCH');
    });

    it('refuses a confirmation that reports no amount', () => {
      expect(
        settlementMismatch(expected, { amount: null, currency: 'PKR' }),
      ).toBe('AMOUNT_MISMATCH');
    });
  });

  describe('checkoutBlockReason', () => {
    it.each([SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIALING])(
      'a %s subscription changes plan instead of buying again',
      (status) => {
        expect(checkoutBlockReason(status)).toBe('ALREADY_ACTIVE');
      },
    );

    it('a subscription in arrears pays its invoice instead', () => {
      expect(checkoutBlockReason(SubscriptionStatus.PAST_DUE)).toBe(
        'PAYMENT_OUTSTANDING',
      );
    });

    it.each([
      null,
      SubscriptionStatus.INCOMPLETE,
      SubscriptionStatus.CANCELED,
      SubscriptionStatus.EXPIRED,
    ])('%s may check out', (status) => {
      expect(checkoutBlockReason(status)).toBeNull();
    });
  });

  describe('periodBoundaryTransition — the subscription state machine', () => {
    const now = at('2026-09-26T12:00:00Z');
    const active = {
      status: SubscriptionStatus.ACTIVE,
      currentPeriodEnd: at('2026-09-25T00:00:00Z'),
      cancelAtPeriodEnd: false,
      gracePeriodEndsAt: null,
    };

    it('does nothing before the period ends', () => {
      expect(
        periodBoundaryTransition(
          { ...active, currentPeriodEnd: at('2026-10-01T00:00:00Z') },
          now,
          7,
        ),
      ).toBeNull();
    });

    // Access is kept until the paid-through date, then it ends.
    it('ends a cancel-at-period-end subscription at the period end', () => {
      expect(
        periodBoundaryTransition(
          { ...active, cancelAtPeriodEnd: true },
          now,
          7,
        ),
      ).toEqual({
        status: SubscriptionStatus.CANCELED,
        endDate: at('2026-09-25T00:00:00Z'),
      });
    });

    it('moves an unpaid renewal to PAST_DUE with a grace period', () => {
      expect(periodBoundaryTransition(active, now, 7)).toEqual({
        status: SubscriptionStatus.PAST_DUE,
        gracePeriodEndsAt: at('2026-10-02T00:00:00Z'),
      });
    });

    it('keeps a PAST_DUE subscription while its grace period runs', () => {
      expect(
        periodBoundaryTransition(
          {
            ...active,
            status: SubscriptionStatus.PAST_DUE,
            gracePeriodEndsAt: at('2026-10-02T00:00:00Z'),
          },
          now,
          7,
        ),
      ).toBeNull();
    });

    it('expires it once the grace period has passed', () => {
      expect(
        periodBoundaryTransition(
          {
            ...active,
            status: SubscriptionStatus.PAST_DUE,
            gracePeriodEndsAt: at('2026-09-26T00:00:00Z'),
          },
          now,
          7,
        ),
      ).toEqual({
        status: SubscriptionStatus.EXPIRED,
        endDate: at('2026-09-26T00:00:00Z'),
      });
    });

    it.each([
      SubscriptionStatus.TRIALING,
      SubscriptionStatus.INCOMPLETE,
      SubscriptionStatus.CANCELED,
    ])('never moves a %s subscription', (status) => {
      expect(
        periodBoundaryTransition({ ...active, status }, now, 7),
      ).toBeNull();
    });
  });

  describe('renewalPeriod', () => {
    const invoice = {
      periodStart: at('2026-10-01T00:00:00Z'),
      periodEnd: at('2026-11-01T00:00:00Z'),
    };

    it('buys the period printed on the invoice', () => {
      expect(
        renewalPeriod(
          invoice,
          SubscriptionStatus.PAST_DUE,
          BillingInterval.MONTH,
          at('2026-10-03T00:00:00Z'),
        ),
      ).toEqual({ start: invoice.periodStart, end: invoice.periodEnd });
    });

    // A lapsed customer is not sold days that already passed.
    it('starts from the payment when the subscription had expired', () => {
      expect(
        renewalPeriod(
          invoice,
          SubscriptionStatus.EXPIRED,
          BillingInterval.MONTH,
          at('2026-12-10T00:00:00Z'),
        ),
      ).toEqual({
        start: at('2026-12-10T00:00:00Z'),
        end: at('2027-01-10T00:00:00Z'),
      });
    });
  });

  describe('renewalDiscount', () => {
    const subtotal = new Prisma.Decimal('10000');
    const percent = {
      discountType: DiscountType.PERCENTAGE,
      percentOff: 20,
      amountOff: null,
      currency: null,
      duration: PromotionDuration.FOREVER,
      durationMonths: null,
    };

    it('applies a FOREVER discount to every renewal', () => {
      expect(
        renewalDiscount(
          percent,
          at('2026-01-01T00:00:00Z'),
          at('2027-06-01T00:00:00Z'),
          subtotal,
          'PKR',
        ).toString(),
      ).toBe('2000');
    });

    it('never applies a ONCE discount to a renewal', () => {
      expect(
        renewalDiscount(
          { ...percent, duration: PromotionDuration.ONCE },
          at('2026-01-01T00:00:00Z'),
          at('2026-02-01T00:00:00Z'),
          subtotal,
          'PKR',
        ).toString(),
      ).toBe('0');
    });

    it('stops a REPEATING discount after its months', () => {
      const repeating = {
        ...percent,
        duration: PromotionDuration.REPEATING,
        durationMonths: 3,
      };
      const applied = at('2026-01-01T00:00:00Z');
      expect(
        renewalDiscount(
          repeating,
          applied,
          at('2026-03-01T00:00:00Z'),
          subtotal,
          'PKR',
        ).toString(),
      ).toBe('2000');
      expect(
        renewalDiscount(
          repeating,
          applied,
          at('2026-04-01T00:00:00Z'),
          subtotal,
          'PKR',
        ).toString(),
      ).toBe('0');
    });

    it('never applies a fixed discount in another currency', () => {
      expect(
        renewalDiscount(
          {
            ...percent,
            discountType: DiscountType.FLAT,
            percentOff: null,
            amountOff: 5000,
            currency: 'PKR',
          },
          at('2026-01-01T00:00:00Z'),
          at('2026-02-01T00:00:00Z'),
          new Prisma.Decimal('300'),
          'USD',
        ).toString(),
      ).toBe('0');
    });
  });

  describe('parseInvoicePurpose', () => {
    it('reads a purpose written at checkout', () => {
      expect(
        parseInvoicePurpose({
          kind: 'INITIAL',
          planId: 'p',
          planPriceId: 'pp',
          seats: 5,
          promotionId: null,
        }),
      ).toEqual({
        kind: 'INITIAL',
        planId: 'p',
        planPriceId: 'pp',
        seats: 5,
        promotionId: null,
      });
    });

    // A Stripe invoice's metadata is the whole Stripe object — never a purpose.
    it('refuses anything that is not one', () => {
      expect(
        parseInvoicePurpose({ id: 'in_123', object: 'invoice' }),
      ).toBeNull();
      expect(parseInvoicePurpose(null)).toBeNull();
    });
  });
});
