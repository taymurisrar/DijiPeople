import { BadRequestException } from '@nestjs/common';
import { StripeWebhookController } from './stripe-webhook.controller';

/**
 * BUG-2462 — a Stripe customer or subscription that cannot be mapped to
 * exactly one tenant answered `400` for six days and 19 redeliveries of one
 * event, because Stripe treats any non-2xx as "deliver it again" and nothing
 * about redelivering ever resolves an ambiguous or missing tenant mapping.
 *
 * `processStripeEvent` itself is unchanged and stays covered by
 * `webhook-event-not-ready.spec.ts` — it still throws, still persists the
 * event `FAILED`, and still records the platform event that raises the
 * critical payment-attribution alert. What changes is only what this
 * controller tells Stripe: acknowledged for this one class of failure, so the
 * redelivery loop stops, and rethrown for everything else.
 */
describe('StripeWebhookController — unmappable Stripe tenant (BUG-2462)', () => {
  function buildController(processStripeEvent: jest.Mock) {
    const billingService = {
      verifyWebhookSignature: jest.fn().mockReturnValue({
        id: 'evt_unmapped',
        type: 'customer.subscription.updated',
        data: { object: { id: 'sub_x', customer: 'cus_ghost' } },
      }),
    };
    const webhookService = { processStripeEvent };
    const controller = new StripeWebhookController(
      billingService as never,
      webhookService as never,
    );
    const request = {
      body: Buffer.from('{}'),
    } as never;
    return { controller, request };
  }

  it('acknowledges Stripe with 2xx when the customer cannot be resolved to one tenant', async () => {
    const processStripeEvent = jest.fn().mockRejectedValue(
      new BadRequestException({
        code: 'STRIPE_CUSTOMER_UNMAPPED',
        message:
          'Stripe subscription customer could not be resolved to one tenant.',
        details: { stripeCustomerId: 'cus_ghost', matchedTenants: 0 },
      }),
    );
    const { controller, request } = buildController(processStripeEvent);

    const result = await controller.handleStripeWebhook(request, 'sig_valid');

    expect(result).toMatchObject({
      received: true,
      duplicate: false,
      stripeEventId: 'evt_unmapped',
      status: 'FAILED',
    });
  });

  it('acknowledges the ambiguous-mapping case the same way as the unmapped case', async () => {
    const processStripeEvent = jest.fn().mockRejectedValue(
      new BadRequestException({
        code: 'STRIPE_CUSTOMER_UNMAPPED',
        message:
          'Stripe subscription customer could not be resolved to one tenant.',
        details: { stripeCustomerId: 'cus_ghost', matchedTenants: 2 },
      }),
    );
    const { controller, request } = buildController(processStripeEvent);

    await expect(
      controller.handleStripeWebhook(request, 'sig_valid'),
    ).resolves.toMatchObject({ received: true, status: 'FAILED' });
  });

  it('still rejects a failure that is not the unmapped-tenant class', async () => {
    // A handler bug, a database outage, anything else — must keep failing
    // loudly rather than being swallowed by this new branch.
    const processStripeEvent = jest
      .fn()
      .mockRejectedValue(new Error('unexpected database error'));
    const { controller, request } = buildController(processStripeEvent);

    await expect(
      controller.handleStripeWebhook(request, 'sig_valid'),
    ).rejects.toThrow('unexpected database error');
  });

  it('still rejects a generic VALIDATION_FAILED that is not tagged as unmapped', async () => {
    // Guards the distinction itself: an ordinary 400 from elsewhere in the
    // handler must not be swallowed just because it is also a
    // BadRequestException.
    const processStripeEvent = jest.fn().mockRejectedValue(
      new BadRequestException({
        code: 'VALIDATION_FAILED',
        message: 'Some other validation problem.',
      }),
    );
    const { controller, request } = buildController(processStripeEvent);

    await expect(
      controller.handleStripeWebhook(request, 'sig_valid'),
    ).rejects.toThrow(BadRequestException);
  });

  it('returns the successful shape untouched when processing succeeds', async () => {
    const processStripeEvent = jest.fn().mockResolvedValue({
      duplicate: false,
      stripeEventId: 'evt_unmapped',
      status: 'PROCESSED',
    });
    const { controller, request } = buildController(processStripeEvent);

    await expect(
      controller.handleStripeWebhook(request, 'sig_valid'),
    ).resolves.toEqual({
      received: true,
      duplicate: false,
      stripeEventId: 'evt_unmapped',
      status: 'PROCESSED',
    });
  });
});
