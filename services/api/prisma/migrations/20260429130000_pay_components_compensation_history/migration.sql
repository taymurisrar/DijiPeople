-- CreateEnum
CREATE TYPE "PayComponentType" AS ENUM ('EARNING', 'ALLOWANCE', 'REIMBURSEMENT', 'DEDUCTION', 'TAX', 'EMPLOYER_CONTRIBUTION', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "PayComponentCalculationMethod" AS ENUM ('FIXED', 'PERCENTAGE', 'FORMULA', 'MANUAL', 'SYSTEM_CALCULATED');

-- CreateEnum
CREATE TYPE "CompensationPayFrequency" AS ENUM ('MONTHLY', 'WEEKLY', 'BIWEEKLY', 'DAILY', 'HOURLY');

-- CreateEnum
CREATE TYPE "EmployeeCompensationHistoryStatus" AS ENUM ('DRAFT', 'ACTIVE', 'RETIRED');

-- CreateTable
CREATE TABLE "PayComponent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "componentType" "PayComponentType" NOT NULL,
    "calculationMethod" "PayComponentCalculationMethod" NOT NULL,
    "isTaxable" BOOLEAN NOT NULL DEFAULT false,
    "affectsGrossPay" BOOLEAN NOT NULL DEFAULT true,
    "affectsNetPay" BOOLEAN NOT NULL DEFAULT true,
    "isRecurring" BOOLEAN NOT NULL DEFAULT false,
    "requiresApproval" BOOLEAN NOT NULL DEFAULT false,
    "displayOnPayslip" BOOLEAN NOT NULL DEFAULT true,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayComponent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeCompensationHistory" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "payFrequency" "CompensationPayFrequency" NOT NULL,
    "currencyCode" TEXT NOT NULL,
    "baseAmount" DECIMAL(12,2) NOT NULL,
    "status" "EmployeeCompensationHistoryStatus" NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmployeeCompensationHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeCompensationComponent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "compensationHistoryId" TEXT NOT NULL,
    "payComponentId" TEXT NOT NULL,
    "amount" DECIMAL(12,2),
    "percentage" DECIMAL(8,4),
    "calculationMethodSnapshot" "PayComponentCalculationMethod" NOT NULL,
    "isRecurring" BOOLEAN NOT NULL,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmployeeCompensationComponent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PayComponent_id_tenantId_key" ON "PayComponent"("id", "tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "PayComponent_tenantId_code_key" ON "PayComponent"("tenantId", "code");

-- CreateIndex
CREATE INDEX "PayComponent_tenantId_componentType_idx" ON "PayComponent"("tenantId", "componentType");

-- CreateIndex
CREATE INDEX "PayComponent_tenantId_isActive_idx" ON "PayComponent"("tenantId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "EmployeeCompensationHistory_id_tenantId_key" ON "EmployeeCompensationHistory"("id", "tenantId");

-- CreateIndex
CREATE INDEX "EmployeeCompensationHistory_tenantId_employeeId_effectiveFrom_idx" ON "EmployeeCompensationHistory"("tenantId", "employeeId", "effectiveFrom");

-- CreateIndex
CREATE INDEX "EmployeeCompensationHistory_tenantId_employeeId_status_idx" ON "EmployeeCompensationHistory"("tenantId", "employeeId", "status");

-- CreateIndex
CREATE INDEX "EmployeeCompensationHistory_tenantId_status_idx" ON "EmployeeCompensationHistory"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "EmployeeCompensationComponent_compensationHistoryId_payComponentId_key" ON "EmployeeCompensationComponent"("compensationHistoryId", "payComponentId");

-- CreateIndex
CREATE INDEX "EmployeeCompensationComponent_tenantId_compensationHistoryId_idx" ON "EmployeeCompensationComponent"("tenantId", "compensationHistoryId");

-- CreateIndex
CREATE INDEX "EmployeeCompensationComponent_tenantId_payComponentId_idx" ON "EmployeeCompensationComponent"("tenantId", "payComponentId");

-- AddForeignKey
ALTER TABLE "PayComponent" ADD CONSTRAINT "PayComponent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeCompensationHistory" ADD CONSTRAINT "EmployeeCompensationHistory_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeCompensationHistory" ADD CONSTRAINT "EmployeeCompensationHistory_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeCompensationComponent" ADD CONSTRAINT "EmployeeCompensationComponent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeCompensationComponent" ADD CONSTRAINT "EmployeeCompensationComponent_compensationHistoryId_tenantId_fkey" FOREIGN KEY ("compensationHistoryId", "tenantId") REFERENCES "EmployeeCompensationHistory"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeCompensationComponent" ADD CONSTRAINT "EmployeeCompensationComponent_payComponentId_tenantId_fkey" FOREIGN KEY ("payComponentId", "tenantId") REFERENCES "PayComponent"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
