import { WorkflowRunStatus } from '@prisma/client';

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
      input.succeeded > 0 ? null : 'The workflow had no active actions to run.',
  };
}
