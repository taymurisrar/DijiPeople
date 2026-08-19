import { PrismaClient, SubscriptionOrderStatus } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { ConfigService } from '@nestjs/config';
import { describeWithDatabase } from './helpers/db-fixtures';
import { BillingService } from '../src/modules/billing/services/billing.service';
import { SubscriptionOrderService } from '../src/modules/billing/services/subscription-order.service';
import { CustomerIdentityService } from '../src/modules/billing/services/customer-identity.service';
import { TaxBasisService } from '../src/modules/billing/services/tax-basis.service';
import { OutboxService } from '../src/modules/outbox/outbox.service';
import type { PrismaService } from '../src/common/prisma/prisma.service';

/**
 * Nothing that looks like a live workspace exists before payment — BUG-0077.
 *
 * WHY THIS CANNOT BE A MOCKED TEST. The defect was not a wrong value; it was
 * four extra rows. Proving they are gone means counting rows in a real database
 * after running the real code path, because a Prisma double returns whatever the
 * test told it to and would happily "prove" either answer.
 *
 * It is also the assertion whose absence let the defect survive: the suite had
 * 1,382 passing tests and not one of them noticed that submitting a form created
 * a tenant.
 */
function createTestPrismaClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString) {
    throw new Error('DATABASE_URL is required for database-backed tests.');
  }
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

/**
 * The narrowest Stripe the checkout path can run against.
 *
 * Only the three calls it actually makes are implemented. A fuller fake would
 * invite the test to depend on behaviour Stripe has not promised, and the point
 * here is what DijiPeople writes to its own database, not what Stripe does.
 */
function createStripeDouble() {
  const created: { customers: number; sessions: number } = {
    customers: 0,
    sessions: 0,
  };
  return {
    created,
    service: {
      getRuntimeMode: () => 'test',
      verifyRecurringPrice: () =>
        Promise.resolve({
          valid: true,
          livemode: false,
          active: true,
          productId: 'prod_double',
          usageType: 'licensed',
          recurringInterval: 'month',
          verifiedAt: new Date(),
          reasons: [] as string[],
        }),
      client: {
        customers: {
          create: (args: Record<string, unknown>) => {
            created.customers += 1;
            return Promise.resolve({
              id: `cus_double_${created.customers}`,
              ...args,
            });
          },
        },
        checkout: {
          sessions: {
            create: () => {
              created.sessions += 1;
              return Promise.resolve({
                id: `cs_double_${created.sessions}`,
                url: 'https://checkout.stripe.test/session',
              });
            },
          },
        },
      },
    },
  };
}

