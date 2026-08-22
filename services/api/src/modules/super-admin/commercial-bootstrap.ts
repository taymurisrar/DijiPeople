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
} from './markets.catalog';
import { DEFAULT_PLAN_DEFINITIONS } from './plans.catalog';
import { PRICED_MARKET_CODES, buildSeededPrices } from './pricing.catalog';

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
 * means "someone else already wrote what I wanted" — see `reconcilePlanPrice`.
 *
 * ## Bootstrap converges; it does not merely create
 *
 * Until now every branch here was create-only: an existing plan kept its name
 * and its features, an occupied price slot was counted as served whatever
 * amount it held, and a plan the catalog had dropped stayed on sale forever.
 * On a fresh database that is indistinguishable from correct. On a database
 * seeded before the owner's schedule arrived on 2026-08-20 it means the catalog
 * is a document describing a state the database never reaches — which is what
 * "delete the existing plans and set the real prices" was actually reporting.
 *
 * So this file now reconciles. The rule it follows throughout: **converge the
 * catalogue, preserve what was sold.** A plan or price the catalog no longer
 * lists is withdrawn from sale rather than deleted, a drifted price is
 * superseded rather than edited, and anything carrying a subscription is left
 * standing and reported. Nothing a customer bought is rewritten by a seed.
 */

export type CommercialBootstrapResult = {
  plansCreated: number;
  /** Catalog plans that existed but disagreed with the catalog. */
  plansUpdated: number;
  /** Plans absent from the catalog, deactivated because nothing was sold on them. */
  plansRetired: number;
  /** Plans absent from the catalog but carrying subscriptions: withdrawn from sale, kept alive. */
  plansWithdrawn: number;
  marketsCreated: number;
  pricesCreated: number;
  /** Occupied slots whose terms disagreed: the old row was deactivated and a new version written. */
  pricesSuperseded: number;
  /** Active prices on a catalogue plan that the catalogue does not list at all. */
  pricesRetired: number;
  /** Slots left alone because an active price already served them **on the catalog's terms**. */
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
    plansUpdated: 0,
    plansRetired: 0,
    plansWithdrawn: 0,
    marketsCreated: 0,
    pricesCreated: 0,
    pricesSuperseded: 0,
    pricesRetired: 0,
    pricesSkippedExisting: 0,
    pricesSkippedRace: 0,
    warnings: [],
  };

  await ensurePlans(prisma, result);
  await retireUnlistedPlans(prisma, result);
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
      await reconcilePlan(prisma, result, existing, definition);
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

/**
 * Bring one existing plan back into agreement with the catalog.
 *
 * Only the fields the catalog is authoritative for. `stripeProductId` is not
 * one of them — it points at a real object in a real Stripe account and is
 * established by the sync action, never by a seed.
 *
 * The legacy amounts are written unconditionally now, where they used to be
 * filled in only when both were zero so as not to "overwrite an operator's
 * numbers". That deference was misplaced: nothing may read those columns to
 * decide what anybody pays (BUG-0027), they are no longer editable in Admin,
 * and their only remaining job is to show a recognisable figure beside the plan
 * name. A stale one does that job wrong.
 */
