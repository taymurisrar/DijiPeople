import {
  PrismaClient,
  BillingModel,
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
import { PartnerReferralResolverService } from '../src/modules/partner-experience/partner-referral-resolver.service';

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
    // See payment-authorised-provisioning: the real resolver, resolving to
    // DIRECT because these submissions carry no referral code. BUG-0281.
    new PartnerReferralResolverService(prisma as unknown as PrismaService),
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

    /*
     * The expectation is the product rule, stated here in full, not a copy of
     * the implementation's expression.
     *
     * This previously read
     * `Math.max(0, Math.max(7, minimumSeats) - includedSeats)` — the exact
     * arithmetic `SubscriptionOrderService` used at the time. A test that
     * recomputes the implementation asserts only that the code does what the
     * code does, and this one duly passed all the way through BUG-0901, where
     * that arithmetic billed a FLAT plan `unitAmount × 0` and wrote a paid
     * order recording no revenue.
     *
     * - `FLAT`: `unitAmount` is the price of the whole subscription and
     *   `includedSeats` states what that one fee covers, so exactly one unit is
     *   billed at any seat count.
     * - `PER_SEAT`: `unitAmount` is the price of one seat, so every seat the
     *   price does not already include is billed.
     *
     * The fixture is `findFirstOrThrow`, so which model this run exercises
     * depends on the seed. Branching keeps the assertion true either way rather
     * than quietly asserting nothing when the seed changes.
     */
    const seats = Math.max(7, planPrice.minimumSeats);
    const billable =
      planPrice.billingModel === BillingModel.PER_SEAT
        ? Math.max(0, seats - planPrice.includedSeats)
        : 1;

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

  /*
   * The workspace-address reservation.
   *
   * WHY THIS CANNOT BE MOCKED, for the same reason `submissionHash` cannot: the
   * guarantee is a unique index, and the failure it prevents is two buyers being
   * told the same name is free and both paying for it. A Prisma double asked
   * "does maseer exist?" answers from whatever the test set up; only PostgreSQL
   * refuses the second INSERT, and only PostgreSQL treats released NULL holds as
   * distinct rather than colliding.
   */
  describe('workspace address reservation', () => {
    it('holds the requested address on the order', async () => {
      const slug = `maseer-${runId}`.slice(0, 50);
      const result = await open({
        companyName: `Maseer ${runId}`,
        email: `owner@maseer-${runId}.com`,
        requestedSlug: slug,
      });

      const order = await prisma.subscriptionOrder.findUniqueOrThrow({
        where: { id: result.orderId },
        select: { requestedSlug: true },
      });
      expect(order.requestedSlug).toBe(slug);
    });

    it('refuses a second order for an address already held', async () => {
      const slug = `contested-${runId}`.slice(0, 50);
      await open({
        companyName: `First Claimant ${runId}`,
        email: `first@contested-${runId}.com`,
        requestedSlug: slug,
      });

      // A different company and a different submission hash, so nothing but the
      // slug index can be what refuses this.
      await expect(
        service.openOrder(
          submission({
            companyName: `Second Claimant ${runId}`,
            email: `second@contested-${runId}.com`,
            requestedSlug: slug,
          }) as never,
        ),
      ).rejects.toMatchObject({
        response: { code: 'WORKSPACE_SLUG_TAKEN' },
      });
    });

    it('releases the address when the order is abandoned, so it can be claimed again', async () => {
      const slug = `released-${runId}`.slice(0, 50);
      const first = await open({
        companyName: `Leaver ${runId}`,
        email: `leaver@released-${runId}.com`,
        requestedSlug: slug,
      });

      await prisma.subscriptionOrder.update({
        where: { id: first.orderId },
        data: { expiresAt: new Date(Date.now() - 60_000) },
      });
      const swept = await service.abandonExpired();
      expect(swept).toBeGreaterThan(0);

      const abandoned = await prisma.subscriptionOrder.findUniqueOrThrow({
        where: { id: first.orderId },
        select: { requestedSlug: true, status: true },
      });
      // Released together with the submission hash. A dead order keeping its
      // claim would lock the name against everyone, including the person who
      // abandoned it.
      expect(abandoned.status).toBe(SubscriptionOrderStatus.ABANDONED);
      expect(abandoned.requestedSlug).toBeNull();

      const second = await open({
        companyName: `Newcomer ${runId}`,
        email: `new@released-${runId}.com`,
        requestedSlug: slug,
      });
      const reclaimed = await prisma.subscriptionOrder.findUniqueOrThrow({
        where: { id: second.orderId },
        select: { requestedSlug: true },
      });
      expect(reclaimed.requestedSlug).toBe(slug);
    });

    it('refuses a reserved platform label outright', async () => {
      await expect(
        service.openOrder(
          submission({
            companyName: `Api Co ${runId}`,
            email: `api@reserved-${runId}.com`,
            requestedSlug: 'api',
          }) as never,
        ),
      ).rejects.toMatchObject({
        response: { code: 'TENANT_SLUG_RESERVED' },
      });
    });

    it('answers availability only for a live onboarding session', async () => {
      const slug = `session-${runId}`.slice(0, 50);
      const session = await open({
        companyName: `Session Co ${runId}`,
        email: `s@session-${runId}.com`,
      });

      const free = await service.checkSlugAvailability(session.orderId, slug);
      expect(free).toMatchObject({ session: 'VALID', available: true });

      // An id naming no session is refused without saying which of the two
      // reasons applied. That distinction is the enumeration leak.
      const unknown = await service.checkSlugAvailability(
        '00000000-0000-4000-8000-000000000000',
        slug,
      );
      expect(unknown).toEqual({ session: 'INVALID' });
    });

    it('stops answering once the session is no longer live', async () => {
      const expired = await open({
        companyName: `Expired Session ${runId}`,
        email: `e@expired-session-${runId}.com`,
      });
      await prisma.subscriptionOrder.update({
        where: { id: expired.orderId },
        data: { expiresAt: new Date(Date.now() - 60_000) },
      });

      const answer = await service.checkSlugAvailability(
        expired.orderId,
        `anything-${runId}`.slice(0, 50),
      );
      expect(answer).toEqual({ session: 'INVALID' });
    });

    it('reports an address held by another order as taken', async () => {
      const slug = `taken-${runId}`.slice(0, 50);
      await open({
        companyName: `Holder ${runId}`,
        email: `holder@taken-${runId}.com`,
        requestedSlug: slug,
      });
      const asker = await open({
        companyName: `Asker ${runId}`,
        email: `asker@taken-${runId}.com`,
      });

      const answer = await service.checkSlugAvailability(asker.orderId, slug);
      expect(answer).toMatchObject({ available: false, reason: 'TAKEN' });
    });

    it('does not tell a session its own held address is taken', async () => {
      const slug = `self-${runId}`.slice(0, 50);
      const mine = await open({
        companyName: `Self Co ${runId}`,
        email: `self@self-${runId}.com`,
        requestedSlug: slug,
      });

      // The wizard re-checks on every keystroke and on reload. Reporting the
      // buyer's own reservation back to them as unavailable would make the
      // field impossible to complete.
      const answer = await service.checkSlugAvailability(mine.orderId, slug);
      expect(answer).toMatchObject({ available: true });
    });

    it('treats a malformed address as unavailable rather than erroring', async () => {
      const asker = await open({
        companyName: `Malformed Co ${runId}`,
        email: `m@malformed-${runId}.com`,
      });

      const answer = await service.checkSlugAvailability(
        asker.orderId,
        'Not A Slug',
      );
      expect(answer).toMatchObject({
        available: false,
        reason: 'INVALID_FORMAT',
      });
    });
  });
});
