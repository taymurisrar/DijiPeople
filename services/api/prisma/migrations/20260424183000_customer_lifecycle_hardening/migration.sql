-- Multi-tenant customer lifecycle hardening

ALTER TABLE "CustomerOnboarding"
  ADD COLUMN IF NOT EXISTS "createServiceAccount" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "serviceAccountDisplayName" TEXT,
  ADD COLUMN IF NOT EXISTS "serviceAccountAssignSystemAdmin" BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE IF NOT EXISTS "PlatformSetting" (
  "id" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "value" JSONB NOT NULL,
  "description" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "createdById" TEXT,
  "updatedById" TEXT,
  CONSTRAINT "PlatformSetting_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PlatformSetting_key_key" ON "PlatformSetting"("key");
CREATE INDEX IF NOT EXISTS "PlatformSetting_key_idx" ON "PlatformSetting"("key");

ALTER TABLE "Tenant" DROP CONSTRAINT IF EXISTS "Tenant_customerAccountId_key";

CREATE TEMP TABLE "_tenant_customer_backfill" (
  "tenantId" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  CONSTRAINT "_tenant_customer_backfill_pkey" PRIMARY KEY ("tenantId")
) ON COMMIT DROP;

INSERT INTO "_tenant_customer_backfill" ("tenantId", "customerId")
SELECT t."id", t."id"
FROM "Tenant" t
WHERE t."customerAccountId" IS NULL;

INSERT INTO "CustomerAccount" (
  "id",
  "companyName",
  "contactEmail",
  "country",
  "status",
  "createdAt",
  "updatedAt"
)
SELECT
  map."customerId",
  COALESCE(t."name", 'Tenant ' || SUBSTRING(t."id" FROM 1 FOR 8)),
  COALESCE(owner_user."email", 'tenant-' || REPLACE(t."id", '-', '') || '@local.dijipeople'),
  'Unknown',
  'Active',
  NOW(),
  NOW()
FROM "_tenant_customer_backfill" map
JOIN "Tenant" t ON t."id" = map."tenantId"
LEFT JOIN "User" owner_user ON owner_user."id" = t."ownerUserId"
WHERE NOT EXISTS (
  SELECT 1
  FROM "CustomerAccount" c
  WHERE c."id" = map."customerId"
);

UPDATE "Tenant" t
SET "customerAccountId" = map."customerId"
FROM "_tenant_customer_backfill" map
WHERE t."id" = map."tenantId";

ALTER TABLE "Tenant" DROP CONSTRAINT IF EXISTS "Tenant_customerAccountId_fkey";

ALTER TABLE "Tenant"
  ALTER COLUMN "customerAccountId" SET NOT NULL;

ALTER TABLE "Tenant"
  ADD CONSTRAINT "Tenant_customerAccountId_fkey"
  FOREIGN KEY ("customerAccountId") REFERENCES "CustomerAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS "CustomerOnboarding_customerId_active_unique_idx"
ON "CustomerOnboarding" ("customerId")
WHERE "status" IN (
  'NOT_STARTED',
  'IN_PROGRESS',
  'AWAITING_CUSTOMER_INPUT',
  'PENDING_PAYMENT',
  'READY_FOR_TENANT_CREATION',
  'BLOCKED'
);
