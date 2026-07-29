-- Payroll foundation mapping fields
ALTER TABLE "PayComponent" ADD COLUMN IF NOT EXISTS "componentCategory" TEXT NOT NULL DEFAULT 'BASIC';
ALTER TABLE "PayComponent" ADD COLUMN IF NOT EXISTS "percentageBaseComponentId" TEXT;
ALTER TABLE "PayComponent" ADD COLUMN IF NOT EXISTS "formulaExpression" TEXT;
ALTER TABLE "PayComponent" ADD COLUMN IF NOT EXISTS "prorationBasis" TEXT NOT NULL DEFAULT 'NONE';
ALTER TABLE "PayComponent" ADD COLUMN IF NOT EXISTS "minimumAmount" DECIMAL(12, 2);
ALTER TABLE "PayComponent" ADD COLUMN IF NOT EXISTS "maximumAmount" DECIMAL(12, 2);
ALTER TABLE "PayComponent" ADD COLUMN IF NOT EXISTS "roundingMethod" TEXT NOT NULL DEFAULT 'NONE';
ALTER TABLE "PayComponent" ADD COLUMN IF NOT EXISTS "defaultDebitAccountId" TEXT;
ALTER TABLE "PayComponent" ADD COLUMN IF NOT EXISTS "defaultCreditAccountId" TEXT;
ALTER TABLE "PayComponent" ADD COLUMN IF NOT EXISTS "employeeVisible" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "PayrollGlAccount" ADD COLUMN IF NOT EXISTS "currencyCode" TEXT;
ALTER TABLE "PayrollGlAccount" ADD COLUMN IF NOT EXISTS "parentAccountId" TEXT;
ALTER TABLE "PayrollGlAccount" ADD COLUMN IF NOT EXISTS "postingAllowed" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "PayrollGlAccount" ADD COLUMN IF NOT EXISTS "isControlAccount" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "PayrollPostingRule" ADD COLUMN IF NOT EXISTS "lineCategory" TEXT NOT NULL DEFAULT 'PAY_COMPONENT';
ALTER TABLE "PayrollPostingRule" ADD COLUMN IF NOT EXISTS "businessUnitId" TEXT;
ALTER TABLE "PayrollPostingRule" ADD COLUMN IF NOT EXISTS "departmentId" TEXT;
ALTER TABLE "PayrollPostingRule" ADD COLUMN IF NOT EXISTS "projectId" TEXT;
ALTER TABLE "PayrollPostingRule" ADD COLUMN IF NOT EXISTS "allowSameAccount" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "ClaimType" ADD COLUMN IF NOT EXISTS "receiptRequired" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ClaimType" ADD COLUMN IF NOT EXISTS "maxAmount" DECIMAL(12, 2);
ALTER TABLE "ClaimType" ADD COLUMN IF NOT EXISTS "currencyCode" TEXT;
ALTER TABLE "ClaimType" ADD COLUMN IF NOT EXISTS "approvalRequired" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "ClaimType" ADD COLUMN IF NOT EXISTS "payrollIncluded" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ClaimType" ADD COLUMN IF NOT EXISTS "taxable" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "ClaimSubType" ADD COLUMN IF NOT EXISTS "maxAmount" DECIMAL(12, 2);
ALTER TABLE "ClaimSubType" ADD COLUMN IF NOT EXISTS "payComponentId" TEXT;

ALTER TABLE "TravelAllowancePolicy" ADD COLUMN IF NOT EXISTS "travelType" TEXT NOT NULL DEFAULT 'DOMESTIC';
ALTER TABLE "TravelAllowancePolicy" ADD COLUMN IF NOT EXISTS "businessUnitId" TEXT;
ALTER TABLE "TravelAllowancePolicy" ADD COLUMN IF NOT EXISTS "departmentId" TEXT;
ALTER TABLE "TravelAllowancePolicy" ADD COLUMN IF NOT EXISTS "employmentTypeId" TEXT;

