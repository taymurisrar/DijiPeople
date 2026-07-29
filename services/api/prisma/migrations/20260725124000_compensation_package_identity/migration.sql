-- Preserve SalaryPackageRule IDs while completing the compensation package identity model.
ALTER TABLE "SalaryPackageRule"
  ADD COLUMN IF NOT EXISTS "code" TEXT,
  ADD COLUMN IF NOT EXISTS "priority" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "isDefault" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "status" "ConfigurationStatus" NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN IF NOT EXISTS "ownerUserId" TEXT,
  ADD COLUMN IF NOT EXISTS "eligibilityRules" JSONB;

UPDATE "SalaryPackageRule"
SET "code" = CASE
  WHEN "name" = 'Default Compensation Package' THEN 'DEFAULT-COMPENSATION'
  ELSE 'PACKAGE-' || UPPER(SUBSTRING(REPLACE("id", '-', '') FROM 1 FOR 12))
END
WHERE "code" IS NULL;

UPDATE "SalaryPackageRule"
SET "isDefault" = true
WHERE "name" = 'Default Compensation Package';

UPDATE "SalaryPackageRule"
SET "status" = CASE WHEN "isActive" THEN 'ACTIVE'::"ConfigurationStatus"
                    ELSE 'INACTIVE'::"ConfigurationStatus" END;

ALTER TABLE "SalaryPackageRule" ALTER COLUMN "code" SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "SalaryPackageRule_tenantId_code_key"
  ON "SalaryPackageRule"("tenantId", "code");
CREATE UNIQUE INDEX IF NOT EXISTS "SalaryPackageRule_one_default_per_tenant_key"
  ON "SalaryPackageRule"("tenantId") WHERE "isDefault" = true;
CREATE INDEX IF NOT EXISTS "SalaryPackageRule_tenantId_isDefault_idx"
  ON "SalaryPackageRule"("tenantId", "isDefault");
CREATE INDEX IF NOT EXISTS "SalaryPackageRule_tenantId_priority_idx"
  ON "SalaryPackageRule"("tenantId", "priority");
CREATE INDEX IF NOT EXISTS "SalaryPackageRule_tenantId_ownerUserId_idx"
  ON "SalaryPackageRule"("tenantId", "ownerUserId");
