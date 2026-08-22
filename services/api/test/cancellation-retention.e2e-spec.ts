import {
  PrismaClient,
  CancellationType,
  DeletionRequestStatus,
  RetentionHoldType,
  RetentionStatus,
  SubscriptionStatus,
} from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { DbFixtures, describeWithDatabase } from './helpers/db-fixtures';
import { CancellationService } from '../src/modules/billing/services/cancellation.service';
import { RetentionHoldService } from '../src/modules/billing/services/retention-hold.service';
import { ReconciliationService } from '../src/modules/billing/services/reconciliation.service';
import { ActiveEmployeeCountService } from '../src/modules/billing/services/active-employee-count.service';
import { OutboxService } from '../src/modules/outbox/outbox.service';
import type { PrismaService } from '../src/common/prisma/prisma.service';
import type { ConfigService } from '@nestjs/config';

/**
 * Cancellation, retention, holds and reconciliation, against a real PostgreSQL.
 *
 * WHY THIS CANNOT BE A MOCKED TEST. Every promise here is about what is still
 * true later: that access survives to the paid-through date, that a retention
 * window keeps the length the customer was told, that an unreleased hold stops
 * an erasure, and that releasing one hold does not release another. Those are
 * stored-state questions across several writes, which is exactly what a double
 * cannot answer.
 */
function createTestPrismaClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString) {
    throw new Error('DATABASE_URL is required for database-backed tests.');
  }
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

/** Defaults left in place, so the 60-day promise is the thing under test. */
const config = { get: () => undefined } as unknown as ConfigService;
const audit = { log: async () => undefined } as never;

