import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { randomUUID } from 'node:crypto';

import { AppModule } from '../src/app.module';
import { ROLE_KEYS } from '../src/common/constants/rbac-matrix';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { TenantEntitlementService } from '../src/common/security/tenant-entitlement.service';
import { StorageService } from '../src/common/storage/storage.service';
import { DbFixtures, describeWithDatabase } from './helpers/db-fixtures';
import { HttpActors, type HttpActor } from './helpers/http-actors';

/**
 * Billing cross-tenant isolation and the tenant -> platform billing boundary.
 *
 * EVIDENCE CLASS: database-backed HTTP integration, persisted state verified.
 *
 * Two real tenants, ALPHA and BETA, each with a GLOBAL_ADMIN (the most
 * privileged tenant role), a subscription on its OWN plan, an invoice, payments,
 * and BETA additionally holds a bank-transfer order with a claim and a stored
 * proof-of-payment file. Every attack follows the same three steps:
 *
 *   (a) a CONTROL proves the route and body work for the caller that owns the
 *       data, so a refusal is the boundary working and not a wrong URL;
 *   (b) ALPHA's admin attacks BETA's row and the EXACT status is asserted;
 *   (c) BETA's whole persisted billing state is re-read and must be identical to
 *       the baseline taken after setup, and no BETA marker may appear in the
 *       ALPHA response body.
 *
 * No external provider is called: every payment row used is SUCCEEDED or a
 * BANK_TRANSFER (which has no gateway), and webhook tests send unsigned/forged
 * payloads that are refused before any provider code runs.
 */