async function reconcilePlan(
  prisma: BootstrapClient,
  result: CommercialBootstrapResult,
  existing: {
    id: string;
    name: string;
    description: string | null;
    sortOrder: number;
    isActive: boolean;
    publicationStatus: CommercialPublicationStatus;
    salesModel: CommercialSalesModel;
    monthlyBasePrice: Prisma.Decimal;
    annualBasePrice: Prisma.Decimal;
    currency: string;
  },
  definition: (typeof DEFAULT_PLAN_DEFINITIONS)[number],
) {
  const salesModel =
    DEFAULT_PLAN_SALES_MODELS[definition.key] ??
    CommercialSalesModel.SELF_SERVICE;

  const drifted =
    existing.name !== definition.name ||
    existing.description !== definition.description ||
    existing.sortOrder !== definition.sortOrder ||
    existing.salesModel !== salesModel ||
    !existing.isActive ||
    existing.publicationStatus !== CommercialPublicationStatus.PUBLISHED ||
    Number(existing.monthlyBasePrice) !== definition.monthlyBasePrice ||
    Number(existing.annualBasePrice) !== definition.annualBasePrice ||
    existing.currency !== definition.currency;

  const featureChanges = await reconcilePlanFeatures(
    prisma,
    existing.id,
    definition.enabledFeatureKeys,
  );

  if (!drifted && featureChanges === 0) return;

  await prisma.plan.update({
    where: { id: existing.id },
    data: {
      name: definition.name,
      description: definition.description,
      sortOrder: definition.sortOrder,
      isActive: true,
      salesModel,
      publicationStatus: CommercialPublicationStatus.PUBLISHED,
      // A plan republished after an archive must lose the archive stamp, or it
      // reads as simultaneously on sale and withdrawn.
      archivedAt: null,
      publishedAt:
        existing.publicationStatus === CommercialPublicationStatus.PUBLISHED
          ? undefined
          : new Date(),
      monthlyBasePrice: definition.monthlyBasePrice,
      annualBasePrice: definition.annualBasePrice,
      currency: definition.currency,
    },
  });
  result.plansUpdated += 1;
}

/**
 * Make the plan's feature rows say exactly what the catalog says.
 *
 * Disabled rather than deleted. A `PlanFeature` row is the record of a decision
 * about that plan, and removing it loses the difference between "this plan
 * never offered payroll" and "this plan stopped offering payroll" — which is
 * the question asked when a customer insists they used to have it.
 *
 * Returns how many rows changed, so the caller can tell a genuine reconcile
 * from a no-op without re-reading them.
 */
async function reconcilePlanFeatures(
  prisma: BootstrapClient,
  planId: string,
  enabledFeatureKeys: readonly string[],
) {
  const wanted = new Set(enabledFeatureKeys);
  const existing = await prisma.planFeature.findMany({
    where: { planId },
    select: { id: true, featureKey: true, isEnabled: true },
  });
  const seen = new Set(existing.map((row) => row.featureKey));
  let changes = 0;

  for (const row of existing) {
    const shouldEnable = wanted.has(row.featureKey);
    if (row.isEnabled === shouldEnable) continue;
    await prisma.planFeature.update({
      where: { id: row.id },
      data: { isEnabled: shouldEnable },
    });
    changes += 1;
  }

  for (const featureKey of wanted) {
    if (seen.has(featureKey)) continue;
    try {
      await prisma.planFeature.create({
        data: { planId, featureKey, isEnabled: true },
      });
      changes += 1;
    } catch (error) {
      // `@@unique([planId, featureKey])`. A concurrent bootstrap adding the
      // same feature wrote the row this call wanted.
      if (!isUniqueViolation(error)) throw error;
    }
  }

  return changes;
}

/**
 * Withdraw plans the catalogue no longer lists.
 *
 * This is the half of "delete the existing plans and create the new ones" that
 * can be done safely. `Plan` sits in front of subscriptions, orders, invoices,
 * leads and customer accounts; deleting one would either fail on a foreign key
 * or cascade through a customer's billing history, and the console refuses it
 * for exactly that reason.
 *
 * Withdrawal is what "delete" meant here — the plan stops being offered. Two
 * outcomes, and which applies is decided by the data rather than by a flag:
 *
 * - **Nothing was ever sold on it** — deactivated and archived, along with its
 *   prices. It leaves Admin's active list and every public surface.
 * - **It carries subscriptions** — unpublished and made non-public so nobody
 *   new can reach it, but left active so the customers on it keep rendering.
 *   Reported, because moving them is a commercial decision and not a seed's to
 *   take.
 */
