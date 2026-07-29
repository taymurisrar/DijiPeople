-- Employee payroll foundation: organizational teams, salary packages, compensation enrichment, and payroll banking.

ALTER TYPE "TeamType" ADD VALUE IF NOT EXISTS 'ORGANIZATIONAL';

CREATE TYPE "EmployerBankAccountPurpose" AS ENUM ('PAYROLL', 'OPERATING', 'TAX', 'BENEFITS', 'OTHER');

ALTER TABLE "Team"
  ALTER COLUMN "teamType" SET DEFAULT 'ACCESS';

UPDATE "Team"
SET "teamType" = 'ORGANIZATIONAL'
WHERE "teamType" = 'OWNER'
  AND ("departmentId" IS NOT NULL OR "businessUnitId" IS NOT NULL);

CREATE TABLE "SalaryPackageRule" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "currencyCode" TEXT NOT NULL,
  "organizationId" TEXT,
  "businessUnitId" TEXT,
  "departmentId" TEXT,
  "employeeLevelId" TEXT,
  "employmentTypeId" TEXT,
  "effectiveFrom" TIMESTAMP(3),
  "effectiveTo" TIMESTAMP(3),
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "createdById" TEXT,
  "updatedById" TEXT,
  CONSTRAINT "SalaryPackageRule_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SalaryPackageRuleComponent" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "salaryPackageRuleId" TEXT NOT NULL,
  "payComponentId" TEXT NOT NULL,
  "calculationMethod" "PayComponentCalculationMethod" NOT NULL,
  "fixedAmount" DECIMAL(12,2),
  "percentage" DECIMAL(8,4),
  "percentageBaseComponentId" TEXT,
  "formulaExpression" TEXT,
  "minimumAmount" DECIMAL(12,2),
  "maximumAmount" DECIMAL(12,2),
  "isRequired" BOOLEAN NOT NULL DEFAULT false,
  "isEmployeeEditable" BOOLEAN NOT NULL DEFAULT false,
  "displayOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "createdById" TEXT,
  "updatedById" TEXT,
  CONSTRAINT "SalaryPackageRuleComponent_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "EmployeeCompensationHistory"
  ADD COLUMN IF NOT EXISTS "salaryPackageRuleId" TEXT,
  ADD COLUMN IF NOT EXISTS "grossEarnings" DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "totalDeductions" DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "employerContributions" DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "estimatedNetPay" DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "changeReason" TEXT,
  ADD COLUMN IF NOT EXISTS "approvedById" TEXT;

ALTER TABLE "EmployeeCompensationComponent"
  ADD COLUMN IF NOT EXISTS "calculatedAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "formulaExpression" TEXT,
  ADD COLUMN IF NOT EXISTS "isTaxable" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "isEmployeeEditable" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "EmployeeBankAccount"
  ADD COLUMN IF NOT EXISTS "branchName" TEXT,
  ADD COLUMN IF NOT EXISTS "branchCode" TEXT,
  ADD COLUMN IF NOT EXISTS "employeeNotes" TEXT,
  ADD COLUMN IF NOT EXISTS "supportingDocumentId" TEXT;

CREATE TABLE "EmployerBankAccount" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "accountName" TEXT NOT NULL,
  "bankId" TEXT,
  "accountTitle" TEXT NOT NULL,
  "accountNumber" TEXT,
  "iban" TEXT,
  "branch" TEXT,
  "currencyCode" TEXT NOT NULL,
  "accountPurpose" "EmployerBankAccountPurpose" NOT NULL DEFAULT 'PAYROLL',
  "isDefaultPayrollAccount" BOOLEAN NOT NULL DEFAULT false,
  "paymentFileFormat" TEXT,
  "description" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "createdById" TEXT,
  "updatedById" TEXT,
  CONSTRAINT "EmployerBankAccount_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SalaryPackageRule_id_tenantId_key" ON "SalaryPackageRule"("id", "tenantId");
CREATE UNIQUE INDEX "SalaryPackageRule_tenantId_name_key" ON "SalaryPackageRule"("tenantId", "name");
CREATE INDEX "SalaryPackageRule_tenantId_isActive_idx" ON "SalaryPackageRule"("tenantId", "isActive");
CREATE INDEX "SalaryPackageRule_tenantId_currencyCode_idx" ON "SalaryPackageRule"("tenantId", "currencyCode");
CREATE INDEX "SalaryPackageRule_tenantId_organizationId_businessUnitId_idx" ON "SalaryPackageRule"("tenantId", "organizationId", "businessUnitId");
CREATE INDEX "SalaryPackageRule_tenantId_departmentId_employeeLevelId_employmentTypeId_idx" ON "SalaryPackageRule"("tenantId", "departmentId", "employeeLevelId", "employmentTypeId");

