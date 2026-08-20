import {
  PrismaClient,
  DomainEventType,
  OutboxEventStatus,
} from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { describeWithDatabase } from './helpers/db-fixtures';
import { OutboxService } from '../src/modules/outbox/outbox.service';
import { OutboxDispatcherService } from '../src/modules/outbox/outbox-dispatcher.service';
import type { OutboxHandler } from '../src/modules/outbox/outbox.types';
import type { PrismaService } from '../src/common/prisma/prisma.service';

/**
 * The outbox guarantees, executed against a real PostgreSQL.
 *
 * WHY THIS CANNOT BE A MOCKED TEST. Every guarantee worth having here is
 * enforced by the database, not by the TypeScript around it:
 *
 *   - emission idempotency is a unique index, not an `if (exists)` branch;
 *   - consumer idempotency is a unique constraint on (event, consumer);
 *   - single-delivery under concurrency is `FOR UPDATE SKIP LOCKED`;
 *   - atomicity is the transaction boundary itself.
 *
 * A Prisma double returns whatever it was told to return, so it will happily
 * "prove" all four while the schema enforces none of them. The unit specs cover
 * the branching; this covers the guarantees.
 */
function createTestPrismaClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString) {
    throw new Error('DATABASE_URL is required for database-backed tests.');
  }
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

describeWithDatabase()('Transactional outbox (DB-backed)', () => {
  jest.setTimeout(180_000);

  const prisma = createTestPrismaClient();
  const service = new OutboxService(prisma as unknown as PrismaService);

  /** Unique per run so repeated runs against the same database never collide. */
  const runId = `e2e-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const key = (suffix: string) => `${runId}:${suffix}`;

  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.outboxEvent.deleteMany({
      where: { correlationId: { startsWith: runId } },
    });
    await prisma.$disconnect();
  });

  function makeEvent(suffix: string, overrides: Record<string, unknown> = {}) {
    return {
      eventType: DomainEventType.SUBSCRIPTION_ACTIVATED,
      idempotencyKey: key(suffix),
      aggregateType: 'Subscription',
      aggregateId: `sub_${suffix}`,
      payload: { subscriptionId: `sub_${suffix}` },
      correlationId: `${runId}:${suffix}`,
      ...overrides,
    };
  }

  it('collapses a repeated emission to one row, by unique index rather than by a pre-check', async () => {
    const first = await prisma.$transaction((tx) =>
      service.emit(tx, makeEvent('dedupe')),
    );
    const second = await prisma.$transaction((tx) =>
      service.emit(tx, makeEvent('dedupe')),
    );

    expect(first.deduplicated).toBe(false);
    expect(second.deduplicated).toBe(true);
    expect(second.id).toBe(first.id);

    const rows = await prisma.outboxEvent.count({
      where: { idempotencyKey: key('dedupe') },
    });
    expect(rows).toBe(1);
  });

  it('loses the event when the surrounding business transaction rolls back', async () => {
    await expect(
      prisma.$transaction(async (tx) => {
        await service.emit(tx, makeEvent('rollback'));
        // Stand-in for a business rule failing after the event was written.
        throw new Error('business rule rejected the change');
      }),
    ).rejects.toThrow('business rule rejected the change');

    const rows = await prisma.outboxEvent.count({
      where: { idempotencyKey: key('rollback') },
    });
    // The whole point of the outbox: no event survives a rolled-back change.
    expect(rows).toBe(0);
  });

  it('refuses a second consumption row for the same (event, consumer)', async () => {
    const { id } = await prisma.$transaction((tx) =>
      service.emit(tx, makeEvent('consume')),
    );

    await prisma.outboxEventConsumption.create({
      data: {
        outboxEventId: id,
        consumerKey: 'test.consumer',
        succeeded: true,
      },
    });

    await expect(
      prisma.outboxEventConsumption.create({
        data: {
          outboxEventId: id,
          consumerKey: 'test.consumer',
          succeeded: true,
        },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });

  it('hands each event to exactly one of two concurrent dispatchers', async () => {
    const suffixes = Array.from({ length: 12 }, (_, i) => `race-${i}`);
    for (const suffix of suffixes) {
      await prisma.$transaction((tx) => service.emit(tx, makeEvent(suffix)));
    }

    // Two dispatchers, each with its own handler recording what it was given.
    const seenByA: string[] = [];
    const seenByB: string[] = [];

    const handlerFor = (sink: string[]): OutboxHandler => ({
      consumerKey: 'test.race-consumer',
      handles: [DomainEventType.SUBSCRIPTION_ACTIVATED],
      handle: async (event) => {
        sink.push(event.id);
        return { status: 'PROCESSED' };
      },
    });

    const dispatcherA = new OutboxDispatcherService(
      prisma as unknown as PrismaService,
      [handlerFor(seenByA)],
    );
    const dispatcherB = new OutboxDispatcherService(
      prisma as unknown as PrismaService,
      [handlerFor(seenByB)],
    );

    await Promise.all([dispatcherA.drain(50), dispatcherB.drain(50)]);

    const ours = new Set(
      (
        await prisma.outboxEvent.findMany({
          where: { correlationId: { startsWith: runId } },
          select: { id: true },
        })
      ).map((row) => row.id),
    );

    const claimedA = seenByA.filter((id) => ours.has(id));
    const claimedB = seenByB.filter((id) => ours.has(id));
    const overlap = claimedA.filter((id) => claimedB.includes(id));

    // FOR UPDATE SKIP LOCKED is the only reason this holds. A find-then-update
    // dispatcher hands the same row to both and this array is non-empty.
    expect(overlap).toEqual([]);

    // And no dispatcher saw the same event twice within its own batch.
    expect(new Set(claimedA).size).toBe(claimedA.length);
    expect(new Set(claimedB).size).toBe(claimedB.length);
  });

  it('settles a delivered event as PROCESSED and does not re-run a succeeded consumer', async () => {
    const { id } = await prisma.$transaction((tx) =>
      service.emit(tx, makeEvent('settle')),
    );

    let invocations = 0;
    const handler: OutboxHandler = {
      consumerKey: 'test.settle-consumer',
      handles: [DomainEventType.SUBSCRIPTION_ACTIVATED],
      handle: async () => {
        invocations += 1;
        return { status: 'PROCESSED' };
      },
    };

    const dispatcher = new OutboxDispatcherService(
      prisma as unknown as PrismaService,
      [handler],
    );

    await dispatcher.drain(50);

    const settled = await prisma.outboxEvent.findUniqueOrThrow({
      where: { id },
      select: { status: true, processedAt: true },
    });
    expect(settled.status).toBe(OutboxEventStatus.PROCESSED);
    expect(settled.processedAt).not.toBeNull();

    const before = invocations;

    // Force a redelivery of an already-consumed event, which is exactly what
    // an at-least-once mechanism does after a crash between work and settle.
    await prisma.outboxEvent.update({
      where: { id },
      data: { status: OutboxEventStatus.PENDING, availableAt: new Date() },
    });
    await dispatcher.drain(50);

    expect(invocations).toBe(before);

    const consumptions = await prisma.outboxEventConsumption.count({
      where: { outboxEventId: id, consumerKey: 'test.settle-consumer' },
    });
    expect(consumptions).toBe(1);
  });
});
