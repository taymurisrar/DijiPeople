import { WorkflowRunStatus } from '@prisma/client';
import { resolveExecutionMode } from './workflow-dispatch.service';
import {
  buildTransitionKey,
  buildWorkflowStepKey,
  classifyEmailOutcome,
  inlineEventIdFor,
  summarizeRun,
} from './workflow-steps';

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

describe('classifyEmailOutcome', () => {
  const base = {
    sent: true,
    delivered: true,
    dryRun: false,
    skipped: false,
    status: 'SENT',
  };

  it('calls only a message that left the building SUCCEEDED', () => {
    expect(classifyEmailOutcome(base)).toEqual({ status: 'SUCCEEDED' });
  });

  it('a sink, a rehearsal and an opt-out are SKIPPED with their reason, not delivered', () => {
    expect(classifyEmailOutcome({ ...base, delivered: false })).toMatchObject({
      status: 'SKIPPED',
      reason: expect.stringContaining('sink'),
    });
    expect(
      classifyEmailOutcome({ ...base, delivered: false, dryRun: true }),
    ).toMatchObject({ status: 'SKIPPED' });
    expect(
      classifyEmailOutcome({
        ...base,
        sent: false,
        delivered: false,
        skipped: true,
      }),
    ).toMatchObject({ status: 'SKIPPED' });
  });

  it('a refused send, or no answer at all, is a retryable FAILED', () => {
    expect(
      classifyEmailOutcome({
        ...base,
        sent: false,
        delivered: false,
        status: 'FAILED',
      }),
    ).toMatchObject({ status: 'FAILED' });
    expect(classifyEmailOutcome(undefined)).toMatchObject({ status: 'FAILED' });
  });
});

describe('transition identity', () => {
  const ctx = {
    tenantId: 't1',
    eventCode: 'LEAVE_APPROVED',
    relatedEntityId: 'r1',
    transitionId: 'd1',
  };

  it('is a pure function of what the emitter stated', () => {
    expect(buildTransitionKey(ctx)).toBe(buildTransitionKey({ ...ctx }));
    expect(inlineEventIdFor(ctx)).toBe(inlineEventIdFor({ ...ctx }));
  });

  it('differs when any part of the transition differs', () => {
    const keys = [
      ctx,
      { ...ctx, tenantId: 't2' },
      { ...ctx, eventCode: 'LEAVE_REJECTED' },
      { ...ctx, relatedEntityId: 'r2' },
      { ...ctx, transitionId: 'd2' },
    ].map(buildTransitionKey);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('summarizeRun with skipped steps', () => {
  it('a run whose every step was skipped is SKIPPED and says why, not SUCCEEDED', () => {
    expect(
      summarizeRun({
        ...base,
        skipped: 1,
        errors: ['sink'],
        finalAttempt: false,
      }),
    ).toMatchObject({
      settled: true,
      status: WorkflowRunStatus.SKIPPED,
      error: 'sink',
    });
  });
});
