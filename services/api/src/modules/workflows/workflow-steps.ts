import { WorkflowRunStatus } from '@prisma/client';
import { createHash } from 'node:crypto';

/*
 * DP-MASTER WP-03.S3 (A02, A07). The pure rules of the workflow step ledger:
 * what identifies a step, and what a run's status is once its steps are known.
 * Kept free of I/O so the retry and settlement rules are unit-tested directly.
 */

/**
 * The idempotency identity of one action in one run:
 * `eventId:workflowVersionId:actionIndex`. The event id makes a redelivery find
 * its own steps; the version id means a workflow republished between attempts
 * is a different set of steps, not a half-matching one; the index orders actions
 * within the version. The recipient is a property of the action, so it is part
 * of the version and needs no place in the key.
 */
export function buildWorkflowStepKey(
  eventId: string,
  workflowVersionId: string,
  actionIndex: number,
): string {
  return `${eventId}:${workflowVersionId}:${actionIndex}`;
}

/**
 * The stable identity of one business transition, built from what the emitter
 * stated and never from a random value: the same transition emitted twice
 * produces the same key, which is what lets two emissions collapse into one.
 */
export function buildTransitionKey(context: {
  tenantId: string;
  eventCode: string;
  relatedEntityId?: string | null;
  transitionId: string;
}): string {
  return [
    context.tenantId,
    context.eventCode,
    context.relatedEntityId ?? '',
    context.transitionId,
  ]
    .map((part) => part.trim())
    .join(':');
}

/** The run id an inline execution of a stable transition uses. */
export function inlineEventIdFor(context: {
  tenantId: string;
  eventCode: string;
  relatedEntityId?: string | null;
  transitionId?: string | null;
}): string {
  return `inline:${createHash('sha256')
    .update(
      buildTransitionKey({
        ...context,
        transitionId: context.transitionId ?? '',
      }),
    )
    .digest('hex')
    .slice(0, 40)}`;
}

/** One recipient of a multi-recipient action: the action key plus its position. */
export function buildRecipientStepKey(
  eventId: string,
  workflowVersionId: string,
  actionIndex: number,
  recipientIndex: number,
): string {
  return `${buildWorkflowStepKey(eventId, workflowVersionId, actionIndex)}:r${recipientIndex}`;
}

export type RunSummary =
  | {
      settled: false;
      status: WorkflowRunStatus;
      actionsRun: number;
      error: string | null;
    }
  | {
      settled: true;
      status: WorkflowRunStatus;
      actionsRun: number;
      error: string | null;
    };

/**
 * A run is settled when no step can still change: either everything is done, or
 * the attempts are exhausted. While a retryable failure remains and attempts are
 * left, the run stays RUNNING and says why, so an operator can see it waiting.
 */
export function summarizeRun(input: {
  succeeded: number;
  /** Steps that deliberately did nothing (opted out, sink provider, rehearsal). */
  skipped?: number;
  failedPermanent: number;
  retryable: number;
  errors: string[];
  finalAttempt: boolean;
}): RunSummary {
  const error = input.errors.length
    ? input.errors.join(' | ').slice(0, 1000)
    : null;

  if (input.retryable > 0 && !input.finalAttempt) {
    return {
      settled: false,
      status: WorkflowRunStatus.RUNNING,
      actionsRun: input.succeeded,
      error,
    };
  }

  const skipped = input.skipped ?? 0;
  const failures = input.failedPermanent + input.retryable;
  if (failures > 0) {
    return {
      settled: true,
      status:
        input.succeeded > 0
          ? WorkflowRunStatus.PARTIALLY_FAILED
          : WorkflowRunStatus.FAILED,
      actionsRun: input.succeeded,
      error,
    };
  }

  return {
    settled: true,
    status:
      input.succeeded > 0
        ? WorkflowRunStatus.SUCCEEDED
        : WorkflowRunStatus.SKIPPED,
    actionsRun: input.succeeded,
    error:
      input.succeeded > 0
        ? null
        : skipped > 0
          ? error
          : 'The workflow had no active actions to run.',
  };
}

export type EmailOutcome = {
  sent: boolean;
  delivered: boolean;
  dryRun: boolean;
  skipped: boolean;
  status: string;
};

export type StepVerdict =
  | { status: 'SUCCEEDED' }
  | { status: 'SKIPPED'; reason: string }
  | { status: 'FAILED'; reason: string };

/**
 * What an e-mail send actually amounted to. The e-mail service reports a
 * failure, a skip, a rehearsal and a sink as return values, not exceptions, so a
 * step that only checked "did not throw" recorded all of them as a delivered
 * mail. Only a message that left the building is SUCCEEDED. A failure is FAILED
 * and retryable (the provider may recover); a skip or a sink is SKIPPED with its
 * reason, because nothing went wrong and retrying cannot change it.
 */
export function classifyEmailOutcome(
  result: EmailOutcome | undefined | null,
): StepVerdict {
  if (!result) {
    return {
      status: 'FAILED',
      reason: 'The e-mail service returned no result.',
    };
  }
  if (result.delivered) return { status: 'SUCCEEDED' };
  if (result.dryRun) {
    return {
      status: 'SKIPPED',
      reason: 'Rehearsal (dry run): nothing was sent.',
    };
  }
  if (result.skipped) {
    return {
      status: 'SKIPPED',
      reason: 'The e-mail was skipped by the notification settings.',
    };
  }
  if (result.sent) {
    return {
      status: 'SKIPPED',
      reason:
        'The provider is a sink: the e-mail was accepted but not delivered.',
    };
  }
  return {
    status: 'FAILED',
    reason: `The e-mail was not sent (delivery status ${result.status}).`,
  };
}