async function retireUnlistedPlans(
  prisma: BootstrapClient,
  result: CommercialBootstrapResult,
) {
  const listed = DEFAULT_PLAN_DEFINITIONS.map((definition) => definition.key);

  const unlisted = await prisma.plan.findMany({
    where: {
      key: { notIn: listed },
      OR: [
        { isActive: true },
        { publicationStatus: CommercialPublicationStatus.PUBLISHED },
      ],
    },
    select: {
      id: true,
      key: true,
      _count: { select: { subscriptions: true } },
    },
  });

  for (const plan of unlisted) {
    if (plan._count.subscriptions > 0) {
      await prisma.plan.update({
        where: { id: plan.id },
        data: {
          publicationStatus: CommercialPublicationStatus.ARCHIVED,
          isPublic: false,
          archivedAt: new Date(),
        },
      });
      result.plansWithdrawn += 1;
      result.warnings.push(
        `Plan "${plan.key}" is not in the catalogue and carries ` +
          `${plan._count.subscriptions} subscription(s). It was withdrawn from sale ` +
          'and left active so those customers keep working. Moving them to a ' +
          'catalogue plan is a commercial decision, not a seed.',
      );
      continue;
    }

    await prisma.plan.update({
      where: { id: plan.id },
      data: {
        isActive: false,
        isPublic: false,
        publicationStatus: CommercialPublicationStatus.ARCHIVED,
        archivedAt: new Date(),
      },
    });
    /*
     * Its prices go with it. An active price under a retired plan is a row the
     * offer resolver would still consider — and the plan being inactive is not
     * something the price-resolution index knows about.
     */
    await prisma.planPrice.updateMany({
      where: { planId: plan.id, isActive: true },
      data: {
        isActive: false,
        publicationStatus: CommercialPublicationStatus.ARCHIVED,
        archivedAt: new Date(),
      },
    });
    result.plansRetired += 1;
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

    if (existing) {
      // Never overwrite an existing market's *attributes*: after the first run
      // its currency, launch status and publication are operator decisions, not
      // seed defaults. Its country claims are reconciled separately below —
      // see `ensureMarketCountries` for why that is not the same thing.
      await ensureMarketCountries(prisma, result, existing.id, definition);
      continue;
    }

    try {
      const created = await prisma.market.create({
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
        },
      });
      result.marketsCreated += 1;
      /*
       * Countries are written after the market rather than nested inside the
       * create. Nested, a single country already claimed by another market
       * fails the whole `market.create` — and the catch below then treated that
       * as benign, so the market silently did not exist at all.
       */
      await ensureMarketCountries(prisma, result, created.id, definition);
    } catch (error) {
      // `Market.code` is unique; a concurrent seeder may have won the race.
      if (!isUniqueViolation(error)) throw error;
    }
  }
}

/**
 * Make a market's country claims match the catalog — including the claims it
 * lost to a market that was seeded before it existed.
 *
 * **This is the repair for BUG-0792**, and the shape of that defect is worth
 * stating plainly because the code that caused it looked careful.
 *
 * `MarketCountry.countryCode` is unique **globally**, not per market. `GCC` was
 * seeded first and claimed `QA` among its six countries. When Qatar was later
 * given its own market at QAR, three things had to line up and did not:
 *
 *  1. `ensureMarkets` skipped any market that already existed, so on a database
 *     that already had `QA` the Qatar market's own row was never revisited.
 *  2. Creating the Qatar market wrote its countries nested, so the unique
 *     violation on `QA` failed the whole create — and the catch treated a
 *     unique violation as benign, so it failed *silently*.
 *  3. The migration written to move the row is guarded on the Qatar market
 *     existing, and `prisma migrate deploy` runs **before** the seed that
 *     creates it. On exactly the databases that needed the repair it matched
 *     nothing.
 *
 * The result in production: a `LAUNCHED`, published Qatar market priced in QAR
 * with **no country row at all**, so `resolveMarketForCountry('QA')` fell
 * through to `GCC` — `PLANNED`, self-service disabled, default currency USD.
 * Every visitor in Doha was quoted USD on `/` and `/plans`, offered no plan at
 * all, and the state was self-perpetuating: re-seeding never repaired it.
 *
 * So the reconciliation is unconditional and idempotent. A country the catalog
 * assigns to this market is moved here from whichever market currently holds
 * it. That is a narrow authority — the catalog decides which market serves a
 * country, and nothing else in the system writes `MarketCountry` — but it is
 * still a move, so every one is recorded in `warnings` rather than done
 * quietly. A silent repair of a silent breakage is how this stayed invisible.
 */
