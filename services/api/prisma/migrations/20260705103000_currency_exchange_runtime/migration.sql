CREATE TABLE IF NOT EXISTS "Currency" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "symbol" TEXT,
    "decimalPlaces" INTEGER NOT NULL DEFAULT 2,
    "status" "ConfigurationStatus" NOT NULL DEFAULT 'ACTIVE',
    "subStatus" TEXT,
    "ownerUserId" TEXT,
    "description" TEXT,
    "integrationKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,

    CONSTRAINT "Currency_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Currency_tenantId_code_key" ON "Currency"("tenantId", "code");
CREATE INDEX IF NOT EXISTS "Currency_tenantId_idx" ON "Currency"("tenantId");
CREATE INDEX IF NOT EXISTS "Currency_tenantId_status_idx" ON "Currency"("tenantId", "status");
CREATE INDEX IF NOT EXISTS "Currency_tenantId_ownerUserId_idx" ON "Currency"("tenantId", "ownerUserId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'Currency_tenantId_fkey'
  ) THEN
    ALTER TABLE "Currency"
    ADD CONSTRAINT "Currency_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

ALTER TABLE "ExchangeRateSnapshot"
ADD COLUMN IF NOT EXISTS "provider" TEXT,
ADD COLUMN IF NOT EXISTS "lastFetchedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "overrideReason" TEXT,
ADD COLUMN IF NOT EXISTS "subStatus" TEXT,
ADD COLUMN IF NOT EXISTS "description" TEXT,
ADD COLUMN IF NOT EXISTS "syncBatchId" TEXT,
ADD COLUMN IF NOT EXISTS "providerRawResponse" JSONB;

UPDATE "ExchangeRateSnapshot"
SET "subStatus" = CASE
  WHEN "source" = 'MANUAL' OR "isManual" = true THEN 'MANUAL_OVERRIDE'
  WHEN "source" = 'API' THEN 'PROVIDER_SYNCED'
  ELSE 'CURRENT'
END
WHERE "subStatus" IS NULL;

CREATE INDEX IF NOT EXISTS "ExchangeRateSnapshot_tenantId_status_idx" ON "ExchangeRateSnapshot"("tenantId", "status");
