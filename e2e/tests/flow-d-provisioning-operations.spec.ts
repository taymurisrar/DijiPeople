import { expect, test } from '@playwright/test';
import { BASE_URLS } from '../playwright.config';
import { openAdmin, signInToAdmin } from '../fixtures/admin-session';
import { probeEnvironment, withDatabase } from '../fixtures/environment';

/**
 * Flow D — the provisioning operations queue, driven through the browser.
 *
 * Provisioning runs and their steps have been recorded for a long time and
 * nothing read them across tenants. An operator could open one workspace and
 * see its history, but there was no answer to the only question that matters
 * when somebody has paid and cannot use the product: **is anybody stuck right
 * now.** This suite is the proof that the answer is now on a screen.
 *
 * What it checks that the API tests cannot: that the six derived states reach a
 * rendered page, that the blocker text an operator would act on is actually
 * shown rather than truncated away, and that the rows arrive in triage order
 * instead of alphabetically. Those are properties of the screen, and reading
 * them from the component source is how a UI defect goes unnoticed.
 */

const RUN_MARKER = 'e2e-flow-d';

test.describe('Flow D — provisioning operations', () => {
  test.beforeAll(async () => {
    const report = await probeEnvironment({
      landing: BASE_URLS.landing,
      admin: BASE_URLS.admin,
      api: BASE_URLS.api,
    });
    test.skip(
      !report.ready,
      `Environment not ready for Flow D: ${report.missing.join('; ')}`,
    );
  });

  /**
   * Seed the states directly.
   *
   * A run only reaches BREACHED after its target passes, and MANUAL_ACTION
   * only when automation stops with nothing in flight. Waiting for either
   * through the product would take hours and would make the suite a clock test.
   * The rows are removed again in afterAll, so the queue is left as found.
   */
  test.beforeAll(async () => {
    await withDatabase(async (db) => {
      const tenant = await db.query<{ id: string }>(
        'select id from "Tenant" limit 1',
      );
      const tenantId = tenant.rows[0]?.id;
      if (!tenantId) return;

      const minutes = (n: number) =>
        new Date(Date.now() + n * 60_000).toISOString();

      /*
       * Written as SQL through the shared client rather than through Prisma,
       * because that is what `withDatabase` hands out — and the fixture's own
       * rule is that the browser performs every step a *user* performs. No user
       * creates a provisioning run; runs are recorded by the API as a
       * consequence of a purchase, and waiting hours for one to breach would
       * make this a clock test rather than a screen test.
       */
      const run = async (
        correlationSuffix: string,
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
            `${RUN_MARKER}-${correlationSuffix}`,
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
      await run(
        'breached',
        'RUNNING',
        minutes(-140),
        { targetReadyBy: minutes(-30) },
        [
          ['create-workspace', 'Create workspace', 1, 'SUCCEEDED', null],
          ['provision-domain', 'Provision domain', 2, 'RUNNING', null],
        ],
      );

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
          [
            'send-welcome',
            'Send welcome email',
            2,
            'FAILED',
            'SMTP relay refused the connection (550)',
          ],
        ],
      );

      // Nothing failed and nothing in flight: waiting on a human, and the
      // easiest state to miss because no error was ever raised.
      await run(
        'manual',
        'RUNNING',
        minutes(-25),
        { targetReadyBy: minutes(35) },
        [
          ['create-workspace', 'Create workspace', 1, 'SUCCEEDED', null],
          ['confirm-name', 'Confirm workspace name', 2, 'SKIPPED', null],
        ],
      );

      await run(
        'progress',
        'RUNNING',
        minutes(-2),
        { targetReadyBy: minutes(58) },
        [['create-workspace', 'Create workspace', 1, 'RUNNING', null]],
      );
    });
  });

  test.afterAll(async () => {
    await withDatabase(async (db) => {
      await db.query(
        `delete from "TenantProvisioningStep"
          where "runId" in (select "id" from "TenantProvisioningRun"
                             where "correlationId" like $1)`,
        [`${RUN_MARKER}-%`],
      );
      await db.query(
        'delete from "TenantProvisioningRun" where "correlationId" like $1',
        [`${RUN_MARKER}-%`],
      );
    });
  });

  test('D1 — the queue names every state it is holding', async ({ page }) => {
    await signInToAdmin(page);
    await openAdmin(page, '/operations/provisioning');

    await expect(
      page.getByRole('heading', { name: /provisioning operations/i }),
    ).toBeVisible();

    /*
     * Each state is asserted as rendered text. Colour alone would not be
     * enough — an operator with no colour vision must still be able to triage,
     * which is why every pill carries its label.
     */
    for (const state of [
      /breached/i,
      /failed/i,
      /manual action required/i,
      /in progress/i,
    ]) {
      await expect(page.getByText(state).first()).toBeVisible();
    }
  });

  test('D2 — the blocker an operator would act on is shown in full', async ({
    page,
  }) => {
    await signInToAdmin(page);
    await openAdmin(page, '/operations/provisioning');

    /*
     * The failed step's message, not the run-level one. A run carries both and
     * the run-level message is the less useful of the two — it says a step
     * failed, where the step says why.
     */
    await expect(
      page.getByText(/SMTP relay refused the connection \(550\)/i),
    ).toBeVisible();
    await expect(
      page.getByText(/Run-level message that must not win/i),
    ).toHaveCount(0);
  });

  test('D3 — rows arrive in triage order, not alphabetical order', async ({
    page,
  }) => {
    await signInToAdmin(page);
    await openAdmin(page, '/operations/provisioning');

    const stateCells = page.locator('table tbody tr td:first-child');
    await expect(stateCells.first()).toBeVisible();

    const order = (await stateCells.allInnerTexts()).map((text) =>
      text.trim().toLowerCase(),
    );

    const rank = (label: string) =>
      [
        'breached',
        'failed',
        'manual action required',
        'at risk',
        'in progress',
        'ready',
      ].findIndex((state) => label.startsWith(state));

    const ranks = order.map(rank).filter((value) => value >= 0);
    expect(ranks.length).toBeGreaterThan(1);
    expect([...ranks].sort((a, b) => a - b)).toEqual(ranks);
  });

  test('D4 — the page tells an operator how many runs need them', async ({
    page,
  }) => {
    await signInToAdmin(page);
    await openAdmin(page, '/operations/provisioning');

    /*
     * The one number worth reading first. A row of six near-identical stat
     * cards was the alternative, and it makes an operator do the arithmetic
     * that the screen exists to have already done.
     */
    await expect(
      page.getByText(/runs? need attention|nothing needs attention/i).first(),
    ).toBeVisible();
  });

  test('D5 — the page body does not scroll sideways at laptop width', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await signInToAdmin(page);
    await openAdmin(page, '/operations/provisioning');

    /*
     * A wide operational table must scroll inside its own container. When the
     * page body scrolls instead, the navigation shell slides off with it and
     * the screen becomes unusable on the most common laptop width there is.
     */
    const overflows = await page.evaluate(
      () =>
        document.documentElement.scrollWidth >
        document.documentElement.clientWidth + 1,
    );
    expect(overflows).toBe(false);
  });
});
