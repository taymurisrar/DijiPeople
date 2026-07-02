ALTER TYPE "ApprovalModuleKey" ADD VALUE IF NOT EXISTS 'BENEFIT_ASSIGNMENT';
ALTER TYPE "PayrollInputSnapshotSourceType" ADD VALUE IF NOT EXISTS 'BENEFIT';

CREATE TYPE "BenefitValueType" AS ENUM ('FIXED_AMOUNT', 'PERCENTAGE');
CREATE TYPE "BenefitType" AS ENUM ('ALLOWANCE', 'REIMBURSEMENT', 'EMPLOYER_PAID', 'PERK', 'EARNING', 'DEDUCTION');
CREATE TYPE "BenefitRenewalPeriod" AS ENUM ('NONE', 'MONTHLY', 'QUARTERLY', 'ANNUAL', 'CUSTOM');
CREATE TYPE "BenefitPolicyStatus" AS ENUM ('ACTIVE', 'INACTIVE');
CREATE TYPE "EmployeeBenefitStatus" AS ENUM ('PENDING_APPROVAL', 'ACTIVE', 'SUSPENDED', 'EXPIRED', 'CANCELLED');
CREATE TYPE "EmployeeBenefitAssignmentSource" AS ENUM ('POLICY', 'MANUAL', 'HIRING', 'PROMOTION');

CREATE TABLE "BenefitPolicy" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "benefitType" "BenefitType" NOT NULL,
  "valueType" "BenefitValueType" NOT NULL,
  "fixedAmount" DECIMAL(12,2),
  "percentage" DECIMAL(7,4),
  "currencyCode" TEXT,
  "payrollCategory" "PayrollRunLineItemCategory",
  "payrollVisible" BOOLEAN NOT NULL DEFAULT false,
  "affectsGrossPay" BOOLEAN NOT NULL DEFAULT false,
  "affectsNetPay" BOOLEAN NOT NULL DEFAULT false,
  "taxable" BOOLEAN NOT NULL DEFAULT false,
  "payslipVisible" BOOLEAN NOT NULL DEFAULT true,
  "employeeVisible" BOOLEAN NOT NULL DEFAULT true,
  "sensitive" BOOLEAN NOT NULL DEFAULT false,
  "requiredForPayroll" BOOLEAN NOT NULL DEFAULT false,
  "defaultBalance" DECIMAL(12,2),
  "renewalPeriod" "BenefitRenewalPeriod" NOT NULL DEFAULT 'NONE',
  "renewalIntervalMonths" INTEGER,
  "expiresAfterMonths" INTEGER,
  "effectiveFrom" TIMESTAMP(3) NOT NULL,
  "effectiveTo" TIMESTAMP(3),
  "organizationId" TEXT,
  "countryCode" TEXT,
  "businessUnitId" TEXT,
  "departmentId" TEXT,
  "locationId" TEXT,
  "employeeLevelId" TEXT,
  "employeeType" "EmployeeType",
  "requiresProbationCompletion" BOOLEAN NOT NULL DEFAULT false,
  "autoAssignOnHire" BOOLEAN NOT NULL DEFAULT false,
  "autoAssignOnPromotion" BOOLEAN NOT NULL DEFAULT false,
  "requiresAssignmentApproval" BOOLEAN NOT NULL DEFAULT false,
  "requiresChangeApproval" BOOLEAN NOT NULL DEFAULT false,
  "eligibilityRules" JSONB,
  "status" "BenefitPolicyStatus" NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "createdById" TEXT,
  "updatedById" TEXT,
  CONSTRAINT "BenefitPolicy_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "BenefitPolicy_value_check" CHECK (("valueType" = 'FIXED_AMOUNT' AND "fixedAmount" IS NOT NULL AND "percentage" IS NULL) OR ("valueType" = 'PERCENTAGE' AND "percentage" IS NOT NULL AND "fixedAmount" IS NULL)),
  CONSTRAINT "BenefitPolicy_effective_range_check" CHECK ("effectiveTo" IS NULL OR "effectiveTo" >= "effectiveFrom"),
  CONSTRAINT "BenefitPolicy_payroll_category_check" CHECK (NOT "payrollVisible" OR "payrollCategory" IS NOT NULL)
);

CREATE TABLE "EmployeeBenefitAssignment" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "benefitPolicyId" TEXT NOT NULL,
  "approvalRequestId" TEXT,
  "pendingAction" TEXT,
  "pendingPayload" JSONB,
  "status" "EmployeeBenefitStatus" NOT NULL DEFAULT 'ACTIVE',
  "assignmentSource" "EmployeeBenefitAssignmentSource" NOT NULL DEFAULT 'POLICY',
  "isManualOverride" BOOLEAN NOT NULL DEFAULT false,
  "fixedAmountOverride" DECIMAL(12,2),
  "percentageOverride" DECIMAL(7,4),
  "currencyCodeOverride" TEXT,
  "effectiveFrom" TIMESTAMP(3) NOT NULL,
  "effectiveTo" TIMESTAMP(3),
  "renewalDate" TIMESTAMP(3),
  "expiryDate" TIMESTAMP(3),
  "allocatedBalance" DECIMAL(12,2),
  "consumedBalance" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "createdById" TEXT,
  "updatedById" TEXT,
  CONSTRAINT "EmployeeBenefitAssignment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "EmployeeBenefitAssignment_effective_range_check" CHECK ("effectiveTo" IS NULL OR "effectiveTo" >= "effectiveFrom"),
  CONSTRAINT "EmployeeBenefitAssignment_balance_check" CHECK ("consumedBalance" >= 0 AND ("allocatedBalance" IS NULL OR "consumedBalance" <= "allocatedBalance"))
);

