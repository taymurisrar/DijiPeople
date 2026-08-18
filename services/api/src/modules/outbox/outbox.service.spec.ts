import { Prisma } from '@prisma/client';
import { DomainEventType } from '@prisma/client';
import { OutboxService } from './outbox.service';
import { buildIdempotencyKey } from './outbox.types';
import type { PrismaService } from '../../common/prisma/prisma.service';

function uniqueViolation(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: 'test',
  });
}

type TxDouble = {
  outboxEvent: {
    create: jest.Mock;
    findUniqueOrThrow: jest.Mock;
  };
};

function makeTx(): TxDouble {
  return {
    outboxEvent: {
      create: jest.fn(),
      findUniqueOrThrow: jest.fn(),
    },
  };
}

describe('OutboxService', () => {
  let service: OutboxService;
  let prisma: { $transaction: jest.Mock };

  beforeEach(() => {
    prisma = { $transaction: jest.fn() };
    service = new OutboxService(prisma as unknown as PrismaService);
  });

  const input = {
    eventType: DomainEventType.SUBSCRIPTION_ACTIVATED,
    idempotencyKey: 'SUBSCRIPTION_ACTIVATED:sub_1',
    aggregateType: 'Subscription',
    aggregateId: 'sub_1',
    payload: { subscriptionId: 'sub_1' },
  };

  it('writes the event through the caller transaction, never its own', async () => {
    const tx = makeTx();
    tx.outboxEvent.create.mockResolvedValue({ id: 'evt_1' });

    const result = await service.emit(
      tx as unknown as Prisma.TransactionClient,
      input,
    );

    expect(result).toEqual({ id: 'evt_1', deduplicated: false });
    expect(tx.outboxEvent.create).toHaveBeenCalledTimes(1);
    // The whole atomicity guarantee is that emit never opens a second
    // transaction behind the caller's back.
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('treats a duplicate idempotency key as success and returns the existing event', async () => {
    const tx = makeTx();
    tx.outboxEvent.create.mockRejectedValue(uniqueViolation());
    tx.outboxEvent.findUniqueOrThrow.mockResolvedValue({ id: 'evt_existing' });

    const result = await service.emit(
      tx as unknown as Prisma.TransactionClient,
      input,
    );

    expect(result).toEqual({ id: 'evt_existing', deduplicated: true });
    expect(tx.outboxEvent.findUniqueOrThrow).toHaveBeenCalledWith({
      where: { idempotencyKey: input.idempotencyKey },
      select: { id: true },
    });
  });

  it('propagates a non-unique failure so the caller transaction rolls back with it', async () => {
    const tx = makeTx();
    const failure = new Error('connection reset');
    tx.outboxEvent.create.mockRejectedValue(failure);

    await expect(
      service.emit(tx as unknown as Prisma.TransactionClient, input),
    ).rejects.toThrow('connection reset');

    // A business change whose event could not be written must not commit.
    expect(tx.outboxEvent.findUniqueOrThrow).not.toHaveBeenCalled();
  });

  it('defaults the attempt budget and stamps a correlation id when none is given', async () => {
    const tx = makeTx();
    tx.outboxEvent.create.mockResolvedValue({ id: 'evt_2' });

    await service.emit(tx as unknown as Prisma.TransactionClient, input);

    const data = tx.outboxEvent.create.mock.calls[0][0].data;
    expect(data.maxAttempts).toBe(8);
    expect(typeof data.correlationId).toBe('string');
    expect(data.correlationId.length).toBeGreaterThan(0);
    expect(data.tenantId).toBeNull();
  });
});

describe('buildIdempotencyKey', () => {
  it('derives the same key from the same transition', () => {
    const first = buildIdempotencyKey(
      DomainEventType.PAYMENT_CONFIRMED,
      'sub_1',
      'inv_9',
    );
    const second = buildIdempotencyKey(
      DomainEventType.PAYMENT_CONFIRMED,
      'sub_1',
      'inv_9',
    );

    expect(first).toBe(second);
    expect(first).toBe('PAYMENT_CONFIRMED:sub_1:inv_9');
  });

  it('drops empty parts rather than emitting a key with a hole in it', () => {
    expect(
      buildIdempotencyKey(DomainEventType.TENANT_READY, 'tenant_1', '  '),
    ).toBe('TENANT_READY:tenant_1');
  });
});