ALTER TABLE "TravelAllowanceRule" ADD COLUMN IF NOT EXISTS "countryCode" TEXT;
ALTER TABLE "TravelAllowanceRule" ADD COLUMN IF NOT EXISTS "city" TEXT;
ALTER TABLE "TravelAllowanceRule" ADD COLUMN IF NOT EXISTS "unit" TEXT NOT NULL DEFAULT 'DAY';

ALTER TABLE "TimePayrollPolicy" ADD COLUMN IF NOT EXISTS "organizationId" TEXT;
ALTER TABLE "TimePayrollPolicy" ADD COLUMN IF NOT EXISTS "departmentId" TEXT;
ALTER TABLE "TimePayrollPolicy" ADD COLUMN IF NOT EXISTS "employmentTypeId" TEXT;

ALTER TABLE "OvertimePolicy" ADD COLUMN IF NOT EXISTS "organizationId" TEXT;
ALTER TABLE "OvertimePolicy" ADD COLUMN IF NOT EXISTS "departmentId" TEXT;
ALTER TABLE "OvertimePolicy" ADD COLUMN IF NOT EXISTS "employmentTypeId" TEXT;
ALTER TABLE "OvertimePolicy" ADD COLUMN IF NOT EXISTS "normalOtMultiplier" DECIMAL(8, 4);
ALTER TABLE "OvertimePolicy" ADD COLUMN IF NOT EXISTS "weekendOtMultiplier" DECIMAL(8, 4);
ALTER TABLE "OvertimePolicy" ADD COLUMN IF NOT EXISTS "holidayOtMultiplier" DECIMAL(8, 4);
ALTER TABLE "OvertimePolicy" ADD COLUMN IF NOT EXISTS "nightOtMultiplier" DECIMAL(8, 4);
ALTER TABLE "OvertimePolicy" ADD COLUMN IF NOT EXISTS "minimumOtMinutes" INTEGER;
ALTER TABLE "OvertimePolicy" ADD COLUMN IF NOT EXISTS "maximumOtHours" DECIMAL(8, 2);
ALTER TABLE "OvertimePolicy" ADD COLUMN IF NOT EXISTS "roundToMinutes" INTEGER;
ALTER TABLE "OvertimePolicy" ADD COLUMN IF NOT EXISTS "payComponentId" TEXT;

ALTER TABLE "TaxRule" ADD COLUMN IF NOT EXISTS "businessUnitId" TEXT;
ALTER TABLE "TaxRule" ADD COLUMN IF NOT EXISTS "departmentId" TEXT;
ALTER TABLE "TaxRule" ADD COLUMN IF NOT EXISTS "employmentTypeId" TEXT;

