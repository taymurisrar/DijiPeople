ALTER TABLE "PayrollCycle" ADD COLUMN "code" TEXT;
ALTER TABLE "PayrollCycle" ADD COLUMN "isDefault" BOOLEAN NOT NULL DEFAULT false;

UPDATE "PayrollCycle"
SET "code" = 'CYCLE_' || upper(substr(replace("id"::text, '-', ''), 1, 12))
WHERE "code" IS NULL;

ALTER TABLE "PayrollCycle" ALTER COLUMN "code" SET NOT NULL;
CREATE UNIQUE INDEX "PayrollCycle_tenantId_code_key"
  ON "PayrollCycle"("tenantId", "code");
