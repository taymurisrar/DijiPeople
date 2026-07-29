ALTER TABLE "PayrollCycle"
  ADD COLUMN "name" TEXT,
  ADD COLUMN "description" TEXT,
  ADD COLUMN "payFrequency" "PayrollCalendarFrequency",
  ADD COLUMN "payrollRegionId" TEXT,
  ADD COLUMN "currencyCode" TEXT,
  ADD COLUMN "periodStartRule" TEXT,
  ADD COLUMN "periodEndRule" TEXT,
  ADD COLUMN "cutoffDay" INTEGER,
  ADD COLUMN "paymentDay" INTEGER,
  ADD COLUMN "adjustDatesForWeekend" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "adjustDatesForHoliday" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "dateAdjustmentDirection" TEXT,
  ADD COLUMN "defaultEmployerBankAccountId" TEXT,
  ADD COLUMN "defaultGenerationSource" TEXT;

CREATE INDEX "PayrollCycle_tenantId_payrollRegionId_idx" ON "PayrollCycle"("tenantId", "payrollRegionId");
CREATE INDEX "PayrollCycle_tenantId_defaultEmployerBankAccountId_idx" ON "PayrollCycle"("tenantId", "defaultEmployerBankAccountId");

ALTER TABLE "PayrollCycle"
  ADD CONSTRAINT "PayrollCycle_payrollRegionId_fkey"
  FOREIGN KEY ("payrollRegionId") REFERENCES "PayrollRegion"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PayrollCycle"
  ADD CONSTRAINT "PayrollCycle_defaultEmployerBankAccountId_fkey"
  FOREIGN KEY ("defaultEmployerBankAccountId") REFERENCES "EmployerBankAccount"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
