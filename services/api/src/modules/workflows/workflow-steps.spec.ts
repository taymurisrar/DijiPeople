import { WorkflowRunStatus } from '@prisma/client';
import { resolveExecutionMode } from './workflow-dispatch.service';
import { buildWorkflowStepKey, summarizeRun } from './workflow-steps';

const base = { succeeded: 0, failedPermanent: 0, retryable: 0, errors: [] };

describe('buildWorkflowStepKey', () => {
  it('names the event, the pinned version and the action', () => {
    expect(buildWorkflowStepKey('evt', 'ver', 2)).toBe('evt:ver:2');
  });

  it('differs when the workflow was republished between attempts', () => {
    expect(buildWorkflowStepKey('evt', 'ver-1', 0)).not.toBe(
      buildWorkflowStepKey('evt', 'ver-2', 0),
    );
  });
});

describe('summarizeRun', () => {
  it('waits (RUNNING) while a retryable failure remains and attempts are left', () => {
    const s = summarizeRun({
      ...base,
      succeeded: 1,
      retryable: 1,
      errors: ['smtp'],
      finalAttempt: false,
    });
    expect(s).toMatchObject({
      settled: false,
      status: WorkflowRunStatus.RUNNING,
    });
    expect(s.error).toBe('smtp');
  });

  it('settles a retryable failure once the attempts are exhausted', () => {
    expect(
      summarizeRun({
        ...base,
        retryable: 1,
        errors: ['x'],
        finalAttempt: true,
      }),
    ).toMatchObject({ settled: true, status: WorkflowRunStatus.FAILED });
    expect(
      summarizeRun({
        ...base,
        succeeded: 1,
        retryable: 1,
        errors: ['x'],
        finalAttempt: true,
      }),
    ).toMatchObject({
      settled: true,
      status: WorkflowRunStatus.PARTIALLY_FAILED,
    });
  });

  it('a permanent failure never waits, even with attempts left', () => {
    expect(
      summarizeRun({
        ...base,
        succeeded: 1,
        failedPermanent: 1,
        errors: ['no recipient'],
        finalAttempt: false,
      }),
    ).toMatchObject({
      settled: true,
      status: WorkflowRunStatus.PARTIALLY_FAILED,
    });
  });

  it('reports SUCCEEDED only when every step ran, and SKIPPED when there was nothing to run', () => {
    expect(
      summarizeRun({ ...base, succeeded: 2, finalAttempt: false }),
    ).toMatchObject({ settled: true, status: WorkflowRunStatus.SUCCEEDED });
    expect(summarizeRun({ ...base, finalAttempt: true })).toMatchObject({
      status: WorkflowRunStatus.SKIPPED,
      error: 'The workflow had no active actions to run.',
    });
  });
});

describe('resolveExecutionMode', () => {
  it('is inline unless durable is asked for explicitly', () => {
    expect(resolveExecutionMode(undefined)).toBe('inline');
    expect(resolveExecutionMode('')).toBe('inline');
    expect(resolveExecutionMode('typo')).toBe('inline');
    expect(resolveExecutionMode(' Durable ')).toBe('durable');
  });
});
