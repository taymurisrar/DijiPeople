-- ROLLBACK / CONTAINMENT for the corrective release of 2026-11-04.
--
-- What the release changes in the database (rehearsed on a restored copy of production):
--   * migration 20261101090000_split_data_import_export_entitlement
--       - PlanFeature / TenantFeature key `data-management` is RENAMED `advanced-data-management`
--       - PlanFeature `data-import-export` is ADDED to every plan
--   * migration 20261102090000_plan_kind_and_custom_plan_metadata
--       - ADDS Plan.kind, eligibleCustomerAccountId, effectiveFrom, effectiveUntil (+ indexes, one FK)
--       - converts the legacy `enterprise-plus` plan IN PLACE (same id) to a neutral custom plan
--   * seed:config (every deploy): catalogue reconcile adds email-template-customization / email-white-label
--     to the predefined plans and removes `desktop-agent` from Growth; adds new role permissions
--
-- The new columns and the new permission rows are additive and ignored by the previous release, so they are left in
-- place. This script reverses the DATA changes the previous release would misread: the renamed feature key (the
-- previous release gates the advanced data-management module on `data-management`) and the converted legacy plan.
-- It is idempotent, guarded by ids and keys, and runs in one transaction. The last resort is a restore from the
-- pre-release logical backup (kept privately; its location is recorded in the release record).
--
-- Run only AFTER the previous release is serving again (Render rollback), against the DIRECT connection:
--   psql "$DIRECT_DATABASE_URL" -v ON_ERROR_STOP=1 -f docs/deployment/corrective-release-2026-11-04-rollback.sql
BEGIN;

-- 1. the legacy plan, exactly as it was before migration 20261102090000 (values read from the pre-release backup)
UPDATE "Plan"
SET "key" = 'enterprise-plus',
    "name" = 'Enterprise+',
    "salesModel" = 'CUSTOM_ONLY',
    "isPublic" = true,
    "isActive" = true,
    "publicationStatus" = 'PUBLISHED',
    "archivedAt" = NULL,
    "metadataJson" = NULL
WHERE "id" = 'f72a0e6d-b701-4a13-9768-e03be15dd0e3'
  AND "key" = 'custom-f72a0e6db701'
  AND NOT EXISTS (SELECT 1 FROM "Plan" x WHERE x."key" = 'enterprise-plus');

-- 2. feature key rename reversed (the key `advanced-data-management` did not exist before the release)
UPDATE "PlanFeature" pf
SET "featureKey" = 'data-management'
WHERE pf."featureKey" = 'advanced-data-management'
  AND NOT EXISTS (
    SELECT 1 FROM "PlanFeature" x WHERE x."planId" = pf."planId" AND x."featureKey" = 'data-management'
  );

UPDATE "TenantFeature" tf
SET "key" = 'data-management'
WHERE tf."key" = 'advanced-data-management'
  AND NOT EXISTS (
    SELECT 1 FROM "TenantFeature" x WHERE x."tenantId" = tf."tenantId" AND x."key" = 'data-management'
  );

-- 3. features the release added (none of these keys existed on any plan before it)
DELETE FROM "PlanFeature"
WHERE "featureKey" IN ('data-import-export', 'email-template-customization', 'email-white-label');

-- 4. Growth had `desktop-agent` before the seed removed it
UPDATE "PlanFeature" pf
SET "isEnabled" = true, "updatedAt" = now()
FROM "Plan" p
WHERE pf."planId" = p."id" AND p."key" = 'growth' AND pf."featureKey" = 'desktop-agent' AND pf."isEnabled" = false;

INSERT INTO "PlanFeature" ("id", "planId", "featureKey", "isEnabled", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, p."id", 'desktop-agent', true, now(), now()
FROM "Plan" p
WHERE p."key" = 'growth'
  AND NOT EXISTS (SELECT 1 FROM "PlanFeature" x WHERE x."planId" = p."id" AND x."featureKey" = 'desktop-agent');

-- Verification the operator must read before COMMIT: the legacy plan is back, no renamed key remains.
SELECT "key", "name", "isActive", "publicationStatus" FROM "Plan" WHERE "id" = 'f72a0e6d-b701-4a13-9768-e03be15dd0e3';
SELECT count(*) AS advanced_data_management_rows_left FROM "PlanFeature" WHERE "featureKey" = 'advanced-data-management';

COMMIT;
