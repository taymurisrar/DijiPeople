import {
  PrismaClient,
  EmployeeEmploymentStatus,
  SeatOverageStatus,
} from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { DbFixtures, describeWithDatabase } from './helpers/db-fixtures';
import { SeatUsageService } from '../src/modules/billing/services/seat-usage.service';
import { ActiveEmployeeCountService } from '../src/modules/billing/services/active-employee-count.service';
import { OutboxService } from '../src/modules/outbox/outbox.service';
import type { PrismaService } from '../src/common/prisma/prisma.service';
import type { ConfigService } from '@nestjs/config';

/**
 * The active-employee seat engine, against a real PostgreSQL.
 *
 * WHY THIS CANNOT BE A MOCKED TEST. The engine's correctness is mostly about
 * what is *stored* across repeated runs — that a re-sampled day updates rather
 * than duplicates, that a peak never moves down, that a closed period stops
 * accepting samples, and that one episode covers a multi-day overage. Those are
 * upsert semantics and unique constraints, and a double asserts nothing about
 * either.
 */
function createTestPrismaClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString) {
    throw new Error('DATABASE_URL is required for database-backed tests.');
  }
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

/** Thresholds left at their defaults, so the classification test is meaningful. */
const config = { get: () => undefined } as unknown as ConfigService;

