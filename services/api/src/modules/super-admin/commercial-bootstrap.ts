import {
  BillingCycle,
  BillingInterval,
  BillingModel,
  CommercialPublicationStatus,
  CommercialSalesModel,
  Prisma,
  type PrismaClient,
} from '@prisma/client';
import {
  DEFAULT_MARKET_DEFINITIONS,
  DEFAULT_PLAN_SALES_MODELS,
  SEEDED_PRICE_MARKET_CODE,
} from './markets.catalog';
import { DEFAULT_PLAN_DEFINITIONS } from './plans.catalog';

/**
 * Explicit, idempotent bootstrap of DijiPeople's own commercial configuration.
 *
 * This used to run as a side effect of `SuperAdminService.listPlans()`, so
 * opening the Admin Plans screen created Plans, Markets and PlanPrices. That
 * produced a production P0 (BUG-0030): a `GET /platform-runtime/plans` returned
 * 409 `DATABASE_DUPLICATE_RECORD` because the insert violated the partial unique
 * index `PlanPrice_active_plan_cycle_currency_key`.
 *
 * The rule this file exists to hold: **reads do not initialise state.**
 * Bootstrap runs from `seed:config` (and therefore from `npm run release:api`),
 * or from a deliberate operator action — never from serving a page.
 *
 * Everything here is safe to run repeatedly and concurrently. Where a race is
 * possible the code either lets the database arbitrate and then *verifies the
 * winning row*, or does nothing at all. It never assumes a unique-violation
 * means "someone else already wrote what I wanted" — see `createPlanPriceIfAbsent`.
 */

export type CommercialBootstrapResult = {
  plansCreated: number;
  marketsCreated: number;
  pricesCreated: number;
  /** Slots left alone because an active price already served them. */
  pricesSkippedExisting: number;
  /** Slots where a concurrent writer won the race; the winner was verified. */
  pricesSkippedRace: number;
  warnings: string[];
};

type BootstrapClient = PrismaClient;

const UNIQUE_VIOLATION = 'P2002';

export async function bootstrapCommercialDefaults(
  prisma: BootstrapClient,
): Promise<CommercialBootstrapResult> {
  const result: CommercialBootstrapResult = {
    plansCreated: 0,
    marketsCreated: 0,
    pricesCreated: 0,
    pricesSkippedExisting: 0,
    pricesSkippedRace: 0,
    warnings: [],
  };

  await ensurePlans(prisma, result);
  await ensureMarkets(prisma, result);
  await ensurePlanPrices(prisma, result);

  return result;
}

async function ensurePlans(
  prisma: BootstrapClient,
  result: CommercialBootstrapResult,
) {
  for (const definition of DEFAULT_PLAN_DEFINITIONS) {
    const existing = await prisma.plan.findUnique({
      where: { key: definition.key },
    });

    if (existing) {
      // Legacy amounts are filled in only when the plan carries none at all.
      // An operator's numbers are never overwritten.
      if (
        Number(existing.monthlyBasePrice) === 0 &&
        Number(existing.annualBasePrice) === 0
      ) {
        await prisma.plan.update({
          where: { id: existing.id },
          data: {
            monthlyBasePrice: definition.monthlyBasePrice,
            annualBasePrice: definition.annualBasePrice,
            currency: definition.currency,
          },
        });
      }
      continue;
    }

    try {
      await prisma.plan.create({
        data: {
          key: definition.key,
          name: definition.name,
          description: definition.description,
          sortOrder: definition.sortOrder,
          isActive: true,
          monthlyBasePrice: definition.monthlyBasePrice,
          annualBasePrice: definition.annualBasePrice,
          currency: definition.currency,
          publicationStatus: CommercialPublicationStatus.PUBLISHED,
          publishedAt: new Date(),
          salesModel:
            DEFAULT_PLAN_SALES_MODELS[definition.key] ??
            CommercialSalesModel.SELF_SERVICE,
          features: {
            create: definition.enabledFeatureKeys.map((featureKey) => ({
              featureKey,
              isEnabled: true,
            })),
          },
        },
      });
      result.plansCreated += 1;
    } catch (error) {
      // `Plan.key` is unique. A concurrent bootstrap creating the same plan is
      // benign — the row it created is the row this one wanted.
      if (!isUniqueViolation(error)) throw error;
    }
  }
}

