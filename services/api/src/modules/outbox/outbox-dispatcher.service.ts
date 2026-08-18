import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { OutboxEventStatus, Prisma } from '@prisma/client';
import type { DomainEventType, OutboxEvent } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  OUTBOX_HANDLERS,
  type OutboxHandler,
  type OutboxHandlerOutcome,
} from './outbox.types';

/**
 * How long a claim may go unfinished before another dispatcher may take it.
 *
 * This is the crash-recovery window. A process that dies mid-handler leaves its
 * rows CLAIMED forever otherwise, and the events they carry — a provisioning
 * request, a cancellation — simply stop happening with nothing reporting that
 * they stopped.
 */
const CLAIM_LEASE_MS = 5 * 60 * 1000;

/** Retry backoff in seconds, indexed by attempt. Past the end, the last value repeats. */
const BACKOFF_SECONDS = [10, 30, 120, 300, 900, 1800, 3600];

export type OutboxDrainResult = {
  claimed: number;
  processed: number;
  retried: number;
  failed: number;
  manualActionRequired: number;
};

/**
 * The read half of the outbox: claim, dispatch, record, retry.
 *
 * Claiming uses `FOR UPDATE SKIP LOCKED` rather than a "find then update"
 * pair. Two dispatchers running the read-then-write version will both read the
 * same PENDING row and both hand it to a consumer; SKIP LOCKED makes the
 * database hand each row to exactly one of them, which is the difference
 * between at-least-once delivery and uncontrolled duplicate delivery.
 */
@Injectable()
export class OutboxDispatcherService {
  private readonly logger = new Logger(OutboxDispatcherService.name);

  /** Identifies this process in `claimedBy`, so a stale claim is attributable. */
  private readonly instanceId = `outbox-${process.pid}-${randomUUID().slice(0, 8)}`;

  private readonly handlersByType = new Map<DomainEventType, OutboxHandler[]>();

  constructor(
    private readonly prisma: PrismaService,
    @Optional()
    @Inject(OUTBOX_HANDLERS)
    handlers: OutboxHandler[] | undefined,
  ) {
    for (const handler of handlers ?? []) {
      for (const eventType of handler.handles) {
        const existing = this.handlersByType.get(eventType) ?? [];
        existing.push(handler);
        this.handlersByType.set(eventType, existing);
      }
    }
  }

  /**
   * Claim and process one batch.
   *
   * Returns counts rather than throwing on handler failure: a batch in which
   * one event failed is a normal outcome that the next poll retries, not an
   * error that should stop the loop and strand every other event behind it.
   */
  async drain(batchSize = 25): Promise<OutboxDrainResult> {
    await this.reclaimExpiredClaims();

    const claimed = await this.claimBatch(batchSize);
    const result: OutboxDrainResult = {
      claimed: claimed.length,
      processed: 0,
      retried: 0,
      failed: 0,
      manualActionRequired: 0,
    };

    for (const event of claimed) {
      const outcome = await this.dispatch(event);
      switch (outcome) {
        case 'PROCESSED':
          result.processed += 1;
          break;
        case 'RETRY_SCHEDULED':
          result.retried += 1;
          break;
        case 'FAILED':
          result.failed += 1;
          break;
        case 'MANUAL_ACTION_REQUIRED':
          result.manualActionRequired += 1;
          break;
      }
    }

    return result;
  }

  /**
   * Return rows whose claim outlived the lease to the retry pool.
   *
   * `attemptCount` is deliberately not incremented here. The attempt was
   * already counted when the row was claimed, and counting it twice would
   * exhaust the budget of an event whose only problem was that a deployment
   * restarted the process holding it.
   */
  private async reclaimExpiredClaims(): Promise<number> {
    const cutoff = new Date(Date.now() - CLAIM_LEASE_MS);

    const reclaimed = await this.prisma.outboxEvent.updateMany({
      where: {
        status: OutboxEventStatus.CLAIMED,
        claimedAt: { lt: cutoff },
      },
      data: {
        status: OutboxEventStatus.RETRY_SCHEDULED,
        claimedAt: null,
        claimedBy: null,
        availableAt: new Date(),
        lastError: 'Claim expired before the handler reported an outcome.',
      },
    });

    if (reclaimed.count > 0) {
      this.logger.warn(
        `Reclaimed ${reclaimed.count} outbox event(s) whose claim expired.`,
      );
    }

    return reclaimed.count;
  }

  private async claimBatch(batchSize: number): Promise<OutboxEvent[]> {
    const limit = Math.max(1, Math.min(batchSize, 200));

    return this.prisma.$queryRaw<OutboxEvent[]>`
      UPDATE "OutboxEvent" AS target
      SET
        "status" = 'CLAIMED'::"OutboxEventStatus",
        "claimedAt" = NOW(),
        "claimedBy" = ${this.instanceId},
        "attemptCount" = target."attemptCount" + 1,
        "updatedAt" = NOW()
      WHERE target."id" IN (
        SELECT candidate."id"
        FROM "OutboxEvent" AS candidate
        WHERE candidate."status" IN (
                'PENDING'::"OutboxEventStatus",
                'RETRY_SCHEDULED'::"OutboxEventStatus"
              )
          AND candidate."availableAt" <= NOW()
        ORDER BY candidate."availableAt" ASC
        LIMIT ${limit}
        FOR UPDATE SKIP LOCKED
      )
      RETURNING target.*;
    `;
  }

