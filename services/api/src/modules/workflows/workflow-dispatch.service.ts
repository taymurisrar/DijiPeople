import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DomainEventType } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { OutboxService } from '../outbox/outbox.service';
import { OutboxWorkerService } from '../outbox/outbox-worker.service';
import { buildIdempotencyKey } from '../outbox/outbox.types';
import {
  WorkflowRuntimeService,
  type WorkflowEventContext,
} from './workflow-runtime.service';

/*
 * How a business event reaches the workflow runtime (DP-MASTER WP-03.S3).
 *
 *   inline  (default)  run the matching workflows in this process, now, through
 *                      the same run and step ledger as the durable path. A failed
 *                      step is the final outcome of its run: nothing retries it.
 *   durable            write the event to the transactional outbox and let the
 *                      outbox worker execute it, with retries and a failure
 *                      queue. Requires OUTBOX_WORKER_ENABLED=true on at least one
 *                      deployed instance; without it events accumulate unrun.
 *
 * The default stays inline so deploying this changes no behaviour until the
 * operator confirms the worker is running and opts in. If writing the outbox
 * event itself fails, the event falls back to inline rather than being lost.
 */
export type WorkflowExecutionMode = 'inline' | 'durable';

export function resolveExecutionMode(raw: string | undefined) {
  return raw?.trim().toLowerCase() === 'durable'
    ? ('durable' as const)
    : ('inline' as const);
}

@Injectable()
export class WorkflowDispatchService {
  private readonly logger = new Logger(WorkflowDispatchService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly runtime: WorkflowRuntimeService,
    private readonly outbox: OutboxService,
    private readonly worker: OutboxWorkerService,
  ) {}

  mode(): WorkflowExecutionMode {
    return resolveExecutionMode(
      this.config.get<string>('WORKFLOW_EXECUTION_MODE'),
    );
  }

  /** Never throws: a workflow must not break the action that triggered it. */
  async dispatch(context: WorkflowEventContext) {
    if (this.mode() === 'durable') {
      try {
        await this.outbox.emitStandalone({
          eventType: DomainEventType.WORKFLOW_EVENT_RECEIVED,
          // Each emission is its own transition; the nonce keeps two genuine
          // events about one record (a leave request approved, later reopened
          // and approved again) from collapsing into one.
          idempotencyKey: buildIdempotencyKey(
            DomainEventType.WORKFLOW_EVENT_RECEIVED,
            context.tenantId,
            context.eventCode,
            context.relatedEntityId ?? '',
            randomUUID(),
          ),
          aggregateType: context.relatedEntityType ?? 'event',
          aggregateId: context.relatedEntityId ?? context.eventCode,
          tenantId: context.tenantId,
          correlationId: context.correlationId ?? null,
          payload: context as unknown as Record<string, unknown>,
        });
        this.worker.kick();
        return { mode: 'durable' as const, matched: 0, ran: 0 };
      } catch (error) {
        this.logger.error(
          `Could not write the workflow event to the outbox; running it inline: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    const result = await this.runtime.handleEvent(context);
    return { mode: 'inline' as const, ...result };
  }
}