describeWithDatabase()('Active-employee seat engine (DB-backed)', () => {
  jest.setTimeout(180_000);

  const prisma = createTestPrismaClient();
  const fixtures = new DbFixtures(prisma, 'seat-usage');

  const activeEmployees = new ActiveEmployeeCountService(
    prisma as unknown as PrismaService,
  );
  const outbox = new OutboxService(prisma as unknown as PrismaService);
  const service = new SeatUsageService(
    prisma as unknown as PrismaService,
    config,
    activeEmployees,
    outbox,
  );

  let tenant: Awaited<ReturnType<DbFixtures['createTenant']>>;
  let subscriptionId: string;

  const day = (n: number) => new Date(Date.UTC(2026, 5, n, 12, 0, 0));
  const periodStart = new Date(Date.UTC(2026, 5, 1));
  const periodEnd = new Date(Date.UTC(2026, 6, 1));

  beforeAll(async () => {
    await prisma.$connect();
    tenant = await fixtures.createTenant('seats');

    const plan = await prisma.plan.findFirst({ select: { id: true } });
    if (!plan) {
      throw new Error('A Plan row is required; run seed:config first.');
    }

    const subscription = await prisma.subscription.create({
      data: {
        tenantId: tenant.id,
        planId: plan.id,
        startDate: periodStart,
        purchasedSeats: 20,
        currentPeriodStart: periodStart,
        currentPeriodEnd: periodEnd,
      },
      select: { id: true },
    });
    subscriptionId = subscription.id;
  });

  afterAll(async () => {
    await prisma.outboxEvent.deleteMany({ where: { tenantId: tenant.id } });
    await prisma.seatOverageEvent.deleteMany({
      where: { tenantId: tenant.id },
    });
    await prisma.seatUsagePeriod.deleteMany({ where: { tenantId: tenant.id } });
    await prisma.seatUsageSample.deleteMany({ where: { tenantId: tenant.id } });
    await prisma.subscription.deleteMany({ where: { tenantId: tenant.id } });
    await fixtures.cleanup();
    await prisma.$disconnect();
  });

  async function sample(count: number, on: Date) {
    return service.recordSample({
      subscriptionId,
      tenantId: tenant.id,
      purchasedCapacity: 20,
      activeEmployeeCount: count,
      periodStart,
      periodEnd,
      now: on,
    });
  }

  it('re-sampling the same day updates the row instead of adding a second one', async () => {
    await sample(10, day(1));
    await sample(12, day(1));

    const rows = await prisma.seatUsageSample.findMany({
      where: { subscriptionId },
    });
    // A duplicate row would double this period's average for that day.
    expect(rows).toHaveLength(1);
    expect(rows[0].activeEmployeeCount).toBe(12);
  });

  it('holds the peak when the count falls back', async () => {
    await sample(18, day(2));
    await sample(11, day(3));

    const period = await prisma.seatUsagePeriod.findUniqueOrThrow({
      where: { subscriptionId_periodStart: { subscriptionId, periodStart } },
    });

    // A tenant that reached 18 was an 18-employee tenant that month, even if it
    // ended at 11. A peak that tracked the latest value would under-bill it.
    expect(period.peakActiveEmployees).toBe(18);
    expect(period.endingActiveEmployees).toBe(11);
    expect(period.peakOverage).toBe(0);
  });

  it('opens one episode for a multi-day overage rather than one per day', async () => {
    await sample(22, day(4));
    await sample(23, day(5));
    await sample(21, day(6));

    const episodes = await prisma.seatOverageEvent.findMany({
      where: { subscriptionId },
    });

    expect(episodes).toHaveLength(1);
    expect(episodes[0].peakActiveEmployees).toBe(23);
    expect(episodes[0].peakOverage).toBe(3);
    // 3 over 20 is 15% — ordinary growth, warned about, not stopped.
    expect(episodes[0].status).toBe(SeatOverageStatus.WARNED);
    expect(episodes[0].resolvedAt).toBeNull();
  });

  it('announces the overage on the outbox exactly once for the episode', async () => {
    const events = await prisma.outboxEvent.findMany({
      where: { tenantId: tenant.id, eventType: 'SEAT_OVERAGE_DETECTED' },
    });
    expect(events).toHaveLength(1);
  });

  it('escalates an abnormal jump to review instead of silently billing it', async () => {
    // The import-accident shape: 20 capacity, 900 active overnight.
    await sample(900, day(7));

    const episode = await prisma.seatOverageEvent.findFirstOrThrow({
      where: { subscriptionId, resolvedAt: null },
    });

    expect(episode.status).toBe(SeatOverageStatus.REVIEW_REQUIRED);
    expect(episode.peakActiveEmployees).toBe(900);
    expect(episode.peakOveragePercent).toBe(4400);
  });

  it('does not de-escalate when the count dips back into ordinary overage', async () => {
    await sample(22, day(8));

    const episode = await prisma.seatOverageEvent.findFirstOrThrow({
      where: { subscriptionId, resolvedAt: null },
    });

    // Dropping back to WARNED would discard the reason a human was asked to
    // look at the 900 in the first place.
    expect(episode.status).toBe(SeatOverageStatus.REVIEW_REQUIRED);
  });

  it('resolves the episode when the count returns within capacity', async () => {
    await sample(15, day(9));

    const open = await prisma.seatOverageEvent.findFirst({
      where: { subscriptionId, resolvedAt: null },
    });
    expect(open).toBeNull();

    const episode = await prisma.seatOverageEvent.findFirstOrThrow({
      where: { subscriptionId },
      orderBy: { detectedAt: 'desc' },
    });
    // Resolved, but the REVIEW_REQUIRED verdict is preserved — somebody still
    // has to say what should be billed for those days.
    expect(episode.resolvedAt).not.toBeNull();
    expect(episode.status).toBe(SeatOverageStatus.REVIEW_REQUIRED);
  });

  it('counts only billable employment statuses, and never soft-deleted rows', async () => {
    const base = {
      tenantId: tenant.id,
      firstName: 'Seat',
      phone: '+920000000000',
      hireDate: periodStart,
    };

    const statuses: Array<[EmployeeEmploymentStatus, boolean]> = [
      [EmployeeEmploymentStatus.ACTIVE, false],
      [EmployeeEmploymentStatus.PROBATION, false],
      [EmployeeEmploymentStatus.NOTICE, false],
      [EmployeeEmploymentStatus.INACTIVE, false],
      [EmployeeEmploymentStatus.TERMINATED, false],
      [EmployeeEmploymentStatus.ACTIVE, true],
    ];

    let index = 0;
    for (const [employmentStatus, isDeleted] of statuses) {
      index += 1;
      await prisma.employee.create({
        data: {
          ...base,
          lastName: `Case${index}`,
          employeeCode: `SEAT-${fixtures.runId}-${index}`,
          email: `seat-${fixtures.runId}-${index}@example.com`,
          employmentStatus,
          isDeleted,
        },
      });
    }

    // ACTIVE + PROBATION + NOTICE = 3. INACTIVE, TERMINATED and the
    // soft-deleted ACTIVE row are all excluded.
    await expect(activeEmployees.countForTenant(tenant.id)).resolves.toBe(3);

    const batched = await activeEmployees.countForTenants([tenant.id]);
    expect(batched.get(tenant.id)).toBe(3);
  });

  it('returns zero rather than omitting a tenant with no billable employees', async () => {
    const empty = await fixtures.createTenant('seats-empty');
    const counts = await activeEmployees.countForTenants([empty.id]);

    // An absent key reads as "unknown" at the call site and would silently skip
    // that tenant's sample, leaving a permanent hole in its billing series.
    expect(counts.has(empty.id)).toBe(true);
    expect(counts.get(empty.id)).toBe(0);
  });
});
