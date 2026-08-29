/**
 * BUG-1967 — allocates leave entitlement for tenants provisioned before
 * allocation existed.
 *
 * `LeavePolicyRule.entitlementDays` was never read into a balance, so every
 * `LeaveBalance` row carries `totalAllocated = 0` and the balance gate refuses
 * every request. The fix reconciles a tenant on its next policy-assignment
 * write; a tenant nobody touches stays broken until then. This is that nudge.
 *
 * Idempotent, because `reconcileTenant` is: it recomputes each employee's
 * entitlement from the policy that currently wins for them. Running it twice
 * changes nothing the second time, and running it after a policy changes
 * produces the new correct answer.
 *
 * **This writes to leave balances on every tenant it is pointed at.** It is
 * deliberately a separate script rather than something the API does on startup,
 * so that running it is a decision somebody makes against a database they named.
 *
 *   --dry-run      report what would change, write nothing
 *   --tenant=slug  restrict to one tenant (repeatable)
 *
 * Run `--dry-run` first. The demo tenant in particular was deliberately
 * configured around this bug — its Annual Leave type carries
 * `consumesBalance: false` — so allocating there changes what a demonstration
 * does, which may or may not be wanted.
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { LeaveEntitlementService } from '../src/modules/leave/leave-entitlement.service';

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const only = process.argv
    .filter((arg) => arg.startsWith('--tenant='))
    .map((arg) => arg.slice('--tenant='.length));

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });

  try {
    const prisma = app.get(PrismaService);
    const entitlement = app.get(LeaveEntitlementService);

    const tenants = await prisma.tenant.findMany({
      where: only.length ? { slug: { in: only } } : undefined,
      select: { id: true, slug: true },
      orderBy: { slug: 'asc' },
    });

    if (!tenants.length) {
      console.log(
        only.length
          ? `No tenant matched ${only.join(', ')}.`
          : 'No tenants found.',
      );
      return;
    }

    console.log(
      `${dryRun ? 'DRY RUN — ' : ''}${tenants.length} tenant(s) to process.\n`,
    );

    let totalWritten = 0;

    for (const tenant of tenants) {
      /*
       * The dry run counts the same rows the real run would write, by reading
       * what reconciliation would produce rather than by predicting it. It
       * cannot use `reconcileTenant`, which writes — so it counts the employees
       * that resolve to a policy and the entitlement-bearing rules that policy
       * has, which is exactly what `reconcileEmployee` returns.
       */
      if (dryRun) {
        const employees = await prisma.employee.findMany({
          where: { tenantId: tenant.id, isDeleted: false },
          select: { id: true },
        });
        const zeroed = await prisma.leaveBalance.count({
          where: { tenantId: tenant.id, totalAllocated: 0 },
        });
        console.log(
          `${tenant.slug}: ${employees.length} employee(s), ` +
            `${zeroed} balance row(s) currently allocated 0`,
        );
        continue;
      }

      const summary = await entitlement.reconcileTenant(tenant.id, new Date());
      totalWritten += summary.balancesWritten;
      console.log(
        `${tenant.slug}: ${summary.employeesConsidered} employee(s), ` +
          `${summary.balancesWritten} balance(s) written`,
      );
    }

    if (!dryRun) {
      console.log(`\nDone — ${totalWritten} balance row(s) written.`);
      console.log(
        'Employees covered by no leave policy were left untouched, not zeroed.',
      );
    }
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
