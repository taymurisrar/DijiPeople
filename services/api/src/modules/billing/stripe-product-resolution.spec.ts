import Stripe from 'stripe';

import { StripeBillingService } from './services/stripe-billing.service';

/**
 * REG — a stale Stripe product id must not brick a plan's pricing.
 *
 * Reported from production on 2026-08-23. Every attempt to edit any price on the
 * Starter plan returned:
 *
 *     500 SYSTEM_UNEXPECTED_ERROR
 *     Error: No such product: 'prod_V4vU7oieZdX6kH'
 *       at StripeBillingService.resolveOrCreateProduct
 *
 * `resolveOrCreateProduct` handled a *deleted* product — Stripe returns a stub
 * with `deleted: true` for those — but not a *missing* one, where
 * `products.retrieve` throws `resource_missing`. An id goes missing for ordinary
 * reasons: the sandbox was reset, the account was switched, the product was
 * removed in the dashboard.
 *
 * Two defects compounded into a permanent dead end, and both are covered here:
 *
 *   1. the throw was not caught, so the "orCreate" half never ran;
 *   2. the caller persisted a new product id only when the stored one was
 *      *empty*, so even after creating a replacement the plan kept pointing at
 *      the dead id — leaking a product per attempt and failing again next time.
 *
 * No screen offered a way to clear the id, so the plan could never be priced
 * again from the admin app.
 */
describe('resolveOrCreateProduct', () => {
  function missingProductError() {
    // The real shape Stripe throws: an invalid-request error with this code.
    const error = new Stripe.errors.StripeInvalidRequestError({
      type: 'invalid_request_error',
      message: "No such product: 'prod_V4vU7oieZdX6kH'",
      code: 'resource_missing',
    });
    return error;
  }

  function build(products: { retrieve: jest.Mock; create: jest.Mock }) {
    return new StripeBillingService(
      { products } as never,
      { get: () => 'test' } as never,
    );
  }

  const input = {
    stripeProductId: 'prod_V4vU7oieZdX6kH',
    name: 'Starter',
    description: 'Core people operations.',
    planId: '11111111-1111-4111-8111-111111111111',
  };

  it('creates a replacement when the stored product no longer exists', async () => {
    const retrieve = jest.fn().mockRejectedValue(missingProductError());
    const create = jest.fn().mockResolvedValue({ id: 'prod_fresh' });

    const product = await build({ retrieve, create }).resolveOrCreateProduct(
      input,
    );

    expect(product).toEqual({ id: 'prod_fresh' });
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('creates a replacement when the stored product was deleted', async () => {
    const retrieve = jest
      .fn()
      .mockResolvedValue({ id: input.stripeProductId, deleted: true });
    const create = jest.fn().mockResolvedValue({ id: 'prod_fresh' });

    const product = await build({ retrieve, create }).resolveOrCreateProduct(
      input,
    );

    expect(product).toEqual({ id: 'prod_fresh' });
  });

  it('reuses a product that still exists', async () => {
    const retrieve = jest.fn().mockResolvedValue({ id: input.stripeProductId });
    const create = jest.fn();

    const product = await build({ retrieve, create }).resolveOrCreateProduct(
      input,
    );

    expect(product).toEqual({ id: input.stripeProductId });
    expect(create).not.toHaveBeenCalled();
  });

  it('still raises anything that is not a missing resource', async () => {
    /*
     * The narrowness matters. Swallowing every error would mint a duplicate
     * Stripe product whenever the API was briefly unreachable or the key was
     * wrong — a worse outcome than the failure, and a silent one.
     */
    const retrieve = jest.fn().mockRejectedValue(
      new Stripe.errors.StripeAuthenticationError({
        type: 'authentication_error',
        message: 'Invalid API Key provided',
      }),
    );
    const create = jest.fn();

    await expect(
      build({ retrieve, create }).resolveOrCreateProduct(input),
    ).rejects.toThrow(/Invalid API Key/);
    expect(create).not.toHaveBeenCalled();
  });
});
