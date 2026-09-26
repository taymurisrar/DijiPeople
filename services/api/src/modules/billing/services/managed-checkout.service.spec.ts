import { ConflictException } from '@nestjs/common';
import {
  BillingCycle,
  BillingInterval,
  BillingModel,
  DiscountType,
  InvoiceStatus,
  PaymentProvider,
  PaymentStatus,
  Prisma,
  PromotionScope,
  SubscriptionStatus,
} from '@prisma/client';
import { AppError } from '../../../common/errors/app-error';
import { ManagedCheckoutService } from './managed-checkout.service';
import { TaxBasisService } from './tax-basis.service';

type Row = Record<string, unknown>;

const TENANT = 'tenant-1';

const planPrice = {
  id: 'price-pro-pkr',
  planId: 'plan-pro',
  billingCycle: BillingCycle.MONTHLY,
  billingInterval: BillingInterval.MONTH,
  billingModel: BillingModel.PER_SEAT,
  includedSeats: 0,
  unitAmount: new Prisma.Decimal('5000'),
  currency: 'PKR',
  market: { code: 'PK', taxProfileRef: null },
  plan: { id: 'plan-pro' },
} as never;

function harness(
  options: {
    subscriptionStatus?: SubscriptionStatus | null;
    promotion?: Row | null;
  } = {},
) {
  const payments: Row[] = [];
  const invoices: Row[] = [];
  const subscriptions: Row[] = [];

  const tx = {
    $executeRaw: () => Promise.resolve(0),
    payment: {
      findFirst: ({ where }: { where: Row }) =>
        Promise.resolve(
          [...payments]
            .reverse()
            .filter(
              (payment) =>
                payment.tenantId === where.tenantId &&
                payment.status === PaymentStatus.PENDING,
            )
            .map((payment) => ({
              ...payment,
              invoice: invoices.find(
                (invoice) => invoice.id === payment.invoiceId,
              ),
            }))[0] ?? null,
        ),
      create: ({ data }: { data: Row }) => {
        const row = {
          id: `payment-${payments.length + 1}`,
          createdAt: new Date(),
          providerCheckoutUrl: null,
          ...data,
          amount: new Prisma.Decimal(String(data.amount)),
        };
        payments.push(row);
        return Promise.resolve(row);
      },
      count: () => Promise.resolve(0),
    },
    invoice: {
      create: ({ data }: { data: Row }) => {
        const row = { id: `invoice-${invoices.length + 1}`, ...data };
        invoices.push(row);
        return Promise.resolve(row);
      },
      update: ({ where, data }: { where: Row; data: Row }) => {
        const row = invoices.find((invoice) => invoice.id === where.id);
        Object.assign(row ?? {}, data);
        return Promise.resolve(row);
      },
    },
    subscription: {
      create: ({ data }: { data: Row }) => {
        const row = { id: 'sub-new', ...data };
        subscriptions.push(row);
        return Promise.resolve(row);
      },
    },
    promotion: {
      findUniqueOrThrow: () =>
        Promise.resolve({
          maximumRedemptions: options.promotion?.maximumRedemptions ?? null,
          redemptionCount: options.promotion?.redemptionCount ?? 0,
        }),
    },
  };

  const prisma = {
    ...tx,
    tenant: {
      findUnique: () =>
        Promise.resolve({
          id: TENANT,
          customerAccountId: 'cust-1',
          customerAccount: { country: 'PK' },
          subscription:
            options.subscriptionStatus === undefined ||
            options.subscriptionStatus === null
              ? null
              : { id: 'sub-1', status: options.subscriptionStatus },
        }),
    },
    promotion: {
      findFirst: () => Promise.resolve(options.promotion ?? null),
    },
    payment: {
      ...tx.payment,
      update: ({ where, data }: { where: Row; data: Row }) => {
        const row = payments.find((payment) => payment.id === where.id);
        Object.assign(row ?? {}, data);
        return Promise.resolve(row);
      },
      findFirst: ({ where }: { where: Row }) =>
        Promise.resolve(
          payments.find(
            (payment) =>
              payment.id === where.id && payment.tenantId === where.tenantId,
          ) ?? null,
        ),
    },
    $transaction: <T>(work: (client: unknown) => Promise<T>) => work(tx),
  };

  const createCheckout = jest.fn((input: { reference: string }) =>
    Promise.resolve({
      providerPaymentId: `track_${input.reference}`,
      checkoutUrl: `https://sandbox.api.getsafepay.com/embedded/?tracker=track_${input.reference}`,
    }),
  );
  const gateway = { provider: PaymentProvider.SAFEPAY, createCheckout };
  const gateways = {
    require: () => gateway,
    isManaged: (provider: PaymentProvider | null) =>
      Boolean(provider) && provider !== PaymentProvider.STRIPE,
  };
  const settlePayment = jest.fn(() => Promise.resolve(PaymentStatus.PENDING));

  const service = new ManagedCheckoutService(
    prisma as never,
    gateways as never,
    new TaxBasisService(),
    { settlePayment } as never,
    { log: () => Promise.resolve() } as never,
  );

  const start = (overrides: Record<string, unknown> = {}) =>
    service.startSubscriptionCheckout({
      tenantId: TENANT,
      userId: 'user-1',
      provider: PaymentProvider.SAFEPAY,
      planPrice,
      seats: 5,
      returnUrls: (paymentId) => ({
        successUrl: `https://app.test/success?payment=${paymentId}`,
        cancelUrl: `https://app.test/cancel?payment=${paymentId}`,
      }),
      ...overrides,
    });

  return {
    service,
    start,
    payments,
    invoices,
    subscriptions,
    createCheckout,
    settlePayment,
  };
}