async function ensureMarketCountries(
  prisma: BootstrapClient,
  result: CommercialBootstrapResult,
  marketId: string,
  definition: (typeof DEFAULT_MARKET_DEFINITIONS)[number],
) {
  for (const countryCode of definition.countryCodes) {
    const existing = await prisma.marketCountry.findUnique({
      where: { countryCode },
      include: { market: { select: { code: true } } },
    });

    if (existing?.marketId === marketId) continue;

    try {
      if (!existing) {
        await prisma.marketCountry.create({ data: { marketId, countryCode } });
        continue;
      }

      await prisma.marketCountry.update({
        where: { countryCode },
        data: { marketId },
      });
      result.warnings.push(
        `Country ${countryCode} was served by market ${existing.market.code} and has been moved to ${definition.code}, which the catalog assigns it to.`,
      );
    } catch (error) {
      /*
       * A concurrent seeder claimed it between the read and the write. Report
       * rather than swallow: the previous version's silence on exactly this
       * error is what let a launched market run with no countries.
       */
      if (!isUniqueViolation(error)) throw error;
      result.warnings.push(
        `Country ${countryCode} could not be assigned to market ${definition.code}: another writer claimed it concurrently. Re-run to reconcile.`,
      );
    }
  }
}

async function ensurePlanPrices(
  prisma: BootstrapClient,
  result: CommercialBootstrapResult,
) {
  /*
   * One pass over the whole schedule.
   *
   * This used to seed a single market — `SEEDED_PRICE_MARKET_CODE` — from the
   * legacy `Plan.monthlyBasePrice` columns, plus a DRAFT PKR placeholder
   * schedule whose amounts nobody had decided. The owner supplied a real
   * schedule on 2026-08-20, so the placeholders are gone and three markets are
   * priced in their own currencies.
   *
   * `pricing.catalog.ts` is the only place the numbers live. This function
   * knows how to write a price; it does not know what one costs.
   */
  const seeded = buildSeededPrices();

  const planIds = new Map<string, string>();
  for (const definition of DEFAULT_PLAN_DEFINITIONS) {
    const plan = await prisma.plan.findUnique({
      where: { key: definition.key },
      select: { id: true },
    });
    if (plan) planIds.set(definition.key, plan.id);
  }

  const marketIds = new Map<string, string>();
  for (const code of PRICED_MARKET_CODES) {
    const market = await prisma.market.findUnique({
      where: { code },
      select: { id: true },
    });
    if (market) {
      marketIds.set(code, market.id);
    } else {
      result.warnings.push(
        `Priced market "${code}" is missing; its prices were not created.`,
      );
    }
  }

  /*
   * Every slot the catalogue claims, as the tuple the retirement pass matches
   * on. Built here rather than re-derived, so the two passes cannot disagree
   * about what "the catalogue asks for" means.
   */
  const catalogued = new Set<string>();

  for (const price of seeded) {
    const planId = planIds.get(price.planKey);
    const marketId = marketIds.get(price.marketCode);

    // A missing plan or market is reported, never invented. Seeding a price
    // against something that does not exist is how an unpurchasable row gets
    // created and then puzzles somebody in Admin.
    if (!planId) {
      result.warnings.push(
        `Plan "${price.planKey}" is missing; its ${price.marketCode} prices were not created.`,
      );
      continue;
    }
    if (!marketId) continue;

    catalogued.add(
      slotKey({
        marketId,
        billingCycle:
          price.cycle === 'ANNUAL' ? BillingCycle.ANNUAL : BillingCycle.MONTHLY,
        currency: price.currency,
        billingModel: price.billingModel,
      }),
    );

    await reconcilePlanPrice(prisma, result, {
      planId,
      planKey: price.planKey,
      marketId,
      currency: price.currency,
      billingCycle:
        price.cycle === 'ANNUAL' ? BillingCycle.ANNUAL : BillingCycle.MONTHLY,
      billingInterval:
        price.cycle === 'ANNUAL' ? BillingInterval.YEAR : BillingInterval.MONTH,
      billingModel: price.billingModel,
      unitAmount: price.unitAmount,
      minimumSeats: price.minimumSeats,
      includedSeats: price.includedSeats,
      overageUnitAmount: price.overageUnitAmount,
      /*
       * The price's own sales model, not the plan's default.
       *
       * This is what keeps flat pricing off the public site: every FLAT row is
       * SALES_ASSISTED, which `resolveCommercialOffer` refuses on the
       * SELF_SERVICE channel. The plan's model still narrows it — an
       * Enterprise+ style CUSTOM_ONLY plan cannot be widened by a permissive
       * price row — see `narrowestSalesModel`.
       */
      salesModel: price.salesModel,
    });
  }

  await retireUncataloguedPrices(prisma, result, planIds, catalogued);
}

