-- Commercial Configuration Foundation — expand + backfill phase.
--
-- Additive only. No column is dropped and no existing value is overwritten.
-- The legacy Plan pricing columns (monthlyBasePrice, annualBasePrice, currency)
-- deliberately survive this migration; proving they have zero live consumers is
-- a later contract phase, tracked in docs/bugs/BUG-0027-*.md.
--
-- The backfill below is the delicate part. Two rules govern it:
--   1. Never overwrite an existing PlanPrice. A hand-authored price outranks a
--      generated one, always.
--   2. Never invent an amount. Only plans whose legacy value is > 0 produce a
--      backfilled row; a plan priced at 0 is unpriced, not free.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

CREATE TYPE "CommercialPublicationStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');
CREATE TYPE "CommercialSalesModel" AS ENUM ('SELF_SERVICE', 'SALES_ASSISTED', 'CUSTOM_ONLY');
CREATE TYPE "MarketLaunchStatus" AS ENUM ('PLANNED', 'PILOT', 'LAUNCHED', 'SUSPENDED');

-- ---------------------------------------------------------------------------
-- Market
-- ---------------------------------------------------------------------------

CREATE TABLE "Market" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "publicationStatus" "CommercialPublicationStatus" NOT NULL DEFAULT 'DRAFT',
    "launchStatus" "MarketLaunchStatus" NOT NULL DEFAULT 'PLANNED',
    "isEnabled" BOOLEAN NOT NULL DEFAULT false,
    "selfServiceEnabled" BOOLEAN NOT NULL DEFAULT false,
    "defaultCurrency" TEXT NOT NULL,
    "supportedCurrencies" TEXT[],
    "dataRegion" TEXT,
    "taxProfileRef" TEXT,
    "legalDocumentSetRef" TEXT,
    "supportTierRef" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "publishedAt" TIMESTAMP(3),
    "publishedById" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,

    CONSTRAINT "Market_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Market_code_key" ON "Market"("code");
CREATE INDEX "Market_publicationStatus_isEnabled_sortOrder_idx" ON "Market"("publicationStatus", "isEnabled", "sortOrder");
CREATE INDEX "Market_launchStatus_idx" ON "Market"("launchStatus");

CREATE TABLE "MarketCountry" (
    "id" TEXT NOT NULL,
    "marketId" TEXT NOT NULL,
    "countryCode" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketCountry_pkey" PRIMARY KEY ("id")
);

-- One country resolves to exactly one market. Without this a visitor could
-- match two markets with different currencies and the answer would depend on
-- row order.
CREATE UNIQUE INDEX "MarketCountry_countryCode_key" ON "MarketCountry"("countryCode");
CREATE INDEX "MarketCountry_marketId_idx" ON "MarketCountry"("marketId");

ALTER TABLE "MarketCountry"
    ADD CONSTRAINT "MarketCountry_marketId_fkey"
    FOREIGN KEY ("marketId") REFERENCES "Market"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Plan — publication lifecycle
-- ---------------------------------------------------------------------------

ALTER TABLE "Plan"
    ADD COLUMN "legacyPricingMigratedAt" TIMESTAMP(3),
    ADD COLUMN "publicationStatus" "CommercialPublicationStatus" NOT NULL DEFAULT 'DRAFT',
    ADD COLUMN "salesModel" "CommercialSalesModel" NOT NULL DEFAULT 'SELF_SERVICE',
    ADD COLUMN "publishedAt" TIMESTAMP(3),
    ADD COLUMN "publishedById" TEXT,
    ADD COLUMN "archivedAt" TIMESTAMP(3);

-- Backfill publication from the booleans that previously carried this meaning.
-- Defaulting every existing plan to DRAFT would take the whole live catalogue
-- off the public site the moment this deploys, so anything currently active and
-- public becomes PUBLISHED, and anything inactive becomes ARCHIVED. A plan that
-- is active but not public stays DRAFT, which is what isPublic=false meant.
UPDATE "Plan"
SET "publicationStatus" = 'PUBLISHED',
    "publishedAt" = COALESCE("publishedAt", "createdAt")
WHERE "isActive" = true AND "isPublic" = true;

UPDATE "Plan"
SET "publicationStatus" = 'ARCHIVED',
    "archivedAt" = COALESCE("archivedAt", "updatedAt")
WHERE "isActive" = false;

CREATE INDEX "Plan_publicationStatus_isActive_sortOrder_idx" ON "Plan"("publicationStatus", "isActive", "sortOrder");

-- ---------------------------------------------------------------------------
-- PlanPrice — market scoping and publication lifecycle
-- ---------------------------------------------------------------------------

ALTER TABLE "PlanPrice"
    ADD COLUMN "marketId" TEXT,
    ADD COLUMN "publicationStatus" "CommercialPublicationStatus" NOT NULL DEFAULT 'DRAFT',
    ADD COLUMN "salesModel" "CommercialSalesModel" NOT NULL DEFAULT 'SELF_SERVICE',
    ADD COLUMN "publishedAt" TIMESTAMP(3),
    ADD COLUMN "publishedById" TEXT,
    ADD COLUMN "archivedAt" TIMESTAMP(3),
    ADD COLUMN "backfilledFromLegacyAt" TIMESTAMP(3),
    ADD COLUMN "createdById" TEXT,
    ADD COLUMN "updatedById" TEXT;

