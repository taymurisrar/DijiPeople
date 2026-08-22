import { NotFoundException } from '@nestjs/common';
import { SubscriptionOrderStatus } from '@prisma/client';

import type { AuditService } from '../../audit/audit.service';
import type { AuthenticatedUser } from '../../../common/interfaces/authenticated-request.interface';
import type { OrderActivationService } from './order-activation.service';
import type { PrismaService } from '../../../common/prisma/prisma.service';
import type { StripeBillingService } from './stripe-billing.service';
import { PaymentRecheckService } from './payment-recheck.service';

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
