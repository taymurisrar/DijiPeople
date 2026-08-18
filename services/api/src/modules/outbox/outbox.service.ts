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

    /*
     * BUG-0070 — why this is `ON CONFLICT DO NOTHING` and not try/catch.
     *
     * The obvious implementation is `create()`, catch P2002, then read the
     * existing row back. It passes every mocked test and it cannot work on
     * PostgreSQL: a constraint violation **aborts the surrounding transaction**,
     * so the read in the catch block fails with "current transaction is aborted,
     * commands ignored until end of transaction block" — and because `emit` is
     * required to run inside the caller's transaction, it poisons the caller's
     * business write too. A redelivered webhook would therefore roll back the
     * very state change it was trying to confirm.
     *
     * `ON CONFLICT DO NOTHING` never raises, so the transaction stays healthy.
     * The empty `RETURNING` is how we learn it was a duplicate, and the row is
     * then read normally. Uniqueness is still enforced by the index, not by a
     * pre-check, so two concurrent emitters still collapse to one row.
     */
    const eventId = randomUUID();
    const inserted = await tx.$queryRaw<Array<{ id: string }>>`
      INSERT INTO "OutboxEvent" (
        "id", "eventType", "idempotencyKey", "aggregateType", "aggregateId",
        "tenantId", "customerAccountId", "correlationId", "payload",
        "maxAttempts", "availableAt", "updatedAt"
      ) VALUES (
        ${eventId},
        ${input.eventType}::"DomainEventType",
        ${input.idempotencyKey},
        ${input.aggregateType.slice(0, 100)},
        ${input.aggregateId.slice(0, 160)},
        ${input.tenantId ?? null},
        ${input.customerAccountId ?? null},
        ${correlationId},
        ${JSON.stringify(input.payload)}::jsonb,
        ${input.maxAttempts ?? 8},
        ${input.availableAt ?? new Date()},
        NOW()
      )
      ON CONFLICT ("idempotencyKey") DO NOTHING
      RETURNING "id";
    `;

    if (inserted.length > 0) {
      return { id: inserted[0].id, deduplicated: false };
    }

    // The same transition was already announced. That is a success, not a
    // conflict — but the caller gets the real id rather than a fabricated one.
    const existing = await tx.outboxEvent.findUniqueOrThrow({
      where: { idempotencyKey: input.idempotencyKey },
      select: { id: true },
    });

    this.logger.debug(
      `Deduplicated ${input.eventType} on key ${input.idempotencyKey}`,
    );

    return { id: existing.id, deduplicated: true };
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
