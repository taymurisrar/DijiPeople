-- Per-seat public pricing, with flat as a sales-assisted instrument.
--
-- See docs/plans/EXECPLAN-0002-per-seat-public-pricing-with-sales-assisted-flat.md
--
-- Hand-written rather than generated. `prisma migrate dev` would fold in the
-- ~195 statements of pre-existing schema/migration drift recorded as ITEM-0060,
-- which has nothing to do with this change and must not ride along with it.
--
-- Three parts, none destructive.

-- ---------------------------------------------------------------------------
-- 1. A flat plan's allowance can finally be priced.
--
-- The seat engine has measured overage since it landed — `SeatUsage.overage`,
-- `SeatOverageEvent.peakOverage` — and there was nowhere to say what an extra
-- employee costs. A flat plan could exceed its included headcount and never be
-- billed for it.
--
-- Nullable, and null means "this price does not charge overage". That is the
-- correct value for every PER_SEAT row: there is no "above included" when every
-- seat is billed. It is also the value every pre-existing row takes, so nothing
-- already stored changes behaviour.
-- ---------------------------------------------------------------------------
ALTER TABLE "PlanPrice"
  ADD COLUMN IF NOT EXISTS "overageUnitAmount" DECIMAL(12,2);

-- ---------------------------------------------------------------------------
-- 2. One plan, two billing models, at the same time.
--
-- The active-price uniqueness rule was:
--
--   ("planId", "marketId", "billingCycle", "currency") WHERE "isActive"
--
-- which permits exactly one active price per plan/market/cycle/currency. That
-- is why a plan could not hold a per-seat price for the public and a flat price
-- for sales simultaneously — the second insert violated the index.
--
-- Adding "billingModel" to the key is **strictly more permissive**: it adds a
-- column, so every row that satisfied the old index satisfies the new one. No
-- row can be rejected by this migration that was not already rejected before
-- it, and no data is read, moved or deleted here.
--
-- NULLS NOT DISTINCT is carried across unchanged. It is what keeps "at most one
-- active unscoped price per plan/cycle/currency" true for rows with no market,
-- which is what the previous two versions of this index each guaranteed.
--
-- Created before the old one is dropped, so there is no window in which the
-- table has no active-price guarantee at all. Same ordering, and same reason,
-- as 20260816200000_planprice_market_aware_active_uniqueness.
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS "PlanPrice_active_plan_market_cycle_currency_model_key"
ON "PlanPrice" ("planId", "marketId", "billingCycle", "currency", "billingModel")
NULLS NOT DISTINCT
WHERE "isActive" = true;

DROP INDEX IF EXISTS "PlanPrice_active_plan_market_cycle_currency_key";

-- ---------------------------------------------------------------------------
-- 3. Qatar takes ownership of its own country code.
--
-- `MarketCountry.countryCode` is UNIQUE **globally**, not per market. The `GCC`
-- market claims 'QA' among its six countries, so a new Qatar market cannot also
-- claim it — and `ensureMarkets` catches unique violations and treats them as
-- benign, which means on any database where GCC already exists the Qatar market
-- would be created with **no country row at all**. Silently. And permanently,
-- because `ensureMarkets` skips markets that already exist, so re-seeding never
-- repairs it.
--
-- So the row is moved here rather than left to a seed that cannot win the race.
-- 'QA' is removed from GCC's list in markets.catalog.ts in the same change.
--
-- Guarded on the Qatar market existing, so this is a no-op on a database seeded
-- before that market was defined: a fresh deploy creates it from the catalog
-- with its country row intact, and this UPDATE matches nothing. Idempotent —
-- a second run finds the row already pointing at Qatar.
-- ---------------------------------------------------------------------------
UPDATE "MarketCountry" mc
SET "marketId" = qa."id",
    "updatedAt" = NOW()
FROM "Market" qa
WHERE qa."code" = 'QA'
  AND mc."countryCode" = 'QA'
  AND mc."marketId" <> qa."id";
