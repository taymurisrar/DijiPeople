import { config as loadEnv } from 'dotenv';
import { resolve } from 'node:path';
import { createPrismaClient } from './create-prisma-client';

loadEnv({ path: resolve(__dirname, '../.env') });
loadEnv();

/**
 * Print the commercial catalogue as the database actually holds it.
 *
 * Read-only, and deliberately separate from `seed-commercial.ts`: the seed
 * reports what *it* changed, which is not the same question as what is there.
 * After a reconcile the two should agree, and this is how that is checked
 * without reading the seed's own account of itself.
 *
 * Useful before a reconcile as well as after — "delete the existing plans" is
 * much easier to answer once the existing plans are on screen.
 */
async function report() {
  const prisma = createPrismaClient();

  try {
    const plans = await prisma.plan.findMany({
      orderBy: [{ isActive: 'desc' }, { sortOrder: 'asc' }],
      select: {
        key: true,
        name: true,
        isActive: true,
        isPublic: true,
        publicationStatus: true,
        salesModel: true,
        _count: { select: { subscriptions: true, prices: true } },
      },
    });

    console.log(`Plans (${plans.length}):`);
    for (const plan of plans) {
      const state = plan.isActive ? plan.publicationStatus : 'INACTIVE';
      console.log(
        `  ${plan.key.padEnd(18)} ${plan.name.padEnd(14)} ${state.padEnd(10)} ` +
          `${plan.salesModel.padEnd(15)} ` +
          `${plan._count.prices} price(s), ${plan._count.subscriptions} subscription(s)`,
      );
    }

    const prices = await prisma.planPrice.findMany({
      where: { isActive: true },
      orderBy: [
        { plan: { sortOrder: 'asc' } },
        { currency: 'asc' },
        { billingModel: 'asc' },
        { billingCycle: 'asc' },
      ],
      select: {
        currency: true,
        billingCycle: true,
        billingModel: true,
        unitAmount: true,
        minimumSeats: true,
        includedSeats: true,
        overageUnitAmount: true,
        salesModel: true,
        publicationStatus: true,
        stripeSyncStatus: true,
        plan: { select: { key: true } },
        market: { select: { code: true } },
      },
    });

    console.log(`\nActive prices (${prices.length}):`);
    for (const price of prices) {
      const seats =
        price.billingModel === 'PER_SEAT'
          ? `min ${price.minimumSeats} seat(s)`
          : `${price.includedSeats} included, overage ${
              price.overageUnitAmount === null
                ? 'none'
                : String(price.overageUnitAmount)
            }`;
      console.log(
        `  ${(price.market?.code ?? '—').padEnd(5)} ${price.plan.key.padEnd(12)} ` +
          `${price.billingModel.padEnd(8)} ${price.billingCycle.padEnd(7)} ` +
          `${price.currency} ${String(price.unitAmount).padStart(10)}  ` +
          `${seats.padEnd(34)} ${price.salesModel.padEnd(15)} ` +
          `stripe:${price.stripeSyncStatus}`,
      );
    }

    /*
     * Counted separately because it is the question an operator actually has:
     * a price can be published, correct and completely unbuyable. Publication
     * is a catalogue decision; checkout readiness additionally needs a
     * verified, synced, active Stripe price, and seeding creates none.
     */
    const synced = prices.filter(
      (price) => price.stripeSyncStatus === 'SYNCED',
    ).length;
    console.log(
      `\n${synced} of ${prices.length} active price(s) are synced to Stripe. ` +
        'The rest cannot be checked out until they are.',
    );
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  report().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
