import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DomainEventType, type Prisma } from '@prisma/client';
import { OutboxService } from '../outbox/outbox.service';
import { OutboxWorkerService } from '../outbox/outbox-worker.service';
import { buildIdempotencyKey } from '../outbox/outbox.types';
import {
  WorkflowRuntimeService,
  type WorkflowEventContext,
} from './workflow-runtime.service';
import { buildTransitionKey } from './workflow-steps';

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
 * operator confirms the worker is running and opts in.
 *
 * Durable delivery rules:
 *   - The event's identity is the caller's stable `transitionId` (an approval
 *     decision id, a status + version), never a random value, so the same
 *     transition emitted twice is one outbox event. A caller that cannot name its
 *     transition is run inline and told so (`reason: NO_TRANSITION_ID`): it is
 *     not given an invented identity that would defeat deduplication.
 *   - `enqueue(tx, ...)` writes the event in the caller's own transaction, so a
 *     rolled-back business change leaves no event and a committed one cannot
 *     lose it. A failure there propagates and rolls the caller back.
 *   - `dispatch(...)` (the post-commit path) never throws. If the outbox write
 *     fails it does NOT run the workflows inline behind the operator's back: it
 *     returns ENQUEUE_FAILED, logs it, and the caller may retry with the same
 *     transition id, which is idempotent.
 */
export type WorkflowExecutionMode = 'inline' | 'durable';

export function resolveExecutionMode(raw: string | undefined) {
  return raw?.trim().toLowerCase() === 'durable'
    ? ('durable' as const)
    : ('inline' as const);
}

export type WorkflowDispatchOutcome =
  | {
      mode: 'durable';
      status: 'QUEUED';
      outboxEventId: string;
      /** True when this transition had already been queued. */
      deduplicated: boolean;
    }
  | { mode: 'durable'; status: 'ENQUEUE_FAILED'; error: string }
  | {
      mode: 'inline';
      status: 'EXECUTED';
      matched: number;
      ran: number;
      /** Set when durable mode was on but the event could not be made durable. */
      reason?: 'NO_TRANSITION_ID';
    };

export class WorkflowDurableModeRequiredError extends Error {
  constructor() {
    super(
      'Transactional workflow enqueue needs WORKFLOW_EXECUTION_MODE=durable and a transitionId.',
    );
  }
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

  /**
   * Write the event in the caller's transaction. Throws when durable delivery is
   * not available (mode, or no transition id), because a transactional caller
   * must know its event was not recorded rather than be told it ran later.
   */
  async enqueue(
    tx: Prisma.TransactionClient,
    context: WorkflowEventContext,
  ): Promise<{ outboxEventId: string; deduplicated: boolean }> {
    if (this.mode() !== 'durable' || !context.transitionId?.trim()) {
      throw new WorkflowDurableModeRequiredError();
    }
    // Resolve who the event is about NOW, so a retry days later acts on the
    // placement the event had when it happened, not whatever the employee
    // record says by then.
    const pinned = await this.runtime.resolveContext(context);
    const stored = await this.outbox.emit(tx, this.toEvent(pinned));
    return { outboxEventId: stored.id, deduplicated: stored.deduplicated };
  }

  /** Never throws: a workflow must not break the action that triggered it. */
  async dispatch(
    context: WorkflowEventContext,
  ): Promise<WorkflowDispatchOutcome> {
    const durable = this.mode() === 'durable';
    const transitionId = context.transitionId?.trim();

    if (durable && transitionId) {
      try {
        const pinned = await this.runtime.resolveContext(context);
        const stored = await this.outbox.emitStandalone(this.toEvent(pinned));
        this.worker.kick();
        return {
          mode: 'durable',
          status: 'QUEUED',
          outboxEventId: stored.id,
          deduplicated: stored.deduplicated,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.error(
          `Workflow event ${context.eventCode} (transition ${transitionId}, tenant ${context.tenantId}) was NOT queued and was NOT run: ${message}. Retrying with the same transition id is safe.`,
        );
        return { mode: 'durable', status: 'ENQUEUE_FAILED', error: message };
      }
    }

    const result = await this.runtime.handleEvent(context);
    return {
      mode: 'inline',
      status: 'EXECUTED',
      ...result,
      ...(durable ? { reason: 'NO_TRANSITION_ID' as const } : {}),
    };
  }

  private toEvent(context: WorkflowEventContext) {
    return {
      eventType: DomainEventType.WORKFLOW_EVENT_RECEIVED,
      idempotencyKey: buildIdempotencyKey(
        DomainEventType.WORKFLOW_EVENT_RECEIVED,
        buildTransitionKey({
          tenantId: context.tenantId,
          eventCode: context.eventCode,
          relatedEntityId: context.relatedEntityId,
          transitionId: context.transitionId ?? '',
        }),
      ),
      aggregateType: context.relatedEntityType ?? 'event',
      aggregateId: context.relatedEntityId ?? context.eventCode,
      tenantId: context.tenantId,
      correlationId: context.correlationId ?? null,
      payload: context as unknown as Record<string, unknown>,
    };
  }
}
