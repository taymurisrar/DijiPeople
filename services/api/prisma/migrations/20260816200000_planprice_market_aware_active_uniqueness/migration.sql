-- Make active-price uniqueness market-aware.
--
-- BUG-0030. The existing partial index dates from before markets existed:
--
--   PlanPrice_active_plan_cycle_currency_key
--   UNIQUE (planId, billingCycle, currency) WHERE isActive = true
--
-- Wave 1 introduced PlanPrice.marketId and scoped prices to markets, which made
-- that index structurally wrong: it cannot tell two markets apart. All three
-- seeded markets (PK, US, GCC) default to USD, so the moment a second market is
-- priced, a legitimate configuration collides with an index that has no opinion
-- about markets.
--
-- What a distinct *active* price is, after this migration:
--
--   plan + market + billing cycle + currency
--
-- Version history is untouched. The index is still partial on isActive, so any
-- number of DRAFT, ARCHIVED, superseded and future-effective rows coexist for
-- the same slot — only the single row currently serving checkout is unique.
--
-- NULLS NOT DISTINCT (PostgreSQL 15+) is deliberate. marketId is nullable, and
-- with default NULL semantics every unscoped legacy row would be mutually
-- distinct, silently *removing* the protection the old index gave those rows.
-- Treating NULLs as equal keeps "at most one active unscoped price per
-- plan/cycle/currency", which is exactly what the old index guaranteed.
--
-- Safety: the new index is strictly more permissive than the old one — it adds
-- a column to the key — so every row that satisfied the old index satisfies the
-- new one. No data is read, moved or deleted here, and no row can be rejected
-- by this migration that was not already rejected before it.

CREATE UNIQUE INDEX IF NOT EXISTS "PlanPrice_active_plan_market_cycle_currency_key"
ON "PlanPrice" ("planId", "marketId", "billingCycle", "currency")
NULLS NOT DISTINCT
WHERE "isActive" = true;

-- Dropped only after the replacement exists, so there is no window without an
-- active-price guarantee.
DROP INDEX IF EXISTS "PlanPrice_active_plan_cycle_currency_key";
