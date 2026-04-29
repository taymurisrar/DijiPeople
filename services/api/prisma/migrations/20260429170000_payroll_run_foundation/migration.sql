-- CreateEnum
CREATE TYPE "PayrollCalendarFrequency" AS ENUM ('MONTHLY', 'SEMI_MONTHLY', 'BIWEEKLY', 'WEEKLY');

-- CreateEnum
CREATE TYPE "PayrollPeriodStatus" AS ENUM ('OPEN', 'INPUT_CLOSED', 'PROCESSING', 'APPROVED', 'PAID', 'LOCKED');

-- CreateEnum
CREATE TYPE "PayrollRunStatus" AS ENUM ('DRAFT', 'CALCULATING', 'CALCULATED', 'REVIEWED', 'APPROVED', 'PAID', 'LOCKED', 'FAILED');

-- CreateEnum
CREATE TYPE "PayrollRunEmployeeStatus" AS ENUM ('PENDING', 'CALCULATED', 'EXCEPTION', 'REVIEWED', 'APPROVED', 'PAID', 'LOCKED');

-- CreateEnum
CREATE TYPE "PayrollRunLineItemCategory" AS ENUM ('EARNING', 'ALLOWANCE', 'REIMBURSEMENT', 'DEDUCTION', 'TAX', 'EMPLOYER_CONTRIBUTION', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "PayrollInputSnapshotSourceType" AS ENUM ('COMPENSATION', 'ATTENDANCE', 'TIMESHEET', 'LEAVE', 'CLAIM', 'TADA', 'BONUS', 'COMMISSION', 'DEDUCTION', 'TAX', 'MANUAL', 'POLICY');

-- CreateEnum
CREATE TYPE "PayrollExceptionSeverity" AS ENUM ('INFO', 'WARNING', 'ERROR', 'BLOCKER');

-- CreateTable
CREATE TABLE "PayrollCalendar" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "businessUnitId" TEXT,
    "name" TEXT NOT NULL,
    "frequency" "PayrollCalendarFrequency" NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "currencyCode" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayrollCalendar_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollPeriod" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "payrollCalendarId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "cutoffDate" TIMESTAMP(3),
    "paymentDate" TIMESTAMP(3),
    "status" "PayrollPeriodStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayrollPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollRun" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "payrollPeriodId" TEXT NOT NULL,
    "runNumber" INTEGER NOT NULL DEFAULT 1,
    "status" "PayrollRunStatus" NOT NULL DEFAULT 'DRAFT',
    "calculationStartedAt" TIMESTAMP(3),
    "calculatedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "lockedAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "approvedBy" TEXT,
    "lockedBy" TEXT,
    "checksum" TEXT,
    "inputChangedAfterCalculation" BOOLEAN NOT NULL DEFAULT false,
    "requiresRecalculation" BOOLEAN NOT NULL DEFAULT false,
    "correlationId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayrollRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollRunEmployee" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "payrollRunId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "status" "PayrollRunEmployeeStatus" NOT NULL DEFAULT 'PENDING',
    "currencyCode" TEXT NOT NULL,
    "grossEarnings" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "totalDeductions" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "totalTaxes" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "totalReimbursements" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "employerContributions" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "netPay" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "calculationSummary" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayrollRunEmployee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollRunLineItem" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "payrollRunEmployeeId" TEXT NOT NULL,
    "payComponentId" TEXT,
    "category" "PayrollRunLineItemCategory" NOT NULL,
    "sourceType" TEXT,
    "sourceId" TEXT,
    "label" TEXT NOT NULL,
    "quantity" DECIMAL(12,4),
    "rate" DECIMAL(12,4),
    "amount" DECIMAL(12,2) NOT NULL,
    "currencyCode" TEXT NOT NULL,
    "isTaxable" BOOLEAN NOT NULL DEFAULT false,
    "affectsGrossPay" BOOLEAN NOT NULL DEFAULT true,
    "affectsNetPay" BOOLEAN NOT NULL DEFAULT true,
    "displayOnPayslip" BOOLEAN NOT NULL DEFAULT true,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayrollRunLineItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollInputSnapshot" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "payrollRunEmployeeId" TEXT NOT NULL,
    "sourceType" "PayrollInputSnapshotSourceType" NOT NULL,
    "sourceId" TEXT,
    "effectiveDate" TIMESTAMP(3),
    "snapshotData" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PayrollInputSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollException" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "payrollRunId" TEXT NOT NULL,
    "employeeId" TEXT,
    "severity" "PayrollExceptionSeverity" NOT NULL,
    "errorType" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "details" JSONB,
    "isResolved" BOOLEAN NOT NULL DEFAULT false,
    "resolvedAt" TIMESTAMP(3),
    "resolvedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayrollException_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PayrollCalendar_id_tenantId_key" ON "PayrollCalendar"("id", "tenantId");
CREATE INDEX "PayrollCalendar_tenantId_businessUnitId_idx" ON "PayrollCalendar"("tenantId", "businessUnitId");
CREATE INDEX "PayrollCalendar_tenantId_isActive_idx" ON "PayrollCalendar"("tenantId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollPeriod_id_tenantId_key" ON "PayrollPeriod"("id", "tenantId");
CREATE UNIQUE INDEX "PayrollPeriod_payrollCalendarId_periodStart_periodEnd_key" ON "PayrollPeriod"("payrollCalendarId", "periodStart", "periodEnd");
CREATE INDEX "PayrollPeriod_tenantId_payrollCalendarId_periodStart_idx" ON "PayrollPeriod"("tenantId", "payrollCalendarId", "periodStart");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollRun_payrollPeriodId_runNumber_key" ON "PayrollRun"("payrollPeriodId", "runNumber");
CREATE INDEX "PayrollRun_tenantId_status_idx" ON "PayrollRun"("tenantId", "status");
CREATE INDEX "PayrollRun_tenantId_payrollPeriodId_idx" ON "PayrollRun"("tenantId", "payrollPeriodId");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollRunEmployee_payrollRunId_employeeId_key" ON "PayrollRunEmployee"("payrollRunId", "employeeId");
CREATE INDEX "PayrollRunEmployee_tenantId_employeeId_idx" ON "PayrollRunEmployee"("tenantId", "employeeId");
CREATE INDEX "PayrollRunEmployee_tenantId_payrollRunId_idx" ON "PayrollRunEmployee"("tenantId", "payrollRunId");

-- CreateIndex
CREATE INDEX "PayrollRunLineItem_tenantId_payrollRunEmployeeId_idx" ON "PayrollRunLineItem"("tenantId", "payrollRunEmployeeId");
CREATE INDEX "PayrollRunLineItem_tenantId_category_idx" ON "PayrollRunLineItem"("tenantId", "category");
CREATE INDEX "PayrollRunLineItem_tenantId_sourceType_sourceId_idx" ON "PayrollRunLineItem"("tenantId", "sourceType", "sourceId");

-- CreateIndex
CREATE INDEX "PayrollInputSnapshot_tenantId_payrollRunEmployeeId_idx" ON "PayrollInputSnapshot"("tenantId", "payrollRunEmployeeId");
CREATE INDEX "PayrollInputSnapshot_tenantId_sourceType_sourceId_idx" ON "PayrollInputSnapshot"("tenantId", "sourceType", "sourceId");

-- CreateIndex
CREATE INDEX "PayrollException_tenantId_payrollRunId_idx" ON "PayrollException"("tenantId", "payrollRunId");
CREATE INDEX "PayrollException_tenantId_employeeId_idx" ON "PayrollException"("tenantId", "employeeId");
CREATE INDEX "PayrollException_tenantId_severity_isResolved_idx" ON "PayrollException"("tenantId", "severity", "isResolved");

-- AddForeignKey
ALTER TABLE "PayrollCalendar" ADD CONSTRAINT "PayrollCalendar_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PayrollCalendar" ADD CONSTRAINT "PayrollCalendar_businessUnitId_tenantId_fkey" FOREIGN KEY ("businessUnitId", "tenantId") REFERENCES "BusinessUnit"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollPeriod" ADD CONSTRAINT "PayrollPeriod_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PayrollPeriod" ADD CONSTRAINT "PayrollPeriod_payrollCalendarId_tenantId_fkey" FOREIGN KEY ("payrollCalendarId", "tenantId") REFERENCES "PayrollCalendar"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollRun" ADD CONSTRAINT "PayrollRun_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PayrollRun" ADD CONSTRAINT "PayrollRun_payrollPeriodId_tenantId_fkey" FOREIGN KEY ("payrollPeriodId", "tenantId") REFERENCES "PayrollPeriod"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollRunEmployee" ADD CONSTRAINT "PayrollRunEmployee_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PayrollRunEmployee" ADD CONSTRAINT "PayrollRunEmployee_payrollRunId_fkey" FOREIGN KEY ("payrollRunId") REFERENCES "PayrollRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PayrollRunEmployee" ADD CONSTRAINT "PayrollRunEmployee_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollRunLineItem" ADD CONSTRAINT "PayrollRunLineItem_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PayrollRunLineItem" ADD CONSTRAINT "PayrollRunLineItem_payrollRunEmployeeId_fkey" FOREIGN KEY ("payrollRunEmployeeId") REFERENCES "PayrollRunEmployee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PayrollRunLineItem" ADD CONSTRAINT "PayrollRunLineItem_payComponentId_fkey" FOREIGN KEY ("payComponentId") REFERENCES "PayComponent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollInputSnapshot" ADD CONSTRAINT "PayrollInputSnapshot_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PayrollInputSnapshot" ADD CONSTRAINT "PayrollInputSnapshot_payrollRunEmployeeId_fkey" FOREIGN KEY ("payrollRunEmployeeId") REFERENCES "PayrollRunEmployee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollException" ADD CONSTRAINT "PayrollException_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PayrollException" ADD CONSTRAINT "PayrollException_payrollRunId_fkey" FOREIGN KEY ("payrollRunId") REFERENCES "PayrollRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PayrollException" ADD CONSTRAINT "PayrollException_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
