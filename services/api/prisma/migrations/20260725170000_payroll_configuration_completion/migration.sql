ALTER TYPE "ConfigurationStatus" ADD VALUE IF NOT EXISTS 'EXPIRED';
ALTER TYPE "BenefitType" ADD VALUE IF NOT EXISTS 'MEDICAL';
ALTER TYPE "BenefitType" ADD VALUE IF NOT EXISTS 'DENTAL';
ALTER TYPE "BenefitType" ADD VALUE IF NOT EXISTS 'LIFE';
ALTER TYPE "BenefitType" ADD VALUE IF NOT EXISTS 'DISABILITY';
ALTER TYPE "BenefitType" ADD VALUE IF NOT EXISTS 'RETIREMENT';
ALTER TYPE "BenefitType" ADD VALUE IF NOT EXISTS 'MEAL';
ALTER TYPE "BenefitType" ADD VALUE IF NOT EXISTS 'TRANSPORT';
ALTER TYPE "BenefitType" ADD VALUE IF NOT EXISTS 'WELLNESS';
ALTER TYPE "BenefitType" ADD VALUE IF NOT EXISTS 'INSURANCE';
ALTER TYPE "BenefitType" ADD VALUE IF NOT EXISTS 'OTHER';
ALTER TYPE "BenefitPolicyStatus" ADD VALUE IF NOT EXISTS 'DRAFT';
ALTER TYPE "BenefitPolicyStatus" ADD VALUE IF NOT EXISTS 'EXPIRED';
ALTER TYPE "BenefitPolicyStatus" ADD VALUE IF NOT EXISTS 'ARCHIVED';
ALTER TYPE "TaxCalculationMethod" ADD VALUE IF NOT EXISTS 'FORMULA';
ALTER TYPE "TaxCalculationMethod" ADD VALUE IF NOT EXISTS 'ZERO';
ALTER TYPE "TaxCalculationMethod" ADD VALUE IF NOT EXISTS 'EXTERNAL';

ALTER TABLE "BenefitPolicy"
  ADD COLUMN "provider" TEXT,
  ADD COLUMN "legalEntityId" TEXT,
  ADD COLUMN "ownerUserId" TEXT,
  ADD COLUMN "isDefault" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "employeePayComponentId" TEXT,
  ADD COLUMN "employerPayComponentId" TEXT,
  ADD COLUMN "postingCategory" TEXT,
  ADD COLUMN "minimumServiceMonths" INTEGER,
  ADD COLUMN "employeeContributionMethod" TEXT NOT NULL DEFAULT 'FIXED_AMOUNT',
  ADD COLUMN "employeeContributionAmount" DECIMAL(12,2),
  ADD COLUMN "employeeContributionPercent" DECIMAL(7,4),
  ADD COLUMN "employerContributionMethod" TEXT NOT NULL DEFAULT 'FIXED_AMOUNT',
  ADD COLUMN "employerContributionAmount" DECIMAL(12,2),
  ADD COLUMN "employerContributionPercent" DECIMAL(7,4),
  ADD COLUMN "basePayComponentId" TEXT,
  ADD COLUMN "contributionMinimum" DECIMAL(12,2),
  ADD COLUMN "contributionMaximum" DECIMAL(12,2),
  ADD COLUMN "contributionFrequency" TEXT NOT NULL DEFAULT 'MONTHLY',
  ADD COLUMN "taxTreatment" TEXT NOT NULL DEFAULT 'TAXABLE',
  ADD COLUMN "includeInEmployerCost" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "prorationMethod" TEXT NOT NULL DEFAULT 'NONE',
  ADD COLUMN "arrearsHandling" TEXT NOT NULL DEFAULT 'CARRY_FORWARD',
  ADD COLUMN "enrollmentMethod" TEXT NOT NULL DEFAULT 'HR_ASSIGNED',
  ADD COLUMN "waitingPeriodDays" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "enrollmentWindowDays" INTEGER,
  ADD COLUMN "dependentCoverage" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "configuration" JSONB,
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "LoanPolicy"
  ADD COLUMN "loanType" TEXT NOT NULL DEFAULT 'PERSONAL_LOAN',
  ADD COLUMN "organizationId" TEXT,
  ADD COLUMN "legalEntityId" TEXT,
  ADD COLUMN "ownerUserId" TEXT,
  ADD COLUMN "status" "ConfigurationStatus" NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN "effectiveFrom" TIMESTAMP(3),
  ADD COLUMN "effectiveTo" TIMESTAMP(3),
  ADD COLUMN "isDefault" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "interestMethod" TEXT NOT NULL DEFAULT 'NO_INTEREST',
  ADD COLUMN "minimumServiceMonths" INTEGER,
  ADD COLUMN "minimumSalary" DECIMAL(12,2),
  ADD COLUMN "maximumActiveLoans" INTEGER,
  ADD COLUMN "probationCompleted" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "maximumSalaryMultiple" DECIMAL(7,2),
  ADD COLUMN "processingFee" DECIMAL(12,2),
  ADD COLUMN "insuranceFee" DECIMAL(12,2),
  ADD COLUMN "gracePeriodDays" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "repaymentFrequency" TEXT NOT NULL DEFAULT 'MONTHLY',
  ADD COLUMN "installmentMethod" TEXT NOT NULL DEFAULT 'EQUAL_INSTALLMENTS',
  ADD COLUMN "fixedInstallment" DECIMAL(12,2),
  ADD COLUMN "percentageOfSalary" DECIMAL(7,4),
  ADD COLUMN "maximumDeductionPercent" DECIMAL(7,4),
  ADD COLUMN "skipPayrollAllowed" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "settlementFee" DECIMAL(12,2),
  ADD COLUMN "arrearsHandling" TEXT NOT NULL DEFAULT 'CARRY_FORWARD',
  ADD COLUMN "finalSettlementHandling" TEXT NOT NULL DEFAULT 'DEDUCT_BALANCE',
  ADD COLUMN "payslipVisible" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "negativeNetPayHandling" TEXT NOT NULL DEFAULT 'BLOCK',
  ADD COLUMN "approvalRequired" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "approvalWorkflowId" TEXT,
  ADD COLUMN "minimumApprovers" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "supportingDocumentRequired" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "deductionPayComponentId" TEXT,
  ADD COLUMN "interestPayComponentId" TEXT,
  ADD COLUMN "feePayComponentId" TEXT,
  ADD COLUMN "postingCategory" TEXT,
  ADD COLUMN "eligibilityRules" JSONB,
  ADD COLUMN "configuration" JSONB,
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "createdById" TEXT,
  ADD COLUMN "updatedById" TEXT;

