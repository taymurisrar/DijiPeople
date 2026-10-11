import {
  BillingCycle,
  BillingInterval,
  BillingModel,
  CommercialPublicationStatus,
  CommercialSalesModel,
  PaymentProvider,
  Prisma,
  StripeEnvironment,
  StripeSyncStatus,
} from '@prisma/client';
import { BadRequestException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { BillingService } from './billing.service';
import { PaymentGateways } from '../providers/payment-gateways';
import { SafepayGateway } from '../providers/safepay.gateway';
import { CreateCheckoutSessionDto } from '../dto/create-checkout-session.dto';
import { PublicSubscribeDto } from '../dto/public-subscribe.dto';

/**
 * WS12 — Safepay as a customer-selectable provider beside Stripe.
 *
 * The buyer may choose among the providers the server offers for a price, and
 * nothing beyond them. No choice keeps currency routing exactly as before.
 * No network: Stripe and the managed checkout are mocks, and Safepay is only
 * asked whether it is enabled and configured.
 */

const SAFEPAY_ON: Record<string, string> = {
  SAFEPAY_ENABLED: 'true',
  SAFEPAY_ENVIRONMENT: 'sandbox',
  SAFEPAY_API_KEY: 'sec_test',
  SAFEPAY_SECRET_KEY: 'secret_test',
  SAFEPAY_WEBHOOK_SECRET: 'whsec_test',
};

const PLAN = {
  id: 'plan-1',
  key: 'starter',
  name: 'Starter',
  isActive: true,
  publicationStatus: CommercialPublicationStatus.PUBLISHED,
  salesModel: CommercialSalesModel.SELF_SERVICE,
};

function planPrice(overrides: Record<string, unknown> = {}) {
  return {
    id: 'price-1',
    planId: PLAN.id,
    marketId: 'market-pk',
    currency: 'PKR',
    billingInterval: BillingInterval.MONTH,
    billingCycle: BillingCycle.MONTHLY,
    billingModel: BillingModel.PER_SEAT,
    unitAmount: new Prisma.Decimal(1000),
    minimumSeats: 1,
    maximumSeats: null,
    includedSeats: 0,
    effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
    effectiveTo: null,
    publicationStatus: CommercialPublicationStatus.PUBLISHED,
    salesModel: CommercialSalesModel.SELF_SERVICE,
    isActive: true,
    // A Stripe Price synced for the running (test) environment.
    stripePriceId: 'price_test_pkr',
    stripeProductId: 'prod_test_1',
    stripeEnvironment: StripeEnvironment.TEST,
    stripeSyncStatus: StripeSyncStatus.SYNCED,
    stripeActive: true,
    stripeUsageType: 'licensed',
    stripeRecurringInterval: 'month',
    stripeVerifiedAt: new Date('2026-06-01T00:00:00.000Z'),
    plan: PLAN,
    market: null,
    ...overrides,
  };
}

const NO_STRIPE_PRICE = {
  stripePriceId: null,
  stripeProductId: null,
  stripeEnvironment: null,
  stripeSyncStatus: StripeSyncStatus.PENDING,
  stripeActive: false,
  stripeUsageType: null,
  stripeRecurringInterval: null,
  stripeVerifiedAt: null,
};

function buildService(options: {
  price: Record<string, unknown>;
  env?: Record<string, string>;
}) {
  const sessionsCreate = jest.fn().mockResolvedValue({
    id: 'cs_test_1',
    url: 'https://checkout.stripe.test/cs_test_1',
  });
  const startSubscriptionCheckout = jest.fn().mockResolvedValue({
    id: 'pay-1',
    paymentId: 'pay-1',
    provider: PaymentProvider.SAFEPAY,
    url: 'https://sandbox.api.getsafepay.com/embedded/?tracker=t',
    reused: false,
    amount: 1000,
    currency: 'PKR',
  });

  const prisma = {
    plan: { findMany: jest.fn() },
    planPrice: {
      findUnique: jest.fn().mockResolvedValue(options.price),
      update: jest.fn().mockResolvedValue(undefined),
    },
    subscription: { findUnique: jest.fn().mockResolvedValue(null) },
    tenant: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'tenant-1',
        slug: 'tenant-1',
        customerAccount: { id: 'ca-1', stripeCustomerId: 'cus_existing' },
      }),
    },
    customerAccount: { update: jest.fn() },
  };

  const stripeBillingService = {
    getRuntimeMode: () => 'test' as const,
    isSecretKeyConfigured: () => true,
    verifyRecurringPrice: jest.fn().mockResolvedValue({
      valid: true,
      livemode: false,
      active: true,
      productId: 'prod_test_1',
      usageType: 'licensed',
      recurringInterval: 'month',
      verifiedAt: new Date('2026-06-01T00:00:00.000Z'),
      reasons: [] as string[],
    }),
    client: { checkout: { sessions: { create: sessionsCreate } } },
  };

  const env = options.env ?? SAFEPAY_ON;
  const config = { get: (key: string) => env[key] ?? 'https://app.test' };

  const service = new BillingService(
    prisma as never,
    stripeBillingService as never,
    config as never,
    { openOrder: jest.fn() } as never,
    { issueCode: jest.fn() } as never,
    { acknowledgeMany: jest.fn() } as never,
    {
      resolveMarketForTenant: jest.fn().mockResolvedValue({ id: 'market-pk' }),
    } as never,
    new PaymentGateways(
      new SafepayGateway({ get: (key: string) => env[key] } as never),
    ),
    { startSubscriptionCheckout } as never,
  );

  return { service, prisma, sessionsCreate, startSubscriptionCheckout };
}

