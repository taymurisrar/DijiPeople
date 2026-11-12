import { PrismaClient, SubscriptionOrderStatus } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import type { ConfigService } from '@nestjs/config';
import { DbFixtures, describeWithDatabase } from './helpers/db-fixtures';
import { PaymentSettlementService } from '../src/modules/billing/services/payment-settlement.service';
import type { PrismaService } from '../src/common/prisma/prisma.service';
import { SecretEncryptionService } from '../src/common/security/secret-encryption.service';
import { OutboxService } from '../src/modules/outbox/outbox.service';
import { BankTransferService } from '../src/modules/billing/services/bank-transfer.service';
import { OrderActivationService } from '../src/modules/billing/services/order-activation.service';
import { PaymentMethodRegistryService } from '../src/modules/billing/services/payment-method-registry.service';
import { SubscriptionOrderService } from '../src/modules/billing/services/subscription-order.service';
import { CustomerIdentityService } from '../src/modules/billing/services/customer-identity.service';
import { TaxBasisService } from '../src/modules/billing/services/tax-basis.service';
import { BillingService } from '../src/modules/billing/services/billing.service';
import { OwnerEmailVerificationService } from '../src/modules/billing/services/owner-email-verification.service';
import { PaymentGateways } from '../src/modules/billing/providers/payment-gateways';
import { SafepayGateway } from '../src/modules/billing/providers/safepay.gateway';
import { PartnerReferralResolverService } from '../src/modules/partner-experience/partner-referral-resolver.service';

/**
 * Bank-transfer settlement against a real PostgreSQL (EXECPLAN-0045).
 *
 * WHY THIS CANNOT BE A MOCKED TEST. The guarantees are: one operator decision
 * wins however many arrive together; one bank credit settles one order; a
 * customer's claim, however convincing, never moves an order. The first two rest
 * on conditional UPDATEs and a unique index under real row locking, which a
 * Prisma double would only echo back.
 */
function createTestPrismaClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString) {
    throw new Error('DATABASE_URL is required for database-backed tests.');
  }
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

// A real PNG signature followed by padding: enough for the magic-byte check.
const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(64, 1),
]);

