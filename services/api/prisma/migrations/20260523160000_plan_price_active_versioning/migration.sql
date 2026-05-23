-- PlanPrice rows are historical Stripe price versions. Only one active row may
-- serve checkout for a plan + billing cycle + currency at any time.

DROP INDEX IF EXISTS "PlanPrice_planId_billingCycle_currency_key";

WITH ranked_active_prices AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "planId", "billingCycle", "currency"
      ORDER BY "updatedAt" DESC, "createdAt" DESC, "id" DESC
    ) AS row_number
  FROM "PlanPrice"
  WHERE "isActive" = true
)
UPDATE "PlanPrice" AS price
SET "isActive" = false,
    "updatedAt" = CURRENT_TIMESTAMP
FROM ranked_active_prices AS ranked
WHERE price."id" = ranked."id"
  AND ranked.row_number > 1;

CREATE UNIQUE INDEX IF NOT EXISTS "PlanPrice_active_plan_cycle_currency_key"
ON "PlanPrice"("planId", "billingCycle", "currency")
WHERE "isActive" = true;