ALTER TABLE "PayrollGlAccount"
  ADD COLUMN "organizationId" TEXT,
  ADD COLUMN "legalEntityId" TEXT,
  ADD COLUMN "accountSubtype" TEXT,
  ADD COLUMN "reconciliationRequired" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "requireBusinessUnitDimension" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "requireDepartmentDimension" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "requireCostCenterDimension" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "requireProjectDimension" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "requireEmployeeDimension" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "requireLocationDimension" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "requireLegalEntityDimension" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "externalSystem" TEXT,
  ADD COLUMN "externalAccountCode" TEXT,
  ADD COLUMN "erpCompanyCode" TEXT,
  ADD COLUMN "erpLedgerCode" TEXT,
  ADD COLUMN "erpAccountId" TEXT,
  ADD COLUMN "effectiveFrom" TIMESTAMP(3),
  ADD COLUMN "effectiveTo" TIMESTAMP(3),
  ADD COLUMN "status" "ConfigurationStatus" NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN "ownerUserId" TEXT,
  ADD COLUMN "configuration" JSONB,
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "createdById" TEXT,
  ADD COLUMN "updatedById" TEXT;

ALTER TABLE "PayrollPostingRule"
  ADD COLUMN "code" TEXT,
  ADD COLUMN "organizationId" TEXT,
  ADD COLUMN "legalEntityId" TEXT,
  ADD COLUMN "ownerUserId" TEXT,
  ADD COLUMN "status" "ConfigurationStatus" NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN "priority" INTEGER NOT NULL DEFAULT 100,
  ADD COLUMN "isDefault" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "postingEvent" TEXT NOT NULL DEFAULT 'PAYROLL_ACCRUAL',
  ADD COLUMN "payrollRegionId" TEXT,
  ADD COLUMN "costCenterId" TEXT,
  ADD COLUMN "employmentTypeId" TEXT,
  ADD COLUMN "debitBusinessUnitSource" TEXT,
  ADD COLUMN "creditBusinessUnitSource" TEXT,
  ADD COLUMN "debitDepartmentSource" TEXT,
  ADD COLUMN "creditDepartmentSource" TEXT,
  ADD COLUMN "debitCostCenterSource" TEXT,
  ADD COLUMN "creditCostCenterSource" TEXT,
  ADD COLUMN "debitProjectSource" TEXT,
  ADD COLUMN "creditProjectSource" TEXT,
  ADD COLUMN "debitEmployeeSource" TEXT,
  ADD COLUMN "creditEmployeeSource" TEXT,
  ADD COLUMN "consolidationMode" TEXT NOT NULL DEFAULT 'BY_ACCOUNT_AND_DIMENSIONS',
  ADD COLUMN "descriptionTemplate" TEXT,
  ADD COLUMN "journalReferenceTemplate" TEXT,
  ADD COLUMN "allowZeroPosting" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "reversalRule" TEXT NOT NULL DEFAULT 'REVERSE_ORIGINAL',
  ADD COLUMN "employeeLevelEntry" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "componentLevelEntry" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "departmentLevelEntry" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "configuration" JSONB,
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "createdById" TEXT,
  ADD COLUMN "updatedById" TEXT;