describeWithDatabase()('Bank-transfer settlement (DB-backed)', () => {
  jest.setTimeout(180_000);

  const prisma = createTestPrismaClient();
  const db = prisma as unknown as PrismaService;
  const runId = `bt-${Date.now()}`;

  const config = {
    get: (key: string) =>
      key === 'SECRET_ENCRYPTION_KEY' ? `e2e-key-${runId}` : undefined,
  } as unknown as ConfigService;
  const secrets = new SecretEncryptionService(config);

  const auditEntries: Array<{ action: string }> = [];
  const audit = {
    log: async (entry: { action: string }) => {
      auditEntries.push(entry);
    },
  };
  const savedFiles: string[] = [];
  const storage = {
    saveFile: async (input: { buffer: Buffer }) => {
      const key = `platform/payment-evidence/${runId}/${savedFiles.length}`;
      savedFiles.push(key);
      return {
        storageKey: key,
        size: input.buffer.length,
        checksumSha256: 'a'.repeat(64),
        storageProvider: 'test',
      };
    },
  };
  const mails: Array<{ eventCode: string }> = [];
  const communications = {
    sendEmail: async (input: { eventCode: string }) => {
      mails.push(input);
      return { sent: true };
    },
  };

  const registry = new PaymentMethodRegistryService(
    db,
    config,
    secrets,
    audit as never,
  );
  const activation = new OrderActivationService(
    db,
    new OutboxService(db) as never,
  );
  const bank = new BankTransferService(
    db,
    registry,
    secrets,
    storage as never,
    audit as never,
    activation,
    communications as never,
  );
  const orders = new SubscriptionOrderService(
    db,
    new CustomerIdentityService(),
    new TaxBasisService(),
    new OutboxService(db),
    new PartnerReferralResolverService(db),
  );

  const sentCodes: string[] = [];
  const verification = new OwnerEmailVerificationService(db, {
    sendEmail: async (input: { eventCode: string; text?: string }) => {
      const match = /\b(\d{6})\b/.exec(input.text ?? '');
      if (input.eventCode === 'ONBOARDING_EMAIL_VERIFICATION' && match) {
        sentCodes.push(match[1]);
      }
      return { sent: true };
    },
  } as never);
  const landingConfig = {
    get: (key: string) => {
      if (key === 'LANDING_APP_URL') return 'https://landing.test';
      // A sandbox Safepay so the card path is reachable and the lock is what stops it.
      if (key === 'SAFEPAY_ENABLED') return 'true';
      if (key === 'SAFEPAY_ENVIRONMENT') return 'sandbox';
      if (key.startsWith('SAFEPAY_')) return `dummy-${key}`;
      return config.get(key);
    },
  } as unknown as ConfigService;
  const billing = new BillingService(
    db,
    {
      getRuntimeMode: () => 'test',
      isSecretKeyConfigured: () => false,
    } as never,
    landingConfig,
    orders,
    verification,
    { acknowledgeMany: async () => undefined } as never,
    { resolveMarketForTenant: async () => null } as never,
    new PaymentGateways(new SafepayGateway(landingConfig)),
    {} as never,
    registry,
    bank,
  );

  const alice = { platformUserId: `alice-${runId}` };
  const bob = { platformUserId: `bob-${runId}` };

  let marketId: string;
  let planId: string;
  let planPriceId: string;
  let configId: string;
  const customerIds: string[] = [];
  const orderIds: string[] = [];

  async function makeOrder(
    suffix: string,
    overrides: Record<string, unknown> = {},
  ) {
    const customer = await prisma.customerAccount.create({
      data: {
        companyName: `Bank Co ${suffix} ${runId}`,
        country: 'PK',
        contactEmail: `owner-${suffix}-${runId}@example.test`,
        primaryContactEmail: `owner-${suffix}-${runId}@example.test`,
      } as never,
      select: { id: true },
    });
    customerIds.push(customer.id);
    const order = await prisma.subscriptionOrder.create({
      data: {
        orderNumber: `ORD-${suffix}-${runId}`,
        customerAccountId: customer.id,
        planId,
        planPriceId,
        marketId,
        currency: 'PKR',
        billingCycle: 'MONTHLY',
        billingInterval: 'MONTH',
        requestedSeats: 5,
        unitAmount: 5000,
        subtotalAmount: 25000,
        taxableAmount: 25000,
        totalAmount: 25000,
        status: SubscriptionOrderStatus.DRAFT,
        ownerEmailVerifiedAt: new Date(),
        ...overrides,
      },
      select: { id: true },
    });
    orderIds.push(order.id);
    return order.id;
  }

  beforeAll(async () => {
    await prisma.$connect();
    marketId = (
      await prisma.market.create({
        data: {
          code: `PK-${runId}`,
          name: 'Pakistan test',
          defaultCurrency: 'PKR',
          supportedCurrencies: ['PKR'],
          publicationStatus: 'PUBLISHED',
          isEnabled: true,
          selfServiceEnabled: true,
        },
        select: { id: true },
      })
    ).id;
    planId = (
      await prisma.plan.create({
        data: {
          key: `bt-plan-${runId}`,
          name: `BT ${runId}`,
          currency: 'PKR',
          publicationStatus: 'PUBLISHED',
        },
        select: { id: true },
      })
    ).id;
    planPriceId = (
      await prisma.planPrice.create({
        data: {
          planId,
          marketId,
          billingCycle: 'MONTHLY',
          currency: 'PKR',
          unitAmount: 5000,
          isActive: true,
          publicationStatus: 'PUBLISHED',
        },
        select: { id: true },
      })
    ).id;
  });

  afterAll(async () => {
    await prisma.bankTransferEvidence.deleteMany({
      where: { claim: { subscriptionOrderId: { in: orderIds } } },
    });
    await prisma.bankTransferClaim.deleteMany({
      where: { subscriptionOrderId: { in: orderIds } },
    });
    await prisma.outboxEvent.deleteMany({
      where: { customerAccountId: { in: customerIds } },
    });
    await prisma.subscriptionOrder.deleteMany({
      where: { id: { in: orderIds } },
    });
    await prisma.customerAccount.deleteMany({
      where: { id: { in: customerIds } },
    });
    await prisma.bankReceivingAccount.deleteMany({
      where: { paymentMethodConfig: { marketId } },
    });
    await prisma.paymentMethodConfiguration.deleteMany({ where: { marketId } });
    await prisma.planPrice.deleteMany({ where: { planId } });
    await prisma.plan.deleteMany({ where: { id: planId } });
    await prisma.market.deleteMany({ where: { id: marketId } });
    await prisma.$disconnect();
  });

  it('offers no bank transfer, and says so honestly, until an approved account exists', async () => {
    const options = await registry.listPublicOptions({
      marketId,
      currency: 'PKR',
      cardProviders: [],
    });
    expect(options.options).toEqual([]);
    expect(options.assistedInvoiceFallback).toBe(true);

    const orderId = await makeOrder('early');
    await expect(bank.issueInvoice(orderId)).rejects.toMatchObject({
      response: { code: 'BANK_TRANSFER_UNAVAILABLE' },
    });
  });

  it('configures a method and account under separation of duties', async () => {
    const created = await registry.createConfiguration(
      {
        marketId,
        currency: 'PKR',
        methodKey: 'BANK_TRANSFER',
        displayName: 'Bank transfer / Raast',
      },
      alice,
    );
    configId = created.id;
    expect(created.enabled).toBe(false);

    // Cannot be enabled before it is approved and has an approved account.
    await expect(
      registry.setEnabled(configId, true, alice),
    ).rejects.toMatchObject({
      response: { code: 'PAYMENT_METHOD_NOT_READY' },
    });

    const account = await registry.createAccount(
      configId,
      {
        bankName: 'Test Bank',
        accountTitle: 'DijiPeople Test Co',
        // A valid IBAN shape (checksum-correct example from the IBAN registry).
        iban: 'GB82 WEST 1234 5698 7654 32',
        raastId: '03001234567',
        paymentInstructions: 'Quote the reference in the narration.',
      },
      alice,
    );
    // The masked projection is all that the admin list ever carries.
    expect(JSON.stringify(account)).not.toContain('WEST12345698765432');
    expect(account.maskedIban).toContain('•');

    // The operator who entered the account cannot approve it.
    await expect(
      registry.decideAccount(account.id, 'APPROVE', undefined, alice),
    ).rejects.toMatchObject({ response: { code: 'SEPARATION_OF_DUTIES' } });

    await registry.decideAccount(account.id, 'APPROVE', undefined, bob);
    await registry.activateAccount(account.id, bob);
    await registry.setApproval(configId, 'APPROVED', bob);
    await registry.setEnabled(configId, true, bob);

    const ready = await registry.findReadyBankTransfer({
      marketId,
      currency: 'PKR',
    });
    expect(ready?.account.id).toBe(account.id);
    // Stored encrypted at rest.
    expect(ready?.account.ibanEncrypted).not.toContain('GB82');
    // And never offered to another currency.
    expect(
      await registry.findReadyBankTransfer({ marketId, currency: 'USD' }),
    ).toBeNull();
  });

  it('refuses an invoice before the owner email is verified', async () => {
    const orderId = await makeOrder('unverified', {
      ownerEmailVerifiedAt: null,
    });
    await expect(bank.issueInvoice(orderId)).rejects.toMatchObject({
      response: { code: 'OWNER_EMAIL_NOT_VERIFIED' },
    });
  });

  it('issues exactly one invoice and reference however many requests race', async () => {
    const orderId = await makeOrder('race');
    const results = await Promise.all(
      Array.from({ length: 6 }, () => bank.issueInvoice(orderId)),
    );
    expect(new Set(results.map((r) => r.reference)).size).toBe(1);
    expect(results[0].reference).toMatch(/^DP-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    expect(results[0].amount).toBe('25000.00');
    expect(results[0].instructions.iban).toBe('GB82WEST12345698765432');
    const order = await prisma.subscriptionOrder.findUniqueOrThrow({
      where: { id: orderId },
    });
    expect(order.status).toBe(SubscriptionOrderStatus.PENDING_PAYMENT);
    expect(order.expiresAt).not.toBeNull();
  });

  it('never activates on a customer claim, and rejects hostile evidence', async () => {
    const orderId = await makeOrder('claim');
    await bank.issueInvoice(orderId);

    await expect(
      bank.submitClaim(orderId, { transactionReference: 'TXN-12345' }, [
        {
          buffer: Buffer.from('<script>alert(1)</script>'),
          originalName: 'receipt.png',
        },
      ]),
    ).rejects.toMatchObject({ response: { code: 'EVIDENCE_TYPE_INVALID' } });

    const claim = await bank.submitClaim(
      orderId,
      { transactionReference: 'TXN-12345', amount: '25000.00' },
      [{ buffer: PNG, originalName: '../../etc/receipt.png' }],
    );
    expect(claim.status).toBe('PENDING_VERIFICATION');

    // A second submission while one is pending is refused.
    await expect(
      bank.submitClaim(orderId, { transactionReference: 'TXN-99999' }),
    ).rejects.toMatchObject({ response: { code: 'CLAIM_ALREADY_PENDING' } });

    const order = await prisma.subscriptionOrder.findUniqueOrThrow({
      where: { id: orderId },
    });
    expect(order.status).toBe(SubscriptionOrderStatus.PENDING_PAYMENT);
    expect(order.paidAt).toBeNull();
    const events = await prisma.outboxEvent.count({
      where: { aggregateId: orderId },
    });
    expect(events).toBe(0);

    // Evidence is stored quarantined, with a sanitised name.
    const evidence = await prisma.bankTransferEvidence.findFirstOrThrow({
      where: { claimId: claim.claimId },
    });
    expect(evidence.scanStatus).toBe('QUARANTINED');
    expect(evidence.originalFileName).toBe('receipt.png');

    // The sweeper must not age the order out from under the pending claim.
    await prisma.subscriptionOrder.update({
      where: { id: orderId },
      data: { expiresAt: new Date(Date.now() - 86_400_000) },
    });
    await orders.abandonExpired();
    expect(
      (
        await prisma.subscriptionOrder.findUniqueOrThrow({
          where: { id: orderId },
        })
      ).status,
    ).toBe(SubscriptionOrderStatus.PENDING_PAYMENT);
  });

  it('refuses to settle a part payment, an overpayment or the wrong currency', async () => {
    const orderId = await makeOrder('amount');
    await bank.issueInvoice(orderId);
    const { claimId } = await bank.submitClaim(orderId, {
      transactionReference: 'TXN-AMOUNT',
    });

    const attempt = (receivedAmount: string, currency = 'PKR') =>
      bank.approveClaim(
        claimId,
        {
          bankStatementReference: `STMT-${receivedAmount}-${currency}`,
          receivedAmount,
          currency,
        },
        bob,
      );
    await expect(attempt('24999.99')).rejects.toMatchObject({
      response: { code: 'PAYMENT_UNDERPAID' },
    });
    await expect(attempt('25000.01')).rejects.toMatchObject({
      response: { code: 'PAYMENT_OVERPAID' },
    });
    await expect(attempt('25000.00', 'USD')).rejects.toMatchObject({
      response: { code: 'PAYMENT_CURRENCY_MISMATCH' },
    });

    const order = await prisma.subscriptionOrder.findUniqueOrThrow({
      where: { id: orderId },
    });
    expect(order.status).toBe(SubscriptionOrderStatus.PENDING_PAYMENT);
    expect(
      (
        await prisma.bankTransferClaim.findUniqueOrThrow({
          where: { id: claimId },
        })
      ).status,
    ).toBe('PENDING_VERIFICATION');
  });

  it('settles once when operators approve concurrently, and emits one provisioning event', async () => {
    const orderId = await makeOrder('approve');
    await bank.issueInvoice(orderId);
    const { claimId } = await bank.submitClaim(orderId, {
      transactionReference: 'TXN-APPROVE',
    });

    const outcomes = await Promise.allSettled(
      Array.from({ length: 5 }, () =>
        bank.approveClaim(
          claimId,
          {
            bankStatementReference: `STMT-${runId}-A`,
            receivedAmount: '25000.00',
            currency: 'PKR',
          },
          bob,
        ),
      ),
    );
    // Every request either won, saw it already approved, or lost the race
    // cleanly — none may fail any other way.
    for (const outcome of outcomes) {
      if (outcome.status === 'rejected') {
        expect(outcome.reason).toMatchObject({
          response: { code: 'CLAIM_ALREADY_DECIDED' },
        });
      }
    }
    expect(outcomes.some((o) => o.status === 'fulfilled')).toBe(true);

    const order = await prisma.subscriptionOrder.findUniqueOrThrow({
      where: { id: orderId },
    });
    expect(order.status).toBe(SubscriptionOrderStatus.PAID);
    const events = await prisma.outboxEvent.count({
      where: { aggregateId: orderId, eventType: 'PAYMENT_CONFIRMED' },
    });
    expect(events).toBe(1);

    // A replay is harmless: still one event.
    await bank.approveClaim(
      claimId,
      {
        bankStatementReference: `STMT-${runId}-A`,
        receivedAmount: '25000.00',
        currency: 'PKR',
      },
      bob,
    );
    expect(
      await prisma.outboxEvent.count({
        where: { aggregateId: orderId, eventType: 'PAYMENT_CONFIRMED' },
      }),
    ).toBe(1);
  });

  it('refuses to let one bank credit settle two orders', async () => {
    const orderId = await makeOrder('dup');
    await bank.issueInvoice(orderId);
    const { claimId } = await bank.submitClaim(orderId, {
      transactionReference: 'TXN-DUP',
    });
    await expect(
      bank.approveClaim(
        claimId,
        {
          // Already used to settle the previous order.
          bankStatementReference: `STMT-${runId}-A`,
          receivedAmount: '25000.00',
          currency: 'PKR',
        },
        bob,
      ),
    ).rejects.toMatchObject({ response: { code: 'DUPLICATE_BANK_REFERENCE' } });

    const order = await prisma.subscriptionOrder.findUniqueOrThrow({
      where: { id: orderId },
    });
    expect(order.status).toBe(SubscriptionOrderStatus.PENDING_PAYMENT);
    expect(
      (
        await prisma.bankTransferClaim.findUniqueOrThrow({
          where: { id: claimId },
        })
      ).status,
    ).toBe('PENDING_VERIFICATION');
  });

  it('keeps a rejected order unpaid and lets the buyer submit again', async () => {
    const orderId = await makeOrder('reject');
    await bank.issueInvoice(orderId);
    const first = await bank.submitClaim(orderId, {
      transactionReference: 'TXN-BAD',
    });
    await bank.rejectClaim(first.claimId, 'No matching credit found.', bob);

    expect(
      (
        await prisma.subscriptionOrder.findUniqueOrThrow({
          where: { id: orderId },
        })
      ).status,
    ).toBe(SubscriptionOrderStatus.PENDING_PAYMENT);
    // A rejected claim cannot be approved afterwards.
    await expect(
      bank.approveClaim(
        first.claimId,
        {
          bankStatementReference: `STMT-${runId}-R`,
          receivedAmount: '25000.00',
          currency: 'PKR',
        },
        bob,
      ),
    ).rejects.toMatchObject({ response: { code: 'CLAIM_NOT_DECIDABLE' } });

    const second = await bank.submitClaim(orderId, {
      transactionReference: 'TXN-GOOD',
    });
    expect(second.claimId).not.toBe(first.claimId);
  });

  it('refuses money for an order that is no longer payable', async () => {
    const orderId = await makeOrder('late');
    await bank.issueInvoice(orderId);
    const { claimId } = await bank.submitClaim(orderId, {
      transactionReference: 'TXN-LATE',
    });
    await prisma.subscriptionOrder.update({
      where: { id: orderId },
      data: { status: SubscriptionOrderStatus.CANCELLED },
    });
    await expect(
      bank.approveClaim(
        claimId,
        {
          bankStatementReference: `STMT-${runId}-L`,
          receivedAmount: '25000.00',
          currency: 'PKR',
        },
        bob,
      ),
    ).rejects.toMatchObject({ response: { code: 'ORDER_NOT_PAYABLE' } });
    expect(
      await prisma.outboxEvent.count({ where: { aggregateId: orderId } }),
    ).toBe(0);
  });

  it('records the verified transfer as one paid invoice and one bank payment once the tenant exists', async () => {
    const fixtures = new DbFixtures(prisma, 'bank-record');
    const tenantId = (await fixtures.createTenant('bank-record')).id;
    try {
      const subscription = await prisma.subscription.create({
        data: {
          tenantId,
          planId,
          planPriceId,
          startDate: new Date(),
          status: 'ACTIVE',
          purchasedSeats: 5,
        },
        select: { id: true },
      });
      const orderId = await makeOrder('record', {
        status: SubscriptionOrderStatus.ACTIVATED,
        tenantId,
        subscriptionId: subscription.id,
        bankReference: `DP-TEST-${runId.slice(-4).toUpperCase()}`,
        paidAt: new Date(),
      });
      const settlement = new PaymentSettlementService(
        db,
        { isManaged: () => false } as never,
        activation,
        audit as never,
      );

      // Provisioning can be replayed; the money must be recorded once.
      await settlement.recordOrderPayment(orderId);
      await settlement.recordOrderPayment(orderId);

      const [payments, invoices] = await Promise.all([
        prisma.payment.findMany({ where: { tenantId } }),
        prisma.invoice.findMany({ where: { tenantId } }),
      ]);
      expect(payments).toHaveLength(1);
      expect(invoices).toHaveLength(1);
      expect(payments[0]).toMatchObject({
        paymentMethod: 'BANK',
        status: 'SUCCEEDED',
        paymentProvider: null,
      });
      expect(payments[0].amount.toString()).toBe('25000');
      expect(invoices[0].status).toBe('PAID');
      expect(payments[0].invoiceId).toBe(invoices[0].id);
    } finally {
      await prisma.payment.deleteMany({ where: { tenantId } });
      await prisma.invoice.deleteMany({ where: { tenantId } });
      await prisma.subscriptionOrder.updateMany({
        where: { tenantId },
        data: { tenantId: null, subscriptionId: null },
      });
      await prisma.subscription.deleteMany({ where: { tenantId } });
      await fixtures.cleanup();
    }
  });

  it('runs the public wizard path: verify email, choose bank transfer, receive an invoice, and cannot also open a card checkout', async () => {
    const submit = () =>
      billing.createPublicSubscriptionCheckout({
        planPriceId,
        seatQuantity: 5,
        companyName: `Wizard Co ${runId}`,
        contactName: 'Aisha Khan',
        email: `aisha@wizard-${runId}.example.test`,
        country: 'PK',
        paymentMethod: 'BANK_TRANSFER',
      } as never) as Promise<Record<string, unknown>>;

    // First call stops at the verification gate: no invoice yet.
    const first = await submit();
    expect(first.verificationRequired).toBe(true);
    const onboardingId = first.onboardingId as string;
    orderIds.push(onboardingId);
    const order = await prisma.subscriptionOrder.findUniqueOrThrow({
      where: { id: onboardingId },
    });
    customerIds.push(order.customerAccountId);
    expect(order.bankReference).toBeNull();

    // After verification the same call issues the invoice and points at its page.
    await verification.verifyCode(
      onboardingId,
      sentCodes[sentCodes.length - 1],
    );
    const second = await submit();
    expect(second.url).toBe(
      `https://landing.test/subscribe/bank-transfer?onboarding=${onboardingId}`,
    );
    expect(second.bankReference).toMatch(/^DP-/);
    const issued = await prisma.subscriptionOrder.findUniqueOrThrow({
      where: { id: onboardingId },
    });
    expect(issued.status).toBe(SubscriptionOrderStatus.PENDING_PAYMENT);

    // Repeating is idempotent: the same reference comes back.
    const third = await submit();
    expect(third.bankReference).toBe(second.bankReference);

    // A card choice on the same order is locked out — no two ways to pay once.
    await expect(
      billing.createPublicSubscriptionCheckout({
        planPriceId,
        seatQuantity: 5,
        companyName: `Wizard Co ${runId}`,
        contactName: 'Aisha Khan',
        email: `aisha@wizard-${runId}.example.test`,
        country: 'PK',
      } as never),
    ).rejects.toMatchObject({ response: { code: 'PAYMENT_PROVIDER_LOCKED' } });

    // Cancelling an unclaimed invoice frees the buyer; a claimed one cannot be.
    await bank.cancelInvoice(onboardingId);
    expect(
      (
        await prisma.subscriptionOrder.findUniqueOrThrow({
          where: { id: onboardingId },
        })
      ).status,
    ).toBe(SubscriptionOrderStatus.CANCELLED);
  });

  it('refuses to cancel an invoice once a payment has been reported', async () => {
    const orderId = await makeOrder('nocancel');
    await bank.issueInvoice(orderId);
    await bank.submitClaim(orderId, { transactionReference: 'TXN-NOCANCEL' });
    await expect(bank.cancelInvoice(orderId)).rejects.toMatchObject({
      response: { code: 'CLAIM_EXISTS' },
    });
  });

  it('a card checkout already open locks the order out of a bank invoice', async () => {
    const orderId = await makeOrder('locked', {
      providerPaymentId: `trk_${runId}`,
      paymentProvider: 'SAFEPAY',
    });
    await expect(bank.issueInvoice(orderId)).rejects.toMatchObject({
      response: { code: 'PAYMENT_PROVIDER_LOCKED' },
    });
  });
});