describeWithDatabase()('Billing cross-tenant (e2e, HTTP)', () => {
  jest.setTimeout(600_000);

  let moduleRef: TestingModule;
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let fixtures: DbFixtures;
  let actors: HttpActors;
  let entitlements: TenantEntitlementService;
  let platform: HttpActor;
  // Config switches only (no credentials, no network): checkout URLs and the
  // Stripe mode flag are read by billing routes before they reach any provider.
  process.env.STRIPE_MODE ??= 'test';
  process.env.WEB_APP_URL ??= 'http://localhost:3001';
  const suffix = randomUUID().slice(0, 6);
  const keyPrefix = `xt${suffix}`;

  interface Side {
    label: string;
    tenantId: string;
    customerAccountId: string;
    admin: HttpActor;
    planId: string;
    planPriceId: string;
    subscriptionId: string;
    invoiceId: string;
    invoiceNumber: string;
    bankReference: string;
    paidPaymentId: string;
    pendingPaymentId: string;
    paymentMarker: string;
    orderId: string;
    claimId: string;
    evidenceId: string;
    proofMarker: string;
  }
  let alpha: Side;
  let beta: Side;
  let marketId: string;
  let methodId: string;
  let accountId: string;
  let betaReservedPlanId: string;
  let betaReservedPriceId: string;
  let ctlInvoiceId: string;
  let ctlClaimId: string;
  let ctlPaymentId: string;
  let baseline = '';
  const storedFiles: string[] = [];

  const call = (
    method: 'get' | 'post' | 'patch' | 'put' | 'delete',
    as: HttpActor,
    path: string,
    client: 'web' | 'admin' = as.client,
  ) =>
    request(app.getHttpServer())
      [method](`/${path}`)
      .set('Authorization', `Bearer ${as.token}`)
      .set('X-DijiPeople-App', client);

  const send = (
    method: 'post' | 'patch' | 'put',
    as: HttpActor,
    path: string,
    body: Record<string, unknown>,
    client: 'web' | 'admin' = as.client,
  ) => call(method, as, path, client).send(body);

  const asText = (res: { text?: string; body: unknown }): string =>
    Buffer.isBuffer(res.body)
      ? res.body.toString('utf8')
      : (res.text ?? JSON.stringify(res.body));

  async function side(label: string, index: number): Promise<Side> {
    const tenant = await fixtures.createTenant(label);
    const organizationId = await fixtures.createOrganization(tenant.id);
    const unit = await fixtures.createBusinessUnit(tenant.id, organizationId);
    const admin = await actors.tenantUser(tenant.id, unit, label);
    const role = await prisma.role.create({
      data: {
        tenantId: tenant.id,
        key: ROLE_KEYS.GLOBAL_ADMIN,
        name: `Admin ${label}`,
      },
      select: { id: true },
    });
    await prisma.userRole.create({
      data: { tenantId: tenant.id, userId: admin.id, roleId: role.id },
    });

    // Each tenant is on its OWN plan with a DIFFERENT feature set, so an
    // entitlement answer that came from the wrong tenant is visible.
    const plan = await prisma.plan.create({
      data: {
        key: `${keyPrefix}-${label}`,
        name: `Plan ${label} ${suffix}`,
        publicationStatus: 'PUBLISHED',
        isActive: true,
        kind: 'CATALOGUE',
        monthlyBasePrice: 10 + index,
        annualBasePrice: 100 + index,
        currency: 'USD',
        features: {
          create: (index === 0
            ? ['employees', 'desktop-agent']
            : ['employees', 'payroll']
          ).map((featureKey) => ({ featureKey, isEnabled: true })),
        },
      },
      select: { id: true },
    });
    const price = await prisma.planPrice.create({
      data: {
        planId: plan.id,
        billingCycle: 'MONTHLY',
        billingModel: 'PER_SEAT',
        billingInterval: 'MONTH',
        currency: 'USD',
        unitAmount: 10 + index,
        marketId,
        publicationStatus: 'PUBLISHED',
        isActive: true,
      },
      select: { id: true },
    });
    const subscription = await prisma.subscription.create({
      data: {
        tenantId: tenant.id,
        planId: plan.id,
        planPriceId: price.id,
        status: 'ACTIVE',
        startDate: new Date('2025-01-01'),
        currentPeriodStart: new Date('2025-01-01'),
        currentPeriodEnd: new Date('2099-01-01'),
        renewalDate: new Date('2099-01-01'),
        basePrice: 50 + index,
        finalPrice: 50 + index,
        currency: 'USD',
        purchasedSeats: 5 + index,
        paymentProvider: 'BANK_TRANSFER',
      },
      select: { id: true },
    });

    const invoiceNumber = `INV-${label.toUpperCase()}-${suffix}`;
    const bankReference = `BREF-${label.toUpperCase()}-${suffix}`;
    const invoice = await prisma.invoice.create({
      data: {
        tenantId: tenant.id,
        subscriptionId: subscription.id,
        invoiceNumber,
        amount: 123.45 + index,
        amountDue: 123.45 + index,
        currency: 'USD',
        issueDate: new Date('2025-02-01'),
        dueDate: new Date('2099-02-01'),
        status: 'ISSUED',
        bankReference,
      },
      select: { id: true },
    });
    const paymentMarker = `PREF-${label.toUpperCase()}-${suffix}`;
    const paid = await prisma.payment.create({
      data: {
        tenantId: tenant.id,
        subscriptionId: subscription.id,
        amount: 77.7 + index,
        currency: 'USD',
        paymentMethod: 'BANK',
        status: 'SUCCEEDED',
        paymentProvider: 'BANK_TRANSFER',
        providerPaymentId: `${paymentMarker}-1`,
        providerReference: paymentMarker,
        paidAt: new Date('2025-03-01'),
      },
      select: { id: true },
    });
    const pending = await prisma.payment.create({
      data: {
        tenantId: tenant.id,
        subscriptionId: subscription.id,
        invoiceId: invoice.id,
        amount: 123.45 + index,
        currency: 'USD',
        paymentMethod: 'BANK',
        status: 'PENDING',
        paymentProvider: 'BANK_TRANSFER',
        providerPaymentId: `${paymentMarker}-2`,
        providerReference: `${paymentMarker}-P`,
      },
      select: { id: true },
    });

    const proofMarker = `PROOF-${label.toUpperCase()}-${suffix}`;
    const order = await prisma.subscriptionOrder.create({
      data: {
        orderNumber: `ORD-${label.toUpperCase()}-${suffix}`,
        customerAccountId: tenant.customerAccountId,
        planId: plan.id,
        planPriceId: price.id,
        marketId,
        paymentMethodConfigId: methodId,
        receivingAccountId: accountId,
        bankReference: `OBREF-${label.toUpperCase()}-${suffix}`,
        currency: 'USD',
        billingCycle: 'MONTHLY',
        billingInterval: 'MONTH',
        requestedSeats: 5,
        unitAmount: 10,
        subtotalAmount: 50,
        taxableAmount: 50,
        totalAmount: 50,
        status: 'PENDING_PAYMENT',
        paymentProvider: 'BANK_TRANSFER',
      },
      select: { id: true },
    });
    const claim = await prisma.bankTransferClaim.create({
      data: {
        subscriptionOrderId: order.id,
        paymentMethodConfigId: methodId,
        receivingAccountId: accountId,
        status: 'PENDING_VERIFICATION',
        claimedAmount: 50,
        currency: 'USD',
        customerNote: `note ${proofMarker}`,
      },
      select: { id: true },
    });
    const stored = await app.get(StorageService).saveFile({
      buffer: Buffer.from(`%PDF-1.4\n%${proofMarker}\n%%EOF\n`),
      originalFileName: 'proof.pdf',
      contentType: 'application/pdf',
      scope: { kind: 'platform' },
      domain: 'payment-evidence',
      segments: [claim.id],
    });
    storedFiles.push(stored.storageKey);
    const evidence = await prisma.bankTransferEvidence.create({
      data: {
        claimId: claim.id,
        storageKey: stored.storageKey,
        originalFileName: 'proof.pdf',
        mimeType: 'application/pdf',
        sizeBytes: stored.size,
        checksumSha256: stored.checksumSha256,
      },
      select: { id: true },
    });

    return {
      label,
      tenantId: tenant.id,
      customerAccountId: tenant.customerAccountId,
      admin,
      planId: plan.id,
      planPriceId: price.id,
      subscriptionId: subscription.id,
      invoiceId: invoice.id,
      invoiceNumber,
      bankReference,
      paidPaymentId: paid.id,
      pendingPaymentId: pending.id,
      paymentMarker,
      orderId: order.id,
      claimId: claim.id,
      evidenceId: evidence.id,
      proofMarker,
    };
  }

  /** Everything BETA owns that a billing attack could touch, as one string. */
  async function betaState(): Promise<string> {
    const [
      subscription,
      invoices,
      payments,
      order,
      claims,
      plans,
      prices,
      configs,
      accounts,
      features,
      tenantFeatures,
      paymentsForBeta,
    ] = await Promise.all([
      prisma.subscription.findUnique({ where: { tenantId: beta.tenantId } }),
      prisma.invoice.findMany({
        where: { tenantId: beta.tenantId },
        orderBy: { id: 'asc' },
      }),
      prisma.payment.findMany({
        where: { tenantId: beta.tenantId },
        orderBy: { id: 'asc' },
      }),
      prisma.subscriptionOrder.findUnique({ where: { id: beta.orderId } }),
      prisma.bankTransferClaim.findMany({
        where: { subscriptionOrderId: beta.orderId },
        include: { evidence: true },
        orderBy: { id: 'asc' },
      }),
      prisma.plan.findMany({
        where: { id: { in: [beta.planId, betaReservedPlanId] } },
        orderBy: { id: 'asc' },
      }),
      prisma.planPrice.findMany({
        where: { planId: { in: [beta.planId, betaReservedPlanId] } },
        orderBy: { id: 'asc' },
      }),
      prisma.paymentMethodConfiguration.findMany({
        where: { marketId },
        orderBy: { id: 'asc' },
      }),
      prisma.bankReceivingAccount.findMany({
        where: { paymentMethodConfigId: methodId },
        orderBy: { id: 'asc' },
      }),
      prisma.planFeature.findMany({
        where: { planId: beta.planId },
        orderBy: { id: 'asc' },
      }),
      prisma.tenantFeature.findMany({
        where: { tenantId: beta.tenantId },
        orderBy: { id: 'asc' },
      }),
      prisma.payment.count({ where: { tenantId: beta.tenantId } }),
    ]);
    return JSON.stringify({
      subscription,
      invoices,
      payments,
      order,
      claims,
      plans,
      prices,
      configs,
      accounts,
      features,
      tenantFeatures,
      paymentsForBeta,
      planCount: await prisma.plan.count({
        where: { key: { startsWith: `${keyPrefix}-attack` } },
      }),
    });
  }

  /** BETA identifiers that must never appear in an ALPHA response. */
  const betaMarkers = (): string[] => [
    beta.invoiceNumber,
    beta.bankReference,
    beta.paymentMarker,
    beta.proofMarker,
    beta.invoiceId,
    beta.paidPaymentId,
    beta.pendingPaymentId,
    beta.claimId,
    beta.tenantId,
    beta.subscriptionId,
    beta.planId,
  ];

  const expectNoBetaMarker = (res: { text?: string; body: unknown }) => {
    const text = asText(res);
    for (const marker of betaMarkers()) {
      expect(text).not.toContain(marker);
    }
  };

  const expectBetaUnchanged = async () => {
    expect(await betaState()).toEqual(baseline);
  };

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.init();
    prisma = app.get(PrismaService);
    entitlements = app.get(TenantEntitlementService);
    fixtures = new DbFixtures(prisma, 'billx');
    actors = new HttpActors(app, suffix);
    platform = await actors.platformUser('SUPER_ADMIN', 'billx-platform');

    const market = await prisma.market.create({
      data: {
        code: `XT${suffix}`.toUpperCase(),
        name: `Market ${suffix}`,
        defaultCurrency: 'USD',
        supportedCurrencies: ['USD'],
        publicationStatus: 'PUBLISHED',
      },
      select: { id: true },
    });
    marketId = market.id;
    const method = await prisma.paymentMethodConfiguration.create({
      data: {
        marketId,
        currency: 'USD',
        methodKey: 'BANK_TRANSFER',
        environment: 'MANUAL',
        displayName: `Bank ${suffix}`,
        enabled: true,
        approvalStatus: 'APPROVED',
      },
      select: { id: true },
    });
    methodId = method.id;
    const account = await prisma.bankReceivingAccount.create({
      data: {
        paymentMethodConfigId: methodId,
        currency: 'USD',
        bankName: `Bank ${suffix}`,
        accountTitleEncrypted: 'enc',
        maskedAccountTitle: 'X***',
        status: 'APPROVED',
        isActive: true,
      },
      select: { id: true },
    });
    accountId = account.id;

    alpha = await side('billalpha', 0);
    beta = await side('billbeta', 1);

    // A plan reserved for BETA's customer alone, with a published price.
    const reserved = await prisma.plan.create({
      data: {
        key: `${keyPrefix}-reserved`,
        name: `Reserved ${suffix}`,
        publicationStatus: 'PUBLISHED',
        isActive: true,
        kind: 'CUSTOM',
        salesModel: 'SALES_ASSISTED',
        eligibleCustomerAccountId: beta.customerAccountId,
      },
      select: { id: true },
    });
    betaReservedPlanId = reserved.id;
    const reservedPrice = await prisma.planPrice.create({
      data: {
        planId: reserved.id,
        billingCycle: 'MONTHLY',
        billingModel: 'PER_SEAT',
        billingInterval: 'MONTH',
        currency: 'USD',
        unitAmount: 7.77,
        marketId,
        publicationStatus: 'PUBLISHED',
        isActive: true,
      },
      select: { id: true },
    });
    betaReservedPriceId = reservedPrice.id;

    // Control-only rows owned by ALPHA's customer, used to prove the platform
    // mutation routes work without touching BETA.
    const ctlInvoice = await prisma.invoice.create({
      data: {
        tenantId: alpha.tenantId,
        subscriptionId: alpha.subscriptionId,
        invoiceNumber: `INV-CTL-${suffix}`,
        amount: 12.34,
        currency: 'USD',
        issueDate: new Date('2025-04-01'),
        dueDate: new Date('2099-04-01'),
        status: 'ISSUED',
      },
      select: { id: true },
    });
    ctlInvoiceId = ctlInvoice.id;
    const ctlOrder = await prisma.subscriptionOrder.create({
      data: {
        orderNumber: `ORD-CTL-${suffix}`,
        customerAccountId: alpha.customerAccountId,
        paymentMethodConfigId: methodId,
        receivingAccountId: accountId,
        currency: 'USD',
        billingCycle: 'MONTHLY',
        billingInterval: 'MONTH',
        requestedSeats: 1,
        unitAmount: 10,
        subtotalAmount: 10,
        taxableAmount: 10,
        totalAmount: 10,
        status: 'PENDING_PAYMENT',
        paymentProvider: 'BANK_TRANSFER',
      },
      select: { id: true },
    });
    const ctlClaim = await prisma.bankTransferClaim.create({
      data: {
        subscriptionOrderId: ctlOrder.id,
        paymentMethodConfigId: methodId,
        receivingAccountId: accountId,
        status: 'PENDING_VERIFICATION',
        claimedAmount: 10,
        currency: 'USD',
      },
      select: { id: true },
    });
    ctlClaimId = ctlClaim.id;
    const ctlPayment = await prisma.payment.create({
      data: {
        tenantId: alpha.tenantId,
        subscriptionId: alpha.subscriptionId,
        amount: 5,
        currency: 'USD',
        paymentMethod: 'BANK',
        status: 'SUCCEEDED',
        paymentProvider: 'BANK_TRANSFER',
        providerPaymentId: `CTL-${suffix}`,
        paidAt: new Date('2025-04-02'),
      },
      select: { id: true },
    });
    ctlPaymentId = ctlPayment.id;

    baseline = await betaState();
  });

  afterAll(async () => {
    // try/finally so a cleanup failure can never leave the Nest app open and the
    // jest process hanging (CI has no --forceExit).
    try {
      await actors.cleanup();
      // Claims and orders restrict their invoice/plan/method, so they go first.
      const orders = await prisma.subscriptionOrder.findMany({
        where: { orderNumber: { endsWith: suffix } },
        select: { id: true },
      });
      const orderIds = orders.map((o) => o.id);
      if (orderIds.length > 0) {
        await prisma.bankTransferClaim.deleteMany({
          where: { subscriptionOrderId: { in: orderIds } },
        });
        await prisma.subscriptionOrder.deleteMany({
          where: { id: { in: orderIds } },
        });
      }
      await prisma.plan.deleteMany({
        where: { key: `${keyPrefix}-reserved` },
      });
      await fixtures.cleanup();
      await prisma.plan.deleteMany({
        where: { key: { startsWith: keyPrefix } },
      });
      if (methodId) {
        await prisma.bankTransferClaim.deleteMany({
          where: { paymentMethodConfigId: methodId },
        });
        await prisma.bankReceivingAccount.deleteMany({
          where: { paymentMethodConfigId: methodId },
        });
        await prisma.paymentMethodConfiguration.deleteMany({
          where: { id: methodId },
        });
      }
      if (marketId) {
        await prisma.market.deleteMany({ where: { id: marketId } });
      }
      const storage = app.get(StorageService);
      for (const key of storedFiles) {
        await storage
          .deleteFile(key, { kind: 'platform' })
          .catch(() => undefined);
      }
    } finally {
      await app.close();
    }
  });

  // ---------------------------------------------------------------------------
  describe('controls: each tenant reaches its OWN billing data (200)', () => {
    it.each([
      ['alpha', () => alpha],
      ['beta', () => beta],
    ])(
      '%s admin reads its own subscription, invoices and payments',
      async (_n, pick) => {
        const own = pick();
        const sub = await call('get', own.admin, 'billing/subscription');
        expect(sub.status).toBe(200);
        expect((sub.body as { plan: { id: string } }).plan.id).toBe(own.planId);

        const list = await call('get', own.admin, 'billing/invoices');
        expect(list.status).toBe(200);
        expect(asText(list)).toContain(own.invoiceNumber);
        expect(asText(list)).toContain(own.bankReference);

        const detail = await call(
          'get',
          own.admin,
          `billing/invoices/${own.invoiceId}`,
        );
        expect(detail.status).toBe(200);
        expect(asText(detail)).toContain(own.invoiceNumber);

        const pay = await call(
          'get',
          own.admin,
          `billing/payments/${own.paidPaymentId}`,
        );
        expect(pay.status).toBe(200);
        expect((pay.body as { id: string }).id).toBe(own.paidPaymentId);
      },
    );

    it('the platform super admin sees BETA billing data (so a refusal is meaningful)', async () => {
      for (const path of [
        'super-admin/invoices',
        'super-admin/subscriptions',
        'super-admin/payments',
        `super-admin/invoices/${beta.invoiceId}`,
        `super-admin/tenants/${beta.tenantId}/invoices`,
        `super-admin/tenants/${beta.tenantId}/features`,
        'super-admin/plans',
        `super-admin/plans/${beta.planId}`,
        `super-admin/plans/${beta.planId}/prices`,
        'super-admin/payments/bank-transfers',
        `super-admin/payments/bank-transfers/${beta.claimId}`,
        'super-admin/billing/payment-methods',
        `super-admin/billing/payment-methods/${methodId}/accounts`,
      ]) {
        const res = await call('get', platform, path);
        expect({ path, status: res.status }).toEqual({ path, status: 200 });
      }
      const claim = await call(
        'get',
        platform,
        `super-admin/payments/bank-transfers/${beta.claimId}`,
      );
      expect(asText(claim)).toContain(beta.evidenceId);
      const proof = await call(
        'get',
        platform,
        `super-admin/payments/bank-transfers/${beta.claimId}/evidence/${beta.evidenceId}`,
      ).buffer(true);
      expect(proof.status).toBe(200);
      expect(asText(proof)).toContain(beta.proofMarker);
    });
  });

  // ---------------------------------------------------------------------------
  describe('ALPHA admin -> BETA billing data (tenant routes)', () => {
    afterEach(expectBetaUnchanged);

    it("ALPHA's own invoice list never contains BETA's invoice or bank reference", async () => {
      const res = await call('get', alpha.admin, 'billing/invoices');
      expect(res.status).toBe(200);
      expect(asText(res)).toContain(alpha.invoiceNumber);
      expectNoBetaMarker(res);
    });

    it("ALPHA's own subscription answer carries ALPHA's plan and seats, not BETA's", async () => {
      const res = await call('get', alpha.admin, 'billing/subscription');
      expect(res.status).toBe(200);
      const body = res.body as {
        id: string;
        plan: { id: string };
        purchasedSeats: number;
      };
      expect(body.id).toBe(alpha.subscriptionId);
      expect(body.plan.id).toBe(alpha.planId);
      expect(body.purchasedSeats).toBe(5);
      expectNoBetaMarker(res);
    });

    it("reading BETA's invoice by id is 404", async () => {
      const res = await call(
        'get',
        alpha.admin,
        `billing/invoices/${beta.invoiceId}`,
      );
      expect(res.status).toBe(404);
      expectNoBetaMarker(res);
    });

    it.each([
      ['succeeded', () => beta.paidPaymentId],
      ['pending', () => beta.pendingPaymentId],
    ])("reading BETA's %s payment by id is 404", async (_n, id) => {
      const res = await call('get', alpha.admin, `billing/payments/${id()}`);
      expect(res.status).toBe(404);
      expectNoBetaMarker(res);
    });

    it("paying BETA's invoice is 404, while ALPHA's own invoice reaches the payable check", async () => {
      const control = await call(
        'post',
        alpha.admin,
        `billing/invoices/${alpha.invoiceId}/pay`,
      );
      // Bank-transfer invoices are not payable by card: the route found ALPHA's
      // own invoice and refused on the payment rule, not on identity.
      // 409: the payment rule refused, which only happens after the invoice was
      // found as ALPHA's own.
      expect(control.status).toBe(409);

      const attack = await call(
        'post',
        alpha.admin,
        `billing/invoices/${beta.invoiceId}/pay`,
      );
      expect(attack.status).toBe(404);
      expectNoBetaMarker(attack);
    });

    it('cancel/resume act on ALPHA only; BETA keeps cancelAtPeriodEnd false', async () => {
      const cancel = await send(
        'post',
        alpha.admin,
        'billing/subscription/cancel',
        {},
      );
      expect(cancel.status).toBeLessThan(300);
      const mine = await prisma.subscription.findUniqueOrThrow({
        where: { id: alpha.subscriptionId },
        select: { cancelAtPeriodEnd: true },
      });
      expect(mine.cancelAtPeriodEnd).toBe(true);
      // The body cannot redirect the verb at another tenant: the field is
      // refused or ignored, never honoured.
      const sneaky = await send(
        'post',
        alpha.admin,
        'billing/subscription/resume',
        { tenantId: beta.tenantId, subscriptionId: beta.subscriptionId },
      );
      // The body names BETA's tenant and subscription but the route has no such
      // fields: it resumes the CALLER's own subscription and ignores them.
      expect(sneaky.status).toBe(201);
      const restored = await prisma.subscription.findUniqueOrThrow({
        where: { id: alpha.subscriptionId },
        select: { cancelAtPeriodEnd: true },
      });
      // ALPHA's own cancel was undone, so the verb acted on the caller...
      expect(restored.cancelAtPeriodEnd).toBe(false);
      // ...and BETA's subscription was not touched by it.
      expect(
        (
          await prisma.subscription.findUniqueOrThrow({
            where: { id: beta.subscriptionId },
            select: { cancelAtPeriodEnd: true },
          })
        ).cancelAtPeriodEnd,
      ).toBe(false);
      expectNoBetaMarker(sneaky);
    });

    it('a plan change with a tenantId in the body is 400 and BETA keeps its plan', async () => {
      const control = await call(
        'get',
        alpha.admin,
        `billing/plan-changes/preview?toPlanId=${beta.planId}`,
      );
      // ALPHA may legitimately preview a public catalogue plan.
      expect(control.status).toBe(200);

      const res = await send('post', alpha.admin, 'billing/plan-changes', {
        toPlanId: beta.planId,
        tenantId: beta.tenantId,
        status: 'ACTIVE',
        planId: alpha.planId,
      });
      expect(res.status).toBe(400);
      expectNoBetaMarker(res);
    });

    it("moving ALPHA onto BETA's customer-reserved plan is refused opaquely", async () => {
      const res = await send('post', alpha.admin, 'billing/plan-changes', {
        toPlanId: betaReservedPlanId,
      });
      expect(res.status).toBe(400);
      // The opaque refusal, not some other plan-change validation: it must not
      // say the plan is reserved for someone else.
      expect((res.body as { message?: string }).message).toBe(
        'That plan is not available.',
      );
      const mine = await prisma.subscription.findUniqueOrThrow({
        where: { id: alpha.subscriptionId },
        select: { planId: true },
      });
      expect(mine.planId).toBe(alpha.planId);
    });

    it('checkout-session mass assignment (tenantId, amount, status) is 400', async () => {
      const res = await send('post', alpha.admin, 'billing/checkout-sessions', {
        planPriceId: alpha.planPriceId,
        seatQuantity: 3,
        tenantId: beta.tenantId,
        amount: 1,
        status: 'ACTIVE',
      });
      expect(res.status).toBe(400);
      expectNoBetaMarker(res);
    });

    it("a quote for BETA's customer-reserved price is not served to ALPHA", async () => {
      const control = await call(
        'get',
        alpha.admin,
        `billing/plan-prices/${alpha.planPriceId}/seat-quote?seats=3`,
      );
      expect(control.status).toBe(200);
      expect((control.body as { unitPrice: number }).unitPrice).toBe(10);

      const res = await call(
        'get',
        alpha.admin,
        `billing/plan-prices/${betaReservedPriceId}/seat-quote?seats=3`,
      );
      // BUG-4638: a price reserved for another customer must not be quoted. The
      // refusal is the generic unavailable answer, not a validation error.
      expect(res.status).toBe(404);
      expect(asText(res)).not.toContain('7.77');
    });

    it("BUG-4652: ALPHA cannot start a checkout for BETA's reserved price, and no invoice is created", async () => {
      const invoicesBefore = await prisma.invoice.count({
        where: { tenantId: alpha.tenantId },
      });
      const res = await send('post', alpha.admin, 'billing/checkout-sessions', {
        planPriceId: betaReservedPriceId,
        seatQuantity: 3,
      });
      expect(res.status).toBe(404);
      expect(asText(res)).not.toContain('7.77');
      expect(
        await prisma.invoice.count({ where: { tenantId: alpha.tenantId } }),
      ).toBe(invoicesBefore);
      const mine = await prisma.subscription.findUniqueOrThrow({
        where: { id: alpha.subscriptionId },
        select: { planId: true },
      });
      expect(mine.planId).toBe(alpha.planId);
    });

    it('billing portal / reconcile / health answer for ALPHA and carry no BETA marker', async () => {
      const health = await call('get', alpha.admin, 'billing/health');
      expect(health.status).toBe(200);
      expectNoBetaMarker(health);
    });
  });

  // ---------------------------------------------------------------------------
  describe('entitlements reflect the caller tenant plan only', () => {
    afterEach(expectBetaUnchanged);

    it('decide() answers differ per tenant and are not swapped', async () => {
      entitlements.invalidate(alpha.tenantId);
      entitlements.invalidate(beta.tenantId);
      const a = await entitlements.decide(alpha.tenantId, ['desktop-agent']);
      const b = await entitlements.decide(beta.tenantId, ['desktop-agent']);
      expect(a.outcome).toBe('ENTITLED');
      expect(b.outcome).toBe('NOT_ENTITLED');
      const aPay = await entitlements.decide(alpha.tenantId, ['payroll']);
      const bPay = await entitlements.decide(beta.tenantId, ['payroll']);
      expect(aPay.outcome).toBe('NOT_ENTITLED');
      expect(bPay.outcome).toBe('ENTITLED');
    });

    it('GET tenant-settings/features(/availability) shows each tenant its own plan', async () => {
      for (const path of [
        'tenant-settings/features',
        'tenant-settings/features/availability',
      ]) {
        const a = await call('get', alpha.admin, path);
        const b = await call('get', beta.admin, path);
        expect(a.status).toBe(200);
        expect(b.status).toBe(200);
        const aKeys = (a.body as { enabledKeys: string[] }).enabledKeys;
        const bKeys = (b.body as { enabledKeys: string[] }).enabledKeys;
        expect(aKeys).toContain('desktop-agent');
        expect(aKeys).not.toContain('payroll');
        expect(bKeys).toContain('payroll');
        expect(bKeys).not.toContain('desktop-agent');
        expectNoBetaMarker(a);
      }
    });

    it('under ENFORCE the desktop-agent route is refused for BETA and open for ALPHA', async () => {
      const spy = jest.spyOn(entitlements, 'mode').mockResolvedValue('ENFORCE');
      try {
        entitlements.invalidate(alpha.tenantId);
        entitlements.invalidate(beta.tenantId);
        const ok = await call('get', alpha.admin, 'agent/me');
        expect(asText(ok)).not.toContain('Not included in your plan');
        const refused = await call('get', beta.admin, 'agent/me');
        expect(refused.status).toBe(403);
        expect(asText(refused)).toContain('Not included in your plan');
      } finally {
        spy.mockRestore();
      }
    });

    it('a tenant admin cannot grant itself a module its plan does not sell', async () => {
      const res = await send('patch', alpha.admin, 'tenant-settings/features', {
        updates: [{ key: 'payroll', isEnabled: true }],
      });
      expect(res.status).toBe(400);
      entitlements.invalidate(alpha.tenantId);
      const decision = await entitlements.decide(alpha.tenantId, ['payroll']);
      expect(decision.outcome).toBe('NOT_ENTITLED');
    });

    it('a tenantId in a feature update is 400', async () => {
      const res = await send('patch', alpha.admin, 'tenant-settings/features', {
        updates: [{ key: 'employees', isEnabled: true }],
        tenantId: beta.tenantId,
      });
      expect(res.status).toBe(400);
    });
  });

  // ---------------------------------------------------------------------------
  describe('ALPHA admin -> platform billing administration', () => {
    afterEach(expectBetaUnchanged);

    interface Attack {
      name: string;
      method: 'get' | 'post' | 'patch' | 'put' | 'delete';
      path: () => string;
      body?: () => Record<string, unknown>;
    }

    const attacks: Attack[] = [
      {
        name: 'list invoices',
        method: 'get',
        path: () => 'super-admin/invoices',
      },
      {
        name: 'list subscriptions',
        method: 'get',
        path: () => 'super-admin/subscriptions',
      },
      {
        name: 'list payments',
        method: 'get',
        path: () => 'super-admin/payments',
      },
      {
        name: "read BETA's invoice",
        method: 'get',
        path: () => `super-admin/invoices/${beta.invoiceId}`,
      },
      {
        name: "download BETA's invoice pdf",
        method: 'get',
        path: () => `super-admin/invoices/${beta.invoiceId}/pdf`,
      },
      {
        name: "list BETA's tenant invoices",
        method: 'get',
        path: () => `super-admin/tenants/${beta.tenantId}/invoices`,
      },
      {
        name: "read BETA's payment state",
        method: 'get',
        path: () =>
          `super-admin/customers/${beta.customerAccountId}/payment-state`,
      },
      {
        name: "email BETA's invoice",
        method: 'post',
        path: () => `super-admin/invoices/${beta.invoiceId}/email`,
        body: () => ({}),
      },
      {
        name: "mark BETA's invoice paid",
        method: 'patch',
        path: () => `super-admin/invoices/${beta.invoiceId}/status`,
        body: () => ({ status: 'PAID' }),
      },
      {
        name: 'record a payment against BETA',
        method: 'post',
        path: () => 'super-admin/payments',
        body: () => ({
          tenantId: beta.tenantId,
          subscriptionId: beta.subscriptionId,
          invoiceId: beta.invoiceId,
          amount: 123.45,
          currency: 'USD',
          paymentMethod: 'BANK',
          status: 'SUCCEEDED',
        }),
      },
      {
        name: "change BETA's subscription plan and seats",
        method: 'patch',
        path: () => `super-admin/tenants/${beta.tenantId}/subscription`,
        body: () => ({ planId: alpha.planId, purchasedSeats: 99 }),
      },
      {
        name: "change ALPHA's own subscription plan",
        method: 'patch',
        path: () => `super-admin/tenants/${alpha.tenantId}/subscription`,
        body: () => ({ planId: beta.planId, purchasedSeats: 99 }),
      },
      {
        name: "issue an invoice on BETA's subscription",
        method: 'post',
        path: () => `super-admin/subscriptions/${beta.subscriptionId}/invoices`,
        body: () => ({}),
      },
      {
        name: "read BETA's entitlements",
        method: 'get',
        path: () => `super-admin/tenants/${beta.tenantId}/features`,
      },
      {
        name: "manage BETA's entitlements",
        method: 'patch',
        path: () => `super-admin/tenants/${beta.tenantId}/features`,
        body: () => ({ features: [{ key: 'payroll', isEnabled: false }] }),
      },
      {
        name: "manage ALPHA's own entitlements",
        method: 'patch',
        path: () => `super-admin/tenants/${alpha.tenantId}/features`,
        body: () => ({ features: [{ key: 'payroll', isEnabled: true }] }),
      },
      { name: 'list plans', method: 'get', path: () => 'super-admin/plans' },
      {
        name: 'create a plan',
        method: 'post',
        path: () => 'super-admin/plans',
        body: () => ({
          key: `${keyPrefix}-attack`,
          name: 'Attack plan',
          monthlyBasePrice: 1,
          annualBasePrice: 10,
          featureKeys: ['employees'],
        }),
      },
      {
        name: "change BETA's plan",
        method: 'patch',
        path: () => `super-admin/plans/${beta.planId}`,
        body: () => ({ name: 'Hacked' }),
      },
      {
        name: "delete BETA's plan",
        method: 'delete',
        path: () => `super-admin/plans/${beta.planId}`,
      },
      {
        name: "create a price on BETA's plan",
        method: 'post',
        path: () => `super-admin/plans/${beta.planId}/prices`,
        body: () => ({ currency: 'USD', unitAmount: 0.01 }),
      },
      {
        name: "change BETA's plan price",
        method: 'patch',
        path: () =>
          `super-admin/plans/${beta.planId}/prices/${beta.planPriceId}`,
        body: () => ({ unitAmount: 0.01 }),
      },
      {
        name: "unpublish BETA's plan price",
        method: 'post',
        path: () =>
          `super-admin/plans/${beta.planId}/prices/${beta.planPriceId}/unpublish`,
      },
      {
        name: "deactivate BETA's plan price",
        method: 'delete',
        path: () =>
          `super-admin/plans/${beta.planId}/prices/${beta.planPriceId}`,
      },
      {
        name: 'list the bank-transfer queue',
        method: 'get',
        path: () => 'super-admin/payments/bank-transfers',
      },
      {
        name: "read BETA's bank-transfer claim",
        method: 'get',
        path: () => `super-admin/payments/bank-transfers/${beta.claimId}`,
      },
      {
        name: "download BETA's proof of payment",
        method: 'get',
        path: () =>
          `super-admin/payments/bank-transfers/${beta.claimId}/evidence/${beta.evidenceId}`,
      },
      {
        name: "approve BETA's bank transfer",
        method: 'post',
        path: () =>
          `super-admin/payments/bank-transfers/${beta.claimId}/approve`,
        body: () => ({
          bankStatementReference: `FORGED-${suffix}`,
          receivedAmount: '50.00',
          currency: 'USD',
        }),
      },
      {
        name: "reject BETA's bank transfer",
        method: 'post',
        path: () =>
          `super-admin/payments/bank-transfers/${beta.claimId}/reject`,
        body: () => ({ reason: 'tenant admin says no' }),
      },
      {
        name: "request clarification on BETA's bank transfer",
        method: 'post',
        path: () =>
          `super-admin/payments/bank-transfers/${beta.claimId}/request-clarification`,
        body: () => ({ reason: 'tenant admin asks' }),
      },
      {
        name: "mark BETA's bank transfer duplicate",
        method: 'post',
        path: () =>
          `super-admin/payments/bank-transfers/${beta.claimId}/mark-duplicate`,
        body: () => ({ reason: 'tenant admin marks' }),
      },
      {
        name: "record a transfer against BETA's invoice",
        method: 'post',
        path: () =>
          `super-admin/payments/bank-transfers/invoices/${beta.invoiceId}/record`,
        body: () => ({
          bankStatementReference: `FORGED-${suffix}-R`,
          receivedAmount: '124.45',
          currency: 'USD',
        }),
      },
      {
        name: 'list payment methods',
        method: 'get',
        path: () => 'super-admin/billing/payment-methods',
      },
      {
        name: 'create a payment method',
        method: 'post',
        path: () => 'super-admin/billing/payment-methods',
        body: () => ({
          marketId,
          currency: 'USD',
          methodKey: 'BANK_TRANSFER',
          environment: 'SANDBOX',
          displayName: 'Attack method',
        }),
      },
      {
        name: 'disable the payment method',
        method: 'patch',
        path: () => `super-admin/billing/payment-methods/${methodId}/enabled`,
        body: () => ({ enabled: false }),
      },
      {
        name: 'suspend the payment method approval',
        method: 'patch',
        path: () => `super-admin/billing/payment-methods/${methodId}/approval`,
        body: () => ({ status: 'SUSPENDED' }),
      },
      {
        name: 'suspend the receiving account',
        method: 'post',
        path: () =>
          `super-admin/billing/receiving-accounts/${accountId}/suspend`,
        body: () => ({ reason: 'tenant admin attack' }),
      },
      {
        name: 'reject the receiving account',
        method: 'post',
        path: () =>
          `super-admin/billing/receiving-accounts/${accountId}/reject`,
        body: () => ({ reason: 'tenant admin attack' }),
      },
      {
        name: 'verify a payment with the provider',
        method: 'post',
        path: () => `super-admin/payments/${beta.pendingPaymentId}/verify`,
        body: () => ({}),
      },
      {
        name: 'refund a payment',
        method: 'post',
        path: () => `super-admin/payments/${beta.paidPaymentId}/refund`,
        body: () => ({ reasonCode: 'OTHER', reason: 'tenant admin attack' }),
      },
      {
        name: "recheck BETA's payment",
        method: 'post',
        path: () =>
          `super-admin/customers/${beta.customerAccountId}/recheck-payment`,
        body: () => ({}),
      },
      {
        name: 'replay a stripe webhook through the platform route',
        method: 'post',
        path: () => 'super-admin/billing/stripe/webhook',
        body: () => ({}),
      },
    ];

    it.each(attacks.map((a) => [a.name, a] as const))(
      'is refused: %s (403 on web, 401 on the admin client)',
      async (_name, attack) => {
        const issue = (client: 'web' | 'admin') => {
          const r = call(attack.method, alpha.admin, attack.path(), client);
          return attack.body ? r.send(attack.body()) : r;
        };
        const web = await issue('web');
        expect({ path: attack.path(), status: web.status }).toEqual({
          path: attack.path(),
          status: 403,
        });
        expectNoBetaMarker(web);
        const adminClient = await issue('admin');
        expect({ path: attack.path(), status: adminClient.status }).toEqual({
          path: attack.path(),
          status: 401,
        });
      },
    );

    it('the plan the attacker tried to create does not exist', async () => {
      const plan = await prisma.plan.findUnique({
        where: { key: `${keyPrefix}-attack` },
      });
      expect(plan).toBeNull();
    });

    it("BETA's proof file still holds BETA's bytes (never served, never altered)", async () => {
      const row = await prisma.bankTransferEvidence.findUniqueOrThrow({
        where: { id: beta.evidenceId },
      });
      expect(row.claimId).toBe(beta.claimId);
      expect(row.scanStatus).toBe('QUARANTINED');
    });
  });

  // ---------------------------------------------------------------------------
  describe('platform controls: the same mutation routes work for a platform operator', () => {
    it('updates an invoice status (control row owned by ALPHA, never BETA)', async () => {
      const res = await send(
        'patch',
        platform,
        `super-admin/invoices/${ctlInvoiceId}/status`,
        { status: 'VOIDED' },
      );
      expect(res.status).toBeLessThan(300);
      const row = await prisma.invoice.findUniqueOrThrow({
        where: { id: ctlInvoiceId },
        select: { status: true },
      });
      expect(row.status).toBe('VOIDED');
    });

    it('records a payment for a tenant', async () => {
      const res = await send('post', platform, 'super-admin/payments', {
        tenantId: alpha.tenantId,
        subscriptionId: alpha.subscriptionId,
        amount: 1.5,
        currency: 'USD',
        paymentMethod: 'BANK',
        status: 'SUCCEEDED',
      });
      expect(res.status).toBeLessThan(300);
    });

    it('changes a tenant subscription seat count', async () => {
      const res = await send(
        'patch',
        platform,
        `super-admin/tenants/${alpha.tenantId}/subscription`,
        { planId: alpha.planId, purchasedSeats: 6 },
      );
      expect(res.status).toBeLessThan(300);
      const row = await prisma.subscription.findUniqueOrThrow({
        where: { id: alpha.subscriptionId },
        select: { purchasedSeats: true },
      });
      expect(row.purchasedSeats).toBe(6);
    });

    it('manages tenant entitlements', async () => {
      const res = await send(
        'patch',
        platform,
        `super-admin/tenants/${alpha.tenantId}/features`,
        { features: [{ key: 'attendance', isEnabled: true }] },
      );
      expect(res.status).toBe(200);
    });

    it('creates a plan', async () => {
      const res = await send('post', platform, 'super-admin/plans', {
        key: `${keyPrefix}-ctlplan`,
        name: `Control plan ${suffix}`,
        monthlyBasePrice: 1,
        annualBasePrice: 10,
        featureKeys: ['employees'],
      });
      expect(res.status).toBeLessThan(300);
    });

    it('decides a bank-transfer claim (reject control claim)', async () => {
      const res = await send(
        'post',
        platform,
        `super-admin/payments/bank-transfers/${ctlClaimId}/reject`,
        { reason: 'control rejection' },
      );
      expect(res.status).toBeLessThan(300);
      const row = await prisma.bankTransferClaim.findUniqueOrThrow({
        where: { id: ctlClaimId },
        select: { status: true },
      });
      expect(row.status).toBe('REJECTED');
    });

    it('reaches the payment-method configuration routes for read', async () => {
      const res = await call(
        'get',
        platform,
        'super-admin/billing/payment-methods',
      );
      expect(res.status).toBe(200);
      expect(ctlPaymentId).toBeTruthy();
    });
  });

  // ---------------------------------------------------------------------------
  describe('provider webhooks refuse unsigned and forged payloads', () => {
    const countEvents = async () => ({
      stripe: await prisma.stripeWebhookEvent.count(),
      provider: await prisma.paymentProviderEvent.count(),
    });

    afterEach(expectBetaUnchanged);

    it.each([
      ['stripe', 'billing/stripe/webhook', 'stripe-signature'],
      ['safepay', 'billing/safepay/webhook', 'x-sfpy-signature'],
    ])(
      '%s: an unsigned body is 400 and nothing is written',
      async (_n, path) => {
        const before = await countEvents();
        const res = await request(app.getHttpServer())
          .post(`/${path}`)
          .set('Content-Type', 'application/json')
          .send({
            id: `evt_forged_${suffix}`,
            type: 'invoice.paid',
            data: {
              object: {
                id: beta.invoiceNumber,
                metadata: { tenantId: beta.tenantId },
              },
            },
          });
        expect(res.status).toBe(400);
        expect(await countEvents()).toEqual(before);
      },
    );

    it.each([
      ['stripe', 'billing/stripe/webhook', 'stripe-signature'],
      ['safepay', 'billing/safepay/webhook', 'x-sfpy-signature'],
    ])(
      '%s: a forged signature naming BETA is 400 and changes no payment or invoice',
      async (_n, path, header) => {
        const before = await countEvents();
        const res = await request(app.getHttpServer())
          .post(`/${path}`)
          .set('Content-Type', 'application/json')
          .set(header, `t=1,v1=${'0'.repeat(64)}`)
          .send({
            id: `evt_forged2_${suffix}`,
            type: 'payment_intent.succeeded',
            data: {
              object: {
                id: beta.paymentMarker,
                invoice: beta.invoiceId,
                metadata: { tenantId: beta.tenantId },
              },
            },
          });
        expect(res.status).toBe(400);
        expect(await countEvents()).toEqual(before);
        const invoice = await prisma.invoice.findUniqueOrThrow({
          where: { id: beta.invoiceId },
          select: { status: true, paidAt: true, amount: true },
        });
        expect(invoice.status).toBe('ISSUED');
        expect(invoice.paidAt).toBeNull();
        const payment = await prisma.payment.findUniqueOrThrow({
          where: { id: beta.pendingPaymentId },
          select: { status: true, paidAt: true },
        });
        expect(payment.status).toBe('PENDING');
        expect(payment.paidAt).toBeNull();
      },
    );

    it('a tenant admin token does not turn a webhook into an authenticated route', async () => {
      const res = await call(
        'post',
        alpha.admin,
        'billing/stripe/webhook',
      ).send({ id: `evt_tenant_${suffix}`, type: 'invoice.paid' });
      expect(res.status).toBe(400);
    });
  });
});
