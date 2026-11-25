import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { DomainEventType, type OutboxEvent, type Prisma } from '@prisma/client';
import { OutboxDispatcherService } from '../outbox/outbox-dispatcher.service';
import type {
  OutboxHandler,
  OutboxHandlerOutcome,
} from '../outbox/outbox.types';
import {
  WorkflowRuntimeService,
  type WorkflowEventContext,
} from './workflow-runtime.service';

/**
 * Executes workflow actions for a tenant event delivered through the outbox
 * (DP-MASTER WP-03.S3). The outbox gives at-least-once delivery with backoff and
 * a visible failure queue; the step ledger inside the runtime makes each action
 * run at most once per success, so a redelivery repeats nothing that worked.
 *
 * A step that failed but may still succeed makes this handler throw, which is
 * how the dispatcher schedules the retry. A step that can never succeed (no
 * recipient) does not: retrying would only burn the attempt budget.
 */
@Injectable()
export class WorkflowActionHandler implements OutboxHandler, OnModuleInit {
  readonly consumerKey = 'workflow-actions';
  readonly handles = [DomainEventType.WORKFLOW_EVENT_RECEIVED] as const;

  private readonly logger = new Logger(WorkflowActionHandler.name);

  constructor(
    private readonly runtime: WorkflowRuntimeService,
    private readonly dispatcher: OutboxDispatcherService,
  ) {}

  onModuleInit(): void {
    this.dispatcher.register(this);
  }

  async handle(
    event: OutboxEvent,
    payload: Prisma.JsonValue,
  ): Promise<OutboxHandlerOutcome> {
    const context = readContext(payload);
    if (!context) {
      // A malformed payload cannot be repaired by retrying.
      return {
        status: 'MANUAL_ACTION_REQUIRED',
        detail: 'The workflow event payload has no tenantId or eventCode.',
      };
    }

    const result = await this.runtime.execute(context, {
      eventId: event.id,
      finalAttempt: event.attemptCount >= event.maxAttempts,
    });

    if (result.retryable > 0) {
      // Throwing is the dispatcher's retry signal. On the last attempt the
      // runtime has already settled the run, so this does not loop.
      this.logger.warn(
        `Workflow event ${event.id} (${context.eventCode}) has ${result.retryable} step(s) to retry`,
      );
      throw new Error(
        `${result.retryable} workflow step(s) failed and will be retried`,
      );
    }

    return {
      status: 'PROCESSED',
      detail: `matched ${result.matched}, ran ${result.ran}`,
    };
  }
}

/** The event context from the outbox payload, or null when it is not one. */
export function readContext(
  payload: Prisma.JsonValue,
): WorkflowEventContext | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return null;
  }
  const value = payload as Record<string, unknown>;
  if (
    typeof value.tenantId !== 'string' ||
    !value.tenantId ||
    typeof value.eventCode !== 'string' ||
    !value.eventCode
  ) {
    return null;
  }
  return value as unknown as WorkflowEventContext;
}
