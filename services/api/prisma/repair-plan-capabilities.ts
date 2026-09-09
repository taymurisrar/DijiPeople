import { config as loadEnv } from 'dotenv';
import { resolve } from 'node:path';
import { createPrismaClient } from './create-prisma-client';
import { backfillCapabilitiesOnCustomPlans } from '../src/modules/super-admin/commercial-bootstrap';

loadEnv({ path: resolve(__dirname, '../.env') });
loadEnv();

/**
 * Grandfather the capabilities carved out by BUG-2958 onto bespoke plans.
 *
 * Three keys were added on 2026-09-09 to gate settings pages that had been free
 * to every tenant: attendance hardware, compliance and retention, and bulk
 * import/export. The four catalog plans pick them up from `plans.catalog.ts` on
 * the next `seed:config`, which is how Starter is meant to *lose* them.
 *
 * Plans an operator created by hand are not in the catalog and are never
 * reconciled, so without this they would silently stop offering three things
 * their tenants use today. This grants the missing rows on those plans only, and
 * never overwrites a row an operator already set.
 *
 * Run once after deploying the change, and safe to run again — a database that
 * already has the rows produces no writes.
 *
 *   npm --workspace api run repair:plan-capabilities
 */
const CARVED_OUT_KEYS = [
  'attendance-integrations',
  'compliance',
  'data-management',
] as const;

async function runRepairPlanCapabilities() {
  const prisma = createPrismaClient();

  try {
    const result = await backfillCapabilitiesOnCustomPlans(
      prisma,
      CARVED_OUT_KEYS,
    );

    console.log('Bespoke plan capabilities reconciled.');
    console.log(`  Plans examined: ${result.plansExamined}`);

    if (result.granted.length === 0) {
      console.log('  No changes were needed.');
      return;
    }

    /*
     * Every grant is printed rather than counted. Each line is a capability a
     * customer keeps, and an operator reviewing this should see which plans were
     * touched rather than infer it from a total.
     */
    console.warn(`  ${result.granted.length} capability grant(s):`);
    for (const line of result.granted) {
      console.warn(`    ${line}`);
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