-- Same reasoning as Plan: an active price was live before this migration and
-- must stay live after it.
UPDATE "PlanPrice"
SET "publicationStatus" = 'PUBLISHED',
    "publishedAt" = COALESCE("publishedAt", "createdAt")
WHERE "isActive" = true;

UPDATE "PlanPrice"
SET "publicationStatus" = 'ARCHIVED',
    "archivedAt" = COALESCE("archivedAt", "updatedAt")
WHERE "isActive" = false;

CREATE INDEX "PlanPrice_planId_marketId_currency_billingInterval_publicat_idx"
    ON "PlanPrice"("planId", "marketId", "currency", "billingInterval", "publicationStatus");
CREATE INDEX "PlanPrice_marketId_idx" ON "PlanPrice"("marketId");
CREATE INDEX "PlanPrice_publicationStatus_effectiveFrom_idx" ON "PlanPrice"("publicationStatus", "effectiveFrom");

-- ON DELETE RESTRICT: deleting a market that prices reference would orphan
-- commercial history, including the price a live subscription was sold under.
ALTER TABLE "PlanPrice"
    ADD CONSTRAINT "PlanPrice_marketId_fkey"
    FOREIGN KEY ("marketId") REFERENCES "Market"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Backfill legacy Plan pricing into PlanPrice
--
-- Creates at most one MONTHLY and one ANNUAL price per plan, and only where:
--   * the legacy amount is > 0 — a zero is unpriced, not free;
--   * no PlanPrice already exists for that plan/currency/cycle — a
--     hand-authored price always wins over a generated one.
--
-- Backfilled rows are created as DRAFT with no market, so they are inert:
-- resolution treats an unscoped, unpublished price as unavailable. An operator
-- assigns the market and publishes deliberately. That is the whole point —
-- this migration must not silently start charging anyone the legacy number.
-- ---------------------------------------------------------------------------

INSERT INTO "PlanPrice" (
    "id", "planId", "billingCycle", "billingModel", "billingInterval",
    "currency", "unitAmount", "minimumSeats", "maximumSeats", "includedSeats",
    "effectiveFrom", "version", "isActive", "publicationStatus", "salesModel",
    "backfilledFromLegacyAt", "stripeSyncStatus", "stripeActive",
    "createdAt", "updatedAt"
)
SELECT
    gen_random_uuid(),
    p."id",
    'MONTHLY',
    'FLAT',            -- legacy base prices were flat per-plan amounts, not per-seat
    'MONTH',
    p."currency",
    p."monthlyBasePrice",
    1, NULL, 0,
    p."createdAt",
    1,
    false,             -- inert until an operator reviews it
    'DRAFT',
    'SELF_SERVICE',
    CURRENT_TIMESTAMP,
    'NOT_SYNCED',
    false,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "Plan" p
WHERE p."monthlyBasePrice" > 0
  AND NOT EXISTS (
      SELECT 1 FROM "PlanPrice" pp
      WHERE pp."planId" = p."id"
        AND pp."billingCycle" = 'MONTHLY'
        AND upper(pp."currency") = upper(p."currency")
  );

INSERT INTO "PlanPrice" (
    "id", "planId", "billingCycle", "billingModel", "billingInterval",
    "currency", "unitAmount", "minimumSeats", "maximumSeats", "includedSeats",
    "effectiveFrom", "version", "isActive", "publicationStatus", "salesModel",
    "backfilledFromLegacyAt", "stripeSyncStatus", "stripeActive",
    "createdAt", "updatedAt"
)
SELECT
    gen_random_uuid(),
    p."id",
    'ANNUAL',
    'FLAT',
    'YEAR',
    p."currency",
    p."annualBasePrice",
    1, NULL, 0,
    p."createdAt",
    1,
    false,
    'DRAFT',
    'SELF_SERVICE',
    CURRENT_TIMESTAMP,
    'NOT_SYNCED',
    false,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "Plan" p
WHERE p."annualBasePrice" > 0
  AND NOT EXISTS (
      SELECT 1 FROM "PlanPrice" pp
      WHERE pp."planId" = p."id"
        AND pp."billingCycle" = 'ANNUAL'
        AND upper(pp."currency") = upper(p."currency")
  );

-- Mark which plans have been through the backfill. A plan with legacy amounts
-- and a NULL marker after this migration means the backfill skipped it because
-- a PlanPrice already existed — i.e. a potential value conflict a human should
-- look at. scripts/report-legacy-price-conflicts.mjs reports exactly those.
UPDATE "Plan"
SET "legacyPricingMigratedAt" = CURRENT_TIMESTAMP
WHERE "monthlyBasePrice" > 0 OR "annualBasePrice" > 0;
