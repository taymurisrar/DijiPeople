import { DomainEventType, SubscriptionOrderStatus } from '@prisma/client';
import { OrderActivationService } from './order-activation.service';

/**
 * One confirmation, however many callers confirm.
 *
 * Since the buyer's status poll started confirming Stripe payments, a paid
 * order normally has two confirmers racing — the webhook and the reconcile.
 * Both call `confirmPayment`; exactly one may move the order, emit
 * PAYMENT_CONFIRMED and kick the outbox worker. The fake below behaves like the
 * database does: the read can see PENDING for both, and the conditional
 * update is what lets only one through.
 */
describe('OrderActivationService.confirmPayment — webhook and reconcile together', () => {
  function harness() {
    let status: SubscriptionOrderStatus =
      SubscriptionOrderStatus.PENDING_PAYMENT;
    const order = () => ({
      id: 'order-1',
      status: SubscriptionOrderStatus.PENDING_PAYMENT, // a stale read, both times
      customerAccountId: 'cust-1',
      tenantId: null,
      requestedSeats: 5,
      planId: 'plan-1',
      currency: 'USD',
      totalAmount: { toString: () => '50.00' },
      paymentProvider: 'STRIPE',
      providerPaymentId: null,
    });
    const tx = {
      subscriptionOrder: {
        updateMany: jest.fn(() => {
          if (
            status === SubscriptionOrderStatus.PAID ||
            status === SubscriptionOrderStatus.ACTIVATED
          ) {
            return Promise.resolve({ count: 0 });
          }
          status = SubscriptionOrderStatus.PAID;
          return Promise.resolve({ count: 1 });
        }),
      },
      customerAccount: { update: jest.fn().mockResolvedValue({}) },
    };
    const prisma = {
      subscriptionOrder: {
        findUnique: jest.fn(() => Promise.resolve(order())),
      },
      $transaction: jest.fn((fn: (client: typeof tx) => Promise<unknown>) =>
        fn(tx),
      ),
    };
    const outbox = {
      emit: jest.fn().mockResolvedValue({ id: 'evt-1', deduplicated: false }),
    };
    const worker = { kick: jest.fn() };
    const service = new OrderActivationService(
      prisma as never,
      outbox as never,
      worker as never,
    );
    return { service, outbox, worker };
  }

  it('confirms once and emits one PAYMENT_CONFIRMED', async () => {
    const h = harness();

    const [webhook, reconcile] = await Promise.all([
      h.service.confirmPayment({ stripeCheckoutSessionId: 'cs_test_1' }),
      h.service.confirmPayment({
        stripeCheckoutSessionId: 'cs_test_1',
        correlationId: 'reconcile:order-1',
      }),
    ]);

    expect(
      [webhook, reconcile].filter((result) => !result.alreadyConfirmed),
    ).toHaveLength(1);
    expect(h.outbox.emit).toHaveBeenCalledTimes(1);
    expect(h.outbox.emit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        eventType: DomainEventType.PAYMENT_CONFIRMED,
        aggregateId: 'order-1',
      }),
    );
  });

  it('kicks the outbox worker only for the confirmation that moved the order', async () => {
    const h = harness();

    await h.service.confirmPayment({ stripeCheckoutSessionId: 'cs_test_1' });
    await h.service.confirmPayment({ stripeCheckoutSessionId: 'cs_test_1' });

    expect(h.worker.kick).toHaveBeenCalledTimes(1);
  });

  it('still confirms in a container with no outbox worker', async () => {
    const prismaless = harness();
    const service = new OrderActivationService(
      (prismaless.service as unknown as { prisma: unknown }).prisma as never,
      prismaless.outbox as never,
    );

    await expect(
      service.confirmPayment({ stripeCheckoutSessionId: 'cs_test_1' }),
    ).resolves.toMatchObject({ alreadyConfirmed: false });
  });
});