async function ensureMarkets(
  prisma: BootstrapClient,
  result: CommercialBootstrapResult,
) {
  for (const definition of DEFAULT_MARKET_DEFINITIONS) {
    const existing = await prisma.market.findUnique({
      where: { code: definition.code },
    });

    // Never overwrite an existing market: after the first run its values are
    // operator decisions, not seed defaults.
    if (existing) continue;

    try {
      await prisma.market.create({
        data: {
          code: definition.code,
          name: definition.name,
          description: definition.description,
          launchStatus: definition.launchStatus,
          isEnabled: definition.isEnabled,
          selfServiceEnabled: definition.selfServiceEnabled,
          publicationStatus: definition.published
            ? CommercialPublicationStatus.PUBLISHED
            : CommercialPublicationStatus.DRAFT,
          publishedAt: definition.published ? new Date() : null,
          defaultCurrency: definition.defaultCurrency,
          supportedCurrencies: [...definition.supportedCurrencies],
          dataRegion: definition.dataRegion,
          taxProfileRef: definition.taxProfileRef,
          legalDocumentSetRef: definition.legalDocumentSetRef,
          sortOrder: definition.sortOrder,
          countries: {
            create: definition.countryCodes.map((countryCode) => ({
              countryCode,
            })),
          },
        },
      });
      result.marketsCreated += 1;
    } catch (error) {
      // `Market.code` and `MarketCountry.countryCode` are both unique.
      if (!isUniqueViolation(error)) throw error;
    }
  }
}

async function ensurePlanPrices(
  prisma: BootstrapClient,
  result: CommercialBootstrapResult,
) {
  const market = await prisma.market.findUnique({
    where: { code: SEEDED_PRICE_MARKET_CODE },
  });

  if (!market) {
    result.warnings.push(
      `Seed market "${SEEDED_PRICE_MARKET_CODE}" is missing; no prices were created.`,
    );
    return;
  }

  const currency = market.defaultCurrency.toUpperCase();

  for (const definition of DEFAULT_PLAN_DEFINITIONS) {
    const plan = await prisma.plan.findUnique({
      where: { key: definition.key },
    });
    if (!plan) continue;

    const slots = [
      {
        billingCycle: BillingCycle.MONTHLY,
        billingInterval: BillingInterval.MONTH,
        unitAmount: definition.monthlyBasePrice,
      },
      {
        billingCycle: BillingCycle.ANNUAL,
        billingInterval: BillingInterval.YEAR,
        unitAmount: definition.annualBasePrice,
      },
    ];

    for (const slot of slots) {
      // A zero legacy amount means unpriced, not free.
      if (slot.unitAmount <= 0) continue;

      await createPlanPriceIfAbsent(prisma, result, {
        planId: plan.id,
        planKey: plan.key,
        marketId: market.id,
        currency,
        salesModel:
          DEFAULT_PLAN_SALES_MODELS[definition.key] ??
          CommercialSalesModel.SELF_SERVICE,
        ...slot,
      });
    }
  }
}

type PriceSlot = {
  planId: string;
  planKey: string;
  marketId: string;
  currency: string;
  billingCycle: BillingCycle;
  billingInterval: BillingInterval;
  unitAmount: number;
  salesModel: CommercialSalesModel;
};

/**
 * Create one seeded price, or establish that the slot is already served.
 *
 * The pre-existing check was the actual root cause of BUG-0030. It looked for
 * `{ planId, marketId, currency, billingInterval }` while the database enforces
 * a **partial unique index** on `(planId, billingCycle, currency)
 * WHERE isActive = true`. Those disagree on three axes — the check included the
 * market and the constraint did not, the check used `billingInterval` and the
 * constraint used `billingCycle`, and the check ignored `isActive` entirely.
 *
 * So on a database that already had an active price for the plan/cycle/currency
 * with a different (or null) market — which is what production had, from before
 * markets existed — the check found nothing and the insert violated the index.
 * Concurrency was a second, independent way to reach the same failure.
 *
 * The check below is therefore written against **what the database actually
 * enforces**, not against what a market-scoped model would suggest.
 */