  /**
   * Run every consumer registered for this event, then settle the row.
   *
   * An event with no registered consumer is PROCESSED, not failed. Emitting a
   * transition nobody listens to yet is a legitimate state — the announcement
   * is still durable and still readable — and treating it as an error would
   * fill the failure queue with events that are working exactly as intended.
   */
  private async dispatch(
    event: OutboxEvent,
  ): Promise<
    'PROCESSED' | 'RETRY_SCHEDULED' | 'FAILED' | 'MANUAL_ACTION_REQUIRED'
  > {
    const handlers = this.handlersByType.get(event.eventType) ?? [];

    const errors: string[] = [];
    let manualAction: string | null = null;

    for (const handler of handlers) {
      const alreadyDone = await this.prisma.outboxEventConsumption.findUnique({
        where: {
          outboxEventId_consumerKey: {
            outboxEventId: event.id,
            consumerKey: handler.consumerKey,
          },
        },
        select: { succeeded: true },
      });

      // A consumer that already succeeded is never re-run. This is what makes a
      // redelivered event safe when only *one* of several consumers failed.
      if (alreadyDone?.succeeded) {
        continue;
      }

      let outcome: OutboxHandlerOutcome;
      try {
        outcome = await handler.handle(event, event.payload);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        errors.push(`${handler.consumerKey}: ${message}`);
        await this.recordConsumption(event, handler, false, message);
        continue;
      }

      if (outcome.status === 'MANUAL_ACTION_REQUIRED') {
        manualAction = `${handler.consumerKey}: ${outcome.detail}`;
        await this.recordConsumption(event, handler, false, outcome.detail);
        continue;
      }

      await this.recordConsumption(
        event,
        handler,
        true,
        outcome.detail ?? null,
      );
    }

    if (manualAction) {
      await this.settle(
        event,
        OutboxEventStatus.MANUAL_ACTION_REQUIRED,
        manualAction,
      );
      return 'MANUAL_ACTION_REQUIRED';
    }

    if (errors.length === 0) {
      await this.settle(event, OutboxEventStatus.PROCESSED, null);
      return 'PROCESSED';
    }

    const lastError = errors.join(' | ').slice(0, 2000);

    if (event.attemptCount >= event.maxAttempts) {
      await this.settle(event, OutboxEventStatus.FAILED, lastError);
      this.logger.error(
        `Outbox event ${event.id} (${event.eventType}) exhausted ${event.maxAttempts} attempts: ${lastError}`,
      );
      return 'FAILED';
    }

    await this.scheduleRetry(event, lastError);
    return 'RETRY_SCHEDULED';
  }

  /**
   * Record that a consumer reached an outcome.
   *
   * Written with an upsert on the unique (event, consumer) pair so a retry
   * updates the existing verdict instead of colliding with it. The row is the
   * durable proof of consumer idempotency, so failing to write it must not be
   * silent — but it also must not abort the other consumers of the same event.
   */
  private async recordConsumption(
    event: OutboxEvent,
    handler: OutboxHandler,
    succeeded: boolean,
    detail: string | null,
  ): Promise<void> {
    try {
      await this.prisma.outboxEventConsumption.upsert({
        where: {
          outboxEventId_consumerKey: {
            outboxEventId: event.id,
            consumerKey: handler.consumerKey,
          },
        },
        create: {
          outboxEventId: event.id,
          consumerKey: handler.consumerKey,
          succeeded,
          attemptCount: event.attemptCount,
          errorMessage: detail?.slice(0, 2000) ?? null,
        },
        update: {
          succeeded,
          attemptCount: event.attemptCount,
          errorMessage: detail?.slice(0, 2000) ?? null,
          processedAt: new Date(),
        },
      });
    } catch (error) {
      this.logger.error(
        `Unable to record consumption of ${event.id} by ${handler.consumerKey}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  private async settle(
    event: OutboxEvent,
    status: OutboxEventStatus,
    lastError: string | null,
  ): Promise<void> {
    await this.prisma.outboxEvent.update({
      where: { id: event.id },
      data: {
        status,
        lastError,
        claimedAt: null,
        claimedBy: null,
        processedAt: status === OutboxEventStatus.PROCESSED ? new Date() : null,
      },
    });
  }

  private async scheduleRetry(
    event: OutboxEvent,
    lastError: string,
  ): Promise<void> {
    const index = Math.min(
      Math.max(event.attemptCount - 1, 0),
      BACKOFF_SECONDS.length - 1,
    );
    const delayMs = BACKOFF_SECONDS[index] * 1000;

    await this.prisma.outboxEvent.update({
      where: { id: event.id },
      data: {
        status: OutboxEventStatus.RETRY_SCHEDULED,
        lastError,
        claimedAt: null,
        claimedBy: null,
        availableAt: new Date(Date.now() + delayMs),
      },
    });
  }
}