const checkout = (service: BillingService, provider?: PaymentProvider) =>
  service.createCheckoutSession({
    tenantId: 'tenant-1',
    userId: 'user-1',
    planPriceId: 'price-1',
    seatQuantity: 1,
    provider,
  });

describe('createCheckoutSession — provider choice (WS12)', () => {
  it('routes PKR to Safepay when no provider is sent, as before', async () => {
    const { service, startSubscriptionCheckout, sessionsCreate } = buildService(
      { price: planPrice() },
    );

    await checkout(service);

    expect(startSubscriptionCheckout).toHaveBeenCalledWith(
      expect.objectContaining({ provider: PaymentProvider.SAFEPAY }),
    );
    expect(sessionsCreate).not.toHaveBeenCalled();
  });

  it('routes a PKR buyer who chose Stripe to Stripe when the price has a Stripe Price', async () => {
    const { service, startSubscriptionCheckout, sessionsCreate } = buildService(
      { price: planPrice() },
    );

    const result = await checkout(service, PaymentProvider.STRIPE);

    expect(sessionsCreate).toHaveBeenCalledTimes(1);
    expect(startSubscriptionCheckout).not.toHaveBeenCalled();
    expect(result).toMatchObject({ provider: PaymentProvider.STRIPE });
  });

  it('refuses Stripe for a PKR price with no Stripe Price — 400 PAYMENT_PROVIDER_UNAVAILABLE', async () => {
    const { service, sessionsCreate, startSubscriptionCheckout } = buildService(
      { price: planPrice(NO_STRIPE_PRICE) },
    );

    const attempt = checkout(service, PaymentProvider.STRIPE);
    await expect(attempt).rejects.toBeInstanceOf(BadRequestException);
    await expect(attempt).rejects.toMatchObject({
      response: { code: 'PAYMENT_PROVIDER_UNAVAILABLE' },
    });
    expect(sessionsCreate).not.toHaveBeenCalled();
    expect(startSubscriptionCheckout).not.toHaveBeenCalled();
  });

  it('refuses Safepay for a USD price — the client cannot widen the offer', async () => {
    const { service, startSubscriptionCheckout } = buildService({
      price: planPrice({ currency: 'USD' }),
    });

    await expect(
      checkout(service, PaymentProvider.SAFEPAY),
    ).rejects.toMatchObject({
      response: { code: 'PAYMENT_PROVIDER_UNAVAILABLE' },
    });
    expect(startSubscriptionCheckout).not.toHaveBeenCalled();
  });

  it('refuses Safepay for PKR while Safepay routing is off', async () => {
    const { service } = buildService({
      price: planPrice(),
      env: { ...SAFEPAY_ON, SAFEPAY_ENABLED: 'false' },
    });

    await expect(
      checkout(service, PaymentProvider.SAFEPAY),
    ).rejects.toMatchObject({
      response: { code: 'PAYMENT_PROVIDER_UNAVAILABLE' },
    });
  });
});

describe('getPublicPlans — paymentProviders (WS12)', () => {
  function plansWith(price: Record<string, unknown>) {
    const { plan: _plan, market: _market, ...row } = price;
    return [
      {
        ...PLAN,
        description: null,
        sortOrder: 1,
        currency: 'PKR',
        monthlyBasePrice: new Prisma.Decimal(0),
        annualBasePrice: new Prisma.Decimal(0),
        metadataJson: null,
        features: [],
        prices: [row],
      },
    ];
  }

  it('offers Safepay first, then Stripe, for a PKR price with a synced Stripe Price', async () => {
    const price = planPrice();
    const { service, prisma } = buildService({ price });
    prisma.plan.findMany.mockResolvedValue(plansWith(price));

    const result = await service.getPublicPlans();

    expect(result.plans[0].prices[0].paymentProviders).toEqual([
      { key: PaymentProvider.SAFEPAY, label: 'Card (Safepay)' },
      { key: PaymentProvider.STRIPE, label: 'Card (Stripe)' },
    ]);
  });

  it('offers only Safepay for a PKR price with no Stripe Price', async () => {
    const price = planPrice(NO_STRIPE_PRICE);
    const { service, prisma } = buildService({ price });
    prisma.plan.findMany.mockResolvedValue(plansWith(price));

    const result = await service.getPublicPlans();

    expect(
      result.plans[0].prices[0].paymentProviders.map((option) => option.key),
    ).toEqual([PaymentProvider.SAFEPAY]);
  });
});