async function createPlanPriceIfAbsent(
  prisma: BootstrapClient,
  result: CommercialBootstrapResult,
  slot: PriceSlot,
) {
  const occupant = await findActiveForSlot(prisma, slot);

  if (occupant) {
    result.pricesSkippedExisting += 1;
    return;
  }

  // Informational only. An active price with no market cannot be resolved by
  // any market, so the slot looks occupied while nothing is actually
  // purchasable. Creating the market-scoped price is still correct — under the
  // market-aware index they are different slots — but an operator should know
  // the stale row is there.
  const unscoped = await findActiveUnscoped(prisma, slot);
  if (unscoped) {
    result.warnings.push(
      `Plan "${slot.planKey}" ${slot.billingCycle} ${slot.currency}: an active price exists with ` +
        'no market and cannot be resolved by any market. A market-scoped price was created ' +
        'alongside it; review the unscoped row in Platform Admin.',
    );
  }

  try {
    await prisma.planPrice.create({
      data: {
        planId: slot.planId,
        marketId: slot.marketId,
        billingCycle: slot.billingCycle,
        billingInterval: slot.billingInterval,
        billingModel: BillingModel.FLAT,
        currency: slot.currency,
        unitAmount: slot.unitAmount,
        minimumSeats: 1,
        includedSeats: 0,
        publicationStatus: CommercialPublicationStatus.PUBLISHED,
        salesModel: slot.salesModel,
        publishedAt: new Date(),
        isActive: true,
      },
    });
    result.pricesCreated += 1;
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;

    // A concurrent bootstrap won the race. A unique violation is never treated
    // as success on faith: re-read the winning row and confirm it is the state
    // this call intended. A conflict can mean a race, but it can equally mean
    // the wrong amount or the wrong market, and those must not be swallowed.
    const winner = await findActiveForSlot(prisma, slot);

    if (!winner) {
      // The conflict was not on the slot this call owns, so the insert failed
      // for a reason this code does not understand. Surface it.
      throw error;
    }

    result.pricesSkippedRace += 1;

    if (Number(winner.unitAmount) !== slot.unitAmount) {
      result.warnings.push(
        `Plan "${slot.planKey}" ${slot.billingCycle} ${slot.currency}: a concurrent write created a ` +
          `different amount (${String(winner.unitAmount)}, expected ${slot.unitAmount}). ` +
          'Left unchanged for review.',
      );
    }
  }
}

/**
 * The row that would collide with `slot` under the database's active-price rule.
 *
 * Mirrors `PlanPrice_active_plan_market_cycle_currency_key` — plan, market,
 * billing cycle, currency, restricted to active rows.
 *
 * Getting this wrong is what caused BUG-0030. The original check looked for
 * `{ planId, marketId, currency, billingInterval }` while the index of the day
 * enforced `(planId, billingCycle, currency) WHERE isActive` — disagreeing on
 * three axes at once: the market, `billingInterval` versus `billingCycle`, and
 * `isActive`. The check passed and the insert failed. This must therefore be
 * kept in step with the migration that defines the index.
 */
async function findActiveForSlot(prisma: BootstrapClient, slot: PriceSlot) {
  return prisma.planPrice.findFirst({
    where: {
      planId: slot.planId,
      marketId: slot.marketId,
      billingCycle: slot.billingCycle,
      currency: slot.currency,
      isActive: true,
    },
    select: { id: true, marketId: true, unitAmount: true },
  });
}

/** An active price for the slot that belongs to no market. Advisory. */
async function findActiveUnscoped(prisma: BootstrapClient, slot: PriceSlot) {
  return prisma.planPrice.findFirst({
    where: {
      planId: slot.planId,
      marketId: null,
      billingCycle: slot.billingCycle,
      currency: slot.currency,
      isActive: true,
    },
    select: { id: true },
  });
}

function isUniqueViolation(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === UNIQUE_VIOLATION
  );
}
