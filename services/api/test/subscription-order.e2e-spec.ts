import {
  PrismaClient,
  CustomerAccountStatus,
  SubscriptionOrderStatus,
  TaxTreatment,
} from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { describeWithDatabase } from './helpers/db-fixtures';
import { SubscriptionOrderService } from '../src/modules/billing/services/subscription-order.service';
import { CustomerIdentityService } from '../src/modules/billing/services/customer-identity.service';
import { TaxBasisService } from '../src/modules/billing/services/tax-basis.service';
import { OutboxService } from '../src/modules/outbox/outbox.service';
import type { PrismaService } from '../src/common/prisma/prisma.service';

/**
 * Customer-before-payment, deduplication and the money snapshot, against a real
 * PostgreSQL.
 *
 * WHY THIS CANNOT BE A MOCKED TEST. Deduplication is enforced by a unique index
 * on `submissionHash`, not by the read that precedes it; the whole point is that
 * two submissions racing each other collapse in the database rather than in a
 * pre-check. The money snapshot is Decimal arithmetic persisted through Prisma,
 * where a double would happily "store" a number the column would reject.
 */
function createTestPrismaClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString) {
    throw new Error('DATABASE_URL is required for database-backed tests.');
  }
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

describeWithDatabase()('Subscription orders (DB-backed)', () => {
  jest.setTimeout(180_000);

  const prisma = createTestPrismaClient();
  const identity = new CustomerIdentityService();
  const service = new SubscriptionOrderService(
    prisma as unknown as PrismaService,
    identity,
    new TaxBasisService(),
    new OutboxService(prisma as unknown as PrismaService),
  );

  const runId = `ord-${Date.now()}`;
  let planPriceId: string;
  const createdCustomerIds: string[] = [];
  const createdOrderIds: string[] = [];

  beforeAll(async () => {
    await prisma.$connect();
    const planPrice = await prisma.planPrice.findFirstOrThrow({
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
    await prisma.$disconnect();
  });

  function submission(overrides: Record<string, unknown> = {}) {
    return {
      planPriceId,
      seatQuantity: 12,
      companyName: `Northwind Trading ${runId}`,
      contactName: 'Ada Lovelace',
      email: `ada@northwind-${runId}.com`,
      country: 'PK',
      ...overrides,
    };
  }

  async function open(overrides: Record<string, unknown> = {}) {
    const result = await service.openOrder(submission(overrides) as never);
    createdOrderIds.push(result.orderId);
    if (!createdCustomerIds.includes(result.customerAccountId)) {
      createdCustomerIds.push(result.customerAccountId);
    }
    return result;
  }

  it('creates the customer before payment, as a prospect', async () => {
    const result = await open();

    expect(result.reused).toBe(false);
    expect(result.status).toBe(SubscriptionOrderStatus.PENDING_PAYMENT);

    const customer = await prisma.customerAccount.findUniqueOrThrow({
      where: { id: result.customerAccountId },
      select: {
        status: true,
        industry: true,
        companySize: true,
        primaryContactLastName: true,
      },
    });

    // The customer exists before any money moves, which is what makes an
    // abandoned checkout a followable lead rather than a gap.
    expect(customer.status).toBe(CustomerAccountStatus.PROSPECT);
    // And nothing was fabricated to satisfy a column. The old path wrote
    // 'Unknown' into both of these and 'Owner' as a surname.
    expect(customer.industry).toBeNull();
    expect(customer.companySize).toBeNull();
    expect(customer.primaryContactLastName).toBe('Lovelace');
  });

  it('absorbs a repeated identical submission instead of creating a second order', async () => {
    const first = await open();
    const second = await open();

    expect(second.reused).toBe(true);
    expect(second.orderId).toBe(first.orderId);
    expect(second.customerAccountId).toBe(first.customerAccountId);

    const orders = await prisma.subscriptionOrder.count({
      where: { customerAccountId: first.customerAccountId },
    });
    expect(orders).toBe(1);
  });

  it('reuses the customer but opens a new order when the plan or quantity changes', async () => {
    const first = await open();
    const changed = await open({ seatQuantity: 25 });

    expect(changed.reused).toBe(false);
    expect(changed.orderId).not.toBe(first.orderId);
    // Same company and contact — a different quantity is a different order,
    // not a different customer.
    expect(changed.customerAccountId).toBe(first.customerAccountId);
  });

  it('refuses to collapse two different companies on a generic email domain', async () => {
    const a = await open({
      companyName: `Alpha Works ${runId}`,
      email: `founder+a-${runId}@gmail.com`,
    });
    const b = await open({
      companyName: `Beta Works ${runId}`,
      email: `founder+b-${runId}@gmail.com`,
    });

    // gmail.com is not evidence of a shared employer. A wrong merge would put
    // one company's workspace under another company's billing account.
    expect(b.customerAccountId).not.toBe(a.customerAccountId);
  });

  it('matches the same company across contacts on a corporate domain', async () => {
    const domain = `contoso-${runId}.com`;
    const first = await open({
      companyName: `Contoso Ltd ${runId}`,
      email: `ada@${domain}`,
    });
    const colleague = await open({
      companyName: `CONTOSO LIMITED ${runId}.`,
      email: `grace@${domain}`,
      contactName: 'Grace Hopper',
    });

    // Same domain and the same normalised company name — legal suffix, case
    // and punctuation are not different companies.
    expect(colleague.customerAccountId).toBe(first.customerAccountId);
  });

  it('resolves every money figure on the server and freezes the commercial snapshot', async () => {
    const result = await open({
      companyName: `Money Co ${runId}`,
      email: `cfo@money-${runId}.com`,
      seatQuantity: 7,
    });

    const order = await prisma.subscriptionOrder.findUniqueOrThrow({
      where: { id: result.orderId },
    });
    const planPrice = await prisma.planPrice.findUniqueOrThrow({
      where: { id: planPriceId },
    });

    const billable = Math.max(
      0,
      Math.max(7, planPrice.minimumSeats) - planPrice.includedSeats,
    );

    expect(order.unitAmount.toString()).toBe(planPrice.unitAmount.toString());
    expect(order.subtotalAmount.toString()).toBe(
      planPrice.unitAmount.mul(billable).toString(),
    );
    // subtotal -> discount -> taxable basis -> tax -> total, each stored.
    expect(order.taxableAmount.toString()).toBe(
      order.subtotalAmount.minus(order.discountAmount).toString(),
    );
    expect(order.totalAmount.toString()).toBe(
      order.taxableAmount.plus(order.taxAmount).toString(),
    );
    expect(order.currency).toBe(planPrice.currency);

    const snapshot = order.commercialSnapshot as Record<string, unknown>;
    expect(snapshot.planPriceVersion).toBe(planPrice.version);
    expect(snapshot.billableSeats).toBe(billable);
  });

  it('records tax as undetermined rather than claiming it does not apply', async () => {
    const result = await open({
      companyName: `Tax Co ${runId}`,
      email: `tax@taxco-${runId}.com`,
    });

    const order = await prisma.subscriptionOrder.findUniqueOrThrow({
      where: { id: result.orderId },
      select: {
        taxTreatment: true,
        taxAmount: true,
        taxRatePercent: true,
        taxRateSnapshot: true,
      },
    });

    // No tax registration is configured anywhere in this platform. Charging
    // zero is correct; recording NOT_APPLICABLE would be a false tax position,
    // and inventing a rate would be worse than both.
    expect(order.taxTreatment).toBe(TaxTreatment.NOT_DETERMINED);
    expect(order.taxAmount.toString()).toBe('0');
    expect(order.taxRatePercent).toBeNull();
    expect((order.taxRateSnapshot as Record<string, unknown>).reason).toBe(
      'NO_TAX_PROFILE_CONFIGURED_FOR_MARKET',
    );
  });

  it('announces CHECKOUT_STARTED once per order, in the same transaction', async () => {
    const result = await open({
      companyName: `Event Co ${runId}`,
      email: `ops@eventco-${runId}.com`,
    });

    const events = await prisma.outboxEvent.findMany({
      where: {
        aggregateType: 'SubscriptionOrder',
        aggregateId: result.orderId,
      },
      select: { eventType: true },
    });

    expect(events).toHaveLength(1);
    expect(events[0].eventType).toBe('CHECKOUT_STARTED');
  });

  it('ages an unpaid order out rather than deleting it', async () => {
    const result = await open({
      companyName: `Stale Co ${runId}`,
      email: `stale@staleco-${runId}.com`,
    });

    await prisma.subscriptionOrder.update({
      where: { id: result.orderId },
      data: { expiresAt: new Date(Date.now() - 60_000) },
    });

    await service.abandonExpired();

    const order = await prisma.subscriptionOrder.findUniqueOrThrow({
      where: { id: result.orderId },
      select: { status: true, abandonedAt: true },
    });

    // An order somebody started and did not finish is a fact about demand.
    expect(order.status).toBe(SubscriptionOrderStatus.ABANDONED);
    expect(order.abandonedAt).not.toBeNull();
  });

  it('does not hand an expired order back to a repeat submission', async () => {
    const stale = await open({
      companyName: `Expired Co ${runId}`,
      email: `x@expiredco-${runId}.com`,
    });
    await prisma.subscriptionOrder.update({
      where: { id: stale.orderId },
      data: { expiresAt: new Date(Date.now() - 60_000) },
    });

    const retry = await service.openOrder(
      submission({
        companyName: `Expired Co ${runId}`,
        email: `x@expiredco-${runId}.com`,
      }) as never,
    );
    createdOrderIds.push(retry.orderId);

    expect(retry.reused).toBe(false);
    expect(retry.orderId).not.toBe(stale.orderId);
  });
});
