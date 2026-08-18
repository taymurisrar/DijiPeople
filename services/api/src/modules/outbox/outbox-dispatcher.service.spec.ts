import { DomainEventType, OutboxEventStatus } from '@prisma/client';
import type { OutboxEvent } from '@prisma/client';
import { OutboxDispatcherService } from './outbox-dispatcher.service';
import type { OutboxHandler } from './outbox.types';
import type { PrismaService } from '../../common/prisma/prisma.service';

function makeEvent(overrides: Partial<OutboxEvent> = {}): OutboxEvent {
  return {
    id: 'evt_1',
    eventType: DomainEventType.SUBSCRIPTION_ACTIVATED,
    idempotencyKey: 'SUBSCRIPTION_ACTIVATED:sub_1',
    aggregateType: 'Subscription',
    aggregateId: 'sub_1',
    tenantId: null,
    customerAccountId: null,
    correlationId: 'corr_1',
    payload: { subscriptionId: 'sub_1' },
    status: OutboxEventStatus.CLAIMED,
    attemptCount: 1,
    maxAttempts: 8,
    availableAt: new Date(),
    claimedAt: new Date(),
    claimedBy: 'test',
    processedAt: null,
    lastError: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as OutboxEvent;
}

type PrismaDouble = {
  $queryRaw: jest.Mock;
  outboxEvent: { updateMany: jest.Mock; update: jest.Mock };
  outboxEventConsumption: { findUnique: jest.Mock; upsert: jest.Mock };
};

function makePrisma(claimed: OutboxEvent[]): PrismaDouble {
  return {
    $queryRaw: jest.fn().mockResolvedValue(claimed),
    outboxEvent: {
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      update: jest.fn().mockResolvedValue({}),
    },
    outboxEventConsumption: {
      findUnique: jest.fn().mockResolvedValue(null),
      upsert: jest.fn().mockResolvedValue({}),
    },
  };
}

function build(prisma: PrismaDouble, handlers: OutboxHandler[]) {
  return new OutboxDispatcherService(
    prisma as unknown as PrismaService,
    handlers,
  );
}

describe('OutboxDispatcherService', () => {
  it('processes an event with no registered consumer instead of failing it', async () => {
    const prisma = makePrisma([makeEvent()]);
    const dispatcher = build(prisma, []);

    const result = await dispatcher.drain();

    expect(result).toMatchObject({ claimed: 1, processed: 1, failed: 0 });
    expect(prisma.outboxEvent.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: OutboxEventStatus.PROCESSED }),
      }),
    );
  });

  it('does not re-run a consumer that already succeeded on this event', async () => {
    const prisma = makePrisma([makeEvent()]);
    prisma.outboxEventConsumption.findUnique.mockResolvedValue({
      succeeded: true,
    });

    const handle = jest.fn();
    const dispatcher = build(prisma, [
      {
        consumerKey: 'test.consumer',
        handles: [DomainEventType.SUBSCRIPTION_ACTIVATED],
        handle,
      },
    ]);

    const result = await dispatcher.drain();

    // This is the guarantee that makes redelivery safe when only one of
    // several consumers failed the first time round.
    expect(handle).not.toHaveBeenCalled();
    expect(result.processed).toBe(1);
  });

  it('schedules a retry and records the failed consumption when a handler throws', async () => {
    const prisma = makePrisma([makeEvent({ attemptCount: 2 })]);
    const dispatcher = build(prisma, [
      {
        consumerKey: 'test.consumer',
        handles: [DomainEventType.SUBSCRIPTION_ACTIVATED],
        handle: jest.fn().mockRejectedValue(new Error('downstream timeout')),
      },
    ]);

    const result = await dispatcher.drain();

    expect(result).toMatchObject({ retried: 1, failed: 0 });
    expect(prisma.outboxEventConsumption.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          consumerKey: 'test.consumer',
          succeeded: false,
        }),
      }),
    );

    const update = prisma.outboxEvent.update.mock.calls[0][0];
    expect(update.data.status).toBe(OutboxEventStatus.RETRY_SCHEDULED);
    // Backoff must push delivery into the future, or the next poll spins on it.
    expect(update.data.availableAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('fails the event once the attempt budget is exhausted rather than retrying forever', async () => {
    const prisma = makePrisma([makeEvent({ attemptCount: 8, maxAttempts: 8 })]);
    const dispatcher = build(prisma, [
      {
        consumerKey: 'test.consumer',
        handles: [DomainEventType.SUBSCRIPTION_ACTIVATED],
        handle: jest.fn().mockRejectedValue(new Error('still broken')),
      },
    ]);

    const result = await dispatcher.drain();

    expect(result).toMatchObject({ failed: 1, retried: 0 });
    expect(prisma.outboxEvent.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: OutboxEventStatus.FAILED }),
      }),
    );
  });

  it('separates "a human must act" from "try again"', async () => {
    const prisma = makePrisma([makeEvent()]);
    const dispatcher = build(prisma, [
      {
        consumerKey: 'test.consumer',
        handles: [DomainEventType.SUBSCRIPTION_ACTIVATED],
        handle: jest.fn().mockResolvedValue({
          status: 'MANUAL_ACTION_REQUIRED',
          detail: 'no published price for this market',
        }),
      },
    ]);

    const result = await dispatcher.drain();

    expect(result.manualActionRequired).toBe(1);
    // Retrying something no retry can fix would burn the budget and then
    // present it as a generic infrastructure failure.
    expect(result.retried).toBe(0);
    expect(prisma.outboxEvent.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: OutboxEventStatus.MANUAL_ACTION_REQUIRED,
        }),
      }),
    );
  });

  it('returns claims that outlived their lease to the retry pool before claiming more', async () => {
    const prisma = makePrisma([]);
    prisma.outboxEvent.updateMany.mockResolvedValue({ count: 3 });
    const dispatcher = build(prisma, []);

    await dispatcher.drain();

    const call = prisma.outboxEvent.updateMany.mock.calls[0][0];
    expect(call.where.status).toBe(OutboxEventStatus.CLAIMED);
    expect(call.data.status).toBe(OutboxEventStatus.RETRY_SCHEDULED);
    // The attempt was already counted at claim time; counting it again would
    // exhaust the budget of an event whose only problem was a restart.
    expect(call.data).not.toHaveProperty('attemptCount');
  });

  it('runs each consumer registered for the event type', async () => {
    const prisma = makePrisma([makeEvent()]);
    const first = jest.fn().mockResolvedValue({ status: 'PROCESSED' });
    const second = jest.fn().mockResolvedValue({ status: 'PROCESSED' });

    const dispatcher = build(prisma, [
      {
        consumerKey: 'a',
        handles: [DomainEventType.SUBSCRIPTION_ACTIVATED],
        handle: first,
      },
      {
        consumerKey: 'b',
        handles: [DomainEventType.SUBSCRIPTION_ACTIVATED],
        handle: second,
      },
      {
        consumerKey: 'c',
        handles: [DomainEventType.TENANT_READY],
        handle: jest.fn(),
      },
    ]);

    await dispatcher.drain();

    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
  });
});