describeWithDatabase()('Cancellation and retention (DB-backed)', () => {
  jest.setTimeout(180_000);

  const prisma = createTestPrismaClient();
  const fixtures = new DbFixtures(prisma, 'cancel-retention');
  const outbox = new OutboxService(prisma as unknown as PrismaService);
  const cancellations = new CancellationService(
    prisma as unknown as PrismaService,
    config,
    outbox,
  );
  const holds = new RetentionHoldService(
    prisma as unknown as PrismaService,
    audit,
  );
  const reconciliation = new ReconciliationService(
    prisma as unknown as PrismaService,
    new ActiveEmployeeCountService(prisma as unknown as PrismaService),
  );

  let tenant: Awaited<ReturnType<DbFixtures['createTenant']>>;
  let terminatedTenant: Awaited<ReturnType<DbFixtures['createTenant']>>;
  const paidThrough = new Date(Date.UTC(2026, 8, 30));

  async function makeSubscription(tenantId: string) {
    const plan = await prisma.plan.findFirstOrThrow({ select: { id: true } });
    return prisma.subscription.create({
      data: {
        tenantId,
        planId: plan.id,
        startDate: new Date(Date.UTC(2026, 7, 1)),
        purchasedSeats: 10,
        currentPeriodEnd: paidThrough,
        status: SubscriptionStatus.ACTIVE,
      },
      select: { id: true },
    });
  }

  beforeAll(async () => {
    await prisma.$connect();
    tenant = await fixtures.createTenant('cancel');
    terminatedTenant = await fixtures.createTenant('terminate');
    await makeSubscription(tenant.id);
    await makeSubscription(terminatedTenant.id);
  });

  afterAll(async () => {
    const ids = [tenant.id, terminatedTenant.id];
    await prisma.outboxEvent.deleteMany({ where: { tenantId: { in: ids } } });
    await prisma.retentionHold.deleteMany({ where: { tenantId: { in: ids } } });
    await prisma.tenantRetention.deleteMany({
      where: { tenantId: { in: ids } },
    });
    await prisma.tenantDeletionRequest.deleteMany({
      where: { tenantId: { in: ids } },
    });
    await prisma.subscriptionCancellation.deleteMany({
      where: { tenantId: { in: ids } },
    });
    await prisma.subscription.deleteMany({ where: { tenantId: { in: ids } } });
    await fixtures.cleanup();
    await prisma.$disconnect();
  });

  it('cancelling a renewal keeps access to the paid-through date', async () => {
    const result = await cancellations.requestCancellation({
      tenantId: tenant.id,
      reason: 'Too expensive',
    });

    expect(result.type).toBe(CancellationType.CANCEL_RENEWAL);
    expect(result.accessEndsAt.toISOString()).toBe(paidThrough.toISOString());

    const subscription = await prisma.subscription.findFirstOrThrow({
      where: { tenantId: tenant.id },
      select: { status: true, cancelAtPeriodEnd: true, autoRenew: true },
    });

    // Billing stops; the workspace does not. They paid for this period.
    expect(subscription.cancelAtPeriodEnd).toBe(true);
    expect(subscription.autoRenew).toBe(false);
    expect(subscription.status).toBe(SubscriptionStatus.ACTIVE);

    // And no retention window has started — nothing has been lost yet.
    const retention = await prisma.tenantRetention.findUnique({
      where: { tenantId: tenant.id },
    });
    expect(retention).toBeNull();
  });

  it('refuses a second pending cancellation', async () => {
    await expect(
      cancellations.requestCancellation({ tenantId: tenant.id }),
    ).rejects.toThrow(/already pending/);
  });

  it('lets the customer change their mind before it takes effect', async () => {
    await cancellations.revokeCancellation(tenant.id);

    const subscription = await prisma.subscription.findFirstOrThrow({
      where: { tenantId: tenant.id },
      select: { cancelAtPeriodEnd: true, autoRenew: true, canceledAt: true },
    });
    expect(subscription.cancelAtPeriodEnd).toBe(false);
    expect(subscription.autoRenew).toBe(true);
    expect(subscription.canceledAt).toBeNull();
  });

  it('terminating now ends access and starts a 60-day retention window', async () => {
    const before = Date.now();
    await cancellations.requestCancellation({
      tenantId: terminatedTenant.id,
      type: CancellationType.TERMINATE_NOW,
      reason: 'Moving to a competitor',
    });

    const subscription = await prisma.subscription.findFirstOrThrow({
      where: { tenantId: terminatedTenant.id },
      select: { status: true },
    });
    expect(subscription.status).toBe(SubscriptionStatus.CANCELED);

    const retention = await prisma.tenantRetention.findUniqueOrThrow({
      where: { tenantId: terminatedTenant.id },
    });
    expect(retention.status).toBe(RetentionStatus.RETAINING);
    // The length is stored, not derived, so editing the default later cannot
    // shorten a window somebody was already promised.
    expect(retention.retentionDays).toBe(60);

    const windowMs =
      retention.scheduledErasureAt.getTime() -
      retention.retentionStartedAt.getTime();
    expect(Math.round(windowMs / (24 * 60 * 60 * 1000))).toBe(60);
    expect(retention.retentionStartedAt.getTime()).toBeGreaterThanOrEqual(
      before - 5000,
    );
  });

  it('does not restart the retention clock on a second termination', async () => {
    const first = await prisma.tenantRetention.findUniqueOrThrow({
      where: { tenantId: terminatedTenant.id },
      select: { scheduledErasureAt: true },
    });

    await cancellations.requestCancellation({
      tenantId: terminatedTenant.id,
      type: CancellationType.TERMINATE_NOW,
    });

    const second = await prisma.tenantRetention.findUniqueOrThrow({
      where: { tenantId: terminatedTenant.id },
      select: { scheduledErasureAt: true },
    });

    // Restarting it would silently extend how long data is kept.
    expect(second.scheduledErasureAt.toISOString()).toBe(
      first.scheduledErasureAt.toISOString(),
    );
  });

  it('an unreleased hold stops erasure even when the window has elapsed', async () => {
    await prisma.tenantRetention.update({
      where: { tenantId: terminatedTenant.id },
      data: { scheduledErasureAt: new Date(Date.now() - 60_000) },
    });

    const legal = await holds.placeHold({
      tenantId: terminatedTenant.id,
      type: RetentionHoldType.LEGAL,
      reason: 'Litigation hold',
      placedByPlatformUser: 'platform_user_test',
    });
    await holds.placeHold({
      tenantId: terminatedTenant.id,
      type: RetentionHoldType.BILLING_DISPUTE,
      reason: 'Disputed final invoice',
      placedByPlatformUser: 'platform_user_test',
    });

    const { due, heldCount } = await cancellations.findTenantsDueForErasure();

    expect(heldCount).toBeGreaterThanOrEqual(1);
    expect(due.map((d) => d.tenantId)).not.toContain(terminatedTenant.id);

    // Releasing ONE hold must not release the other. A single boolean is how
    // data gets erased in the middle of litigation.
    const release = await holds.releaseHold({
      holdId: legal.id,
      releasedByPlatformUser: 'platform_user_test',
      releaseReason: 'Counsel cleared it',
    });
    expect(release.remainingHolds).toBe(1);

    const stillHeld = await prisma.tenantRetention.findUniqueOrThrow({
      where: { tenantId: terminatedTenant.id },
      select: { status: true },
    });
    expect(stillHeld.status).toBe(RetentionStatus.ON_HOLD);
  });

  it('returns to retaining only when the last hold is released', async () => {
    const remaining = await holds.listActiveHolds(terminatedTenant.id);
    expect(remaining).toHaveLength(1);

    const release = await holds.releaseHold({
      holdId: remaining[0].id,
      releasedByPlatformUser: 'platform_user_test',
      releaseReason: 'Dispute settled',
    });
    expect(release.remainingHolds).toBe(0);

    const retention = await prisma.tenantRetention.findUniqueOrThrow({
      where: { tenantId: terminatedTenant.id },
      select: { status: true },
    });
    expect(retention.status).toBe(RetentionStatus.RETAINING);

    const { due } = await cancellations.findTenantsDueForErasure();
    expect(due.map((d) => d.tenantId)).toContain(terminatedTenant.id);
  });

  it('an owner deletion request is a request, never an erasure', async () => {
    await expect(
      cancellations.requestTenantDeletion({
        tenantId: tenant.id,
        reason: 'Closing the business',
        requestedByUserId: 'user-1',
        confirmationPhrase: 'not the workspace name',
      }),
    ).rejects.toThrow(/exactly match the workspace name/);

    const result = await cancellations.requestTenantDeletion({
      tenantId: tenant.id,
      reason: 'Closing the business',
      requestedByUserId: 'user-1',
      confirmationPhrase: tenant.name,
    });

    const request = await prisma.tenantDeletionRequest.findUniqueOrThrow({
      where: { id: result.requestId },
      select: { status: true, origin: true },
    });

    // REQUESTED, not APPROVED and certainly not executed. An owner-initiated
    // deletion that erased immediately would make an angry afternoon permanent.
    expect(request.status).toBe(DeletionRequestStatus.REQUESTED);
    expect(request.origin).toBe('TENANT_OWNER');

    const stillThere = await prisma.tenant.findUnique({
      where: { id: tenant.id },
      select: { id: true },
    });
    expect(stillThere).not.toBeNull();
  });

  it('reconciliation reports a provider quantity mismatch without fixing it', async () => {
    await prisma.subscription.updateMany({
      where: { tenantId: tenant.id },
      data: { stripeQuantity: 99, purchasedSeats: 10 },
    });

    const { runId } = await reconciliation.runInternal();

    const finding = await prisma.reconciliationFinding.findFirst({
      where: { runId, checkKey: 'subscription.quantity_vs_provider' },
      select: {
        outcome: true,
        expectedValue: true,
        actualValue: true,
        autoFixApplied: true,
      },
    });

    expect(finding?.outcome).toBe('MISMATCH');
    expect(finding?.expectedValue).toBe('10');
    expect(finding?.actualValue).toBe('99');
    // Either side could be right depending on where a seat change failed, so a
    // reconciler that picked one would be a second, unaudited billing writer.
    expect(finding?.autoFixApplied).toBe(false);

    const stillDisagreeing = await prisma.subscription.findFirstOrThrow({
      where: { tenantId: tenant.id },
      select: { stripeQuantity: true, purchasedSeats: true },
    });
    expect(stillDisagreeing.stripeQuantity).toBe(99);
    expect(stillDisagreeing.purchasedSeats).toBe(10);
  });

  it('summarises a run from its own findings', async () => {
    const { runId } = await reconciliation.runInternal();

    const run = await prisma.reconciliationRun.findUniqueOrThrow({
      where: { id: runId },
    });
    const findings = await prisma.reconciliationFinding.count({
      where: { runId },
    });

    expect(run.status).toBe('COMPLETED');
    expect(run.completedAt).not.toBeNull();
    // Derived from the rows rather than incremented as it goes, so the summary
    // can never disagree with what it summarises.
    expect(run.checkedCount).toBe(findings);
    expect(
      run.warningCount + run.mismatchCount + run.manualActionRequiredCount,
    ).toBeLessThanOrEqual(findings);
  });
});
