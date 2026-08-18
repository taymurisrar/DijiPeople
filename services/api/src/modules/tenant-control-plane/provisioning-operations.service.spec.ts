import { TenantProvisioningRunStatus } from '@prisma/client';
import {
  deriveProvisioningState,
  type ProvisioningStateInput,
} from './provisioning-operations.service';

const NOW = new Date('2026-08-18T12:00:00.000Z').getTime();
const minutes = (n: number) => new Date(NOW + n * 60_000);

function run(overrides: Partial<ProvisioningStateInput> = {}) {
  const base: ProvisioningStateInput = {
    status: TenantProvisioningRunStatus.RUNNING,
    startedAt: minutes(-10),
    completedAt: null,
    targetReadyBy: null,
    escalateAt: null,
    breachedAt: null,
    steps: [{ status: 'RUNNING' }],
  };
  return { ...base, ...overrides };
}

describe('provisioning operational state', () => {
  it('reports a succeeded run as ready even when its target was missed', () => {
    // The run finished. Whether it finished late is a question about the
    // target, not about whether the customer can use the product — and an
    // operator has nothing left to do here.
    expect(
      deriveProvisioningState(
        run({
          status: TenantProvisioningRunStatus.SUCCEEDED,
          completedAt: minutes(-1),
          targetReadyBy: minutes(-30),
          breachedAt: minutes(-30),
        }),
        NOW,
      ),
    ).toBe('READY');
  });

  it('reports a failed run as failed regardless of its target', () => {
    expect(
      deriveProvisioningState(
        run({
          status: TenantProvisioningRunStatus.FAILED,
          steps: [{ status: 'FAILED' }],
          escalateAt: minutes(-5),
        }),
        NOW,
      ),
    ).toBe('FAILED');
  });

  it('prefers a recorded breach over an escalation that also passed', () => {
    // Both are true; only the more serious one is worth showing.
    expect(
      deriveProvisioningState(
        run({ breachedAt: minutes(-1), escalateAt: minutes(-20) }),
        NOW,
      ),
    ).toBe('BREACHED');
  });

  it('treats a passed target as breached even when nothing recorded the breach', () => {
    // `breachedAt` is stamped by whatever notices the breach. If that has not
    // run yet, the target itself is still the truth — a queue that waited for
    // the stamp would hide exactly the runs it exists to surface.
    expect(deriveProvisioningState(run({ targetReadyBy: minutes(-1) }), NOW)).toBe(
      'BREACHED',
    );
  });

  it('does not call a run at risk or breached before its times arrive', () => {
    expect(
      deriveProvisioningState(
        run({ targetReadyBy: minutes(30), escalateAt: minutes(15) }),
        NOW,
      ),
    ).toBe('IN_PROGRESS');
  });

  it('treats the escalation instant itself as at risk', () => {
    // Boundary: at exactly escalateAt the run has reached the point somebody
    // chose to be told about. Excluding the instant would delay it a tick for
    // no reason anyone could defend.
    expect(deriveProvisioningState(run({ escalateAt: minutes(0) }), NOW)).toBe(
      'AT_RISK',
    );
  });

  it('flags a running run with no step in flight as needing a human', () => {
    // Nothing failed and nothing is working: automation has quietly stopped.
    // This is the state that hides, because no error was ever raised.
    expect(
      deriveProvisioningState(
        run({ steps: [{ status: 'SUCCEEDED' }, { status: 'SKIPPED' }] }),
        NOW,
      ),
    ).toBe('MANUAL_ACTION_REQUIRED');
  });

  it('does not mistake a just-started run with no steps yet for a stuck one', () => {
    // A run records its steps a moment after it starts. Zero steps means the
    // recorder has not caught up, not that provisioning has stalled.
    expect(deriveProvisioningState(run({ steps: [] }), NOW)).toBe('IN_PROGRESS');
  });

  it('keeps a run with a pending step in progress', () => {
    expect(
      deriveProvisioningState(
        run({ steps: [{ status: 'SUCCEEDED' }, { status: 'PENDING' }] }),
        NOW,
      ),
    ).toBe('IN_PROGRESS');
  });
});