CREATE INDEX IF NOT EXISTS "PayComponent_tenantId_componentCategory_idx" ON "PayComponent"("tenantId", "componentCategory");
CREATE INDEX IF NOT EXISTS "PayComponent_tenantId_percentageBaseComponentId_idx" ON "PayComponent"("tenantId", "percentageBaseComponentId");
CREATE INDEX IF NOT EXISTS "PayComponent_tenantId_defaultDebitAccountId_idx" ON "PayComponent"("tenantId", "defaultDebitAccountId");
CREATE INDEX IF NOT EXISTS "PayComponent_tenantId_defaultCreditAccountId_idx" ON "PayComponent"("tenantId", "defaultCreditAccountId");
CREATE INDEX IF NOT EXISTS "PayrollGlAccount_tenantId_parentAccountId_idx" ON "PayrollGlAccount"("tenantId", "parentAccountId");
CREATE INDEX IF NOT EXISTS "PayrollGlAccount_tenantId_postingAllowed_idx" ON "PayrollGlAccount"("tenantId", "postingAllowed");
CREATE INDEX IF NOT EXISTS "PayrollPostingRule_tenantId_lineCategory_idx" ON "PayrollPostingRule"("tenantId", "lineCategory");
CREATE INDEX IF NOT EXISTS "PayrollPostingRule_tenantId_businessUnitId_idx" ON "PayrollPostingRule"("tenantId", "businessUnitId");
CREATE INDEX IF NOT EXISTS "PayrollPostingRule_tenantId_departmentId_idx" ON "PayrollPostingRule"("tenantId", "departmentId");
CREATE INDEX IF NOT EXISTS "PayrollPostingRule_tenantId_projectId_idx" ON "PayrollPostingRule"("tenantId", "projectId");
CREATE INDEX IF NOT EXISTS "ClaimSubType_tenantId_payComponentId_idx" ON "ClaimSubType"("tenantId", "payComponentId");
CREATE INDEX IF NOT EXISTS "TravelAllowancePolicy_tenantId_businessUnitId_idx" ON "TravelAllowancePolicy"("tenantId", "businessUnitId");
CREATE INDEX IF NOT EXISTS "TravelAllowancePolicy_tenantId_departmentId_idx" ON "TravelAllowancePolicy"("tenantId", "departmentId");
CREATE INDEX IF NOT EXISTS "TravelAllowancePolicy_tenantId_employmentTypeId_idx" ON "TravelAllowancePolicy"("tenantId", "employmentTypeId");
CREATE INDEX IF NOT EXISTS "TimePayrollPolicy_tenantId_organizationId_idx" ON "TimePayrollPolicy"("tenantId", "organizationId");
CREATE INDEX IF NOT EXISTS "TimePayrollPolicy_tenantId_departmentId_idx" ON "TimePayrollPolicy"("tenantId", "departmentId");
CREATE INDEX IF NOT EXISTS "TimePayrollPolicy_tenantId_employmentTypeId_idx" ON "TimePayrollPolicy"("tenantId", "employmentTypeId");
CREATE INDEX IF NOT EXISTS "OvertimePolicy_tenantId_organizationId_idx" ON "OvertimePolicy"("tenantId", "organizationId");
CREATE INDEX IF NOT EXISTS "OvertimePolicy_tenantId_departmentId_idx" ON "OvertimePolicy"("tenantId", "departmentId");
CREATE INDEX IF NOT EXISTS "OvertimePolicy_tenantId_employmentTypeId_idx" ON "OvertimePolicy"("tenantId", "employmentTypeId");
CREATE INDEX IF NOT EXISTS "OvertimePolicy_tenantId_payComponentId_idx" ON "OvertimePolicy"("tenantId", "payComponentId");
CREATE INDEX IF NOT EXISTS "TaxRule_tenantId_businessUnitId_idx" ON "TaxRule"("tenantId", "businessUnitId");
CREATE INDEX IF NOT EXISTS "TaxRule_tenantId_departmentId_idx" ON "TaxRule"("tenantId", "departmentId");
CREATE INDEX IF NOT EXISTS "TaxRule_tenantId_employmentTypeId_idx" ON "TaxRule"("tenantId", "employmentTypeId");

ALTER TABLE "PayComponent" ADD CONSTRAINT "PayComponent_percentageBaseComponentId_fkey" FOREIGN KEY ("percentageBaseComponentId") REFERENCES "PayComponent"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PayComponent" ADD CONSTRAINT "PayComponent_defaultDebitAccountId_fkey" FOREIGN KEY ("defaultDebitAccountId") REFERENCES "PayrollGlAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PayComponent" ADD CONSTRAINT "PayComponent_defaultCreditAccountId_fkey" FOREIGN KEY ("defaultCreditAccountId") REFERENCES "PayrollGlAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PayrollGlAccount" ADD CONSTRAINT "PayrollGlAccount_parentAccountId_fkey" FOREIGN KEY ("parentAccountId") REFERENCES "PayrollGlAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ClaimSubType" ADD CONSTRAINT "ClaimSubType_payComponentId_tenantId_fkey" FOREIGN KEY ("payComponentId", "tenantId") REFERENCES "PayComponent"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OvertimePolicy" ADD CONSTRAINT "OvertimePolicy_payComponentId_tenantId_fkey" FOREIGN KEY ("payComponentId", "tenantId") REFERENCES "PayComponent"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
