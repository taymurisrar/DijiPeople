-- Pay component defaults, eligibility, and employee-level overrides.
ALTER TABLE "PayComponent"
  ADD COLUMN IF NOT EXISTS "fixedAmount" DECIMAL(12,2),
  ADD COLUMN IF NOT EXISTS "percentage" DECIMAL(8,4),
  ADD COLUMN IF NOT EXISTS "eligibilityAppliesTo" TEXT NOT NULL DEFAULT 'ALL_EMPLOYEES',
  ADD COLUMN IF NOT EXISTS "effectiveFrom" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "effectiveTo" TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS "PayComponentEligibilityRule" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "payComponentId" TEXT NOT NULL,
  "name" TEXT,
  "matchType" TEXT NOT NULL DEFAULT 'ALL',
  "conditions" JSONB,
  "priority" INTEGER NOT NULL DEFAULT 10,
  "calculationMethodOverride" "PayComponentCalculationMethod",
  "fixedAmount" DECIMAL(12,2),
  "percentage" DECIMAL(8,4),
  "percentageBaseComponentId" TEXT,
  "formulaExpression" TEXT,
  "effectiveFrom" TIMESTAMP(3),
  "effectiveTo" TIMESTAMP(3),
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdById" TEXT,
  "updatedById" TEXT,
  CONSTRAINT "PayComponentEligibilityRule_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PayComponentEligibilityRule_id_tenantId_key" ON "PayComponentEligibilityRule"("id", "tenantId");
CREATE INDEX IF NOT EXISTS "PayComponentEligibilityRule_tenantId_payComponentId_idx" ON "PayComponentEligibilityRule"("tenantId", "payComponentId");
CREATE INDEX IF NOT EXISTS "PayComponentEligibilityRule_tenantId_isActive_effectiveFrom_effectiveTo_idx" ON "PayComponentEligibilityRule"("tenantId", "isActive", "effectiveFrom", "effectiveTo");
CREATE INDEX IF NOT EXISTS "PayComponentEligibilityRule_tenantId_priority_idx" ON "PayComponentEligibilityRule"("tenantId", "priority");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'PayComponentEligibilityRule_tenantId_fkey'
  ) THEN
    ALTER TABLE "PayComponentEligibilityRule"
      ADD CONSTRAINT "PayComponentEligibilityRule_tenantId_fkey"
      FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'PayComponentEligibilityRule_payComponentId_tenantId_fkey'
  ) THEN
    ALTER TABLE "PayComponentEligibilityRule"
      ADD CONSTRAINT "PayComponentEligibilityRule_payComponentId_tenantId_fkey"
      FOREIGN KEY ("payComponentId", "tenantId") REFERENCES "PayComponent"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "PayComponent_tenantId_eligibilityAppliesTo_idx" ON "PayComponent"("tenantId", "eligibilityAppliesTo");
CREATE INDEX IF NOT EXISTS "PayComponent_tenantId_effectiveFrom_effectiveTo_idx" ON "PayComponent"("tenantId", "effectiveFrom", "effectiveTo");

ALTER TABLE "EmployeeCompensationComponent"
  ADD COLUMN IF NOT EXISTS "configuredAmount" DECIMAL(12,2),
  ADD COLUMN IF NOT EXISTS "overrideAmount" DECIMAL(12,2),
  ADD COLUMN IF NOT EXISTS "effectiveAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "isOverridden" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "overrideReason" TEXT,
  ADD COLUMN IF NOT EXISTS "overriddenById" TEXT,
  ADD COLUMN IF NOT EXISTS "overriddenAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "overrideExpiresAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "ruleAppliedId" TEXT,
  ADD COLUMN IF NOT EXISTS "calculationSource" TEXT,
  ADD COLUMN IF NOT EXISTS "calculationSnapshot" JSONB,
  ADD COLUMN IF NOT EXISTS "effectiveFrom" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "effectiveTo" TIMESTAMP(3);

UPDATE "EmployeeCompensationComponent"
SET "effectiveAmount" = COALESCE("effectiveAmount", "calculatedAmount", 0)
WHERE "effectiveAmount" IS NULL OR "effectiveAmount" = 0;
