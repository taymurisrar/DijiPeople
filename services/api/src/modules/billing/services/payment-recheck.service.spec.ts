import { NotFoundException } from '@nestjs/common';
import { SubscriptionOrderStatus } from '@prisma/client';

import type { AuditService } from '../../audit/audit.service';
import type { AuthenticatedUser } from '../../../common/interfaces/authenticated-request.interface';
import type { OrderActivationService } from './order-activation.service';
import type { PrismaService } from '../../../common/prisma/prisma.service';
import type { StripeBillingService } from './stripe-billing.service';
import {
  PaymentRecheckService,
  RECONCILE_THROTTLE_MS,
  STRIPE_CHECKOUT_SESSION_ID_PATTERN,
} from './payment-recheck.service';

/**
 * REG-227 — ITEM-0076.
 *
 * The operator recovery path for an order whose Stripe webhook never arrived.
 * It was written, wired to a controller and given an admin panel, and had **no
 * test of any kind** — no spec referenced `PaymentRecheckService` or
 * `recheckCustomerPayment`.
 *
 * That matters more here than for most services, because of what this one is
 * allowed to do: it can move an order to PAID and set a tenant being
 * provisioned in motion. Its own documentation explains why it must never
 * become a manual "mark as paid" — the platform would be witnessing its own
 * payment, with no provider evidence behind the record.
 *
 * So the properties under test are the refusals, not the happy path:
 *
 *   1. it advances **only** when Stripe says paid;
 *   2. it advances **only** through `confirmPayment`, the same call the webhook
 *      makes, so the same event reaches the same outbox and a tenant is
 *      actually provisioned;
 *   3. it audits every outcome, including "we looked and they had not paid",
 *      which is the entry that explains a support conversation weeks later;
 *   4. it picks the **newest** recheckable order, because a customer who
 *      abandoned one checkout and completed another has two, and re-checking
 *      the wrong one reports "not paid" about somebody who has paid.
 */
