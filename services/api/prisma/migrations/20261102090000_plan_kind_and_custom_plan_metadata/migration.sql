-- Plans: an explicit catalogue/custom distinction, customer eligibility and a validity window.
--
-- There are exactly three predefined plans (starter, growth, enterprise). Everything
-- else is a custom plan created for a customer, agreement, promotion or pilot. The
-- distinction is a column, not a naming convention, so the catalogue seed can leave
-- custom plans alone.
--
-- Additive and idempotent in effect: no row is deleted, no price, subscription or
-- feature row is touched.

CREATE TYPE "PlanKind" AS ENUM ('CATALOGUE', 'CUSTOM');

ALTER TABLE "Plan"
  ADD COLUMN "kind" "PlanKind" NOT NULL DEFAULT 'CUSTOM',
  ADD COLUMN "eligibleCustomerAccountId" TEXT,
  ADD COLUMN "effectiveFrom" TIMESTAMP(3),
  ADD COLUMN "effectiveUntil" TIMESTAMP(3);

ALTER TABLE "Plan"
  ADD CONSTRAINT "Plan_eligibleCustomerAccountId_fkey"
  FOREIGN KEY ("eligibleCustomerAccountId") REFERENCES "CustomerAccount"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "Plan_kind_isActive_idx" ON "Plan"("kind", "isActive");
CREATE INDEX "Plan_eligibleCustomerAccountId_idx" ON "Plan"("eligibleCustomerAccountId");

-- The three predefined plans.
UPDATE "Plan" SET "kind" = 'CATALOGUE' WHERE "key" IN ('starter', 'growth', 'enterprise');

-- Legacy `enterprise-plus` was a predefined, contract-only plan. It is not a plan any
-- more. It is CONVERTED, never deleted: it keeps its id, key, features, prices and
-- every subscription, customer, lead and order that references it, so nobody loses a
-- capability or a billing term. It becomes a custom plan, withdrawn from sale and
-- hidden from customers. What to do with the tenants still on it (rename, reprice,
-- move to a purpose-made custom plan) is a commercial decision recorded in the
-- handoff, not something a migration may take.
UPDATE "Plan"
SET "kind" = 'CUSTOM',
    "salesModel" = 'CUSTOM_ONLY',
    "isPublic" = false,
    "publicationStatus" = 'ARCHIVED',
    "archivedAt" = COALESCE("archivedAt", now()),
    "metadataJson" = COALESCE("metadataJson", '{}'::jsonb)
      || jsonb_build_object('convertedFromCataloguePlan', 'enterprise-plus')
WHERE "key" = 'enterprise-plus';

-- Nothing at all references it: it can also leave the active list.
UPDATE "Plan" p
SET "isActive" = false
WHERE p."key" = 'enterprise-plus'
  AND NOT EXISTS (SELECT 1 FROM "Subscription" s WHERE s."planId" = p."id")
  AND NOT EXISTS (SELECT 1 FROM "CustomerAccount" c WHERE c."selectedPlanId" = p."id")
  AND NOT EXISTS (SELECT 1 FROM "CustomerOnboarding" o WHERE o."selectedPlanId" = p."id")
  AND NOT EXISTS (SELECT 1 FROM "Lead" l WHERE l."agreedPlanId" = p."id")
  AND NOT EXISTS (SELECT 1 FROM "SubscriptionOrder" so WHERE so."planId" = p."id");
