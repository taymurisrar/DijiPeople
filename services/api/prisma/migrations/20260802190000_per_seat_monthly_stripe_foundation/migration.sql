-- Additive per-seat billing foundation. Existing PlanPrice rows remain legacy
-- flat prices; database defaults make newly-created rows per-seat/monthly.
CREATE TYPE "BillingModel" AS ENUM ('PER_SEAT', 'FLAT');
CREATE TYPE "BillingInterval" AS ENUM ('MONTH', 'YEAR');
CREATE TYPE "StripeEnvironment" AS ENUM ('TEST', 'LIVE');
CREATE TYPE "StripeSyncStatus" AS ENUM ('NOT_SYNCED', 'PENDING', 'SYNCED', 'FAILED', 'ENVIRONMENT_MISMATCH');

ALTER TABLE "PlanPrice"
  ADD COLUMN "billingModel" "BillingModel" NOT NULL DEFAULT 'PER_SEAT',
  ADD COLUMN "billingInterval" "BillingInterval" NOT NULL DEFAULT 'MONTH',
  ADD COLUMN "minimumSeats" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "maximumSeats" INTEGER,
  ADD COLUMN "includedSeats" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "stripeProductId" TEXT,
  ADD COLUMN "stripeEnvironment" "StripeEnvironment",
  ADD COLUMN "stripeSyncStatus" "StripeSyncStatus" NOT NULL DEFAULT 'NOT_SYNCED',
  ADD COLUMN "stripeActive" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "stripeUsageType" TEXT,
  ADD COLUMN "stripeRecurringInterval" TEXT,
  ADD COLUMN "stripeVerifiedAt" TIMESTAMP(3),
  ADD COLUMN "stripeVerificationError" TEXT;

-- Preserve the meaning of pre-existing rows. The application only creates
-- PER_SEAT prices after this migration.
UPDATE "PlanPrice"
SET "billingModel" = 'FLAT',
    "billingInterval" = CASE WHEN "billingCycle" = 'ANNUAL' THEN 'YEAR'::"BillingInterval" ELSE 'MONTH'::"BillingInterval" END,
    "minimumSeats" = 1,
    "includedSeats" = 0,
    "stripeSyncStatus" = CASE WHEN "stripePriceId" IS NULL THEN 'NOT_SYNCED'::"StripeSyncStatus" ELSE 'PENDING'::"StripeSyncStatus" END;

ALTER TABLE "PlanPrice"
  ADD CONSTRAINT "PlanPrice_minimumSeats_check" CHECK ("minimumSeats" >= 1),
  ADD CONSTRAINT "PlanPrice_maximumSeats_check" CHECK ("maximumSeats" IS NULL OR "maximumSeats" >= "minimumSeats"),
  ADD CONSTRAINT "PlanPrice_includedSeats_check" CHECK ("includedSeats" >= 0);

CREATE INDEX "PlanPrice_billingModel_billingInterval_currency_isActive_idx"
  ON "PlanPrice"("billingModel", "billingInterval", "currency", "isActive");
CREATE INDEX "PlanPrice_stripeSyncStatus_stripeEnvironment_idx"
  ON "PlanPrice"("stripeSyncStatus", "stripeEnvironment");
CREATE INDEX "PlanPrice_effectiveFrom_isActive_idx"
  ON "PlanPrice"("effectiveFrom", "isActive");

ALTER TABLE "Subscription"
  ADD COLUMN "stripeSubscriptionItemId" TEXT,
  ADD COLUMN "purchasedSeats" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "stripeQuantity" INTEGER,
  ADD COLUMN "seatsLastReconciledAt" TIMESTAMP(3),
  ADD COLUMN "lastStripeEventCreatedAt" TIMESTAMP(3);

ALTER TABLE "Subscription"
  ADD CONSTRAINT "Subscription_purchasedSeats_check" CHECK ("purchasedSeats" >= 1),
  ADD CONSTRAINT "Subscription_stripeQuantity_check" CHECK ("stripeQuantity" IS NULL OR "stripeQuantity" >= 1);

CREATE INDEX "Subscription_stripeSubscriptionItemId_idx"
  ON "Subscription"("stripeSubscriptionItemId");

-- Monitoring incidents are grouped by fingerprint; each observed trace remains
-- addressable as a separate occurrence.
ALTER TABLE "ErrorLog"
  ADD COLUMN "fingerprint" TEXT,
  ADD COLUMN "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "occurrenceCount" INTEGER NOT NULL DEFAULT 1;

UPDATE "ErrorLog"
SET "fingerprint" = "traceId",
    "firstSeenAt" = "createdAt",
    "lastSeenAt" = "createdAt";

CREATE UNIQUE INDEX "ErrorLog_fingerprint_key" ON "ErrorLog"("fingerprint");
CREATE INDEX "ErrorLog_lastSeenAt_occurrenceCount_idx" ON "ErrorLog"("lastSeenAt", "occurrenceCount");

CREATE TABLE "ErrorLogOccurrence" (
  "id" TEXT NOT NULL,
  "incidentId" TEXT NOT NULL,
  "traceId" TEXT NOT NULL,
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "diagnosticJson" JSONB,
  CONSTRAINT "ErrorLogOccurrence_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ErrorLogOccurrence_traceId_key" ON "ErrorLogOccurrence"("traceId");
CREATE INDEX "ErrorLogOccurrence_incidentId_occurredAt_idx" ON "ErrorLogOccurrence"("incidentId", "occurredAt");
CREATE INDEX "ErrorLogOccurrence_occurredAt_idx" ON "ErrorLogOccurrence"("occurredAt");
ALTER TABLE "ErrorLogOccurrence" ADD CONSTRAINT "ErrorLogOccurrence_incidentId_fkey"
  FOREIGN KEY ("incidentId") REFERENCES "ErrorLog"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "ErrorLogOccurrence" ("id", "incidentId", "traceId", "occurredAt")
SELECT 'legacy_' || "id", "id", "traceId", "createdAt" FROM "ErrorLog";