describe('ITEM-0076 — payment re-check advances only on the provider’s word', () => {
  const OPERATOR = { userId: 'platform-user-1' } as AuthenticatedUser;

  interface Harness {
    service: PaymentRecheckService;
    confirmCalls: Array<{
      stripeCheckoutSessionId: string;
      correlationId?: string;
    }>;
    auditCalls: Array<Record<string, unknown>>;
    findFirstArgs: Array<Record<string, unknown>>;
  }

  function harness(options: {
    order?: Record<string, unknown> | null;
    sessionPaymentStatus?: string | null;
    stripeThrows?: boolean;
    alreadyConfirmed?: boolean;
  }): Harness {
    const confirmCalls: Harness['confirmCalls'] = [];
    const auditCalls: Harness['auditCalls'] = [];
    const findFirstArgs: Harness['findFirstArgs'] = [];

    const order =
      options.order === undefined
        ? {
            id: 'order-1',
            orderNumber: 'ORD-1',
            status: SubscriptionOrderStatus.PENDING_PAYMENT,
            paidAt: null,
            createdAt: new Date('2026-08-01'),
            stripeCheckoutSessionId: 'cs_test_1',
            customerAccountId: 'cust-1',
          }
        : options.order;

    const prisma = {
      subscriptionOrder: {
        findFirst: (args: Record<string, unknown>) => {
          findFirstArgs.push(args);
          return Promise.resolve(order);
        },
        findUnique: () => Promise.resolve(order),
      },
    } as unknown as PrismaService;

    /*
     * The real call is `stripe.client.checkout.sessions.retrieve(id, { expand })`.
     * Stubbing a method the service does not call would make every assertion
     * below pass for the wrong reason — which is how the first version of this
     * spec had six green tests over a service it never reached.
     */
    const stripe = {
      client: {
        checkout: {
          sessions: {
            retrieve: () => {
              if (options.stripeThrows)
                throw new Error('Stripe is unreachable');
              return Promise.resolve({
                id: 'cs_test_1',
                status: 'complete',
                payment_status: options.sessionPaymentStatus ?? 'unpaid',
                expires_at: null,
                payment_intent: null,
              });
            },
          },
        },
      },
    } as unknown as StripeBillingService;

    const activation = {
      confirmPayment: (input: {
        stripeCheckoutSessionId: string;
        correlationId?: string;
      }) => {
        confirmCalls.push(input);
        return Promise.resolve({
          alreadyConfirmed: options.alreadyConfirmed ?? false,
        });
      },
    } as unknown as OrderActivationService;

    const audit = {
      log: (entry: Record<string, unknown>) => {
        auditCalls.push(entry);
        return Promise.resolve();
      },
    } as unknown as AuditService;

    return {
      service: new PaymentRecheckService(prisma, stripe, activation, audit),
      confirmCalls,
      auditCalls,
      findFirstArgs,
    };
  }

  it('does not advance an order Stripe says is unpaid', async () => {
    /*
     * The assertion the whole service exists to satisfy. If this ever passes
     * while `confirmPayment` was called, the platform has witnessed its own
     * payment.
     */
    const h = harness({ sessionPaymentStatus: 'unpaid' });

    await h.service.recheckOrder(OPERATOR, 'order-1');

    expect(h.confirmCalls).toEqual([]);
  });

  it('advances through confirmPayment when Stripe says paid', async () => {
    const h = harness({ sessionPaymentStatus: 'paid' });

    await h.service.recheckOrder(OPERATOR, 'order-1');

    // Through the webhook's own path, not a direct status write — that is what
    // makes PAYMENT_CONFIRMED reach the outbox and a tenant get provisioned.
    expect(h.confirmCalls).toHaveLength(1);
    expect(h.confirmCalls[0].stripeCheckoutSessionId).toBe('cs_test_1');
  });

  it('does not advance when Stripe cannot be reached', async () => {
    // An unreachable provider is not evidence of anything. Failing open here
    // would mean an outage could confirm payments.
    const h = harness({ stripeThrows: true });

    await h.service.recheckOrder(OPERATOR, 'order-1');

    expect(h.confirmCalls).toEqual([]);
  });

  it('audits the outcome even when nothing was advanced', async () => {
    /*
     * "Somebody looked and Stripe said they had not paid" is as much a part of
     * the record as a confirmation. Auditing only successes would leave the
     * support conversation unexplained.
     */
    const h = harness({ sessionPaymentStatus: 'unpaid' });

    await h.service.recheckOrder(OPERATOR, 'order-1');

    expect(h.auditCalls).toHaveLength(1);
    expect(h.auditCalls[0]).toMatchObject({
      action: 'BILLING_PAYMENT_RECHECKED',
      tenantId: 'platform',
      actorUserId: 'platform-user-1',
      entityType: 'SubscriptionOrder',
    });
  });

  it('refuses a customer with no recheckable order', async () => {
    const h = harness({ order: null });

    await expect(
      h.service.recheckCustomerPayment(OPERATOR, 'cust-1'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(h.confirmCalls).toEqual([]);
  });

  it('selects the newest recheckable order for a customer', async () => {
    /*
     * A customer who abandoned one checkout and completed another has two
     * orders. Re-checking the older one reports "not paid" about somebody who
     * has paid — the worst possible answer, because it is confidently wrong and
     * the operator relays it.
     */
    const h = harness({ sessionPaymentStatus: 'paid' });

    await h.service.recheckCustomerPayment(OPERATOR, 'cust-1');

    expect(h.findFirstArgs).toHaveLength(1);
    expect(h.findFirstArgs[0]).toMatchObject({
      orderBy: { createdAt: 'desc' },
      where: { customerAccountId: 'cust-1' },
    });
  });

  it('does not offer an ABANDONED or ACTIVATED order', async () => {
    // An ACTIVATED order needs nothing; an ABANDONED one cannot be revived.
    // Offering either would produce a confusing no-op the operator has to
    // interpret.
    const h = harness({ sessionPaymentStatus: 'paid' });

    await h.service.recheckCustomerPayment(OPERATOR, 'cust-1');

    const where = h.findFirstArgs[0].where as {
      status: { in: SubscriptionOrderStatus[] };
    };
    expect(where.status.in).not.toContain(SubscriptionOrderStatus.ABANDONED);
    expect(where.status.in).not.toContain(SubscriptionOrderStatus.ACTIVATED);
  });
});

/**
 * The buyer's status poll confirming a Stripe payment ahead of the webhook.
 *
 * The success page used to sit on "We're confirming your payment" until
 * `checkout.session.completed` arrived, because nothing else asked Stripe. The
 * reconcile asks — but it is reachable from an anonymous endpoint, so the
 * properties under test are again the refusals: a foreign session id is never
 * read, an unpaid session never confirms, and polling cannot hammer Stripe.
 */
describe('reconcileStripeOrder — the status poll asks Stripe, within limits', () => {
  function harness(options: {
    status?: SubscriptionOrderStatus;
    paymentProvider?: string | null;
    paymentStatus?: string;
    stripeThrows?: boolean;
  }) {
    const order = {
      id: 'order-1',
      orderNumber: 'ORD-1',
      status: options.status ?? SubscriptionOrderStatus.PENDING_PAYMENT,
      paymentProvider:
        options.paymentProvider === undefined
          ? 'STRIPE'
          : options.paymentProvider,
      stripeCheckoutSessionId: 'cs_test_order',
    };
    const prisma = {
      subscriptionOrder: { findUnique: jest.fn(() => Promise.resolve(order)) },
    } as unknown as PrismaService;
    const retrieve = jest.fn(() => {
      if (options.stripeThrows) {
        return Promise.reject(new Error('Stripe is unreachable'));
      }
      return Promise.resolve({
        id: 'cs_test_order',
        status: 'complete',
        payment_status: options.paymentStatus ?? 'paid',
      });
    });
    const stripe = {
      client: { checkout: { sessions: { retrieve } } },
    } as unknown as StripeBillingService;
    /*
     * Stateful like the real `confirmPayment`: the first call moves the order,
     * every later one finds it confirmed.
     */
    let confirmed = false;
    const confirmPayment = jest.fn(() => {
      const already = confirmed;
      confirmed = true;
      return Promise.resolve({ orderId: 'order-1', alreadyConfirmed: already });
    });
    const activation = { confirmPayment } as unknown as OrderActivationService;
    const service = new PaymentRecheckService(prisma, stripe, activation, {
      log: jest.fn(),
    } as unknown as AuditService);
    return { service, retrieve, confirmPayment, order };
  }

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('confirms a paid session once, through confirmPayment', async () => {
    const h = harness({ paymentStatus: 'paid' });

    await expect(
      h.service.reconcileStripeOrder('order-1', 'cs_test_order'),
    ).resolves.toBe('CONFIRMED');

    expect(h.retrieve).toHaveBeenCalledWith('cs_test_order');
    expect(h.confirmPayment).toHaveBeenCalledTimes(1);
    expect(h.confirmPayment).toHaveBeenCalledWith({
      stripeCheckoutSessionId: 'cs_test_order',
      correlationId: 'reconcile:order-1',
    });
  });

  it('reads the order’s own stored session when no hint is given', async () => {
    const h = harness({ paymentStatus: 'paid' });

    await h.service.reconcileStripeOrder('order-1');

    expect(h.retrieve).toHaveBeenCalledWith('cs_test_order');
  });

  it('refuses a session id that is not the order’s own, without asking Stripe', async () => {
    const h = harness({ paymentStatus: 'paid' });

    await expect(
      h.service.reconcileStripeOrder('order-1', 'cs_test_somebody_else'),
    ).resolves.toBe('SESSION_MISMATCH');

    expect(h.retrieve).not.toHaveBeenCalled();
    expect(h.confirmPayment).not.toHaveBeenCalled();
  });

  it('leaves an unpaid session pending', async () => {
    const h = harness({ paymentStatus: 'unpaid' });

    await expect(h.service.reconcileStripeOrder('order-1')).resolves.toBe(
      'NOT_PAID',
    );
    expect(h.confirmPayment).not.toHaveBeenCalled();
  });

  it('asks Stripe at most once per throttle window per order', async () => {
    let now = Date.parse('2026-10-11T10:00:00Z');
    jest.spyOn(Date, 'now').mockImplementation(() => now);
    const h = harness({ paymentStatus: 'unpaid' });

    await h.service.reconcileStripeOrder('order-1');
    await expect(h.service.reconcileStripeOrder('order-1')).resolves.toBe(
      'THROTTLED',
    );
    expect(h.retrieve).toHaveBeenCalledTimes(1);

    now += RECONCILE_THROTTLE_MS;
    await h.service.reconcileStripeOrder('order-1');
    expect(h.retrieve).toHaveBeenCalledTimes(2);
  });

  it('does nothing for an order the webhook already confirmed', async () => {
    // The duplicate path: webhook first, poll second. No Stripe read, no
    // second confirmation.
    const h = harness({ status: SubscriptionOrderStatus.PAID });

    await expect(h.service.reconcileStripeOrder('order-1')).resolves.toBe(
      'NOT_APPLICABLE',
    );
    expect(h.retrieve).not.toHaveBeenCalled();
    expect(h.confirmPayment).not.toHaveBeenCalled();
  });

  it('reports a confirmation that raced the webhook as already confirmed', async () => {
    const h = harness({ paymentStatus: 'paid' });
    // The webhook's call wins the conditional update first.
    await (h.confirmPayment as unknown as (input: unknown) => Promise<unknown>)(
      { stripeCheckoutSessionId: 'cs_test_order' },
    );

    await expect(h.service.reconcileStripeOrder('order-1')).resolves.toBe(
      'ALREADY_CONFIRMED',
    );
  });

  it('leaves orders another provider collects to the settlement path', async () => {
    const h = harness({ paymentProvider: 'SAFEPAY' });

    await expect(h.service.reconcileStripeOrder('order-1')).resolves.toBe(
      'NOT_APPLICABLE',
    );
    expect(h.retrieve).not.toHaveBeenCalled();
  });

  it('never throws when Stripe is unreachable, and confirms nothing', async () => {
    const h = harness({ stripeThrows: true });

    await expect(h.service.reconcileStripeOrder('order-1')).resolves.toBe(
      'PROVIDER_UNREACHABLE',
    );
    expect(h.confirmPayment).not.toHaveBeenCalled();
  });

  it('accepts only Checkout Session shaped ids as a hint', () => {
    expect(STRIPE_CHECKOUT_SESSION_ID_PATTERN.test('cs_test_a1B2')).toBe(true);
    expect(STRIPE_CHECKOUT_SESSION_ID_PATTERN.test('pi_123')).toBe(false);
    expect(STRIPE_CHECKOUT_SESSION_ID_PATTERN.test('cs_x/../y')).toBe(false);
    expect(STRIPE_CHECKOUT_SESSION_ID_PATTERN.test('')).toBe(false);
  });
});