describeWithDatabase()('Payment-authorised provisioning (DB-backed)', () => {
  jest.setTimeout(180_000);

  const prisma = createTestPrismaClient();
  const stripe = createStripeDouble();

  const orders = new SubscriptionOrderService(
    prisma as unknown as PrismaService,
    new CustomerIdentityService(),
    new TaxBasisService(),
    new OutboxService(prisma as unknown as PrismaService),
  );

  /*
   * The checkout path refuses to build success and cancel URLs without a
   * configured landing origin, which is correct — a checkout that redirects
   * nowhere is worse than one that does not start.
   */
  const config = {
    get: (key: string) =>
      key === 'LANDING_APP_URL' ? 'https://landing.test' : undefined,
  } as unknown as ConfigService;

  const billing = new BillingService(
    prisma as unknown as PrismaService,
    stripe.service as never,
    config,
    orders,
  );

  const runId = `pap-${Date.now()}`;
  let planPriceId: string;
  const createdCustomerIds: string[] = [];
  const createdOrderIds: string[] = [];

  beforeAll(async () => {
    await prisma.$connect();

    /*
     * A checkout-ready price of this test's own, rather than whichever seeded
     * row happens to sort first. The path refuses a price with no
     * `stripePriceId` long before it reaches the rows this test is about, and
     * mutating a shared seed row to make it ready would leak into every other
     * spec that reads it.
     */
    const plan = await prisma.plan.findFirstOrThrow({ select: { id: true } });
    const planPrice = await prisma.planPrice.create({
      data: {
        planId: plan.id,
        billingCycle: 'MONTHLY',
        billingInterval: 'MONTH',
        currency: 'QAR',
        unitAmount: 100,
        minimumSeats: 1,
        includedSeats: 0,
        isActive: true,
        stripePriceId: `price_double_${runId}`,
        stripeProductId: `prod_double_${runId}`,
      },
      select: { id: true },
    });
    planPriceId = planPrice.id;
  });

  afterAll(async () => {
    await prisma.outboxEvent.deleteMany({
      where: { customerAccountId: { in: createdCustomerIds } },
    });
    await prisma.subscriptionOrder.deleteMany({
      where: { id: { in: createdOrderIds } },
    });
    await prisma.customerAccount.deleteMany({
      where: { id: { in: createdCustomerIds } },
    });
    if (planPriceId) {
      await prisma.planPrice.delete({ where: { id: planPriceId } });
    }
    await prisma.$disconnect();
  });

  async function subscribe(overrides: Record<string, unknown> = {}) {
    const result = (await billing.createPublicSubscriptionCheckout({
      planPriceId,
      seatQuantity: 5,
      companyName: `Maseer ${runId}`,
      contactName: 'Saud Al Thani',
      email: `saud@maseer-${runId}.com`,
      country: 'QA',
      ...overrides,
    } as never)) as Record<string, unknown>;

    const order = await prisma.subscriptionOrder.findFirst({
      where: { stripeCheckoutSessionId: result.checkoutSessionId as string },
      select: { id: true, customerAccountId: true },
    });
    if (order) {
      createdOrderIds.push(order.id);
      if (!createdCustomerIds.includes(order.customerAccountId)) {
        createdCustomerIds.push(order.customerAccountId);
      }
    }
    return { result, order };
  }

  it('creates no tenant, no subscription and no lead before payment', async () => {
    const tenantsBefore = await prisma.tenant.count();
    const leadsBefore = await prisma.lead.count();
    const subscriptionsBefore = await prisma.subscription.count();

    const { result, order } = await subscribe();

    expect(result.submitted).toBe(true);
    expect(result.url).toBeTruthy();
    expect(order).not.toBeNull();

    // The four rows BUG-0077 created. Counted globally rather than by owner,
    // because the defect created them under a *second* customer account — a
    // scoped count would have missed exactly the rows that mattered.
    expect(await prisma.tenant.count()).toBe(tenantsBefore);
    expect(await prisma.lead.count()).toBe(leadsBefore);
    expect(await prisma.subscription.count()).toBe(subscriptionsBefore);
  });

  it('creates exactly one customer account for one buyer', async () => {
    const email = `single@maseer-${runId}.com`;
    await subscribe({
      companyName: `Single Customer ${runId}`,
      email,
    });

    const customers = await prisma.customerAccount.findMany({
      where: { contactEmail: email },
      select: { id: true, industry: true, companySize: true },
    });

    // Two accounts per buyer was the second half of BUG-0077: the order pointed
    // at one and the tenant, subscription and Stripe customer at the other.
    expect(customers).toHaveLength(1);

    // And neither column is fabricated. The public form does not ask for these,
    // and 'Unknown' in a reportable column is indistinguishable from an answer.
    expect(customers[0].industry).toBeNull();
    expect(customers[0].companySize).toBeNull();
  });

  it('reports the order as awaiting payment, with no tenant attached', async () => {
    const { order } = await subscribe({
      companyName: `Awaiting ${runId}`,
      email: `awaiting@maseer-${runId}.com`,
    });

    const row = await prisma.subscriptionOrder.findUniqueOrThrow({
      where: { id: order!.id },
      select: {
        status: true,
        tenantId: true,
        subscriptionId: true,
        stripeCheckoutSessionId: true,
        stripeCustomerId: true,
      },
    });

    expect(row.status).toBe(SubscriptionOrderStatus.PENDING_PAYMENT);
    expect(row.stripeCheckoutSessionId).toBeTruthy();
    expect(row.stripeCustomerId).toBeTruthy();
    // Filled in by provisioning, after payment — never at checkout.
    expect(row.tenantId).toBeNull();
    expect(row.subscriptionId).toBeNull();
  });

  it('sends Stripe the order, not a tenant', async () => {
    const { order } = await subscribe({
      companyName: `Metadata ${runId}`,
      email: `metadata@maseer-${runId}.com`,
    });

    const row = await prisma.subscriptionOrder.findUniqueOrThrow({
      where: { id: order!.id },
      select: { customerAccountId: true, stripeCustomerId: true },
    });

    // The Stripe customer is keyed to the order's own CustomerAccount. When it
    // was keyed to the second one, "who is this customer" had two answers
    // depending on whether you started from billing or from the workspace.
    const customer = await prisma.customerAccount.findUniqueOrThrow({
      where: { id: row.customerAccountId },
      select: { stripeCustomerId: true },
    });
    expect(customer.stripeCustomerId).toBe(row.stripeCustomerId);
  });
});
