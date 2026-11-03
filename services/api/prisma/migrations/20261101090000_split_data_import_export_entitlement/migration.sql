-- Split the Growth-only `data-management` entitlement (final product decision):
--   data-import-export         basic import/export, sold on EVERY plan
--   advanced-data-management   premium tier (mappings, schedules, transforms)
--
-- Data-only; no schema change. Idempotent, and never disables anything.

-- 1. The old key becomes the premium tier, so every plan or tenant override that
--    had it keeps exactly the premium access it had. (A key that already exists
--    on the same plan/tenant is left alone rather than colliding.)
UPDATE "PlanFeature" pf
SET "featureKey" = 'advanced-data-management'
WHERE pf."featureKey" = 'data-management'
  AND NOT EXISTS (
    SELECT 1 FROM "PlanFeature" x
    WHERE x."planId" = pf."planId" AND x."featureKey" = 'advanced-data-management'
  );

UPDATE "TenantFeature" tf
SET "key" = 'advanced-data-management'
WHERE tf."key" = 'data-management'
  AND NOT EXISTS (
    SELECT 1 FROM "TenantFeature" x
    WHERE x."tenantId" = tf."tenantId" AND x."key" = 'advanced-data-management'
  );

-- 2. Basic import/export on every plan, including custom plans that the
--    `seed:config` catalog reconcile does not touch.
INSERT INTO "PlanFeature" ("id", "planId", "featureKey", "isEnabled", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, p."id", 'data-import-export', true, now(), now()
FROM "Plan" p
WHERE NOT EXISTS (
  SELECT 1 FROM "PlanFeature" x
  WHERE x."planId" = p."id" AND x."featureKey" = 'data-import-export'
);