UPDATE "PayrollPostingRule"
SET "code" = 'POST-' || UPPER(SUBSTRING(REPLACE("id", '-', '') FROM 1 FOR 12))
WHERE "code" IS NULL;
ALTER TABLE "PayrollPostingRule" ALTER COLUMN "code" SET NOT NULL;
CREATE UNIQUE INDEX "PayrollPostingRule_tenantId_code_key" ON "PayrollPostingRule"("tenantId", "code");

ALTER TABLE "TaxRule"
  ADD COLUMN "organizationId" TEXT,
  ADD COLUMN "legalEntityId" TEXT,
  ADD COLUMN "payrollRegionId" TEXT,
  ADD COLUMN "taxAuthority" TEXT,
  ADD COLUMN "calculationStrategy" TEXT NOT NULL DEFAULT 'PERIODIC',
  ADD COLUMN "taxYearStart" TIMESTAMP(3),
  ADD COLUMN "taxYearEnd" TIMESTAMP(3),
  ADD COLUMN "status" "ConfigurationStatus" NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN "ownerUserId" TEXT,
  ADD COLUMN "isDefault" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "priority" INTEGER NOT NULL DEFAULT 100,
  ADD COLUMN "formulaExpression" TEXT,
  ADD COLUMN "employeeTaxComponentId" TEXT,
  ADD COLUMN "employerTaxComponentId" TEXT,
  ADD COLUMN "postingCategory" TEXT,
  ADD COLUMN "taxStatementTemplateId" TEXT,
  ADD COLUMN "applicabilityRules" JSONB,
  ADD COLUMN "configuration" JSONB,
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "createdById" TEXT,
  ADD COLUMN "updatedById" TEXT;

ALTER TABLE "TaxRuleBracket"
  ADD COLUMN "sequence" INTEGER NOT NULL DEFAULT 10,
  ADD COLUMN "excessOver" DECIMAL(12,2),
  ADD COLUMN "minimumTax" DECIMAL(12,2),
  ADD COLUMN "maximumTax" DECIMAL(12,2),
  ADD COLUMN "effectiveFrom" TIMESTAMP(3),
  ADD COLUMN "effectiveTo" TIMESTAMP(3),
  ADD COLUMN "status" "ConfigurationStatus" NOT NULL DEFAULT 'ACTIVE';

ALTER TABLE "SalaryPackageRule"
  ADD COLUMN "legalEntityId" TEXT,
  ADD COLUMN "payFrequency" "CompensationPayFrequency" NOT NULL DEFAULT 'MONTHLY',
  ADD COLUMN "autoAssign" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "allowEmployeeOverride" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "overrideRequiresApproval" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "configuration" JSONB,
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "SalaryPackageRuleComponent"
  ADD COLUMN "effectiveFrom" TIMESTAMP(3),
  ADD COLUMN "effectiveTo" TIMESTAMP(3),
  ADD COLUMN "status" "ConfigurationStatus" NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;

CREATE INDEX "TaxRule_tenantId_status_isDefault_idx" ON "TaxRule"("tenantId", "status", "isDefault");
CREATE INDEX "PayrollGlAccount_tenantId_status_idx" ON "PayrollGlAccount"("tenantId", "status");
CREATE INDEX "PayrollPostingRule_tenantId_status_priority_idx" ON "PayrollPostingRule"("tenantId", "status", "priority");
CREATE INDEX "LoanPolicy_tenantId_status_idx" ON "LoanPolicy"("tenantId", "status");

ALTER TABLE "PayrollJournalEntryLine" ADD COLUMN "dimensions" JSONB;
