ALTER TABLE "Tenant" ADD COLUMN "ownerUserId" TEXT;

UPDATE "Tenant" t
SET "ownerUserId" = ca."primaryOwnerUserId"
FROM "CustomerAccount" ca
WHERE t."customerAccountId" = ca."id"
  AND ca."primaryOwnerUserId" IS NOT NULL;

CREATE INDEX "Tenant_ownerUserId_idx" ON "Tenant"("ownerUserId");

ALTER TABLE "Tenant"
ADD CONSTRAINT "Tenant_ownerUserId_fkey"
FOREIGN KEY ("ownerUserId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

-- Migrate legacy super-admin role key to system-admin.
UPDATE "Role" r
SET "key" = 'system-admin',
    "name" = 'System Admin'
WHERE r."key" = 'super-admin'
  AND NOT EXISTS (
    SELECT 1
    FROM "Role" existing
    WHERE existing."tenantId" = r."tenantId"
      AND existing."key" = 'system-admin'
  );

-- If both keys exist in a tenant, move assignments to system-admin and remove legacy rows.
WITH legacy_pairs AS (
  SELECT
    legacy."id" AS legacy_role_id,
    target."id" AS target_role_id
  FROM "Role" legacy
  JOIN "Role" target
    ON target."tenantId" = legacy."tenantId"
   AND target."key" = 'system-admin'
  WHERE legacy."key" = 'super-admin'
)
INSERT INTO "UserRole" ("id", "tenantId", "userId", "roleId", "createdAt", "updatedAt", "createdById", "updatedById")
SELECT
  gen_random_uuid(),
  ur."tenantId",
  ur."userId",
  lp.target_role_id,
  ur."createdAt",
  ur."updatedAt",
  ur."createdById",
  ur."updatedById"
FROM "UserRole" ur
JOIN legacy_pairs lp
  ON lp.legacy_role_id = ur."roleId"
ON CONFLICT ("userId", "roleId") DO NOTHING;

WITH legacy_pairs AS (
  SELECT
    legacy."id" AS legacy_role_id,
    target."id" AS target_role_id
  FROM "Role" legacy
  JOIN "Role" target
    ON target."tenantId" = legacy."tenantId"
   AND target."key" = 'system-admin'
  WHERE legacy."key" = 'super-admin'
)
INSERT INTO "RolePermission" ("id", "tenantId", "roleId", "permissionId", "createdAt", "updatedAt", "createdById", "updatedById")
SELECT
  gen_random_uuid(),
  rp."tenantId",
  lp.target_role_id,
  rp."permissionId",
  rp."createdAt",
  rp."updatedAt",
  rp."createdById",
  rp."updatedById"
FROM "RolePermission" rp
JOIN legacy_pairs lp
  ON lp.legacy_role_id = rp."roleId"
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

DELETE FROM "Role"
WHERE "key" = 'super-admin';

ALTER TABLE "CustomerOnboarding"
  DROP COLUMN IF EXISTS "superAdminFirstName",
  DROP COLUMN IF EXISTS "superAdminLastName",
  DROP COLUMN IF EXISTS "superAdminWorkEmail";
