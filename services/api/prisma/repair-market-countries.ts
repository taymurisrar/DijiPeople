import { config as loadEnv } from 'dotenv';
import { resolve } from 'node:path';
import { createPrismaClient } from './create-prisma-client';
import { reconcileMarketsOnly } from '../src/modules/super-admin/commercial-bootstrap';

loadEnv({ path: resolve(__dirname, '../.env') });
loadEnv();

/**
 * Make every market's country claims match the catalog. Nothing else.
 *
 * **Why this is not just `seed:commercial`.** BUG-0792: `MarketCountry.
 * countryCode` is unique globally, so the `GCC` market holding `QA` made the
 * Qatar market's own country row impossible to create — and the seed caught
 * that unique violation as benign, then skipped the market on every later run
 * because it existed. Production has been serving a LAUNCHED, published,
 * QAR-priced Qatar market that resolves for nobody, so every visitor in Doha
 * falls through to GCC and is quoted USD with nothing purchasable.
 *
 * The obvious repair is to run `seed:commercial`, which calls `ensureMarkets`.
 * It is also the wrong one here, and by a wide margin: that entry point
 * additionally reconciles plan prices against `pricing.catalog.ts`, and on this
 * production database the two disagree. The catalog has Qatar per-seat monthly
 * at QAR 8 / 14 / 22 and International at USD 2.2 / 3.85 / 6.05; production is
 * selling QAR 15 / 25 / 36 and USD 3.5 / 5.5 / 8.5. Fixing a join table would
 * have superseded every live price as a side effect, roughly halving them.
 *
 * Nothing already sold would have changed — `reconcilePlanPrice` supersedes
 * rather than edits, and existing subscriptions keep the terms they bought — but
 * the next customer would be charged a number nobody decided on today. Which
 * schedule is authoritative is a real commercial question. This repair does not
 * require it answered, and must not force the question by acting first.
 *
 * Safe to run repeatedly. A database whose countries already match produces no
 * writes and no warnings.
 *
 *   npm --workspace api run repair:market-countries
 */
async function runRepairMarketCountries() {
  const prisma = createPrismaClient();

  try {
    const result = await reconcileMarketsOnly(prisma);

    console.log('Market country claims reconciled.');
    console.log(`  Markets created: ${result.marketsCreated}`);

    if (result.warnings.length === 0) {
      console.log('  No changes were needed.');
      return;
    }

    /*
     * Every country move is printed. A country changing markets changes which
     * currency a whole country is quoted in and whether it can buy online at
     * all — the largest commercial effect this script can have, and the operator
     * should read it rather than infer it from an exit code.
     */
    console.warn(`  ${result.warnings.length} change(s):`);
    for (const warning of result.warnings) {
      console.warn(`    - ${warning}`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  runRepairMarketCountries().catch((error) => {
    console.error('Market country repair failed.', error);
    process.exitCode = 1;
  });
}

export { runRepairMarketCountries };
