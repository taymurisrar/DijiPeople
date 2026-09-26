import {
  InvoiceStatus,
  PaymentMethod,
  PaymentProvider,
  PaymentStatus,
  Prisma,
  PrismaClient,
  SubscriptionStatus,
} from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { DbFixtures, describeWithDatabase } from './helpers/db-fixtures';
import { PaymentSettlementService } from '../src/modules/billing/services/payment-settlement.service';
import type { PrismaService } from '../src/common/prisma/prisma.service';

/**
 * Safepay settlement against a real PostgreSQL.
 *
 * WHY THIS CANNOT BE A MOCKED TEST. The promise is "a payment is credited
 * once, however many confirmations arrive at the same moment" — a webhook, the
 * buyer's return page and the sweeper can all ask at once. That rests on a
 * conditional UPDATE under PostgreSQL's row locking and on unique indexes, and
 * a Prisma double proves neither: it returns whatever the test told it to.
 */
function createTestPrismaClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString) {
    throw new Error('DATABASE_URL is required for database-backed tests.');
  }
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

describeWithDatabase()('Safepay payment settlement (DB-backed)', () => {
  jest.setTimeout(180_000);

  const prisma = createTestPrismaClient();
  const fixtures = new DbFixtures(prisma, 'safepay-settlement');
  const tracker = `track_${fixtures.runId}`;

  const settlement = new PaymentSettlementService(
    prisma as unknown as PrismaService,
    {
      isManaged: (provider: PaymentProvider | null) =>
        Boolean(provider) && provider !== PaymentProvider.STRIPE,
      get: () => ({
        fetchPayment: async () => ({
          status: 'PAID' as const,
          providerPaymentId: tracker,
          amount: '25000.00',
          currency: 'PKR',
          providerReference: 'ch_e2e',
          reference: null,
          failureCode: null,
          failureMessage: null,
        }),
      }),
    } as never,
    {
      confirmPayment: async () => ({ orderId: null, alreadyConfirmed: false }),
    } as never,
    { log: async () => undefined } as never,
  );

  let tenantId: string;
  let planId: string;
  let planPriceId: string;
  let subscriptionId: string;
  let paymentId: string;

  beforeAll(async () => {
    await prisma.$connect();
    tenantId = (await fixtures.createTenant('safepay')).id;

    planId = (
      await prisma.plan.create({
        data: {
          key: `safepay-${fixtures.runId}`,
          name: `Safepay ${fixtures.runId}`,
          currency: 'PKR',
        },
        select: { id: true },
      })
    ).id;
    planPriceId = (
      await prisma.planPrice.create({
        data: {
          planId,
          billingCycle: 'MONTHLY',
          currency: 'PKR',
          unitAmount: 5000,
          isActive: true,
        },
        select: { id: true },
      })
    ).id;
    subscriptionId = (
      await prisma.subscription.create({
        data: {
          tenantId,
          planId,
          planPriceId,
          startDate: new Date(),
          status: SubscriptionStatus.INCOMPLETE,
          paymentProvider: PaymentProvider.SAFEPAY,
          purchasedSeats: 5,
        },
        select: { id: true },
      })
    ).id;
    const invoice = await prisma.invoice.create({
      data: {
        tenantId,
        subscriptionId,
        invoiceNumber: `INV-E2E-${fixtures.runId}`,
        amount: 25000,
        currency: 'PKR',
        issueDate: new Date(),
        dueDate: new Date(),
        status: InvoiceStatus.ISSUED,
        amountDue: 25000,
        metadataJson: {
          kind: 'INITIAL',
          planId,
          planPriceId,
          seats: 5,
          promotionId: null,
        },
      },
      select: { id: true },
    });
    paymentId = (
      await prisma.payment.create({
        data: {
          tenantId,
          subscriptionId,
          invoiceId: invoice.id,
          amount: 25000,
          currency: 'PKR',
          paymentMethod: PaymentMethod.OTHER,
          status: PaymentStatus.PENDING,
          paymentProvider: PaymentProvider.SAFEPAY,
          providerPaymentId: tracker,
        },
        select: { id: true },
      })
    ).id;
  });

  afterAll(async () => {
    await prisma.refundRequest.deleteMany({ where: { tenantId } });
    await prisma.paymentProviderEvent.deleteMany({
      where: { providerPaymentId: tracker },
    });
    await prisma.payment.deleteMany({ where: { tenantId } });
    await prisma.invoice.deleteMany({ where: { tenantId } });
    await prisma.subscription.deleteMany({ where: { tenantId } });
    await prisma.planPrice.deleteMany({ where: { planId } });
    await prisma.plan.deleteMany({ where: { id: planId } });
    await fixtures.cleanup();
    await prisma.$disconnect();
  });

  it('credits a payment exactly once when confirmations race', async () => {
    const before = new Date();

    await Promise.all(
      Array.from({ length: 5 }, () =>
        settlement.settlePayment(paymentId, 'WEBHOOK'),
      ),
    );

    const [payment, subscription, refunds] = await Promise.all([
      prisma.payment.findUniqueOrThrow({ where: { id: paymentId } }),
      prisma.subscription.findUniqueOrThrow({ where: { id: subscriptionId } }),
      prisma.refundRequest.count({ where: { tenantId } }),
    ]);

    expect(payment.status).toBe(PaymentStatus.SUCCEEDED);
    expect(payment.providerReference).toBe('ch_e2e');
    expect(subscription.status).toBe(SubscriptionStatus.ACTIVE);
    expect(subscription.currentPeriodStart?.getTime()).toBeGreaterThanOrEqual(
      before.getTime() - 1000,
    );
    // Five confirmations, one credit: no duplicate was mistaken for a second
    // payment and turned into a refund.
    expect(refunds).toBe(0);
  });

  // Reviewer finding 5: two DIFFERENT paid checkouts for one invoice each won
  // their own payment row and both credited; the second charge was kept.
  it('credits one of two payments for the same invoice and refunds the other', async () => {
    const second = await fixtures.createTenant('safepay-two');
    const subscription = await prisma.subscription.create({
      data: {
        tenantId: second.id,
        planId,
        planPriceId,
        startDate: new Date(),
        status: SubscriptionStatus.INCOMPLETE,
        paymentProvider: PaymentProvider.SAFEPAY,
        purchasedSeats: 5,
      },
      select: { id: true },
    });
    const invoice = await prisma.invoice.create({
      data: {
        tenantId: second.id,
        subscriptionId: subscription.id,
        invoiceNumber: `INV-E2E2-${fixtures.runId}`,
        amount: 25000,
        currency: 'PKR',
        issueDate: new Date(),
        dueDate: new Date(),
        status: InvoiceStatus.ISSUED,
        amountDue: 25000,
        metadataJson: {
          kind: 'INITIAL',
          planId,
          planPriceId,
          seats: 5,
          promotionId: null,
        },
      },
      select: { id: true },
    });
    const payments = await Promise.all(
      ['a', 'b'].map((suffix) =>
        prisma.payment.create({
          data: {
            tenantId: second.id,
            subscriptionId: subscription.id,
            invoiceId: invoice.id,
            amount: 25000,
            currency: 'PKR',
            paymentMethod: PaymentMethod.OTHER,
            status: PaymentStatus.PENDING,
            paymentProvider: PaymentProvider.SAFEPAY,
            providerPaymentId: `${tracker}-${suffix}`,
          },
          select: { id: true },
        }),
      ),
    );

    try {
      await Promise.all(
        payments.map((payment) =>
          settlement.settlePayment(payment.id, 'WEBHOOK'),
        ),
      );

      const [refunds, activated] = await Promise.all([
        prisma.refundRequest.count({ where: { tenantId: second.id } }),
        prisma.subscription.findUniqueOrThrow({
          where: { id: subscription.id },
          select: { status: true },
        }),
      ]);
      expect(activated.status).toBe(SubscriptionStatus.ACTIVE);
      expect(refunds).toBe(1);
    } finally {
      await prisma.refundRequest.deleteMany({ where: { tenantId: second.id } });
      await prisma.payment.deleteMany({ where: { tenantId: second.id } });
      await prisma.invoice.deleteMany({ where: { tenantId: second.id } });
      await prisma.subscription.deleteMany({ where: { tenantId: second.id } });
    }
  });

  it('refuses a second payment row for the same provider checkout', async () => {
    await expect(
      prisma.payment.create({
        data: {
          tenantId,
          subscriptionId,
          amount: 1,
          currency: 'PKR',
          paymentMethod: PaymentMethod.OTHER,
          paymentProvider: PaymentProvider.SAFEPAY,
          providerPaymentId: tracker,
        },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });

  it('records a provider webhook event once', async () => {
    const event = {
      provider: PaymentProvider.SAFEPAY,
      externalEventId: `evt_${fixtures.runId}`,
      eventType: 'payment.succeeded',
      providerPaymentId: tracker,
      payloadJson: {} as Prisma.InputJsonValue,
    };
    await prisma.paymentProviderEvent.create({ data: event });

    await expect(
      prisma.paymentProviderEvent.create({ data: event }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });
});
