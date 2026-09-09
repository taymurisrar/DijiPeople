import { config as loadEnv } from 'dotenv';
import { resolve } from 'node:path';
import { createPrismaClient } from './create-prisma-client';
import { backfillPlanCapabilities } from '../src/modules/super-admin/commercial-bootstrap';

loadEnv({ path: resolve(__dirname, '../.env') });
loadEnv();

/**
 * Write the `PlanFeature` rows the capabilities carved out by BUG-2958 need.
 *
 * Four keys were added on 2026-09-09 to gate settings pages that had been free
 * to every tenant: the desktop agent, attendance hardware, compliance and
 * retention, and bulk import/export. `getResolvedTenantFeatures` treats a
 * missing `PlanFeature` row as not-included, so shipping the code without these
 * rows removes fourteen settings pages from **every** tenant, Enterprise
 * customers included.
 *
 * ## Why this is not `seed:config`
 *
 * That entry point runs the whole commercial bootstrap, which also reconciles
 * `PlanPrice` against `pricing.catalog.ts`. On this production database the two
 * disagree, and writing plan features through it would have superseded every
 * live price as a side effect. Nothing already sold would change, because prices
 * are superseded rather than edited, but the next customer would be charged a
 * figure nobody decided on today. Fixing an entitlement must not quietly
 * reprice the product.
 *
 * ## What it does
 *
 * Creates a missing row as enabled, and nothing else. It never disables, deletes
 * or updates a row, so an operator's deliberate toggle survives and a second run
 * writes nothing. A **catalog** plan gets a key only if `plans.catalog.ts` says
 * it sells it — which is what correctly leaves Starter without the carved-out
 * capabilities. Those withholdings are printed, not skipped silently.
 *
 * Run it **before** the code that reads these keys reaches production. The
 * currently-deployed API does not know them, so the rows are inert until it
 * does; write them after the deploy instead and there is a window in which
 * paying tenants lose pages.
 *
 *   npm --workspace api run repair:plan-capabilities
 *   npm --workspace api run repair:plan-capabilities -- --dry-run
 */
const CARVED_OUT_KEYS = [
  'desktop-agent',
  'attendance-integrations',
  'compliance',
  'data-management',
] as const;

async function runRepairPlanCapabilities() {
  const dryRun = process.argv.includes('--dry-run');
  const prisma = createPrismaClient();

  try {
    const result = await backfillPlanCapabilities(prisma, CARVED_OUT_KEYS, {
      dryRun,
    });

    console.log(
      dryRun
        ? 'Plan capability backfill — DRY RUN, nothing was written.'
        : 'Plan capabilities reconciled.',
    );
    console.log(`  Plans examined: ${result.plansExamined}`);

    /*
     * Both lists print in full rather than as counts. Each granted line is a
     * capability a customer keeps; each withheld line is one a customer loses,
     * and the second is the half an operator most needs to read before it
     * reaches a support queue.
     */
    if (result.granted.length === 0) {
      console.log('  Nothing to grant.');
    } else {
      console.log(`  ${result.granted.length} grant(s):`);
      for (const line of result.granted) {
        console.log(`    + ${line}`);
      }
    }

    if (result.withheld.length > 0) {
      console.warn(
        `  ${result.withheld.length} withheld by the catalog (intended):`,
      );
      for (const line of result.withheld) {
        console.warn(`    - ${line}`);
      }
    }
  } finally {
    await prisma.$disconnect();
  }
}

void runRepairPlanCapabilities().catch((error) => {
  console.error('repair:plan-capabilities failed');
  console.error(error);
  process.exitCode = 1;
});