/**
 * One price slot, as a comparable string.
 *
 * The market is part of it, and `null` is a distinct value rather than a
 * wildcard — an active price with no market cannot be resolved by any market,
 * so it is never a slot the catalogue asked for.
 */
function slotKey(slot: {
  marketId: string | null;
  billingCycle: BillingCycle;
  currency: string;
  billingModel: BillingModel;
}) {
  return [
    slot.marketId ?? 'no-market',
    slot.billingCycle,
    slot.currency,
    slot.billingModel,
  ].join('|');
}

/**
 * Deactivate active prices on catalogue plans that the catalogue does not list.
 *
 * `reconcilePlanPrice` can only correct a slot the catalogue *asks* for: it
 * looks up the occupant by plan, market, cycle, currency and billing model, so
 * a row in a combination the catalogue never mentions is invisible to it and
 * survives every run. That is not hypothetical. Before this pass existed the
 * development database held eight active prices, and all eight were of exactly
 * that kind:
 *
 * - four with **no market**, unresolvable by any market yet occupying the slot;
 * - four scoped to the Pakistan market but priced in **USD**, which PK accepts
 *   as a supported currency — so they were genuinely resolvable, at amounts
 *   from the invented pre-schedule figures;
 * - all eight FLAT and marked `SELF_SERVICE`, putting flat pricing on the
 *   public site, which is the one thing the schedule says must never happen.
 *
 * Seeding the catalogue alongside them would have left every one of those rows
 * live. "Set the real prices" has to mean the unreal ones stop being prices.
 *
 * Deactivated, never deleted, and for the same reason a superseded price is
 * kept: a subscription may point at one, and the terms it was sold under have
 * to stay readable.
 */
async function retireUncataloguedPrices(
  prisma: BootstrapClient,
  result: CommercialBootstrapResult,
  planIds: Map<string, string>,
  catalogued: Set<string>,
) {
  const ids = [...planIds.values()];
  if (ids.length === 0) return;

  const active = await prisma.planPrice.findMany({
    where: { planId: { in: ids }, isActive: true },
    select: {
      id: true,
      planId: true,
      marketId: true,
      billingCycle: true,
      currency: true,
      billingModel: true,
      unitAmount: true,
      salesModel: true,
      plan: { select: { key: true } },
    },
  });

  const now = new Date();

  for (const price of active) {
    if (catalogued.has(slotKey(price))) continue;

    await prisma.planPrice.update({
      where: { id: price.id },
      data: {
        isActive: false,
        effectiveTo: now,
        publicationStatus: CommercialPublicationStatus.ARCHIVED,
        archivedAt: now,
      },
    });
    result.pricesRetired += 1;
    result.warnings.push(
      `Plan "${price.plan.key}" ${price.billingCycle} ${price.currency} ` +
        `${price.billingModel} (${
          price.marketId === null ? 'no market' : 'market-scoped'
        }, ${String(price.unitAmount)}, ${price.salesModel}): not in the ` +
        'catalogue. Deactivated.',
    );
  }
}

type PriceSlot = {
  planId: string;
  planKey: string;
  marketId: string;
  currency: string;
  billingCycle: BillingCycle;
  billingInterval: BillingInterval;
  billingModel: BillingModel;
  unitAmount: number;
  minimumSeats: number;
  includedSeats: number;
  overageUnitAmount: number | null;
  salesModel: CommercialSalesModel;
};

