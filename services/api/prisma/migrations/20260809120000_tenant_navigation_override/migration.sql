-- Per-tenant sidebar navigation overrides.
--
-- Written with explicit guards so it is safe against a fresh database and
-- against one where an earlier attempt already created part of it. Postgres
-- offers IF NOT EXISTS for tables and indexes but not for constraints, so the
-- foreign key gets a catalogue check instead.

-- CreateTable
CREATE TABLE IF NOT EXISTS "TenantNavigationOverride" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "itemKey" TEXT NOT NULL,
    "isHidden" BOOLEAN NOT NULL DEFAULT false,
    "label" TEXT,
    "sortOrder" INTEGER,
    "visibilityRules" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,

    CONSTRAINT "TenantNavigationOverride_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "TenantNavigationOverride_tenantId_idx" ON "TenantNavigationOverride"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "TenantNavigationOverride_tenantId_itemKey_key" ON "TenantNavigationOverride"("tenantId", "itemKey");

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'TenantNavigationOverride_tenantId_fkey') THEN
    ALTER TABLE "TenantNavigationOverride" ADD CONSTRAINT "TenantNavigationOverride_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