describe('checkout DTOs accept only real providers', () => {
  it.each([
    [
      CreateCheckoutSessionDto,
      { planPriceId: crypto.randomUUID(), seatQuantity: 1 },
    ],
    [
      PublicSubscribeDto,
      {
        planPriceId: crypto.randomUUID(),
        seatQuantity: 1,
        companyName: 'Acme',
        contactName: 'A Person',
        email: 'a@example.com',
        country: 'Pakistan',
      },
    ],
  ] as const)('%p', async (Dto, base) => {
    const errorsFor = async (provider: unknown) =>
      (
        await validate(plainToInstance(Dto as never, { ...base, provider }))
      ).filter((error) => error.property === 'provider');

    expect(await errorsFor(undefined)).toHaveLength(0);
    expect(await errorsFor('SAFEPAY')).toHaveLength(0);
    expect(await errorsFor('STRIPE')).toHaveLength(0);
    expect(await errorsFor('PAYFAST')).toHaveLength(1);
  });
});

describe('createPublicSubscriptionCheckout — one provider per order (WS12)', () => {
  function buildPublic(openOrder: {
    paymentProvider: PaymentProvider | null;
    providerPaymentId: string | null;
    stripeCheckoutSessionId: string | null;
  }) {
    const startOrderCheckout = jest.fn().mockResolvedValue({
      url: 'https://sandbox.api.getsafepay.com/embedded/?tracker=t',
      reused: false,
    });
    const prisma = {
      planPrice: {
        findUnique: jest.fn().mockResolvedValue(planPrice()),
        update: jest.fn(),
      },
      subscriptionOrder: {
        findUnique: jest.fn().mockResolvedValue({
          ownerEmailVerifiedAt: new Date('2026-10-01T00:00:00.000Z'),
          ...openOrder,
        }),
      },
    };
    const config = {
      get: (key: string) => SAFEPAY_ON[key] ?? 'https://landing.test',
    };
    const service = new BillingService(
      prisma as never,
      {
        getRuntimeMode: () => 'test' as const,
        isSecretKeyConfigured: () => true,
      } as never,
      config as never,
      {
        openOrder: jest.fn().mockResolvedValue({
          orderId: 'order-1',
          orderNumber: 'ORD-1',
          customerAccountId: 'ca-1',
          reused: true,
          stripeCheckoutSessionId: openOrder.stripeCheckoutSessionId,
        }),
      } as never,
      { issueCode: jest.fn() } as never,
      { acknowledgeMany: jest.fn() } as never,
      {} as never,
      new PaymentGateways(
        new SafepayGateway({ get: (key: string) => SAFEPAY_ON[key] } as never),
      ),
      { startOrderCheckout } as never,
    );
    const submit = (provider?: PaymentProvider) =>
      service.createPublicSubscriptionCheckout({
        planPriceId: 'price-1',
        seatQuantity: 1,
        companyName: 'Acme',
        contactName: 'A Person',
        email: 'a@example.com',
        country: 'Pakistan',
        provider,
      });
    return { submit, startOrderCheckout };
  }

  // A Stripe session can still be paid; a Safepay tracker beside it would let
  // a late Stripe payment provision the subscription as SAFEPAY.
  it('refuses an explicit switch to Safepay once a Stripe session is open — 409', async () => {
    const { submit, startOrderCheckout } = buildPublic({
      paymentProvider: null,
      providerPaymentId: null,
      stripeCheckoutSessionId: 'cs_open',
    });

    await expect(submit(PaymentProvider.SAFEPAY)).rejects.toMatchObject({
      response: { code: 'PAYMENT_PROVIDER_LOCKED' },
    });
    expect(startOrderCheckout).not.toHaveBeenCalled();
  });

  it("keeps today's behaviour when no provider is sent", async () => {
    const { submit, startOrderCheckout } = buildPublic({
      paymentProvider: null,
      providerPaymentId: null,
      stripeCheckoutSessionId: 'cs_open',
    });

    await submit();

    expect(startOrderCheckout).toHaveBeenCalledWith(
      expect.objectContaining({ provider: PaymentProvider.SAFEPAY }),
    );
  });

  it('opens Safepay for an explicit choice when no other checkout is open', async () => {
    const { submit, startOrderCheckout } = buildPublic({
      paymentProvider: PaymentProvider.SAFEPAY,
      providerPaymentId: 'track_1',
      stripeCheckoutSessionId: null,
    });

    await submit(PaymentProvider.SAFEPAY);

    expect(startOrderCheckout).toHaveBeenCalledTimes(1);
  });
});
