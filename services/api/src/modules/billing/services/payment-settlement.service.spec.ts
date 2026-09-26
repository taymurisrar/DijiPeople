import {
  BillingCycle,
  BillingInterval,
  BillingModel,
  InvoiceStatus,
  PaymentProvider,
  PaymentStatus,
  Prisma,
  RefundStatus,
  SubscriptionOrderStatus,
  SubscriptionStatus,
  TenantStatus,
} from '@prisma/client';
import type { ProviderPaymentState } from '../providers/payment-gateway';
import { PaymentSettlementService } from './payment-settlement.service';

/**
 * Settlement is where money becomes access, so the properties under test are
 * the refusals as much as the happy path: nothing activates without the
 * provider's own confirmation, a wrong amount or currency is never credited,
 * a second confirmation of the same payment changes nothing, and money that
 * arrives for something already settled becomes a refund request.
 *
 * The fake database holds real rows and the assertions read them back, so a
 * test cannot pass by the service merely calling the right method.
 */

type Row = Record<string, unknown>;

const TENANT = 'tenant-1';
const NOW = new Date('2026-09-26T12:00:00Z');

function harness(options: {
  subscriptionStatus?: SubscriptionStatus;
  invoiceStatus?: InvoiceStatus;
  purpose?: Row | null;
  invoicePeriod?: { periodStart: Date; periodEnd: Date };
  promotion?: { maximumRedemptions: number | null; redemptionCount: number };
}) {
  const payment: Row = {
    id: 'payment-1',
    tenantId: TENANT,
    subscriptionId: 'sub-1',
    invoiceId: 'invoice-1',
    amount: new Prisma.Decimal('25000.00'),
    currency: 'PKR',
    status: PaymentStatus.PENDING,
    paymentProvider: PaymentProvider.SAFEPAY,
    providerPaymentId: 'track_abc',
    failureCode: null,
  };
  const invoice: Row = {
    id: 'invoice-1',
    tenantId: TENANT,
    subscriptionId: 'sub-1',
    status: options.invoiceStatus ?? InvoiceStatus.ISSUED,
    periodStart: options.invoicePeriod?.periodStart ?? null,
    periodEnd: options.invoicePeriod?.periodEnd ?? null,
    metadataJson:
      options.purpose === undefined
        ? {
            kind: 'INITIAL',
            planId: 'plan-pro',
            planPriceId: 'price-pro-pkr',
            seats: 5,
            promotionId: options.promotion ? 'promo-1' : null,
          }
        : options.purpose,
  };
  const subscription: Row = {
    id: 'sub-1',
    tenantId: TENANT,
    status: options.subscriptionStatus ?? SubscriptionStatus.INCOMPLETE,
    gracePeriodEndsAt: null,
    planPriceId: 'price-pro-pkr',
    currentPeriodStart: null,
    currentPeriodEnd: null,
  };
  const planPrice = {
    id: 'price-pro-pkr',
    planId: 'plan-pro',
    billingCycle: BillingCycle.MONTHLY,
    billingInterval: BillingInterval.MONTH,
    billingModel: BillingModel.PER_SEAT,
    includedSeats: 0,
    unitAmount: new Prisma.Decimal('5000'),
    currency: 'PKR',
  };
  const promotion: Row | null = options.promotion
    ? { id: 'promo-1', ...options.promotion }
    : null;
  const tenant: Row = {
    id: TENANT,
    status: TenantStatus.ACTIVE,
    customerAccountId: 'cust-1',
  };
  const order: Row = {
    id: 'order-1',
    orderNumber: 'ORD-1',
    status: SubscriptionOrderStatus.PENDING_PAYMENT,
    customerAccountId: 'cust-1',
    totalAmount: new Prisma.Decimal('25000.00'),
    currency: 'PKR',
    paymentProvider: PaymentProvider.SAFEPAY,
    providerPaymentId: 'track_order',
  };
  const refundRequests: Row[] = [];
  const promotionApplications: Row[] = [];
  const audits: Row[] = [];
  const planChanges: Row[] = [];

  const matches = (row: Row, where: Row) =>
    Object.entries(where).every(([key, condition]) => {
      if (condition && typeof condition === 'object' && 'in' in condition) {
        return (condition.in as unknown[]).includes(row[key]);
      }
      return row[key] === condition;
    });

  const prisma = {
    payment: {
      findUnique: ({ where }: { where: Row }) =>
        Promise.resolve(
          where.id === payment.id ||
            (where.paymentProvider_providerPaymentId as Row | undefined)
              ?.providerPaymentId === payment.providerPaymentId
            ? { ...payment, tenant }
            : null,
        ),
      findUniqueOrThrow: () =>
        Promise.resolve({
          ...payment,
          invoice: { ...invoice },
          subscription: { ...subscription },
          tenant,
        }),
      updateMany: ({ where, data }: { where: Row; data: Row }) => {
        if (!matches(payment, where)) return Promise.resolve({ count: 0 });
        Object.assign(payment, data);
        return Promise.resolve({ count: 1 });
      },
      update: ({ data }: { data: Row }) => {
        Object.assign(payment, data);
        return Promise.resolve(payment);
      },
    },
    invoice: {
      update: ({ data }: { data: Row }) => {
        Object.assign(invoice, data);
        return Promise.resolve(invoice);
      },
      // One invoice exists, so `id: { not: … }` excludes it and relation or
      // JSON filters are not modelled.
      updateMany: ({ where, data }: { where: Row; data: Row }) => {
        const id = where.id as { not?: string } | string | undefined;
        if (typeof id === 'object' && id.not === invoice.id) {
          return Promise.resolve({ count: 0 });
        }
        const status = where.status as { in?: unknown[] } | string | undefined;
        const statusMatches =
          status === undefined ||
          (typeof status === 'object'
            ? (status.in ?? []).includes(invoice.status)
            : invoice.status === status);
        if (!statusMatches) return Promise.resolve({ count: 0 });
        Object.assign(invoice, data);
        return Promise.resolve({ count: 1 });
      },
    },
    planChangeRequest: {
      updateMany: ({ data }: { data: Row }) => {
        planChanges.push(data);
        return Promise.resolve({ count: 1 });
      },
    },
    $queryRaw: () => Promise.resolve([]),
    subscription: {
      update: ({ data }: { data: Row }) => {
        for (const [key, value] of Object.entries(data)) {
          if (value !== undefined) subscription[key] = value;
        }
        return Promise.resolve(subscription);
      },
    },
    planPrice: {
      findUniqueOrThrow: () => Promise.resolve(planPrice),
    },
    tenant: {
      update: ({ data }: { data: Row }) => {
        Object.assign(tenant, data);
        return Promise.resolve(tenant);
      },
    },
    customerAccount: { update: () => Promise.resolve({}) },
    refundRequest: {
      create: ({ data }: { data: Row }) => {
        refundRequests.push(data);
        return Promise.resolve(data);
      },
      findFirst: ({ where }: { where: Row }) =>
        Promise.resolve(
          refundRequests.find((request) => request.reason === where.reason) ??
            null,
        ),
    },
    subscriptionPromotion: {
      upsert: ({ create }: { create: Row }) => {
        promotionApplications.push(create);
        return Promise.resolve(create);
      },
    },
    subscriptionOrder: {
      findUnique: ({ where }: { where: Row }) =>
        Promise.resolve(
          where.id === order.id ||
            where.providerPaymentId === order.providerPaymentId
            ? order
            : null,
        ),
      findFirst: () => Promise.resolve(null),
      update: ({ data }: { data: Row }) => {
        Object.assign(order, data);
        return Promise.resolve(order);
      },
    },
    $executeRaw: (strings: TemplateStringsArray) => {
      if (!promotion) return Promise.resolve(0);
      const capped = strings.join('').includes('"maximumRedemptions" IS NULL');
      const max = promotion.maximumRedemptions as number | null;
      if (
        capped &&
        max !== null &&
        (promotion.redemptionCount as number) >= max
      ) {
        return Promise.resolve(0);
      }
      promotion.redemptionCount = (promotion.redemptionCount as number) + 1;
      return Promise.resolve(1);
    },
    $transaction: <T>(work: (tx: unknown) => Promise<T>) => work(prisma),
  };

  let providerState: ProviderPaymentState = {
    status: 'PAID',
    providerPaymentId: 'track_abc',
    amount: '25000.00',
    currency: 'PKR',
    providerReference: 'ch_1',
    reference: 'payment-1',
    failureCode: null,
    failureMessage: null,
  };
  const fetchPayment = jest.fn(() => Promise.resolve(providerState));
  const gateways = {
    isManaged: (provider: PaymentProvider | null) =>
      Boolean(provider) && provider !== PaymentProvider.STRIPE,
    get: () => ({ fetchPayment }),
  };
  const confirmPayment = jest.fn(() =>
    Promise.resolve({ orderId: 'order-1', alreadyConfirmed: false }),
  );
  const audit = {
    log: (entry: Row) => {
      audits.push(entry);
      return Promise.resolve();
    },
  };

  jest.useFakeTimers().setSystemTime(NOW.getTime());

  const service = new PaymentSettlementService(
    prisma as never,
    gateways as never,
    { confirmPayment } as never,
    audit as never,
  );

  return {
    service,
    payment,
    invoice,
    subscription,
    promotion,
    order,
    refundRequests,
    promotionApplications,
    audits,
    planChanges,
    fetchPayment,
    confirmPayment,
    setProviderState: (patch: Partial<ProviderPaymentState>) => {
      providerState = { ...providerState, ...patch };
    },
  };
}