CREATE UNIQUE INDEX "SalaryPackageRuleComponent_salaryPackageRuleId_payComponentId_key" ON "SalaryPackageRuleComponent"("salaryPackageRuleId", "payComponentId");
CREATE INDEX "SalaryPackageRuleComponent_tenantId_salaryPackageRuleId_idx" ON "SalaryPackageRuleComponent"("tenantId", "salaryPackageRuleId");
CREATE INDEX "SalaryPackageRuleComponent_tenantId_payComponentId_idx" ON "SalaryPackageRuleComponent"("tenantId", "payComponentId");
CREATE INDEX "SalaryPackageRuleComponent_tenantId_percentageBaseComponentId_idx" ON "SalaryPackageRuleComponent"("tenantId", "percentageBaseComponentId");

CREATE INDEX "EmployeeCompensationHistory_tenantId_salaryPackageRuleId_idx" ON "EmployeeCompensationHistory"("tenantId", "salaryPackageRuleId");
CREATE INDEX "EmployeeCompensationHistory_tenantId_approvedById_idx" ON "EmployeeCompensationHistory"("tenantId", "approvedById");
CREATE INDEX "EmployeeBankAccount_tenantId_currencyCode_isPrimaryPayroll_isActive_idx" ON "EmployeeBankAccount"("tenantId", "currencyCode", "isPrimaryPayroll", "isActive");

CREATE UNIQUE INDEX "EmployerBankAccount_tenantId_accountName_key" ON "EmployerBankAccount"("tenantId", "accountName");
CREATE INDEX "EmployerBankAccount_tenantId_bankId_idx" ON "EmployerBankAccount"("tenantId", "bankId");
CREATE INDEX "EmployerBankAccount_tenantId_currencyCode_accountPurpose_isActive_idx" ON "EmployerBankAccount"("tenantId", "currencyCode", "accountPurpose", "isActive");
CREATE INDEX "EmployerBankAccount_tenantId_currencyCode_isDefaultPayrollAccount_isActive_idx" ON "EmployerBankAccount"("tenantId", "currencyCode", "isDefaultPayrollAccount", "isActive");

ALTER TABLE "SalaryPackageRule" ADD CONSTRAINT "SalaryPackageRule_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SalaryPackageRule" ADD CONSTRAINT "SalaryPackageRule_organizationId_tenantId_fkey" FOREIGN KEY ("organizationId", "tenantId") REFERENCES "Organization"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SalaryPackageRule" ADD CONSTRAINT "SalaryPackageRule_businessUnitId_tenantId_fkey" FOREIGN KEY ("businessUnitId", "tenantId") REFERENCES "BusinessUnit"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SalaryPackageRule" ADD CONSTRAINT "SalaryPackageRule_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SalaryPackageRule" ADD CONSTRAINT "SalaryPackageRule_employeeLevelId_tenantId_fkey" FOREIGN KEY ("employeeLevelId", "tenantId") REFERENCES "EmployeeLevel"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SalaryPackageRule" ADD CONSTRAINT "SalaryPackageRule_employmentTypeId_tenantId_fkey" FOREIGN KEY ("employmentTypeId", "tenantId") REFERENCES "EmploymentType"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "SalaryPackageRuleComponent" ADD CONSTRAINT "SalaryPackageRuleComponent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SalaryPackageRuleComponent" ADD CONSTRAINT "SalaryPackageRuleComponent_salaryPackageRuleId_tenantId_fkey" FOREIGN KEY ("salaryPackageRuleId", "tenantId") REFERENCES "SalaryPackageRule"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SalaryPackageRuleComponent" ADD CONSTRAINT "SalaryPackageRuleComponent_payComponentId_tenantId_fkey" FOREIGN KEY ("payComponentId", "tenantId") REFERENCES "PayComponent"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SalaryPackageRuleComponent" ADD CONSTRAINT "SalaryPackageRuleComponent_percentageBaseComponentId_tenantId_fkey" FOREIGN KEY ("percentageBaseComponentId", "tenantId") REFERENCES "PayComponent"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "EmployeeCompensationHistory" ADD CONSTRAINT "EmployeeCompensationHistory_salaryPackageRuleId_tenantId_fkey" FOREIGN KEY ("salaryPackageRuleId", "tenantId") REFERENCES "SalaryPackageRule"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EmployeeCompensationHistory" ADD CONSTRAINT "EmployeeCompensationHistory_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "EmployeeBankAccount" ADD CONSTRAINT "EmployeeBankAccount_supportingDocumentId_fkey" FOREIGN KEY ("supportingDocumentId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "EmployerBankAccount" ADD CONSTRAINT "EmployerBankAccount_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmployerBankAccount" ADD CONSTRAINT "EmployerBankAccount_bankId_fkey" FOREIGN KEY ("bankId") REFERENCES "Bank"("id") ON DELETE SET NULL ON UPDATE CASCADE;
