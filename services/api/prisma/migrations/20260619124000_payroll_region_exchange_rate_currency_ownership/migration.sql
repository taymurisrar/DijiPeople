ALTER TABLE "PayrollRegion"
  ADD COLUMN IF NOT EXISTS "locationId" TEXT,
  ADD COLUMN IF NOT EXISTS "countryCode" TEXT,
  ADD COLUMN IF NOT EXISTS "regionCode" TEXT,
  ADD COLUMN IF NOT EXISTS "effectiveStartDate" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "effectiveEndDate" TIMESTAMP(3);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'PayrollRegion_locationId_fkey'
  ) THEN
    ALTER TABLE "PayrollRegion"
      ADD CONSTRAINT "PayrollRegion_locationId_fkey"
      FOREIGN KEY ("locationId") REFERENCES "Location"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "PayrollRegion_tenantId_locationId_idx" ON "PayrollRegion"("tenantId", "locationId");
CREATE INDEX IF NOT EXISTS "PayrollRegion_tenantId_countryCode_regionCode_idx" ON "PayrollRegion"("tenantId", "countryCode", "regionCode");
CREATE INDEX IF NOT EXISTS "PayrollRegion_tenantId_effectiveStartDate_effectiveEndDate_idx" ON "PayrollRegion"("tenantId", "effectiveStartDate", "effectiveEndDate");

ALTER TABLE "ExchangeRateSnapshot"
  ADD COLUMN IF NOT EXISTS "effectiveEndDate" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "lockedRate" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "status" "ConfigurationStatus" NOT NULL DEFAULT 'ACTIVE';

CREATE INDEX IF NOT EXISTS "ExchangeRateSnapshot_tenantId_status_idx" ON "ExchangeRateSnapshot"("tenantId", "status");
CREATE INDEX IF NOT EXISTS "ExchangeRateSnapshot_tenantId_effectiveDate_effectiveEndDate_idx" ON "ExchangeRateSnapshot"("tenantId", "effectiveDate", "effectiveEndDate");

