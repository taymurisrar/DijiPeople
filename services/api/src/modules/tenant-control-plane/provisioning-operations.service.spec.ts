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
    expect(
      deriveProvisioningState(run({ targetReadyBy: minutes(-1) }), NOW),
    ).toBe('BREACHED');
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
    expect(deriveProvisioningState(run({ steps: [] }), NOW)).toBe(
      'IN_PROGRESS',
    );
  });

  it('keeps a run with a pending step in progress', () => {
    expect(
      deriveProvisioningState(
        run({ steps: [{ status: 'SUCCEEDED' }, { status: 'PENDING' }] }),
        NOW,
      ),
    ).toBe('IN_PROGRESS');
  });

  /*
   * A run whose process died.
   *
   * `TenantProvisioningRunStatus` has no terminal value for this: the row is
   * created RUNNING and moved on by the same process that is executing it, so a
   * restart, a deploy or a crash mid-run leaves it RUNNING for ever. Nothing
   * sweeps it. Reported as a tenant that "is not provisioned or stuck ... what
   * to do? I am not sure" — with the retry button disabled and the panel
   * insisting a run was already in progress.
   */
  describe('a run that stopped recording', () => {
    it('is stalled once nothing has happened for the threshold', () => {
      expect(
        deriveProvisioningState(
          run({
            startedAt: minutes(-90),
            updatedAt: minutes(-90),
            steps: [{ status: 'RUNNING', updatedAt: minutes(-45) }],
          }),
          NOW,
        ),
      ).toBe('STALLED');
    });

    it('is not stalled while a step is still recording', () => {
      // Long-running is not the same as abandoned, and a retry mid-run is the
      // thing this state exists to avoid authorising.
      expect(
        deriveProvisioningState(
          run({
            startedAt: minutes(-90),
            updatedAt: minutes(-90),
            steps: [{ status: 'RUNNING', updatedAt: minutes(-2) }],
          }),
          NOW,
        ),
      ).toBe('IN_PROGRESS');
    });

    it('outranks a breached target, because they ask for different things', () => {
      /*
       * "Late" and "nothing is coming" need different responses. A breached run
       * that is still moving is watched; a stalled one is retried.
       */
      expect(
        deriveProvisioningState(
          run({
            startedAt: minutes(-120),
            updatedAt: minutes(-120),
            breachedAt: minutes(-60),
            targetReadyBy: minutes(-90),
            steps: [{ status: 'RUNNING', updatedAt: minutes(-119) }],
          }),
          NOW,
        ),
      ).toBe('STALLED');
    });

    it('never calls a finished run stalled, however old it is', () => {
      for (const status of [
        TenantProvisioningRunStatus.SUCCEEDED,
        TenantProvisioningRunStatus.FAILED,
      ]) {
        expect(
          deriveProvisioningState(
            run({
              status,
              startedAt: minutes(-6000),
              updatedAt: minutes(-6000),
              completedAt: minutes(-5990),
              steps: [{ status: 'COMPLETED', updatedAt: minutes(-5990) }],
            }),
            NOW,
          ),
        ).toBe(
          status === TenantProvisioningRunStatus.SUCCEEDED ? 'READY' : 'FAILED',
        );
      }
    });

    it('tolerates a run whose steps carry no timestamps', () => {
      // Older rows predate the columns being read here. Falling back to the run
      // start keeps them classifiable rather than throwing on a null.
      expect(
        deriveProvisioningState(
          run({ startedAt: minutes(-90), steps: [{ status: 'RUNNING' }] }),
          NOW,
        ),
      ).toBe('STALLED');
    });
  });
});
