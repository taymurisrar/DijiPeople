import { withDatabase } from './environment';

/**
 * Provisioning runs, created by the suite that asserts on them.
 *
 * This exists because two tests asserted on a table they never populated. E5
 * and E6 read the provisioning queue's column headers and state cells, and
 * passed locally against rows left behind by earlier runs — then failed in CI,
 * where the database is clean and the screen correctly rendered its empty
 * state. The screen was right; the tests were borrowing data.
 *
 * That is the same defect Flow D had against a different mechanism, and it is
 * worth stating once in a shared place: **a suite that does not create its
 * fixtures is a suite that reports on whatever happens to be there.**
 *
 * Seeded through SQL rather than the product because no user creates a
 * provisioning run — runs are recorded by the API as a consequence of a
 * purchase, and a run only reaches BREACHED once its target has passed. Waiting
 * for that through the UI would make these clock tests rather than screen tests.
 */

/** Offsets are relative to now, so a run's derived state is stable per run. */
const minutes = (n: number) => new Date(Date.now() + n * 60_000).toISOString();

export type SeededRuns = {
  /** The failed step's message, unique per marker so an assertion cannot match another suite's row. */
  blockerMessage: string;
};

/**
 * Create one run per operational state the queue can show.
 *
 * Returns the values a test needs to assert on, rather than making each caller
 * reconstruct them — a literal repeated in the fixture and the assertion is a
 * literal that drifts.
 */
export async function seedProvisioningRuns(marker: string): Promise<SeededRuns> {
  const blockerMessage = `SMTP relay refused the connection (550) [${marker}]`;

  await withDatabase(async (db) => {
    const tenant = await db.query<{ id: string }>(
      'select id from "Tenant" limit 1',
    );
    const tenantId = tenant.rows[0]?.id;
    if (!tenantId) return;

    const run = async (
      suffix: string,
      status: string,
      startedAt: string,
      extra: {
        completedAt?: string | null;
        targetReadyBy?: string | null;
        failedStepKey?: string | null;
        message?: string | null;
      },
      steps: Array<[string, string, number, string, string | null]>,
    ) => {
      const inserted = await db.query<{ id: string }>(
        `insert into "TenantProvisioningRun"
           ("id","tenantId","trigger","attempt","status","startedAt",
            "completedAt","targetReadyBy","failedStepKey","message",
            "correlationId","createdAt","updatedAt")
         values (gen_random_uuid(),$1,'ONBOARDING',1,$2::"TenantProvisioningRunStatus",$3,
                 $4,$5,$6,$7,$8,now(),now())
         returning "id"`,
        [
          tenantId,
          status,
          startedAt,
          extra.completedAt ?? null,
          extra.targetReadyBy ?? null,
          extra.failedStepKey ?? null,
          extra.message ?? null,
          `${marker}-${suffix}`,
        ],
      );
      const runId = inserted.rows[0].id;

      for (const [key, label, sequence, stepStatus, message] of steps) {
        await db.query(
          `insert into "TenantProvisioningStep"
             ("id","tenantId","runId","key","label","sequence","status",
              "message","createdAt","updatedAt")
           values (gen_random_uuid(),$1,$2,$3,$4,$5,
                   $6::"TenantProvisioningStepStatus",$7,now(),now())`,
          [tenantId, runId, key, label, sequence, stepStatus, message],
        );
      }
    };

    // Past its target and still running — the case the screen exists for.
    await run('breached', 'RUNNING', minutes(-140), { targetReadyBy: minutes(-30) }, [
      ['create-workspace', 'Create workspace', 1, 'SUCCEEDED', null],
      ['provision-domain', 'Provision domain', 2, 'RUNNING', null],
    ]);

    await run(
      'failed',
      'FAILED',
      minutes(-55),
      {
        completedAt: minutes(-50),
        failedStepKey: 'send-welcome',
        message: 'Run-level message that must not win over the step message',
      },
      [
        ['create-workspace', 'Create workspace', 1, 'SUCCEEDED', null],
        ['send-welcome', 'Send welcome email', 2, 'FAILED', blockerMessage],
      ],
    );

    // Nothing failed and nothing in flight: waiting on a human, and the easiest
    // state to miss because no error was ever raised.
    await run('manual', 'RUNNING', minutes(-25), { targetReadyBy: minutes(35) }, [
      ['create-workspace', 'Create workspace', 1, 'SUCCEEDED', null],
      ['confirm-name', 'Confirm workspace name', 2, 'SKIPPED', null],
    ]);

    await run('progress', 'RUNNING', minutes(-2), { targetReadyBy: minutes(58) }, [
      ['create-workspace', 'Create workspace', 1, 'RUNNING', null],
    ]);
  });

  return { blockerMessage };
}

/** Remove only what this marker created, so the queue is left as it was found. */
export async function removeProvisioningRuns(marker: string): Promise<void> {
  await withDatabase(async (db) => {
    await db.query(
      `delete from "TenantProvisioningStep"
        where "runId" in (select "id" from "TenantProvisioningRun"
                           where "correlationId" like $1)`,
      [`${marker}-%`],
    );
    await db.query(
      'delete from "TenantProvisioningRun" where "correlationId" like $1',
      [`${marker}-%`],
    );
  });
}