CREATE TABLE "BenefitConsumption" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "employeeBenefitAssignmentId" TEXT NOT NULL,
  "amount" DECIMAL(12,2) NOT NULL,
  "consumedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "sourceType" TEXT,
  "sourceId" TEXT,
  "notes" TEXT,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BenefitConsumption_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "BenefitConsumption_amount_check" CHECK ("amount" > 0)
);

CREATE UNIQUE INDEX "BenefitPolicy_tenantId_code_key" ON "BenefitPolicy"("tenantId", "code");
CREATE INDEX "BenefitPolicy_tenantId_status_effectiveFrom_effectiveTo_idx" ON "BenefitPolicy"("tenantId", "status", "effectiveFrom", "effectiveTo");
CREATE INDEX "BenefitPolicy_tenantId_organizationId_businessUnitId_idx" ON "BenefitPolicy"("tenantId", "organizationId", "businessUnitId");
CREATE INDEX "BenefitPolicy_tenantId_departmentId_locationId_employeeLevelId_idx" ON "BenefitPolicy"("tenantId", "departmentId", "locationId", "employeeLevelId");
CREATE INDEX "BenefitPolicy_tenantId_countryCode_employeeType_idx" ON "BenefitPolicy"("tenantId", "countryCode", "employeeType");
CREATE UNIQUE INDEX "EmployeeBenefitAssignment_employeeId_benefitPolicyId_effectiveFrom_key" ON "EmployeeBenefitAssignment"("employeeId", "benefitPolicyId", "effectiveFrom");
CREATE INDEX "EmployeeBenefitAssignment_tenantId_employeeId_status_idx" ON "EmployeeBenefitAssignment"("tenantId", "employeeId", "status");
CREATE INDEX "EmployeeBenefitAssignment_tenantId_benefitPolicyId_status_idx" ON "EmployeeBenefitAssignment"("tenantId", "benefitPolicyId", "status");
CREATE INDEX "EmployeeBenefitAssignment_tenantId_effectiveFrom_effectiveTo_idx" ON "EmployeeBenefitAssignment"("tenantId", "effectiveFrom", "effectiveTo");
CREATE INDEX "EmployeeBenefitAssignment_tenantId_expiryDate_renewalDate_idx" ON "EmployeeBenefitAssignment"("tenantId", "expiryDate", "renewalDate");
CREATE INDEX "BenefitConsumption_tenantId_employeeBenefitAssignmentId_consumedAt_idx" ON "BenefitConsumption"("tenantId", "employeeBenefitAssignmentId", "consumedAt");
CREATE INDEX "BenefitConsumption_tenantId_sourceType_sourceId_idx" ON "BenefitConsumption"("tenantId", "sourceType", "sourceId");

ALTER TABLE "BenefitPolicy" ADD CONSTRAINT "BenefitPolicy_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BenefitPolicy" ADD CONSTRAINT "BenefitPolicy_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BenefitPolicy" ADD CONSTRAINT "BenefitPolicy_businessUnitId_fkey" FOREIGN KEY ("businessUnitId") REFERENCES "BusinessUnit"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BenefitPolicy" ADD CONSTRAINT "BenefitPolicy_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BenefitPolicy" ADD CONSTRAINT "BenefitPolicy_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BenefitPolicy" ADD CONSTRAINT "BenefitPolicy_employeeLevelId_fkey" FOREIGN KEY ("employeeLevelId") REFERENCES "EmployeeLevel"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EmployeeBenefitAssignment" ADD CONSTRAINT "EmployeeBenefitAssignment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmployeeBenefitAssignment" ADD CONSTRAINT "EmployeeBenefitAssignment_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmployeeBenefitAssignment" ADD CONSTRAINT "EmployeeBenefitAssignment_benefitPolicyId_fkey" FOREIGN KEY ("benefitPolicyId") REFERENCES "BenefitPolicy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EmployeeBenefitAssignment" ADD CONSTRAINT "EmployeeBenefitAssignment_approvalRequestId_fkey" FOREIGN KEY ("approvalRequestId") REFERENCES "ApprovalRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BenefitConsumption" ADD CONSTRAINT "BenefitConsumption_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BenefitConsumption" ADD CONSTRAINT "BenefitConsumption_employeeBenefitAssignmentId_fkey" FOREIGN KEY ("employeeBenefitAssignmentId") REFERENCES "EmployeeBenefitAssignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
