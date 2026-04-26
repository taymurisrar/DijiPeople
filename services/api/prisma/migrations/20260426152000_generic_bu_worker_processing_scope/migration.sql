CREATE TYPE "EmployeeRecordType" AS ENUM ('INTERNAL_EMPLOYEE', 'EXTERNAL_WORKER', 'CONTRACTOR');
CREATE TYPE "BusinessUnitType" AS ENUM ('INTERNAL', 'EXTERNAL_ORGANIZATION', 'BRANCH', 'DEPARTMENT', 'COST_CENTER');
CREATE TYPE "ProcessingCycleType" AS ENUM ('MONTHLY', 'WEEKLY', 'BIWEEKLY', 'SEMI_MONTHLY', 'CUSTOM');
CREATE TYPE "ProcessingCycleStatus" AS ENUM (
  'OPEN',
  'DATA_IMPORTED',
  'VALIDATION_FAILED',
  'SUBMITTED',
  'APPROVED',
  'PAYROLL_READY',
  'PAYROLL_GENERATED',
  'EXPORTED',
  'LOCKED'
);

ALTER TABLE "BusinessUnit"
  ADD COLUMN "type" "BusinessUnitType" NOT NULL DEFAULT 'INTERNAL',
  ADD COLUMN "settingsJson" JSONB,
  ADD COLUMN "payrollContactName" TEXT,
  ADD COLUMN "payrollContactEmail" TEXT,
  ADD COLUMN "payrollContactPhone" TEXT,
  ADD COLUMN "approvalContactName" TEXT,
  ADD COLUMN "approvalContactEmail" TEXT;

ALTER TABLE "Employee"
  ADD COLUMN "recordType" "EmployeeRecordType" NOT NULL DEFAULT 'INTERNAL_EMPLOYEE',
  ADD COLUMN "businessUnitId" TEXT;

UPDATE "Employee" e
SET "businessUnitId" = u."businessUnitId"
FROM "User" u
WHERE e."userId" = u."id"
  AND e."tenantId" = u."tenantId"
  AND e."businessUnitId" IS NULL;

ALTER TABLE "Employee"
  ADD CONSTRAINT "Employee_businessUnitId_tenantId_fkey"
  FOREIGN KEY ("businessUnitId", "tenantId")
  REFERENCES "BusinessUnit"("id", "tenantId")
  ON DELETE RESTRICT
  ON UPDATE CASCADE;

ALTER TABLE "Project"
  ADD COLUMN "businessUnitId" TEXT,
  ADD CONSTRAINT "Project_businessUnitId_tenantId_fkey"
  FOREIGN KEY ("businessUnitId", "tenantId")
  REFERENCES "BusinessUnit"("id", "tenantId")
  ON DELETE RESTRICT
  ON UPDATE CASCADE;

ALTER TABLE "Timesheet"
  ADD COLUMN "businessUnitId" TEXT,
  ADD COLUMN "processingCycleId" TEXT,
  ADD CONSTRAINT "Timesheet_businessUnitId_tenantId_fkey"
  FOREIGN KEY ("businessUnitId", "tenantId")
  REFERENCES "BusinessUnit"("id", "tenantId")
  ON DELETE RESTRICT
  ON UPDATE CASCADE;

UPDATE "Timesheet" t
SET "businessUnitId" = e."businessUnitId"
FROM "Employee" e
WHERE t."employeeId" = e."id"
  AND t."tenantId" = e."tenantId"
  AND t."businessUnitId" IS NULL;

CREATE TABLE "ProcessingCycle" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "businessUnitId" TEXT,
  "name" TEXT NOT NULL,
  "startDate" TIMESTAMP(3) NOT NULL,
  "endDate" TIMESTAMP(3) NOT NULL,
  "cycleType" "ProcessingCycleType" NOT NULL DEFAULT 'MONTHLY',
  "status" "ProcessingCycleStatus" NOT NULL DEFAULT 'OPEN',
  "lockedAt" TIMESTAMP(3),
  "lockedByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "createdById" TEXT,
  "updatedById" TEXT,
  CONSTRAINT "ProcessingCycle_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "ProcessingCycle"
  ADD CONSTRAINT "ProcessingCycle_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProcessingCycle"
  ADD CONSTRAINT "ProcessingCycle_businessUnitId_tenantId_fkey"
  FOREIGN KEY ("businessUnitId", "tenantId")
  REFERENCES "BusinessUnit"("id", "tenantId")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ProcessingCycle"
  ADD CONSTRAINT "ProcessingCycle_lockedByUserId_fkey"
  FOREIGN KEY ("lockedByUserId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Timesheet"
  ADD CONSTRAINT "Timesheet_processingCycleId_fkey"
  FOREIGN KEY ("processingCycleId") REFERENCES "ProcessingCycle"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PayrollCycle"
  ADD COLUMN "businessUnitId" TEXT,
  ADD COLUMN "processingCycleId" TEXT;

ALTER TABLE "PayrollCycle"
  ADD CONSTRAINT "PayrollCycle_businessUnitId_tenantId_fkey"
  FOREIGN KEY ("businessUnitId", "tenantId")
  REFERENCES "BusinessUnit"("id", "tenantId")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PayrollCycle"
  ADD CONSTRAINT "PayrollCycle_processingCycleId_fkey"
  FOREIGN KEY ("processingCycleId") REFERENCES "ProcessingCycle"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PayrollCycle"
  DROP CONSTRAINT IF EXISTS "PayrollCycle_tenantId_periodStart_periodEnd_key";

CREATE UNIQUE INDEX "PayrollCycle_tenantId_businessUnitId_periodStart_periodEnd_key"
  ON "PayrollCycle"("tenantId", "businessUnitId", "periodStart", "periodEnd");

CREATE UNIQUE INDEX "ProcessingCycle_tenantId_businessUnitId_startDate_endDate_cycleType_key"
  ON "ProcessingCycle"("tenantId", "businessUnitId", "startDate", "endDate", "cycleType");

CREATE INDEX "BusinessUnit_tenantId_type_idx" ON "BusinessUnit"("tenantId", "type");
CREATE INDEX "Employee_tenantId_recordType_idx" ON "Employee"("tenantId", "recordType");
CREATE INDEX "Employee_tenantId_businessUnitId_idx" ON "Employee"("tenantId", "businessUnitId");
CREATE INDEX "Project_tenantId_businessUnitId_idx" ON "Project"("tenantId", "businessUnitId");
CREATE INDEX "Timesheet_tenantId_businessUnitId_status_idx" ON "Timesheet"("tenantId", "businessUnitId", "status");
CREATE INDEX "Timesheet_tenantId_processingCycleId_idx" ON "Timesheet"("tenantId", "processingCycleId");
CREATE INDEX "PayrollCycle_tenantId_businessUnitId_idx" ON "PayrollCycle"("tenantId", "businessUnitId");
CREATE INDEX "PayrollCycle_tenantId_processingCycleId_idx" ON "PayrollCycle"("tenantId", "processingCycleId");
CREATE INDEX "ProcessingCycle_tenantId_idx" ON "ProcessingCycle"("tenantId");
CREATE INDEX "ProcessingCycle_tenantId_businessUnitId_idx" ON "ProcessingCycle"("tenantId", "businessUnitId");
CREATE INDEX "ProcessingCycle_tenantId_status_idx" ON "ProcessingCycle"("tenantId", "status");
CREATE INDEX "ProcessingCycle_tenantId_startDate_endDate_idx" ON "ProcessingCycle"("tenantId", "startDate", "endDate");