afterEach(() => {
  jest.useRealTimers();
});

describe('PaymentSettlementService — money becomes access only on the provider’s word', () => {
  it('activates the subscription when the provider confirms the exact amount', async () => {
    const h = harness({});

    await expect(h.service.settlePayment('payment-1', 'WEBHOOK')).resolves.toBe(
      PaymentStatus.SUCCEEDED,
    );

    expect(h.payment.status).toBe(PaymentStatus.SUCCEEDED);
    expect(h.payment.providerReference).toBe('ch_1');
    expect(h.invoice.status).toBe(InvoiceStatus.PAID);
    expect(h.subscription).toMatchObject({
      status: SubscriptionStatus.ACTIVE,
      paymentProvider: PaymentProvider.SAFEPAY,
      planPriceId: 'price-pro-pkr',
      purchasedSeats: 5,
      currentPeriodStart: NOW,
      currentPeriodEnd: new Date('2026-10-26T12:00:00Z'),
      gracePeriodEndsAt: null,
    });
    expect(h.refundRequests).toHaveLength(0);
  });

  it('asks the provider rather than trusting whoever called', async () => {
    const h = harness({});
    await h.service.settlePayment('payment-1', 'RETURN');
    expect(h.fetchPayment).toHaveBeenCalledWith('track_abc');
  });

  it('does not activate anything while the provider says pending', async () => {
    const h = harness({});
    h.setProviderState({ status: 'PENDING' });

    await h.service.settlePayment('payment-1', 'RETURN');

    expect(h.payment.status).toBe(PaymentStatus.PENDING);
    expect(h.subscription.status).toBe(SubscriptionStatus.INCOMPLETE);
  });

  it('records a failed payment and leaves the subscription alone', async () => {
    const h = harness({});
    h.setProviderState({
      status: 'FAILED',
      failureCode: 'SAFEPAY_TRACKER_EXPIRED',
      failureMessage: 'expired',
    });

    await expect(h.service.settlePayment('payment-1', 'WEBHOOK')).resolves.toBe(
      PaymentStatus.FAILED,
    );
    expect(h.payment.failureCode).toBe('SAFEPAY_TRACKER_EXPIRED');
    expect(h.invoice.status).toBe(InvoiceStatus.PAYMENT_FAILED);
    expect(h.subscription.status).toBe(SubscriptionStatus.INCOMPLETE);
  });

  it('never credits a payment for a different amount', async () => {
    const h = harness({});
    h.setProviderState({ amount: '2500.00' });

    await expect(h.service.settlePayment('payment-1', 'WEBHOOK')).resolves.toBe(
      PaymentStatus.FAILED,
    );
    expect(h.payment.failureCode).toBe('SAFEPAY_AMOUNT_MISMATCH');
    expect(h.invoice.status).toBe(InvoiceStatus.ISSUED);
    expect(h.subscription.status).toBe(SubscriptionStatus.INCOMPLETE);
  });

  it('never credits a payment in a different currency', async () => {
    const h = harness({});
    h.setProviderState({ currency: 'USD' });

    await h.service.settlePayment('payment-1', 'WEBHOOK');

    expect(h.payment.failureCode).toBe('SAFEPAY_CURRENCY_MISMATCH');
    expect(h.subscription.status).toBe(SubscriptionStatus.INCOMPLETE);
  });

  // Webhook and return page racing each other, or a duplicate delivery.
  it('settles a payment once however many times it is confirmed', async () => {
    const h = harness({});

    await h.service.settlePayment('payment-1', 'WEBHOOK');
    const firstPeriodEnd = h.subscription.currentPeriodEnd;
    await h.service.settlePayment('payment-1', 'WEBHOOK');
    await h.service.settlePayment('payment-1', 'RETURN');

    expect(h.subscription.currentPeriodEnd).toEqual(firstPeriodEnd);
    expect(
      h.audits.filter(
        (entry) => entry.action === 'SUBSCRIPTION_ACTIVATED_BY_PAYMENT',
      ),
    ).toHaveLength(1);
    // The status poll does not even call the provider for a settled payment.
    expect(h.fetchPayment).toHaveBeenCalledTimes(2);
  });

  it('turns a payment for an invoice already paid into a refund request', async () => {
    const h = harness({ invoiceStatus: InvoiceStatus.PAID });

    await h.service.settlePayment('payment-1', 'WEBHOOK');

    expect(h.payment.status).toBe(PaymentStatus.SUCCEEDED);
    expect(h.refundRequests).toEqual([
      expect.objectContaining({
        paymentId: 'payment-1',
        status: RefundStatus.REQUESTED,
        reasonCode: 'DUPLICATE_PAYMENT',
      }),
    ]);
    expect(h.subscription.status).toBe(SubscriptionStatus.INCOMPLETE);
  });

  it('does not reactivate a subscription another payment already activated', async () => {
    const h = harness({ subscriptionStatus: SubscriptionStatus.ACTIVE });

    await h.service.settlePayment('payment-1', 'WEBHOOK');

    expect(h.refundRequests).toHaveLength(1);
    expect(h.subscription.currentPeriodEnd).toBeNull();
  });

  it('extends currentPeriodEnd when a renewal is paid', async () => {
    const periodStart = new Date('2026-10-01T00:00:00Z');
    const periodEnd = new Date('2026-11-01T00:00:00Z');
    const h = harness({
      subscriptionStatus: SubscriptionStatus.PAST_DUE,
      invoicePeriod: { periodStart, periodEnd },
      purpose: {
        kind: 'RENEWAL',
        planId: 'plan-pro',
        planPriceId: 'price-pro-pkr',
        seats: 5,
        promotionId: null,
      },
    });
    h.subscription.gracePeriodEndsAt = new Date('2026-10-08T00:00:00Z');

    await h.service.settlePayment('payment-1', 'WEBHOOK');

    expect(h.subscription).toMatchObject({
      status: SubscriptionStatus.ACTIVE,
      currentPeriodEnd: periodEnd,
      renewalDate: periodEnd,
      gracePeriodEndsAt: null,
    });
  });

  it('refunds rather than renews a subscription cancelled before the renewal was paid', async () => {
    const h = harness({
      subscriptionStatus: SubscriptionStatus.CANCELED,
      purpose: {
        kind: 'RENEWAL',
        planId: 'plan-pro',
        planPriceId: 'price-pro-pkr',
        seats: 5,
        promotionId: null,
      },
    });

    await h.service.settlePayment('payment-1', 'WEBHOOK');

    expect(h.subscription.status).toBe(SubscriptionStatus.CANCELED);
    expect(h.refundRequests).toHaveLength(1);
  });

  describe('Reviewer findings (SESSION-0108)', () => {
    const renewalPurpose = {
      kind: 'RENEWAL',
      planId: 'plan-pro',
      planPriceId: 'price-pro-pkr',
      seats: 5,
      promotionId: null,
    };

    // Finding 2: a lapse switched renewals off, and paying never switched
    // them back on — the next period had no invoice to pay.
    it('turns renewals back on when a renewal is paid', async () => {
      const h = harness({
        subscriptionStatus: SubscriptionStatus.PAST_DUE,
        invoicePeriod: {
          periodStart: new Date('2026-10-01T00:00:00Z'),
          periodEnd: new Date('2026-11-01T00:00:00Z'),
        },
        purpose: renewalPurpose,
      });
      Object.assign(h.subscription, {
        autoRenew: false,
        cancelAtPeriodEnd: true,
        currentPeriodEnd: new Date('2026-10-01T00:00:00Z'),
      });

      await h.service.settlePayment('payment-1', 'WEBHOOK');

      expect(h.subscription).toMatchObject({
        status: SubscriptionStatus.ACTIVE,
        autoRenew: true,
        cancelAtPeriodEnd: false,
      });
    });

    // Finding 4: a stale renewal paid after re-subscribing moved the
    // paid-through date backwards.
    it('refunds a renewal for a period the subscription already covers', async () => {
      const h = harness({
        subscriptionStatus: SubscriptionStatus.ACTIVE,
        invoicePeriod: {
          periodStart: new Date('2026-08-01T00:00:00Z'),
          periodEnd: new Date('2026-09-01T00:00:00Z'),
        },
        purpose: renewalPurpose,
      });
      const paidThrough = new Date('2026-10-20T00:00:00Z');
      h.subscription.currentPeriodEnd = paidThrough;

      await h.service.settlePayment('payment-1', 'WEBHOOK');

      expect(h.subscription.currentPeriodEnd).toEqual(paidThrough);
      expect(h.refundRequests).toHaveLength(1);
    });

    // Finding 3: a plan change on a Safepay subscription takes effect with
    // the renewal priced at it, not on the date.
    it('applies the scheduled plan change the renewal was priced at', async () => {
      const h = harness({
        subscriptionStatus: SubscriptionStatus.ACTIVE,
        invoicePeriod: {
          periodStart: new Date('2026-10-01T00:00:00Z'),
          periodEnd: new Date('2026-11-01T00:00:00Z'),
        },
        purpose: renewalPurpose,
      });
      h.subscription.currentPeriodEnd = new Date('2026-10-01T00:00:00Z');

      await h.service.settlePayment('payment-1', 'WEBHOOK');

      expect(h.planChanges).toEqual([
        expect.objectContaining({ status: 'APPLIED' }),
      ]);
    });

    // Finding 6: a second tracker paid for an order already paid through
    // another was kept silently.
    it('raises a refund for a second paid checkout on an already-paid order', async () => {
      const h = harness({});
      h.order.status = SubscriptionOrderStatus.PAID;
      h.setProviderState({ providerPaymentId: 'track_old' });

      await h.service.settleOrder('order-1', 'WEBHOOK', 'track_old');
      await h.service.settleOrder('order-1', 'WEBHOOK', 'track_old');

      expect(h.confirmPayment).not.toHaveBeenCalled();
      expect(h.refundRequests).toEqual([
        expect.objectContaining({
          customerAccountId: 'cust-1',
          reasonCode: 'DUPLICATE_PAYMENT',
          status: RefundStatus.REQUESTED,
        }),
      ]);
    });
  });

  describe('coupons', () => {
    it('counts a redemption only once the payment succeeds', async () => {
      const h = harness({
        promotion: { maximumRedemptions: 10, redemptionCount: 3 },
      });

      h.setProviderState({ status: 'PENDING' });
      await h.service.settlePayment('payment-1', 'RETURN');
      expect(h.promotion?.redemptionCount).toBe(3);

      h.setProviderState({ status: 'PAID' });
      await h.service.settlePayment('payment-1', 'WEBHOOK');
      expect(h.promotion?.redemptionCount).toBe(4);
      expect(h.promotionApplications).toEqual([
        { subscriptionId: 'sub-1', promotionId: 'promo-1' },
      ]);
    });

    // The buyer paid the discounted price; the payment stands and is counted.
    it('honours a payment that lands over the cap and still counts it', async () => {
      const h = harness({
        promotion: { maximumRedemptions: 3, redemptionCount: 3 },
      });

      await h.service.settlePayment('payment-1', 'WEBHOOK');

      expect(h.subscription.status).toBe(SubscriptionStatus.ACTIVE);
      expect(h.promotion?.redemptionCount).toBe(4);
    });
  });

  describe('public signup orders', () => {
    it('confirms a paid order through the same confirmPayment the Stripe webhook uses', async () => {
      const h = harness({});
      h.setProviderState({ providerPaymentId: 'track_order' });

      await expect(h.service.settleOrder('order-1', 'RETURN')).resolves.toBe(
        SubscriptionOrderStatus.PAID,
      );
      expect(h.confirmPayment).toHaveBeenCalledWith({
        orderId: 'order-1',
        correlationId: 'track_order',
      });
    });

    it('fails an order paid for the wrong amount instead of provisioning it', async () => {
      const h = harness({});
      h.setProviderState({ amount: '1.00' });

      await expect(h.service.settleOrder('order-1', 'WEBHOOK')).resolves.toBe(
        SubscriptionOrderStatus.FAILED,
      );
      expect(h.confirmPayment).not.toHaveBeenCalled();
      expect(h.order.status).toBe(SubscriptionOrderStatus.FAILED);
    });

    it('does not provision an unpaid order', async () => {
      const h = harness({});
      h.setProviderState({ status: 'PENDING' });

      await h.service.settleOrder('order-1', 'RETURN');
      expect(h.confirmPayment).not.toHaveBeenCalled();
    });
  });

  describe('handleProviderEvent', () => {
    it('settles the payment a webhook names', async () => {
      const h = harness({});

      await expect(
        h.service.handleProviderEvent(PaymentProvider.SAFEPAY, {
          externalEventId: 'evt_1',
          eventType: 'payment.succeeded',
          providerPaymentId: 'track_abc',
          storedPayload: {},
        }),
      ).resolves.toBe('PROCESSED');
      expect(h.payment.status).toBe(PaymentStatus.SUCCEEDED);
    });

    it('ignores an event that names no payment', async () => {
      const h = harness({});
      await expect(
        h.service.handleProviderEvent(PaymentProvider.SAFEPAY, {
          externalEventId: 'evt_2',
          eventType: 'payment.succeeded',
          providerPaymentId: null,
          storedPayload: {},
        }),
      ).resolves.toBe('IGNORED');
      expect(h.fetchPayment).not.toHaveBeenCalled();
    });
  });
});
