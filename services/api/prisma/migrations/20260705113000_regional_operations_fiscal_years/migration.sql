CREATE TABLE IF NOT EXISTS "FiscalYear" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "isCurrent" BOOLEAN NOT NULL DEFAULT false,
    "status" "ConfigurationStatus" NOT NULL DEFAULT 'ACTIVE',
    "subStatus" TEXT,
    "ownerUserId" TEXT,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,
    "updatedById" TEXT,

    CONSTRAINT "FiscalYear_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "FiscalYear_tenantId_name_key" ON "FiscalYear"("tenantId", "name");
CREATE INDEX IF NOT EXISTS "FiscalYear_tenantId_idx" ON "FiscalYear"("tenantId");
CREATE INDEX IF NOT EXISTS "FiscalYear_tenantId_status_idx" ON "FiscalYear"("tenantId", "status");
CREATE INDEX IF NOT EXISTS "FiscalYear_tenantId_isCurrent_idx" ON "FiscalYear"("tenantId", "isCurrent");
CREATE INDEX IF NOT EXISTS "FiscalYear_tenantId_startDate_endDate_idx" ON "FiscalYear"("tenantId", "startDate", "endDate");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'FiscalYear_tenantId_fkey'
  ) THEN
    ALTER TABLE "FiscalYear"
    ADD CONSTRAINT "FiscalYear_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

ALTER TABLE "PayrollPeriod"
ADD COLUMN IF NOT EXISTS "fiscalYearId" TEXT;

CREATE INDEX IF NOT EXISTS "PayrollPeriod_tenantId_fiscalYearId_idx" ON "PayrollPeriod"("tenantId", "fiscalYearId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'PayrollPeriod_fiscalYearId_fkey'
  ) THEN
    ALTER TABLE "PayrollPeriod"
    ADD CONSTRAINT "PayrollPeriod_fiscalYearId_fkey"
    FOREIGN KEY ("fiscalYearId") REFERENCES "FiscalYear"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

ALTER TABLE "PayrollRegion"
ADD COLUMN IF NOT EXISTS "subStatus" TEXT,
ADD COLUMN IF NOT EXISTS "ownerUserId" TEXT;

CREATE INDEX IF NOT EXISTS "PayrollRegion_tenantId_ownerUserId_idx" ON "PayrollRegion"("tenantId", "ownerUserId");
