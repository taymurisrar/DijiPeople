import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { EmitDomainEventInput } from './outbox.types';

/**
 * The write half of the transactional outbox.
 *
 * Every method here takes an explicit transaction client. That is not a
 * convenience — it is the entire point. An event written outside the
 * transaction that changed the business state can survive a rollback (an
 * activation announced for a subscription that never activated) or be lost in a
 * crash (a subscription that activated with nothing scheduled to provision it).
 * Requiring the caller to pass its own `tx` makes the atomic pairing the
 * default and the unsafe version the thing you have to go out of your way to
 * write.
 */
@Injectable()
export class OutboxService {
  private readonly logger = new Logger(OutboxService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Write one domain event in the caller's transaction.
   *
   * Returns the stored event, which for a duplicate emission is the event that
   * already existed. Callers get the same answer whether they are the first
   * writer or the fourth redelivery, so no caller needs a "have I already done
   * this" branch.
   */
  async emit(
    tx: Prisma.TransactionClient,
    input: EmitDomainEventInput,
  ): Promise<{ id: string; deduplicated: boolean }> {
    const correlationId =
      input.correlationId?.trim().slice(0, 128) || `evt_${randomUUID()}`;

    try {
      const created = await tx.outboxEvent.create({
        data: {
          eventType: input.eventType,
          idempotencyKey: input.idempotencyKey,
          aggregateType: input.aggregateType.slice(0, 100),
          aggregateId: input.aggregateId.slice(0, 160),
          tenantId: input.tenantId ?? null,
          customerAccountId: input.customerAccountId ?? null,
          correlationId,
          payload: input.payload as Prisma.InputJsonValue,
          availableAt: input.availableAt ?? new Date(),
          maxAttempts: input.maxAttempts ?? 8,
        },
        select: { id: true },
      });

      return { id: created.id, deduplicated: false };
    } catch (error) {
      if (!isUniqueViolation(error)) {
        // Never swallow this. The caller's transaction must roll back with it:
        // a business change whose event could not be written is exactly the
        // split state the outbox exists to make impossible.
        throw error;
      }

      // The same transition was already announced. That is a success, not a
      // conflict — but it has to be read back inside the same transaction so
      // the caller gets a real id rather than a fabricated one.
      const existing = await tx.outboxEvent.findUniqueOrThrow({
        where: { idempotencyKey: input.idempotencyKey },
        select: { id: true },
      });

      this.logger.debug(
        `Deduplicated ${input.eventType} on key ${input.idempotencyKey}`,
      );

      return { id: existing.id, deduplicated: true };
    }
  }

  /**
   * Emit inside a transaction this service opens itself.
   *
   * Only for callers whose business change is already committed and whose event
   * is genuinely standalone — a periodic detector announcing a threshold it just
   * measured, for instance. A caller that is also changing business state must
   * use `emit` with its own transaction instead.
   */
  async emitStandalone(
    input: EmitDomainEventInput,
  ): Promise<{ id: string; deduplicated: boolean }> {
    return this.prisma.$transaction((tx) => this.emit(tx, input));
  }
}

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  );
}
