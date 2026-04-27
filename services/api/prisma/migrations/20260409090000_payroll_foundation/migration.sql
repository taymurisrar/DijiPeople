-- CreateEnum
CREATE TYPE "PayrollCycleStatus" AS ENUM ('DRAFT', 'PROCESSING', 'REVIEW', 'FINALIZED');

-- CreateEnum
CREATE TYPE "PayrollRecordStatus" AS ENUM ('DRAFT', 'REVIEWED', 'FINALIZED');

-- CreateEnum
CREATE TYPE "SalaryComponentType" AS ENUM ('EARNING', 'DEDUCTION');

-- CreateEnum
CREATE TYPE "PayFrequency" AS ENUM ('MONTHLY', 'SEMI_MONTHLY', 'BI_WEEKLY', 'WEEKLY');

-- CreateTable
CREATE TABLE "PayrollCycle" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "runDate" TIMESTAMP(3),
    "status" "PayrollCycleStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,

    CONSTRAINT "PayrollCycle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollRecord" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "payrollCycleId" TEXT NOT NULL,
    "gross" DECIMAL(12,2) NOT NULL,
    "deductions" DECIMAL(12,2) NOT NULL,
    "net" DECIMAL(12,2) NOT NULL,
    "status" "PayrollRecordStatus" NOT NULL DEFAULT 'DRAFT',
    "lineItems" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,

    CONSTRAINT "PayrollRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalaryComponent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "type" "SalaryComponentType" NOT NULL,
    "defaultAmount" DECIMAL(12,2),
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,

    CONSTRAINT "SalaryComponent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeCompensation" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "basicSalary" DECIMAL(12,2) NOT NULL,
    "payFrequency" "PayFrequency" NOT NULL,
    "effectiveDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,

    CONSTRAINT "EmployeeCompensation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PayrollCycle_tenantId_idx" ON "PayrollCycle"("tenantId");
CREATE INDEX "PayrollCycle_tenantId_status_idx" ON "PayrollCycle"("tenantId", "status");
CREATE INDEX "PayrollCycle_tenantId_periodStart_periodEnd_idx" ON "PayrollCycle"("tenantId", "periodStart", "periodEnd");
CREATE UNIQUE INDEX "PayrollCycle_tenantId_periodStart_periodEnd_key" ON "PayrollCycle"("tenantId", "periodStart", "periodEnd");

CREATE INDEX "PayrollRecord_tenantId_idx" ON "PayrollRecord"("tenantId");
CREATE INDEX "PayrollRecord_tenantId_payrollCycleId_idx" ON "PayrollRecord"("tenantId", "payrollCycleId");
CREATE INDEX "PayrollRecord_tenantId_employeeId_idx" ON "PayrollRecord"("tenantId", "employeeId");
CREATE INDEX "PayrollRecord_tenantId_status_idx" ON "PayrollRecord"("tenantId", "status");
CREATE UNIQUE INDEX "PayrollRecord_payrollCycleId_employeeId_key" ON "PayrollRecord"("payrollCycleId", "employeeId");

CREATE INDEX "SalaryComponent_tenantId_idx" ON "SalaryComponent"("tenantId");
CREATE INDEX "SalaryComponent_tenantId_type_isActive_idx" ON "SalaryComponent"("tenantId", "type", "isActive");
CREATE UNIQUE INDEX "SalaryComponent_tenantId_name_key" ON "SalaryComponent"("tenantId", "name");
CREATE UNIQUE INDEX "SalaryComponent_tenantId_code_key" ON "SalaryComponent"("tenantId", "code");

CREATE INDEX "EmployeeCompensation_tenantId_idx" ON "EmployeeCompensation"("tenantId");
CREATE INDEX "EmployeeCompensation_tenantId_employeeId_idx" ON "EmployeeCompensation"("tenantId", "employeeId");
CREATE INDEX "EmployeeCompensation_tenantId_effectiveDate_idx" ON "EmployeeCompensation"("tenantId", "effectiveDate");
CREATE UNIQUE INDEX "EmployeeCompensation_tenantId_employeeId_effectiveDate_key" ON "EmployeeCompensation"("tenantId", "employeeId", "effectiveDate");

-- AddForeignKey
ALTER TABLE "PayrollCycle" ADD CONSTRAINT "PayrollCycle_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PayrollRecord" ADD CONSTRAINT "PayrollRecord_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PayrollRecord" ADD CONSTRAINT "PayrollRecord_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PayrollRecord" ADD CONSTRAINT "PayrollRecord_payrollCycleId_fkey" FOREIGN KEY ("payrollCycleId") REFERENCES "PayrollCycle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SalaryComponent" ADD CONSTRAINT "SalaryComponent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmployeeCompensation" ADD CONSTRAINT "EmployeeCompensation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmployeeCompensation" ADD CONSTRAINT "EmployeeCompensation_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

