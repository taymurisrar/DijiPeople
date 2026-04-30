-- CreateEnum
CREATE TYPE "TimePayrollMode" AS ENUM ('ATTENDANCE_ONLY', 'TIMESHEET_ONLY', 'ATTENDANCE_TO_TIMESHEET', 'ATTENDANCE_AND_TIMESHEET_SEPARATE');

-- CreateEnum
CREATE TYPE "TimeProrationBasis" AS ENUM ('CALENDAR_DAYS', 'WORKING_DAYS', 'FIXED_30_DAYS');

-- CreateEnum
CREATE TYPE "OvertimeCalculationPeriod" AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY');

-- CreateEnum
CREATE TYPE "TimePayrollInputSourceType" AS ENUM ('ATTENDANCE', 'TIMESHEET', 'NO_SHOW', 'OVERTIME');

-- CreateEnum
CREATE TYPE "TimePayrollInputStatus" AS ENUM ('PREPARED', 'INCLUDED_IN_PAYROLL', 'EXCLUDED');

-- CreateTable
CREATE TABLE "TimePayrollPolicy" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "employeeLevelId" TEXT,
    "businessUnitId" TEXT,
    "countryCode" TEXT,
    "mode" "TimePayrollMode" NOT NULL,
    "useAttendanceForPayroll" BOOLEAN NOT NULL DEFAULT true,
    "useTimesheetForPayroll" BOOLEAN NOT NULL DEFAULT false,
    "requireAttendanceApproval" BOOLEAN NOT NULL DEFAULT false,
    "requireTimesheetApproval" BOOLEAN NOT NULL DEFAULT true,
    "detectNoShow" BOOLEAN NOT NULL DEFAULT true,
    "deductNoShow" BOOLEAN NOT NULL DEFAULT true,
    "overtimeEnabled" BOOLEAN NOT NULL DEFAULT false,
    "standardHoursPerDay" DECIMAL(6,2) NOT NULL DEFAULT 8,
    "standardWorkingDaysPerMonth" DECIMAL(6,2),
    "prorationBasis" "TimeProrationBasis" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TimePayrollPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OvertimePolicy" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "employeeLevelId" TEXT,
    "businessUnitId" TEXT,
    "calculationPeriod" "OvertimeCalculationPeriod" NOT NULL,
    "thresholdHours" DECIMAL(8,2) NOT NULL,
    "rateMultiplier" DECIMAL(8,4) NOT NULL,
    "requiresApproval" BOOLEAN NOT NULL DEFAULT true,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "OvertimePolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TimePayrollInput" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "payrollRunEmployeeId" TEXT,
    "sourceType" "TimePayrollInputSourceType" NOT NULL,
    "sourceId" TEXT,
    "workDate" TIMESTAMP(3) NOT NULL,
    "regularHours" DECIMAL(8,2) NOT NULL DEFAULT 0,
    "overtimeHours" DECIMAL(8,2) NOT NULL DEFAULT 0,
    "absenceDays" DECIMAL(6,2) NOT NULL DEFAULT 0,
    "status" "TimePayrollInputStatus" NOT NULL DEFAULT 'PREPARED',
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TimePayrollInput_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TimePayrollPolicy_id_tenantId_key" ON "TimePayrollPolicy"("id", "tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "TimePayrollPolicy_tenantId_code_key" ON "TimePayrollPolicy"("tenantId", "code");

-- CreateIndex
CREATE INDEX "TimePayrollPolicy_tenantId_employeeLevelId_idx" ON "TimePayrollPolicy"("tenantId", "employeeLevelId");

-- CreateIndex
CREATE INDEX "TimePayrollPolicy_tenantId_businessUnitId_idx" ON "TimePayrollPolicy"("tenantId", "businessUnitId");

-- CreateIndex
CREATE INDEX "TimePayrollPolicy_tenantId_isActive_idx" ON "TimePayrollPolicy"("tenantId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "OvertimePolicy_id_tenantId_key" ON "OvertimePolicy"("id", "tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "OvertimePolicy_tenantId_code_key" ON "OvertimePolicy"("tenantId", "code");

-- CreateIndex
CREATE INDEX "OvertimePolicy_tenantId_employeeLevelId_idx" ON "OvertimePolicy"("tenantId", "employeeLevelId");

-- CreateIndex
CREATE INDEX "OvertimePolicy_tenantId_businessUnitId_idx" ON "OvertimePolicy"("tenantId", "businessUnitId");

-- CreateIndex
CREATE INDEX "OvertimePolicy_tenantId_isActive_idx" ON "OvertimePolicy"("tenantId", "isActive");

-- CreateIndex
CREATE INDEX "TimePayrollInput_tenantId_employeeId_workDate_idx" ON "TimePayrollInput"("tenantId", "employeeId", "workDate");

-- CreateIndex
CREATE INDEX "TimePayrollInput_tenantId_payrollRunEmployeeId_idx" ON "TimePayrollInput"("tenantId", "payrollRunEmployeeId");

-- CreateIndex
CREATE INDEX "TimePayrollInput_tenantId_sourceType_sourceId_idx" ON "TimePayrollInput"("tenantId", "sourceType", "sourceId");

-- AddForeignKey
ALTER TABLE "TimePayrollPolicy" ADD CONSTRAINT "TimePayrollPolicy_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimePayrollPolicy" ADD CONSTRAINT "TimePayrollPolicy_employeeLevelId_tenantId_fkey" FOREIGN KEY ("employeeLevelId", "tenantId") REFERENCES "EmployeeLevel"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimePayrollPolicy" ADD CONSTRAINT "TimePayrollPolicy_businessUnitId_tenantId_fkey" FOREIGN KEY ("businessUnitId", "tenantId") REFERENCES "BusinessUnit"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OvertimePolicy" ADD CONSTRAINT "OvertimePolicy_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OvertimePolicy" ADD CONSTRAINT "OvertimePolicy_employeeLevelId_tenantId_fkey" FOREIGN KEY ("employeeLevelId", "tenantId") REFERENCES "EmployeeLevel"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OvertimePolicy" ADD CONSTRAINT "OvertimePolicy_businessUnitId_tenantId_fkey" FOREIGN KEY ("businessUnitId", "tenantId") REFERENCES "BusinessUnit"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimePayrollInput" ADD CONSTRAINT "TimePayrollInput_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimePayrollInput" ADD CONSTRAINT "TimePayrollInput_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimePayrollInput" ADD CONSTRAINT "TimePayrollInput_payrollRunEmployeeId_fkey" FOREIGN KEY ("payrollRunEmployeeId") REFERENCES "PayrollRunEmployee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
