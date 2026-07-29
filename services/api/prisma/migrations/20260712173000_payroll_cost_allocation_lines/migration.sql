CREATE TABLE "PayrollCostAllocationLine" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "payrollRunId" TEXT NOT NULL,
  "payrollRunEmployeeId" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "projectId" TEXT,
  "customerId" TEXT,
  "costCenterId" TEXT,
  "allocationPercentage" DECIMAL(8,4) NOT NULL,
  "originalAmount" DECIMAL(14,2) NOT NULL,
  "currencyCode" TEXT NOT NULL,
  "reportingAmount" DECIMAL(14,2),
  "reportingCurrency" TEXT,
  "exchangeRate" DECIMAL(18,8),
  "isBench" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PayrollCostAllocationLine_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PayrollCostAllocationLine_tenantId_payrollRunId_idx" ON "PayrollCostAllocationLine"("tenantId", "payrollRunId");
CREATE INDEX "PayrollCostAllocationLine_tenantId_payrollRunEmployeeId_idx" ON "PayrollCostAllocationLine"("tenantId", "payrollRunEmployeeId");
CREATE INDEX "PayrollCostAllocationLine_tenantId_employeeId_idx" ON "PayrollCostAllocationLine"("tenantId", "employeeId");
CREATE INDEX "PayrollCostAllocationLine_tenantId_projectId_idx" ON "PayrollCostAllocationLine"("tenantId", "projectId");
CREATE INDEX "PayrollCostAllocationLine_tenantId_customerId_idx" ON "PayrollCostAllocationLine"("tenantId", "customerId");

ALTER TABLE "PayrollCostAllocationLine" ADD CONSTRAINT "PayrollCostAllocationLine_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PayrollCostAllocationLine" ADD CONSTRAINT "PayrollCostAllocationLine_payrollRunId_tenantId_fkey" FOREIGN KEY ("payrollRunId", "tenantId") REFERENCES "PayrollRun"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PayrollCostAllocationLine" ADD CONSTRAINT "PayrollCostAllocationLine_payrollRunEmployeeId_fkey" FOREIGN KEY ("payrollRunEmployeeId") REFERENCES "PayrollRunEmployee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PayrollCostAllocationLine" ADD CONSTRAINT "PayrollCostAllocationLine_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PayrollCostAllocationLine" ADD CONSTRAINT "PayrollCostAllocationLine_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PayrollCostAllocationLine" ADD CONSTRAINT "PayrollCostAllocationLine_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "CustomerAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
