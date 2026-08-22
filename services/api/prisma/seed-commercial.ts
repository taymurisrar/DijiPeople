import { config as loadEnv } from 'dotenv';
import { resolve } from 'node:path';
import { createPrismaClient } from './create-prisma-client';
import { bootstrapCommercialDefaults } from '../src/modules/super-admin/commercial-bootstrap';

loadEnv({ path: resolve(__dirname, '../.env') });
loadEnv();

/**
 * Reconcile DijiPeople's own commercial catalogue — plans, markets, prices —
 * and nothing else.
 *
 * `seed:config` already calls `bootstrapCommercialDefaults`, but it calls it
 * alongside notification templates, RBAC bootstrap, reference data and
 * per-tenant seeding for every tenant in the database. Correcting three plan
 * names should not require all of that, and an operator who has just changed
 * the price schedule should be able to apply it and read what changed.
 *
 * Same function, same idempotence, same safety under concurrency. This is a
 * narrower door into it, not a second implementation — the numbers live in
 * `pricing.catalog.ts` and the plans in `plans.catalog.ts`, here as everywhere.
 *
 * What it does **not** do is talk to Stripe. Every price it writes is published
 * and none of them is purchasable, because `deriveCheckoutReadiness` requires a
 * verified, synced, active Stripe price and seeding creates none. Syncing is a
 * deliberate per-price action in Platform Admin, and it creates real objects in
 * a real Stripe account — not something a seed should do on anyone's behalf.
 */
async function runSeedCommercial() {
  const prisma = createPrismaClient();

  try {
    const result = await bootstrapCommercialDefaults(prisma);

    console.log('Commercial catalogue reconciled.');
    console.log(
      `  Plans:   ${result.plansCreated} created, ${result.plansUpdated} reconciled, ` +
        `${result.plansRetired} retired, ${result.plansWithdrawn} withdrawn from sale`,
    );
    console.log(`  Markets: ${result.marketsCreated} created`);
    console.log(
      `  Prices:  ${result.pricesCreated} created, ${result.pricesSuperseded} superseded, ` +
        `${result.pricesRetired} retired as uncatalogued, ` +
        `${result.pricesSkippedExisting} already on catalogue terms, ` +
        `${result.pricesSkippedRace} lost a concurrent race`,
    );

    if (result.warnings.length === 0) {
      console.log('  No warnings.');
      return;
    }

    /*
     * Warnings are printed last and counted, because they are the part an
     * operator has to act on: a superseded price needs a Stripe sync before
     * anybody can buy it, and a withdrawn plan carrying subscriptions needs a
     * commercial decision. A run that ends "36 prices already on catalogue
     * terms" and buries four of those underneath is a report that reads as
     * success.
     */
    console.warn(`  ${result.warnings.length} warning(s):`);
    for (const warning of result.warnings) {
      console.warn(`    - ${warning}`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  runSeedCommercial().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}

export { runSeedCommercial };