/**
 * Bring one price slot to the terms the catalogue states.
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
async function reconcilePlanPrice(
  prisma: BootstrapClient,
  result: CommercialBootstrapResult,
  slot: PriceSlot,
  /*
   * PUBLISHED unless a caller says otherwise.
   *
   * Every caller now says nothing, because every seeded price is a real one the
   * owner set. This used to read "the one caller that says otherwise is the PKR
   * placeholder schedule, whose amounts nobody has decided" — that schedule was
   * removed on 2026-08-20 when the real one arrived.
   *
   * The parameter stays because the distinction it encodes is still true and
   * still needed: a DRAFT price is invisible to the offer resolver, so it is how
   * a price can exist before anybody has decided to sell at it.
   *
   * Publishing is **not** the same as being sellable. Every seeded price is
   * PUBLISHED and none of them can be bought, because `deriveCheckoutReadiness`
   * refuses anything without a verified, synced, active Stripe price — and
   * seeding creates none. That guard, not the publication status, is what stands
   * between a seeded number and a customer's card.
   */
  publicationStatus: CommercialPublicationStatus = CommercialPublicationStatus.PUBLISHED,
) {
  const occupant = await findActiveForSlot(prisma, slot);

  if (occupant) {
    const differences = describePriceDrift(occupant, slot);
    if (differences.length === 0) {
      result.pricesSkippedExisting += 1;
      return;
    }

    /*
     * The slot is served on the wrong terms. This is the case that used to be
     * counted as "already served" and skipped, which is why a database seeded
     * before the owner's schedule arrived kept its old amounts however many
     * times the seed ran.
     *
     * Superseded, not edited. `Subscription` snapshots `planPriceId` alongside
     * `basePrice`, `finalPrice` and `currency` at purchase, so updating the row
     * in place would not reprice anybody — but it would rewrite the row an
     * existing subscription points at, and the terms a customer bought under
     * would no longer be readable anywhere. The old row stays, deactivated and
     * dated; the new one records what it supersedes.
     */
    await supersedePrice(prisma, result, occupant, slot, differences);
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
        billingModel: slot.billingModel,
        currency: slot.currency,
        unitAmount: slot.unitAmount,
        minimumSeats: slot.minimumSeats,
        includedSeats: slot.includedSeats,
        overageUnitAmount: slot.overageUnitAmount,
        publicationStatus,
        salesModel: slot.salesModel,
        // A draft was never published, so it has no publication date. Stamping
        // one would make an unpublished price look like a withdrawn one.
        publishedAt:
          publicationStatus === CommercialPublicationStatus.PUBLISHED
            ? new Date()
            : null,
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
 * Everything about the occupant that disagrees with the catalogue.
 *
 * Returned as prose rather than a boolean because the reason is what an
 * operator needs: "Starter MONTHLY PKR was superseded" invites the question
 * this answers. Compared with `Number()` on every Decimal — a `Prisma.Decimal`
 * is never `===` a JavaScript number, so a naive comparison reports drift on
 * every run and supersedes a correct price forever.
 */
function describePriceDrift(
  occupant: {
    unitAmount: Prisma.Decimal;
    minimumSeats: number;
    includedSeats: number;
    overageUnitAmount: Prisma.Decimal | null;
    salesModel: CommercialSalesModel;
    billingInterval: BillingInterval;
    publicationStatus: CommercialPublicationStatus;
  },
  slot: PriceSlot,
) {
  const differences: string[] = [];
  const occupantOverage =
    occupant.overageUnitAmount === null
      ? null
      : Number(occupant.overageUnitAmount);

  if (Number(occupant.unitAmount) !== slot.unitAmount) {
    differences.push(
      `amount ${String(occupant.unitAmount)} -> ${slot.unitAmount}`,
    );
  }
  if (occupant.minimumSeats !== slot.minimumSeats) {
    differences.push(
      `minimum seats ${occupant.minimumSeats} -> ${slot.minimumSeats}`,
    );
  }
  if (occupant.includedSeats !== slot.includedSeats) {
    differences.push(
      `included seats ${occupant.includedSeats} -> ${slot.includedSeats}`,
    );
  }
  if (occupantOverage !== slot.overageUnitAmount) {
    differences.push(
      `overage ${occupantOverage === null ? 'none' : occupantOverage} -> ` +
        `${slot.overageUnitAmount === null ? 'none' : slot.overageUnitAmount}`,
    );
  }
  if (occupant.salesModel !== slot.salesModel) {
    differences.push(
      `sales model ${occupant.salesModel} -> ${slot.salesModel}`,
    );
  }
  if (occupant.billingInterval !== slot.billingInterval) {
    differences.push(
      `interval ${occupant.billingInterval} -> ${slot.billingInterval}`,
    );
  }
  if (occupant.publicationStatus !== CommercialPublicationStatus.PUBLISHED) {
    differences.push(`publication ${occupant.publicationStatus} -> PUBLISHED`);
  }

  return differences;
}

/**
 * Retire the occupying price and write the catalogue's terms as its successor.
 *
 * Both writes go in one transaction. Deactivating the old row and failing
 * before the new one lands would leave the slot empty — no active price for a
 * published plan in a launched market, which reads to the offer resolver as
 * "this plan is not sold here" and takes the plan off the pricing page.
 *
 * The new row carries no Stripe identifiers, deliberately. The old row's
 * `stripePriceId` belongs to a Stripe Price for the old amount; copying it
 * across would produce a row that looks synced and charges the previous price.
 * `deriveCheckoutReadiness` therefore reports the new price as not checkout-
 * ready until somebody syncs it, which is the correct and visible state.
 */
async function supersedePrice(
  prisma: BootstrapClient,
  result: CommercialBootstrapResult,
  occupant: { id: string; version: number },
  slot: PriceSlot,
  differences: string[],
) {
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    await tx.planPrice.update({
      where: { id: occupant.id },
      data: {
        isActive: false,
        effectiveTo: now,
        publicationStatus: CommercialPublicationStatus.ARCHIVED,
        archivedAt: now,
      },
    });

    await tx.planPrice.create({
      data: {
        planId: slot.planId,
        marketId: slot.marketId,
        billingCycle: slot.billingCycle,
        billingInterval: slot.billingInterval,
        billingModel: slot.billingModel,
        currency: slot.currency,
        unitAmount: slot.unitAmount,
        minimumSeats: slot.minimumSeats,
        includedSeats: slot.includedSeats,
        overageUnitAmount: slot.overageUnitAmount,
        publicationStatus: CommercialPublicationStatus.PUBLISHED,
        publishedAt: now,
        salesModel: slot.salesModel,
        effectiveFrom: now,
        version: occupant.version + 1,
        supersedesPriceId: occupant.id,
        isActive: true,
      },
    });
  });

  result.pricesSuperseded += 1;
  result.warnings.push(
    `Plan "${slot.planKey}" ${slot.billingCycle} ${slot.currency} ` +
      `${slot.billingModel}: superseded (${differences.join('; ')}). ` +
      'The new price is not checkout-ready until it is synced to Stripe.',
  );
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
      /*
       * `billingModel` joined this check on 2026-08-20, when it joined the
       * index. Without it the two are back in disagreement — a per-seat row
       * would look like it occupied the flat slot, the flat price would never
       * be seeded, and nothing would say so. That is the same shape as the
       * defect described above, which is the one this function was rewritten
       * for.
       */
      billingModel: slot.billingModel,
      isActive: true,
    },
    /*
     * Every field the catalogue is authoritative for, because this row is what
     * drift is measured against. Selecting only the amount — which is what this
     * did while the check was create-only — would let a price with the right
     * number and the wrong minimum seats or sales model pass as correct. The
     * sales model in particular is what keeps flat pricing off the public site.
     */
    select: {
      id: true,
      marketId: true,
      version: true,
      unitAmount: true,
      minimumSeats: true,
      includedSeats: true,
      overageUnitAmount: true,
      salesModel: true,
      billingInterval: true,
      publicationStatus: true,
    },
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
