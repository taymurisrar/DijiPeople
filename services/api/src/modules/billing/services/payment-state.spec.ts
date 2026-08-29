import { SubscriptionOrderStatus } from '@prisma/client';
import { PaymentRecheckService } from './payment-recheck.service';

/**
 * BUG-1884 — the console offered "Re-check payment with Stripe" on every
 * customer record, including ones whose payment succeeded and whose workspace
 * was provisioned. Pressing it answered `NO_RECHECKABLE_ORDER`: the API always
 * knew there was nothing to re-check, and the screen never asked.
 *
 * `getCustomerPaymentState` is what the screen now asks. It is deliberately
 * built on the newest order — the same record `findRecheckableOrder` reads — so
 * the button and the action behind it cannot disagree about whether there is
 * anything to do.
 *
 * The mapping below is the whole contract, and the interesting half is the
 * third row: DRAFT, ABANDONED and CANCELLED are neither settled payments nor
 * payments in flight, so the panel renders nothing rather than explaining the
 * absence of a payment nobody started.
 */

const EXPECTED: Array<[SubscriptionOrderStatus, string]> = [
  [SubscriptionOrderStatus.PAID, 'CONFIRMED'],
  [SubscriptionOrderStatus.ACTIVATED, 'CONFIRMED'],
  [SubscriptionOrderStatus.PENDING_PAYMENT, 'AWAITING'],
  [SubscriptionOrderStatus.FAILED, 'FAILED'],
  [SubscriptionOrderStatus.DRAFT, 'NONE'],
  [SubscriptionOrderStatus.ABANDONED, 'NONE'],
  [SubscriptionOrderStatus.CANCELLED, 'NONE'],
];

function build(order: Record<string, unknown> | null) {
  const prisma = {
    subscriptionOrder: { findFirst: () => Promise.resolve(order) },
  };
  return new PaymentRecheckService(
    prisma as never,
    {} as never,
    {} as never,
    {} as never,
  );
}

function order(status: SubscriptionOrderStatus) {
  return {
    orderNumber: 'ORD-1001',
    status,
    paidAt: status === SubscriptionOrderStatus.PAID ? new Date() : null,
    totalAmount: 80,
    currency: 'QAR',
    stripeCheckoutSessionId: 'cs_test_1',
  };
}

describe('BUG-1884 — the payment panel asks before it offers', () => {
  it.each(EXPECTED)('reports %s as %s', async (status, expected) => {
    const service = build(order(status));
    const state = await service.getCustomerPaymentState('customer-1');
    expect(state.state).toBe(expected);
  });

  it('reports NONE for a customer with no order at all', async () => {
    const service = build(null);
    await expect(
      service.getCustomerPaymentState('customer-1'),
    ).resolves.toEqual({ state: 'NONE' });
  });

  it('carries what the operator needs to say, not just the verdict', async () => {
    /*
     * The confirmed panel states the amount, the currency, the date and the
     * order number. Without them the screen would have to fetch the order
     * separately to say anything more useful than "paid".
     */
    const service = build(order(SubscriptionOrderStatus.PAID));
    const state = await service.getCustomerPaymentState('customer-1');
    expect(state).toMatchObject({
      state: 'CONFIRMED',
      orderNumber: 'ORD-1001',
      amount: 80,
      currency: 'QAR',
    });
    expect(state.paidAt).toEqual(expect.any(String));
  });

  it('never reports CONFIRMED for an order Stripe has not settled', async () => {
    // The assertion that matters if the mapping is ever edited: a settled
    // panel on an unsettled payment tells an operator to stop chasing it.
    for (const status of [
      SubscriptionOrderStatus.PENDING_PAYMENT,
      SubscriptionOrderStatus.FAILED,
      SubscriptionOrderStatus.DRAFT,
      SubscriptionOrderStatus.ABANDONED,
      SubscriptionOrderStatus.CANCELLED,
    ]) {
      const service = build(order(status));
      const state = await service.getCustomerPaymentState('customer-1');
      expect([status, state.state]).not.toEqual([status, 'CONFIRMED']);
    }
  });
});
