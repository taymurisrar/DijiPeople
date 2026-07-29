-- Connect reusable payroll cycle definitions to calendars and generated periods.
ALTER TABLE "PayrollCycle"
  ADD COLUMN IF NOT EXISTS "payrollCalendarId" TEXT;

ALTER TABLE "PayrollPeriod"
  ADD COLUMN IF NOT EXISTS "payrollCycleId" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "PayrollCycle_id_tenantId_key"
  ON "PayrollCycle"("id", "tenantId");

CREATE INDEX IF NOT EXISTS "PayrollCycle_tenantId_payrollCalendarId_idx"
  ON "PayrollCycle"("tenantId", "payrollCalendarId");

CREATE INDEX IF NOT EXISTS "PayrollPeriod_tenantId_payrollCycleId_periodStart_idx"
  ON "PayrollPeriod"("tenantId", "payrollCycleId", "periodStart");

-- Preserve existing data by linking cycles to the best matching active calendar.
UPDATE "PayrollCycle" AS cycle
SET "payrollCalendarId" = (
  SELECT calendar."id"
  FROM "PayrollCalendar" AS calendar
  WHERE calendar."tenantId" = cycle."tenantId"
    AND calendar."isActive" = true
    AND calendar."businessUnitId" IS NOT DISTINCT FROM cycle."businessUnitId"
    AND (cycle."currencyCode" IS NULL OR calendar."currencyCode" = cycle."currencyCode")
    AND (cycle."payFrequency" IS NULL OR calendar."frequency" = cycle."payFrequency")
  ORDER BY calendar."isDefault" DESC, calendar."createdAt" ASC
  LIMIT 1
)
WHERE cycle."payrollCalendarId" IS NULL;

-- Link exact legacy periods where a cycle and calendar describe the same range.
UPDATE "PayrollPeriod" AS period
SET "payrollCycleId" = (
  SELECT cycle."id"
  FROM "PayrollCycle" AS cycle
  WHERE cycle."tenantId" = period."tenantId"
    AND cycle."payrollCalendarId" = period."payrollCalendarId"
    AND cycle."periodStart" = period."periodStart"
    AND cycle."periodEnd" = period."periodEnd"
  ORDER BY cycle."createdAt" ASC
  LIMIT 1
)
WHERE period."payrollCycleId" IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'PayrollCycle_payrollCalendarId_tenantId_fkey'
  ) THEN
    ALTER TABLE "PayrollCycle"
      ADD CONSTRAINT "PayrollCycle_payrollCalendarId_tenantId_fkey"
      FOREIGN KEY ("payrollCalendarId", "tenantId")
      REFERENCES "PayrollCalendar"("id", "tenantId")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'PayrollPeriod_payrollCycleId_tenantId_fkey'
  ) THEN
    ALTER TABLE "PayrollPeriod"
      ADD CONSTRAINT "PayrollPeriod_payrollCycleId_tenantId_fkey"
      FOREIGN KEY ("payrollCycleId", "tenantId")
      REFERENCES "PayrollCycle"("id", "tenantId")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;