describe('ManagedCheckoutService', () => {
  it('prices the checkout on the server and opens it with the provider', async () => {
    const h = harness();

    const result = await h.start();

    expect(result).toMatchObject({
      provider: PaymentProvider.SAFEPAY,
      amount: 25000,
      currency: 'PKR',
      reused: false,
    });
    expect(h.createCheckout).toHaveBeenCalledWith(
      expect.objectContaining({
        reference: result.paymentId,
        amount: '25000.00',
        currency: 'PKR',
      }),
    );
    expect(h.subscriptions).toEqual([
      expect.objectContaining({
        status: SubscriptionStatus.INCOMPLETE,
        paymentProvider: PaymentProvider.SAFEPAY,
      }),
    ]);
    expect(h.invoices[0]).toMatchObject({
      status: InvoiceStatus.ISSUED,
      metadataJson: { kind: 'INITIAL', seats: 5 },
    });
    expect(h.payments[0]).toMatchObject({
      status: PaymentStatus.PENDING,
      providerPaymentId: `track_${result.paymentId}`,
    });
  });

  it('applies a valid percentage coupon', async () => {
    const h = harness({
      promotion: {
        id: 'promo-1',
        isActive: true,
        discountType: DiscountType.PERCENTAGE,
        percentOff: 20,
        amountOff: null,
        currency: null,
        scope: PromotionScope.GLOBAL,
        planId: null,
        planPriceId: null,
        customerAccountId: null,
        startsAt: new Date('2026-01-01'),
        redeemBy: null,
        maximumRedemptions: null,
        redemptionCount: 0,
      },
    });

    const result = await h.start({ promotionCode: 'WELCOME20' });

    expect(result.amount).toBe(20000);
    expect(h.invoices[0].metadataJson).toMatchObject({
      promotionId: 'promo-1',
    });
  });

  it('refuses a fixed PKR coupon on a purchase in another currency', async () => {
    const h = harness({
      promotion: {
        id: 'promo-1',
        isActive: true,
        discountType: DiscountType.FLAT,
        percentOff: null,
        amountOff: 5000,
        currency: 'USD',
        scope: PromotionScope.GLOBAL,
        planId: null,
        planPriceId: null,
        customerAccountId: null,
        startsAt: new Date('2026-01-01'),
        redeemBy: null,
        maximumRedemptions: null,
        redemptionCount: 0,
      },
    });

    await expect(h.start({ promotionCode: 'USD5K' })).rejects.toMatchObject({
      errorCode: 'BILLING_PROMOTION_INVALID',
      details: { reason: 'CURRENCY_MISMATCH' },
    });
    expect(h.createCheckout).not.toHaveBeenCalled();
  });

  it('refuses an unknown coupon without opening a checkout', async () => {
    const h = harness();
    await expect(h.start({ promotionCode: 'NOPE' })).rejects.toBeInstanceOf(
      AppError,
    );
    expect(h.createCheckout).not.toHaveBeenCalled();
  });

  it('refuses a tenant whose subscription is already active', async () => {
    const h = harness({ subscriptionStatus: SubscriptionStatus.ACTIVE });
    await expect(h.start()).rejects.toBeInstanceOf(ConflictException);
  });

  // A double click must not open two chargeable provider pages.
  it('returns the same checkout for a repeated identical request', async () => {
    const h = harness();

    const first = await h.start();
    const second = await h.start();

    expect(second).toMatchObject({ paymentId: first.paymentId, reused: true });
    expect(h.createCheckout).toHaveBeenCalledTimes(1);
  });

  it('never shows one tenant another tenant’s payment', async () => {
    const h = harness();
    const { paymentId } = await h.start();

    await expect(
      h.service.getTenantPayment('another-tenant', paymentId),
    ).rejects.toMatchObject({ errorCode: 'PAYMENT_NOT_FOUND' });
  });

  it('re-verifies a pending payment when the buyer returns', async () => {
    const h = harness();
    const { paymentId } = await h.start();

    await expect(
      h.service.getTenantPayment(TENANT, paymentId),
    ).resolves.toMatchObject({ id: paymentId, status: PaymentStatus.PENDING });
    expect(h.settlePayment).toHaveBeenCalledWith(paymentId, 'RETURN');
  });
});
