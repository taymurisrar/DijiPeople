import {
  PrismaClient,
  EmployeeEmploymentStatus,
  PlanChangeDirection,
  PlanChangeStatus,
  SeatChangeDirection,
  SeatChangeStatus,
} from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { DbFixtures, describeWithDatabase } from './helpers/db-fixtures';
import { SeatChangeService } from '../src/modules/billing/services/seat-change.service';
import { PlanChangeService } from '../src/modules/billing/services/plan-change.service';
import { ActiveEmployeeCountService } from '../src/modules/billing/services/active-employee-count.service';
import { OutboxService } from '../src/modules/outbox/outbox.service';
import type { PrismaService } from '../src/common/prisma/prisma.service';

/**
 * Seat and plan change lifecycle, against a real PostgreSQL.
 *
 * WHY THIS CANNOT BE A MOCKED TEST. The whole behaviour is about *when* a
 * column moves and what is left behind: an increase writes capacity now, a
 * decrease writes a future value and leaves the current one alone, and a
 * scheduler later swaps them. A double cannot demonstrate that the paid-for
 * capacity survived the request, which is the commercial promise being made.
 */
function createTestPrismaClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString) {
    throw new Error('DATABASE_URL is required for database-backed tests.');
  }
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

describeWithDatabase()('Seat and plan changes (DB-backed)', () => {
  jest.setTimeout(180_000);

  const prisma = createTestPrismaClient();
  const fixtures = new DbFixtures(prisma, 'seat-plan-change');
  const activeEmployees = new ActiveEmployeeCountService(
    prisma as unknown as PrismaService,
  );
  const outbox = new OutboxService(prisma as unknown as PrismaService);
  const seatChanges = new SeatChangeService(
    prisma as unknown as PrismaService,
    outbox,
    activeEmployees,
  );
  const planChanges = new PlanChangeService(
    prisma as unknown as PrismaService,
    outbox,
  );

  let tenant: Awaited<ReturnType<DbFixtures['createTenant']>>;
  let subscriptionId: string;
  let cheapPlanId: string;
  let dearPlanId: string;
  let cheapPlanPriceId: string;

  const renewalDate = new Date(Date.UTC(2026, 8, 1));

  beforeAll(async () => {
    await prisma.$connect();
    tenant = await fixtures.createTenant('seatplan');

    // Two plans with authoritative PlanPrice rows. Direction is decided from
    // PlanPrice, never from the deprecated Plan.monthlyBasePrice, so the
    // fixture has to provide real prices for the comparison to mean anything.
    const cheap = await prisma.plan.create({
      data: {
        key: `spc-cheap-${fixtures.runId}`,
        name: `SPC Cheap ${fixtures.runId}`,
        currency: 'PKR',
      },
      select: { id: true },
    });
    const dear = await prisma.plan.create({
      data: {
        key: `spc-dear-${fixtures.runId}`,
        name: `SPC Dear ${fixtures.runId}`,
        currency: 'PKR',
      },
      select: { id: true },
    });
    cheapPlanId = cheap.id;
    dearPlanId = dear.id;

    const cheapPrice = await prisma.planPrice.create({
      data: {
        planId: cheapPlanId,
        billingCycle: 'MONTHLY',
        currency: 'PKR',
        unitAmount: 1000,
        isActive: true,
      },
      select: { id: true },
    });
    await prisma.planPrice.create({
      data: {
        planId: dearPlanId,
        billingCycle: 'MONTHLY',
        currency: 'PKR',
        unitAmount: 5000,
        isActive: true,
      },
    });
    cheapPlanPriceId = cheapPrice.id;

    const subscription = await prisma.subscription.create({
      data: {
        tenantId: tenant.id,
        planId: cheapPlanId,
        planPriceId: cheapPlanPriceId,
        startDate: new Date(Date.UTC(2026, 7, 1)),
        purchasedSeats: 20,
        renewalDate,
      },
      select: { id: true },
    });
    subscriptionId = subscription.id;
  });

  afterAll(async () => {
    await prisma.outboxEvent.deleteMany({ where: { tenantId: tenant.id } });
    await prisma.planChangeRequest.deleteMany({
      where: { tenantId: tenant.id },
    });
    await prisma.seatChangeRequest.deleteMany({
      where: { tenantId: tenant.id },
    });
    await prisma.subscription.deleteMany({ where: { tenantId: tenant.id } });
    await prisma.planPrice.deleteMany({
      where: { planId: { in: [cheapPlanId, dearPlanId] } },
    });
    await prisma.plan.deleteMany({
      where: { id: { in: [cheapPlanId, dearPlanId] } },
    });
    await fixtures.cleanup();
    await prisma.$disconnect();
  });

  async function capacity() {
    return prisma.subscription.findUniqueOrThrow({
      where: { id: subscriptionId },
      select: {
        purchasedSeats: true,
        scheduledSeats: true,
        scheduledSeatsEffectiveAt: true,
      },
    });
  }

  it('applies a seat increase immediately', async () => {
    const result = await seatChanges.requestChange({
      tenantId: tenant.id,
      toSeats: 30,
    });

    expect(result.direction).toBe(SeatChangeDirection.INCREASE);
    expect(result.appliedImmediately).toBe(true);
    expect(result.status).toBe(SeatChangeStatus.APPLIED);

    // Somebody hired people and needs them working today.
    expect((await capacity()).purchasedSeats).toBe(30);
  });

  it('schedules a seat decrease for renewal and leaves paid-for capacity alone', async () => {
    const result = await seatChanges.requestChange({
      tenantId: tenant.id,
      toSeats: 22,
    });

    expect(result.direction).toBe(SeatChangeDirection.DECREASE);
    expect(result.appliedImmediately).toBe(false);
    expect(result.effectiveAt.toISOString()).toBe(renewalDate.toISOString());

    const state = await capacity();
    // The customer paid for 30 this period and keeps 30.
    expect(state.purchasedSeats).toBe(30);
    expect(state.scheduledSeats).toBe(22);
    expect(state.scheduledSeatsEffectiveAt?.toISOString()).toBe(
      renewalDate.toISOString(),
    );
  });

  it('cancels a pending decrease when the customer increases instead', async () => {
    await seatChanges.requestChange({ tenantId: tenant.id, toSeats: 40 });

    const state = await capacity();
    expect(state.purchasedSeats).toBe(40);
    // Leaving the old decrease to fire at renewal would undo the increase they
    // just paid for.
    expect(state.scheduledSeats).toBeNull();

    const cancelled = await prisma.seatChangeRequest.findMany({
      where: {
        subscriptionId,
        direction: SeatChangeDirection.DECREASE,
        status: SeatChangeStatus.CANCELLED,
      },
    });
    expect(cancelled.length).toBeGreaterThan(0);
  });

  it('refuses a decrease below the people already working', async () => {
    for (let i = 0; i < 3; i += 1) {
      await prisma.employee.create({
        data: {
          tenantId: tenant.id,
          firstName: 'Seat',
          lastName: `Holder${i}`,
          employeeCode: `SPC-${fixtures.runId}-${i}`,
          email: `spc-${fixtures.runId}-${i}@example.com`,
          phone: '+920000000000',
          hireDate: new Date(Date.UTC(2026, 7, 1)),
          employmentStatus: EmployeeEmploymentStatus.ACTIVE,
        },
      });
    }

    // Accepting this and locking three people out at renewal — when nobody
    // remembers the request — is worse than refusing now.
    await expect(
      seatChanges.requestChange({ tenantId: tenant.id, toSeats: 2 }),
    ).rejects.toThrow(/3 employees are currently active/);
  });

  it('applies a scheduled decrease once its effective date arrives', async () => {
    await seatChanges.requestChange({ tenantId: tenant.id, toSeats: 25 });
    expect((await capacity()).purchasedSeats).toBe(40);

    const result = await seatChanges.applyDueChanges(
      new Date(renewalDate.getTime() + 1000),
    );

    expect(result.applied).toBeGreaterThanOrEqual(1);
    const state = await capacity();
    expect(state.purchasedSeats).toBe(25);
    expect(state.scheduledSeats).toBeNull();
  });

  it('previews a downgrade without performing it, and never promises data loss', async () => {
    const before = await prisma.subscription.findUniqueOrThrow({
      where: { id: subscriptionId },
      select: { planId: true },
    });

    // Move up first so there is something to come down from.
    await planChanges.requestChange({
      tenantId: tenant.id,
      toPlanId: dearPlanId,
    });

    const preview = await planChanges.preview(tenant.id, cheapPlanId);

    expect(preview.direction).toBe(PlanChangeDirection.DOWNGRADE);
    expect(preview.dataRetained).toBe(true);
    expect(Array.isArray(preview.impact.lost)).toBe(true);

    // A preview is a pure read — the plan must not have moved because somebody
    // looked at the consequences screen.
    const after = await prisma.subscription.findUniqueOrThrow({
      where: { id: subscriptionId },
      select: { planId: true },
    });
    expect(after.planId).toBe(dearPlanId);
    expect(before.planId).toBe(cheapPlanId);
  });

  it('applies an upgrade immediately and schedules a downgrade for renewal', async () => {
    const upgraded = await prisma.subscription.findUniqueOrThrow({
      where: { id: subscriptionId },
      select: { planId: true },
    });
    expect(upgraded.planId).toBe(dearPlanId);

    const downgrade = await planChanges.requestChange({
      tenantId: tenant.id,
      toPlanId: cheapPlanId,
    });

    expect(downgrade.direction).toBe(PlanChangeDirection.DOWNGRADE);
    expect(downgrade.status).toBe(PlanChangeStatus.SCHEDULED);

    // Still on the plan they paid for, until renewal.
    const during = await prisma.subscription.findUniqueOrThrow({
      where: { id: subscriptionId },
      select: { planId: true },
    });
    expect(during.planId).toBe(dearPlanId);

    await planChanges.applyDueChanges(new Date(renewalDate.getTime() + 1000));

    const after = await prisma.subscription.findUniqueOrThrow({
      where: { id: subscriptionId },
      select: { planId: true },
    });
    expect(after.planId).toBe(cheapPlanId);
  });

  it('freezes the entitlement impact on the request', async () => {
    const request = await prisma.planChangeRequest.findFirstOrThrow({
      where: { tenantId: tenant.id, direction: PlanChangeDirection.DOWNGRADE },
      orderBy: { createdAt: 'desc' },
      select: { entitlementImpact: true },
    });

    const impact = request.entitlementImpact as Record<string, unknown>;
    // Frozen so a later edit to either plan cannot rewrite what the customer
    // was shown when they agreed.
    expect(impact).toHaveProperty('lost');
    expect(impact).toHaveProperty('gained');
    expect(impact).toHaveProperty('retained');
  });

  it('announces every change on the outbox', async () => {
    const events = await prisma.outboxEvent.findMany({
      where: { tenantId: tenant.id },
      select: { eventType: true },
    });
    const types = new Set(events.map((e) => e.eventType));

    expect(types.has('SEAT_CHANGE_REQUESTED')).toBe(true);
    expect(types.has('SEAT_CHANGE_APPLIED')).toBe(true);
    expect(types.has('PLAN_CHANGE_REQUESTED')).toBe(true);
    expect(types.has('PLAN_CHANGE_APPLIED')).toBe(true);
  });
});
