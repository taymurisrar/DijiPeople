import { WebhookProcessingStatus } from '@prisma/client';
import { WebhookService } from './webhook.service';

describe('WebhookService idempotency', () => {
  it('does not dispatch an already processed Stripe event', async () => {
    const record = {
      id: 'stored-event',
      stripeEventId: 'evt_duplicate',
      processingStatus: WebhookProcessingStatus.PROCESSED,
    };
    const prisma = {
      stripeWebhookEvent: { create: jest.fn().mockResolvedValue(record) },
    };
    const stripe = { client: {} };
    const service = new WebhookService(prisma as never, stripe as never);

    await expect(
      service.processStripeEvent({
        id: 'evt_duplicate',
        type: 'customer.subscription.updated',
        api_version: 'test',
        livemode: false,
        pending_webhooks: 1,
        created: 1,
        data: { object: {} },
      } as never),
    ).resolves.toMatchObject({
      duplicate: true,
      stripeEventId: 'evt_duplicate',
      status: WebhookProcessingStatus.PROCESSED,
    });
  });
});

/**
 * Delayed-notification payments (bank debits, transfers) complete the Checkout
 * Session `unpaid` and settle later. Before these cases existed nothing ever
 * confirmed such an order: `completed` requires `paid`, and the later
 * `async_payment_succeeded` fell through to `default` and was IGNORED.
 */
describe('WebhookService — checkout.session async payments', () => {
  function harness() {
    const confirmPayment = jest
      .fn()
      .mockResolvedValue({ orderId: 'order-1', alreadyConfirmed: false });
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const prisma = {
      stripeWebhookEvent: {
        create: jest.fn().mockResolvedValue({
          id: 'stored-event',
          stripeEventId: 'evt_async',
          processingStatus: WebhookProcessingStatus.RECEIVED,
        }),
        update: jest.fn(({ data }: { data: Record<string, unknown> }) =>
          Promise.resolve({
            id: 'stored-event',
            stripeEventId: 'evt_async',
            ...data,
          }),
        ),
      },
      subscriptionOrder: { updateMany },
    };
    const service = new WebhookService(
      prisma as never,
      { client: {} } as never,
      { confirmPayment } as never,
    );
    return { service, confirmPayment, updateMany };
  }

  function event(type: string, session: Record<string, unknown>) {
    return {
      id: 'evt_async',
      type,
      api_version: 'test',
      livemode: false,
      pending_webhooks: 1,
      created: 1,
      data: {
        object: {
          id: 'cs_test_async',
          mode: 'subscription',
          customer: 'cus_1',
          subscription: 'sub_1',
          metadata: { subscriptionOrderId: 'order-1' },
          ...session,
        },
      },
    } as never;
  }

  it('confirms a public order when the delayed payment succeeds', async () => {
    const { service, confirmPayment } = harness();

    const result = await service.processStripeEvent(
      event('checkout.session.async_payment_succeeded', {
        payment_status: 'paid',
      }),
    );

    expect(result.status).toBe(WebhookProcessingStatus.PROCESSED);
    expect(confirmPayment).toHaveBeenCalledTimes(1);
    expect(confirmPayment).toHaveBeenCalledWith({
      stripeCheckoutSessionId: 'cs_test_async',
      stripeSubscriptionId: 'sub_1',
    });
  });

  it('confirms nothing on an async event that is still unpaid', async () => {
    const { service, confirmPayment } = harness();

    await service.processStripeEvent(
      event('checkout.session.async_payment_succeeded', {
        payment_status: 'unpaid',
      }),
    );

    expect(confirmPayment).not.toHaveBeenCalled();
  });

  it('marks a still-waiting public order FAILED when the delayed payment fails', async () => {
    const { service, confirmPayment, updateMany } = harness();

    const result = await service.processStripeEvent(
      event('checkout.session.async_payment_failed', {
        payment_status: 'unpaid',
      }),
    );

    expect(result.status).toBe(WebhookProcessingStatus.PROCESSED);
    expect(confirmPayment).not.toHaveBeenCalled();
    expect(updateMany).toHaveBeenCalledTimes(1);
    const args = (updateMany.mock.calls as unknown[][])[0][0] as {
      where: { stripeCheckoutSessionId: string; status: { in: string[] } };
      data: { status: string };
    };
    expect(args.where.stripeCheckoutSessionId).toBe('cs_test_async');
    // Conditional: a late failure can never un-pay a confirmed order.
    expect(args.where.status.in).not.toContain('PAID');
    expect(args.where.status.in).not.toContain('ACTIVATED');
    expect(args.data.status).toBe('FAILED');
  });

  it('leaves a tenant checkout failure to the subscription and invoice events', async () => {
    const { service, updateMany } = harness();

    const result = await service.processStripeEvent(
      event('checkout.session.async_payment_failed', {
        payment_status: 'unpaid',
        metadata: { tenantId: 'tenant-1' },
      }),
    );

    expect(result.status).toBe(WebhookProcessingStatus.IGNORED);
    expect(updateMany).not.toHaveBeenCalled();
  });
});
