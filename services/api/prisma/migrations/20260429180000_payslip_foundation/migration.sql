-- CreateEnum
CREATE TYPE "PayslipStatus" AS ENUM ('DRAFT', 'GENERATED', 'PUBLISHED', 'VOID');

-- CreateEnum
CREATE TYPE "PayslipEventType" AS ENUM ('GENERATED', 'REGENERATED', 'PUBLISHED', 'VOIDED', 'VIEWED', 'DOWNLOADED');

-- CreateTable
CREATE TABLE "Payslip" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "payrollRunId" TEXT NOT NULL,
    "payrollRunEmployeeId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "payslipNumber" TEXT NOT NULL,
    "status" "PayslipStatus" NOT NULL DEFAULT 'DRAFT',
    "currencyCode" TEXT NOT NULL,
    "grossEarnings" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "totalDeductions" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "totalTaxes" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "totalReimbursements" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "employerContributions" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "netPay" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "generatedAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "voidedAt" TIMESTAMP(3),
    "voidReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payslip_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayslipLineItem" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "payslipId" TEXT NOT NULL,
    "payrollRunLineItemId" TEXT,
    "payComponentId" TEXT,
    "category" "PayrollRunLineItemCategory" NOT NULL,
    "label" TEXT NOT NULL,
    "quantity" DECIMAL(12,4),
    "rate" DECIMAL(12,4),
    "amount" DECIMAL(12,2) NOT NULL,
    "currencyCode" TEXT NOT NULL,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "displayOnPayslip" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PayslipLineItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayslipEventLog" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "payslipId" TEXT NOT NULL,
    "eventType" "PayslipEventType" NOT NULL,
    "actorUserId" TEXT,
    "message" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PayslipEventLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Payslip_payrollRunEmployeeId_key" ON "Payslip"("payrollRunEmployeeId");
CREATE UNIQUE INDEX "Payslip_tenantId_payslipNumber_key" ON "Payslip"("tenantId", "payslipNumber");
CREATE INDEX "Payslip_tenantId_employeeId_idx" ON "Payslip"("tenantId", "employeeId");
CREATE INDEX "Payslip_tenantId_payrollRunId_idx" ON "Payslip"("tenantId", "payrollRunId");
CREATE INDEX "Payslip_tenantId_status_idx" ON "Payslip"("tenantId", "status");

-- CreateIndex
CREATE INDEX "PayslipLineItem_tenantId_payslipId_idx" ON "PayslipLineItem"("tenantId", "payslipId");
CREATE INDEX "PayslipLineItem_tenantId_category_idx" ON "PayslipLineItem"("tenantId", "category");

-- CreateIndex
CREATE INDEX "PayslipEventLog_tenantId_payslipId_idx" ON "PayslipEventLog"("tenantId", "payslipId");
CREATE INDEX "PayslipEventLog_tenantId_eventType_idx" ON "PayslipEventLog"("tenantId", "eventType");

-- AddForeignKey
ALTER TABLE "Payslip" ADD CONSTRAINT "Payslip_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Payslip" ADD CONSTRAINT "Payslip_payrollRunId_fkey" FOREIGN KEY ("payrollRunId") REFERENCES "PayrollRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Payslip" ADD CONSTRAINT "Payslip_payrollRunEmployeeId_fkey" FOREIGN KEY ("payrollRunEmployeeId") REFERENCES "PayrollRunEmployee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Payslip" ADD CONSTRAINT "Payslip_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayslipLineItem" ADD CONSTRAINT "PayslipLineItem_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PayslipLineItem" ADD CONSTRAINT "PayslipLineItem_payslipId_fkey" FOREIGN KEY ("payslipId") REFERENCES "Payslip"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PayslipLineItem" ADD CONSTRAINT "PayslipLineItem_payrollRunLineItemId_fkey" FOREIGN KEY ("payrollRunLineItemId") REFERENCES "PayrollRunLineItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PayslipLineItem" ADD CONSTRAINT "PayslipLineItem_payComponentId_fkey" FOREIGN KEY ("payComponentId") REFERENCES "PayComponent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayslipEventLog" ADD CONSTRAINT "PayslipEventLog_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PayslipEventLog" ADD CONSTRAINT "PayslipEventLog_payslipId_fkey" FOREIGN KEY ("payslipId") REFERENCES "Payslip"("id") ON DELETE CASCADE ON UPDATE CASCADE;
