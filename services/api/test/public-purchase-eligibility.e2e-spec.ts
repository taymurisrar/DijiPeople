import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { randomUUID } from 'node:crypto';

import { NotFoundException } from '@nestjs/common';

import { AppModule } from '../src/app.module';
import { SubscriptionOrderService } from '../src/modules/billing/services/subscription-order.service';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { describeWithDatabase } from './helpers/db-fixtures';

process.env.STRIPE_MODE ??= 'test';
process.env.WEB_APP_URL ??= 'http://localhost:3001';

/**
 * BUG-4652 — an ANONYMOUS caller who holds a price id must not be able to turn
 * it into an order, an invoice, a payment session or a payment-option answer
 * unless that price is a genuine self-service public offer.
 *
 * Every route is hit with no credentials, as a browser visitor would. A set of
 * prices that differ from the valid one in exactly ONE respect is used, so a
 * refusal can only be that respect. Each refused request must answer exactly like
 * an unknown price id (404 "Plan price not found.") and must leave no order,
 * customer account, e-mail record or outbox event behind. A valid offer is
 * driven through the same routes as the control, so the 404s are the policy and
 * not a wrong URL or an invalid body.
 *
 * EVIDENCE CLASS: database-backed HTTP integration, persisted state verified.
 */
describeWithDatabase()('Public purchase eligibility (e2e, HTTP)', () => {
  jest.setTimeout(600_000);

  let moduleRef: TestingModule;
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const suffix = randomUUID().slice(0, 6);
  const attackerEmail = `attacker-${suffix}@example.invalid`;
  const validEmail = `buyer-${suffix}@example.invalid`;
  const startedAt = new Date();
  const NOT_FOUND = 'Plan price not found.';

  let marketId: string;
  let reservedAccountId: string;
  const planIds: string[] = [];
  const priceIds: string[] = [];
  const prices: Record<string, string> = {};

  const past = new Date('2020-01-01T00:00:00Z');
  const future = new Date('2099-01-01T00:00:00Z');

  interface PlanSpec {
    plan: Record<string, unknown>;
    price?: Record<string, unknown>;
  }

  async function makePrice(name: string, spec: PlanSpec): Promise<string> {
    const plan = await prisma.plan.create({
      data: {
        key: `pp-${suffix}-${name}`,
        name: `PP ${name} ${suffix}`,
        publicationStatus: 'PUBLISHED',
        isActive: true,
        kind: 'CATALOGUE',
        salesModel: 'SELF_SERVICE',
        ...spec.plan,
      },
      select: { id: true },
    });
    planIds.push(plan.id);
    const price = await prisma.planPrice.create({
      data: {
        planId: plan.id,
        billingCycle: 'MONTHLY',
        billingModel: 'PER_SEAT',
        billingInterval: 'MONTH',
        currency: 'USD',
        unitAmount: 12.5,
        marketId,
        publicationStatus: 'PUBLISHED',
        isActive: true,
        salesModel: 'SELF_SERVICE',
        ...spec.price,
      },
      select: { id: true },
    });
    priceIds.push(price.id);
    prices[name] = price.id;
    return price.id;
  }

  const paymentOptions = (id: string) =>
    request(app.getHttpServer()).get(
      `/public/payment-methods?planPriceId=${id}`,
    );

  const onboarding = (id: string, email: string) =>
    request(app.getHttpServer())
      .post('/public/onboarding')
      .send({
        planPriceId: id,
        seatQuantity: 5,
        companyName: `Acme ${suffix}`,
        contactName: 'Buyer Test',
        email,
        country: 'AE',
      });

  const subscribe = (id: string, email: string) =>
    request(app.getHttpServer())
      .post('/public/subscribe')
      .send({
        planPriceId: id,
        seatQuantity: 5,
        companyName: `Acme ${suffix}`,
        contactName: 'Buyer Test',
        email,
        country: 'AE',
      });

  /** Everything an accepted purchase attempt could leave behind for the attacker. */
  const sideEffects = async () => ({
    orders: await prisma.subscriptionOrder.count({
      where: { planPriceId: { in: priceIds } },
    }),
    accounts: await prisma.customerAccount.count({
      where: { contactEmail: attackerEmail },
    }),
    emails: await prisma.emailDeliveryLog.count({
      where: { recipient: attackerEmail },
    }),
    outbox: await prisma.outboxEvent.count({
      where: {
        createdAt: { gte: startedAt },
        aggregateType: 'SubscriptionOrder',
      },
    }),
  });

  beforeAll(async () => {
    // The public write guard allows 20 requests per path per window; this suite
    // makes more than that on a disposable database (ignored in production).
    process.env.PUBLIC_RATE_LIMIT_WRITE_MAX = '500';
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

    const market = await prisma.market.create({
      data: {
        code: `PP${suffix}`.toUpperCase(),
        name: `Market ${suffix}`,
        defaultCurrency: 'USD',
        supportedCurrencies: ['USD'],
        publicationStatus: 'PUBLISHED',
      },
      select: { id: true },
    });
    marketId = market.id;
    const account = await prisma.customerAccount.create({
      data: {
        companyName: `Reserved ${suffix}`,
        contactEmail: `reserved-${suffix}@example.invalid`,
        country: 'AE',
      },
      select: { id: true },
    });
    reservedAccountId = account.id;

    // A valid price, and one price per way of NOT being a public offer.
    await makePrice('standard', { plan: {} });
    await makePrice('custom-public', { plan: { kind: 'CUSTOM' } });
    await makePrice('reserved-self', {
      plan: { kind: 'CUSTOM', eligibleCustomerAccountId: reservedAccountId },
    });
    await makePrice('reserved-assisted', {
      plan: {
        kind: 'CUSTOM',
        salesModel: 'SALES_ASSISTED',
        eligibleCustomerAccountId: reservedAccountId,
      },
    });
    await makePrice('plan-future', { plan: { effectiveFrom: future } });
    await makePrice('plan-expired', { plan: { effectiveUntil: past } });
    await makePrice('assisted', {
      plan: { kind: 'CUSTOM', salesModel: 'SALES_ASSISTED' },
    });
    await makePrice('price-assisted', {
      plan: {},
      price: { salesModel: 'SALES_ASSISTED' },
    });
    await makePrice('price-draft', {
      plan: {},
      price: { publicationStatus: 'DRAFT' },
    });
    await makePrice('price-inactive', { plan: {}, price: { isActive: false } });
    await makePrice('price-unscoped', { plan: {}, price: { marketId: null } });
    await makePrice('price-future', {
      plan: {},
      price: { effectiveFrom: future },
    });
    await makePrice('price-expired', {
      plan: {},
      price: { effectiveTo: past },
    });
    await makePrice('plan-draft', { plan: { publicationStatus: 'DRAFT' } });
    await makePrice('plan-inactive', { plan: { isActive: false } });
  });

  afterAll(async () => {
    // try/finally so a cleanup failure can never leave the app open.
    try {
      const orders = await prisma.subscriptionOrder.findMany({
        where: { planPriceId: { in: priceIds } },
        select: { id: true, customerAccountId: true },
      });
      await prisma.subscriptionOrder.deleteMany({
        where: { id: { in: orders.map((o) => o.id) } },
      });
      await prisma.planPrice.deleteMany({ where: { id: { in: priceIds } } });
      await prisma.plan.deleteMany({ where: { id: { in: planIds } } });
      await prisma.customerAccount.deleteMany({
        where: {
          id: {
            in: [reservedAccountId, ...orders.map((o) => o.customerAccountId)],
          },
        },
      });
      await prisma.market.deleteMany({ where: { id: marketId } });
    } finally {
      await app.close();
    }
  });

  const REFUSED = [
    'reserved-self',
    'reserved-assisted',
    'plan-future',
    'plan-expired',
    'assisted',
    'price-assisted',
    'price-draft',
    'price-inactive',
    'price-unscoped',
    'price-future',
    'price-expired',
    'plan-draft',
    'plan-inactive',
  ];

  describe('controls: a valid public offer remains purchasable', () => {
    it.each(['standard', 'custom-public'])(
      'payment options for the %s price answer 200',
      async (name) => {
        const res = await paymentOptions(prices[name]);
        expect(res.status).toBe(200);
        expect((res.body as { currency?: string }).currency).toBe('USD');
      },
    );

    it('a standard price starts an onboarding order for a new buyer', async () => {
      const res = await onboarding(prices.standard, validEmail);
      expect(res.status).toBe(201);
      expect(
        await prisma.subscriptionOrder.count({
          where: { planPriceId: prices.standard },
        }),
      ).toBe(1);
    });

    it('the public listing offers the standard price and hides every refused one', async () => {
      const res = await request(app.getHttpServer()).get('/public/plans');
      expect(res.status).toBe(200);
      const text = JSON.stringify(res.body);
      expect(text).toContain(prices.standard);
      for (const name of REFUSED) {
        expect({ name, listed: text.includes(prices[name]) }).toEqual({
          name,
          listed: false,
        });
      }
    });
  });

  describe('anonymous caller with a refused price id', () => {
    it.each(REFUSED)(
      'payment options for %s answer exactly like an unknown id',
      async (name) => {
        const res = await paymentOptions(prices[name]);
        const unknown = await paymentOptions(randomUUID());
        const body = res.body as Record<string, unknown>;
        const unknownBody = unknown.body as Record<string, unknown>;
        // The whole response body, not just the message, matches an unknown id's.
        expect({ name, status: res.status, body }).toEqual({
          name,
          status: 404,
          body: unknownBody,
        });
        expect((res.body as { message?: string }).message).toBe(NOT_FOUND);
      },
    );

    it.each(REFUSED)(
      'onboarding for %s is 404 and creates no order, account, e-mail or event',
      async (name) => {
        const before = await sideEffects();
        const res = await onboarding(prices[name], attackerEmail);
        expect({ name, status: res.status }).toEqual({ name, status: 404 });
        expect((res.body as { message?: string }).message).toBe(NOT_FOUND);
        expect(JSON.stringify(res.body)).not.toContain('12.5');
        expect(await sideEffects()).toEqual(before);
      },
    );

    it.each(REFUSED)(
      'subscribe for %s is 404 and creates nothing',
      async (name) => {
        const before = await sideEffects();
        const res = await subscribe(prices[name], attackerEmail);
        expect({ name, status: res.status }).toEqual({ name, status: 404 });
        expect((res.body as { message?: string }).message).toBe(NOT_FOUND);
        expect(await sideEffects()).toEqual(before);
      },
    );

    it('says nothing that identifies the reserved plan, price or customer', async () => {
      const res = await onboarding(prices['reserved-self'], attackerEmail);
      const text = JSON.stringify(res.body);
      for (const secret of [
        prices['reserved-self'],
        reservedAccountId,
        `pp-${suffix}-reserved-self`,
        'reserved',
      ]) {
        expect(text).not.toContain(secret);
      }
    });
  });

  describe('an internal caller that bypasses the HTTP controllers', () => {
    // `openOrder` reaches the database from inside the service, so it cannot rely
    // on a controller having checked. Calling it directly proves the policy is
    // enforced where the order is created, not only at the edge.
    it.each(REFUSED)(
      'openOrder refuses %s with the unknown-id error and creates nothing',
      async (name) => {
        const orders = app.get(SubscriptionOrderService, { strict: false });
        const before = await sideEffects();
        await expect(
          orders.openOrder({
            planPriceId: prices[name],
            seatQuantity: 5,
            companyName: `Acme ${suffix}`,
            contactName: 'Direct Caller',
            email: attackerEmail,
            country: 'AE',
          }),
        ).rejects.toBeInstanceOf(NotFoundException);
        expect(await sideEffects()).toEqual(before);
      },
    );
  });
  describe('the control proves the refusal is the policy, not the request', () => {
    it('the same onboarding body, differing only in the price id, succeeds for the standard price', async () => {
      const ok = await onboarding(
        prices['custom-public'],
        `second-${suffix}@example.invalid`,
      );
      expect(ok.status).toBe(201);
      const refused = await onboarding(
        prices['reserved-self'],
        `second-${suffix}@example.invalid`,
      );
      expect(refused.status).toBe(404);
    });
  });
});
