-- Plans: an explicit catalogue/custom distinction, customer eligibility and a validity window.
--
-- There are exactly three predefined plans (starter, growth, enterprise). Everything
-- else is a custom plan created for a customer, agreement, promotion or pilot. The
-- distinction is a column, not a naming convention, so the catalogue seed can leave
-- custom plans alone.
--
-- No row is deleted, and no price, subscription or feature row is touched.

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
-- more, and its key must not survive as a plan identity. It is CONVERTED IN PLACE,
-- never deleted or re-created: the row keeps its id, so every foreign key
-- (Subscription, PlanFeature, PlanPrice, CustomerAccount, CustomerOnboarding, Lead,
-- Promotion, SubscriptionOrder) still points at the same plan, with its features,
-- prices and history unchanged.
--
-- What changes is the identity and the sales posture:
--   * key / name -> neutral `custom-<id prefix>` / `Custom Plan <ID prefix>`. The id is
--     stable and unique, so the key cannot collide. The old key and name are kept
--     ONLY as provenance in metadataJson.
--   * kind CUSTOM, salesModel CUSTOM_ONLY: never self-service, assigned by an operator.
--   * Reserved for the one customer that uses it when exactly one does, so no other
--     customer can select or be provisioned onto it. When several customers use it it
--     cannot be reserved to one, so it is ARCHIVED instead (not listed publicly, not
--     assignable through the public catalogue); existing subscriptions are unaffected.
--   * Features are NOT changed: contracted capabilities (including the Desktop Agent
--     and white-label e-mail) stay until an approved commercial review.
--
-- Key-based dependencies inspected before renaming: Stripe objects reference the plan
-- by ID (metadata.planId), and every feature/price/subscription/customer/order table
-- joins on planId. No setting, template or seed addresses the plan by its key.
-- Historical text snapshots of the key (order commercialSnapshot.planKey, audit-log
-- before/after) are immutable history and deliberately keep the old text. If the new
-- key were already taken the migration stops rather than guess.
DO $$
DECLARE
  legacy_id text;
  new_key text;
  sole_customer text;
  customer_count integer;
BEGIN
  SELECT p."id" INTO legacy_id FROM "Plan" p WHERE p."key" = 'enterprise-plus';
  IF legacy_id IS NULL THEN
    RETURN;
  END IF;

  new_key := 'custom-' || left(replace(legacy_id, '-', ''), 12);
  IF EXISTS (SELECT 1 FROM "Plan" WHERE "key" = new_key) THEN
    RAISE EXCEPTION 'Cannot convert legacy plan enterprise-plus: key % is already used by another plan. Resolve manually; no data was changed.', new_key;
  END IF;

  -- Every customer the plan touches: subscribers (through their tenant), customers
  -- that selected it, and onboarding records that carry it.
  SELECT count(DISTINCT refs.c), min(refs.c)
  INTO customer_count, sole_customer
  FROM (
    SELECT t."customerAccountId" AS c
      FROM "Subscription" s JOIN "Tenant" t ON t."id" = s."tenantId"
      WHERE s."planId" = legacy_id
    UNION ALL
    SELECT ca."id" FROM "CustomerAccount" ca WHERE ca."selectedPlanId" = legacy_id
    UNION ALL
    SELECT o."customerId" FROM "CustomerOnboarding" o WHERE o."selectedPlanId" = legacy_id
  ) refs;

  UPDATE "Plan"
  SET "key" = new_key,
      "name" = 'Custom Plan ' || upper(left(replace(legacy_id, '-', ''), 6)),
      "kind" = 'CUSTOM',
      "salesModel" = 'CUSTOM_ONLY',
      "isPublic" = false,
      "eligibleCustomerAccountId" =
        CASE WHEN customer_count = 1 THEN sole_customer ELSE NULL END,
      "publicationStatus" =
        CASE WHEN customer_count = 1 THEN "publicationStatus" ELSE 'ARCHIVED' END,
      "archivedAt" =
        CASE WHEN customer_count = 1 THEN "archivedAt" ELSE COALESCE("archivedAt", now()) END,
      "metadataJson" = COALESCE("metadataJson", '{}'::jsonb)
        || jsonb_build_object(
             'convertedFromLegacyPlan',
             jsonb_build_object('key', 'enterprise-plus', 'name', "name")
           )
  WHERE "id" = legacy_id;

  -- Nothing at all references it: it can also leave the active list.
  IF NOT EXISTS (SELECT 1 FROM "Subscription" WHERE "planId" = legacy_id)
     AND NOT EXISTS (SELECT 1 FROM "CustomerAccount" WHERE "selectedPlanId" = legacy_id)
     AND NOT EXISTS (SELECT 1 FROM "CustomerOnboarding" WHERE "selectedPlanId" = legacy_id)
     AND NOT EXISTS (SELECT 1 FROM "Lead" WHERE "agreedPlanId" = legacy_id)
     AND NOT EXISTS (SELECT 1 FROM "SubscriptionOrder" WHERE "planId" = legacy_id) THEN
    UPDATE "Plan" SET "isActive" = false WHERE "id" = legacy_id;
  END IF;
END
$$;
