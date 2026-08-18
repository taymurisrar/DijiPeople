import { Prisma } from '@prisma/client';
import { DomainEventType } from '@prisma/client';
import { OutboxService } from './outbox.service';
import { buildIdempotencyKey } from './outbox.types';
import type { PrismaService } from '../../common/prisma/prisma.service';

type TxDouble = {
  $queryRaw: jest.Mock;
  outboxEvent: {
    findUniqueOrThrow: jest.Mock;
  };
};

function makeTx(): TxDouble {
  return {
    $queryRaw: jest.fn(),
    outboxEvent: {
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
    tx.$queryRaw.mockResolvedValue([{ id: 'evt_1' }]);

    const result = await service.emit(
      tx as unknown as Prisma.TransactionClient,
      input,
    );

    expect(result).toEqual({ id: 'evt_1', deduplicated: false });
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    // The whole atomicity guarantee is that emit never opens a second
    // transaction behind the caller's back.
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  /*
   * BUG-0070. The original implementation used create() + catch(P2002) + read.
   * On PostgreSQL the violation aborts the transaction, so the read in the catch
   * block could never run and the caller's business write was poisoned too.
   * A Prisma double cannot reproduce that, which is why the DB-backed proof in
   * test/outbox-delivery.e2e-spec.ts is the authority for this behaviour and
   * these unit tests only pin the shape of the query.
   */
  it('uses ON CONFLICT DO NOTHING so a duplicate never aborts the caller transaction', async () => {
    const tx = makeTx();
    tx.$queryRaw.mockResolvedValue([{ id: 'evt_1' }]);

    await service.emit(tx as unknown as Prisma.TransactionClient, input);

    const sql = tx.$queryRaw.mock.calls[0][0].join('?');
    expect(sql).toContain('ON CONFLICT');
    expect(sql).toContain('DO NOTHING');
    expect(sql).toContain('RETURNING');
  });

  it('treats an empty RETURNING as a duplicate and returns the existing event', async () => {
    const tx = makeTx();
    // ON CONFLICT DO NOTHING returns no rows when the key already exists.
    tx.$queryRaw.mockResolvedValue([]);
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

  it('propagates a genuine failure so the caller transaction rolls back with it', async () => {
    const tx = makeTx();
    tx.$queryRaw.mockRejectedValue(new Error('connection reset'));

    await expect(
      service.emit(tx as unknown as Prisma.TransactionClient, input),
    ).rejects.toThrow('connection reset');

    // A business change whose event could not be written must not commit.
    expect(tx.outboxEvent.findUniqueOrThrow).not.toHaveBeenCalled();
  });

  it('defaults the attempt budget and stamps a correlation id when none is given', async () => {
    const tx = makeTx();
    tx.$queryRaw.mockResolvedValue([{ id: 'evt_2' }]);

    await service.emit(tx as unknown as Prisma.TransactionClient, input);

    // Tagged-template call: [strings, ...values]. The values carry the payload.
    const values = tx.$queryRaw.mock.calls[0].slice(1);
    expect(values).toContain(8);
    expect(
      values.some(
        (v: unknown) => typeof v === 'string' && v.startsWith('evt_'),
      ),
    ).toBe(true);
    expect(values).toContain(null);
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
