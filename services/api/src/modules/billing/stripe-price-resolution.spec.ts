import Stripe from 'stripe';
import { BillingInterval } from '@prisma/client';

import { StripeBillingService } from './services/stripe-billing.service';

/**
 * BUG-1134 — a stale Stripe price id must not brick a plan's pricing.
 *
 * Reported from production on 2026-08-24. Editing a Starter price returned:
 *
 *     500 SYSTEM_UNEXPECTED_ERROR
 *     Error: No such price: 'price_1U4mO1Dx5h60TWDLy3zudsug'
 *       at StripeBillingService.verifyRecurringPrice
 *
 * This is the same defect [[BUG-0995]] fixed for the *product*, in the sibling
 * call eighty lines away, left bare. `stripe-product-resolution.spec.ts` is its
 * counterpart and the two should be read together — fixing one half of a
 * symmetry is how the second half survives to be found in production.
 *
 * The distinction that matters: `verifyRecurringPrice` already speaks in
 * verdicts, and its caller turns an invalid one into `stripeSyncStatus: FAILED`
 * with the reasons attached. So a missing price belongs in `reasons`, where an
 * operator reads it and re-syncs — not in a stack trace. Unlike the product
 * path, nothing is auto-created here: minting a price behind an operator's back
 * would change what customers are charged.
 */
describe('verifyRecurringPrice — a price id that no longer resolves', () => {
  function missingPriceError() {
    // The real shape Stripe throws, matching the production stack trace.
    return new Stripe.errors.StripeInvalidRequestError({
      type: 'invalid_request_error',
      message: "No such price: 'price_1U4mO1Dx5h60TWDLy3zudsug'",
      code: 'resource_missing',
    });
  }

  function build(retrieve: jest.Mock) {
    return new StripeBillingService(
      { prices: { retrieve } } as never,
      { get: () => 'test' } as never,
    );
  }

  const input = {
    stripePriceId: 'price_1U4mO1Dx5h60TWDLy3zudsug',
    expectedProductId: 'prod_current',
    expectedCurrency: 'PKR',
    expectedUnitAmount: 12000,
    expectedBillingInterval: BillingInterval.MONTH,
  };

  it('returns an invalid verdict instead of throwing', async () => {
    const retrieve = jest.fn().mockRejectedValue(missingPriceError());

    const verdict = await build(retrieve).verifyRecurringPrice(input);

    expect(verdict.valid).toBe(false);
    expect(verdict.priceId).toBeNull();
    expect(verdict.active).toBe(false);
  });

  it('names the price and tells the operator what to do', async () => {
    const retrieve = jest.fn().mockRejectedValue(missingPriceError());

    const verdict = await build(retrieve).verifyRecurringPrice(input);

    // The reason is surfaced verbatim as stripeVerificationError on the row,
    // so it has to be readable by a person, not only by a developer.
    expect(verdict.reasons).toHaveLength(1);
    expect(verdict.reasons[0]).toContain(input.stripePriceId);
    expect(verdict.reasons[0]).toContain('Re-sync');
  });

  it('reports the runtime environment rather than inventing one', async () => {
    const retrieve = jest.fn().mockRejectedValue(missingPriceError());

    const verdict = await build(retrieve).verifyRecurringPrice(input);

    // A price that is gone has no livemode of its own. Defaulting to false
    // regardless of mode would stamp a LIVE deployment's row as TEST.
    expect(verdict.mode).toBe('test');
    expect(verdict.livemode).toBe(false);
    expect(verdict.currency).toBe('PKR');
  });

  it('still throws for anything that is not resource_missing', async () => {
    // Silently marking a good price unsynced during a Stripe outage is worse
    // than the error — the operator would re-sync a price that was fine.
    const authError = new Stripe.errors.StripeAuthenticationError({
      type: 'authentication_error',
      message: 'Invalid API Key provided',
    });
    const retrieve = jest.fn().mockRejectedValue(authError);

    await expect(build(retrieve).verifyRecurringPrice(input)).rejects.toThrow(
      'Invalid API Key provided',
    );
  });

  it('verifies a price that does exist, unchanged', async () => {
    const retrieve = jest.fn().mockResolvedValue({
      id: input.stripePriceId,
      product: 'prod_current',
      active: true,
      type: 'recurring',
      currency: 'pkr',
      unit_amount: 1200000,
      livemode: false,
      recurring: { interval: 'month', usage_type: 'licensed' },
    });

    const verdict = await build(retrieve).verifyRecurringPrice(input);

    expect(verdict.valid).toBe(true);
    expect(verdict.reasons).toEqual([]);
    expect(verdict.priceId).toBe(input.stripePriceId);
  });
});
