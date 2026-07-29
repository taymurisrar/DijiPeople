-- Payroll calculation inputs, manual adjustments, locked exchange rates, and exception workflow.

CREATE TYPE "PayrollAdjustmentStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED');

ALTER TABLE "PayrollRunEmployee"
  ADD COLUMN "reportingCurrencyCode" TEXT,
  ADD COLUMN "exchangeRate" DECIMAL(18,8),
  ADD COLUMN "grossEarningsReporting" DECIMAL(14,2),
  ADD COLUMN "totalDeductionsReporting" DECIMAL(14,2),
  ADD COLUMN "totalTaxesReporting" DECIMAL(14,2),
  ADD COLUMN "totalReimbursementsReporting" DECIMAL(14,2),
  ADD COLUMN "employerContributionsReporting" DECIMAL(14,2),
  ADD COLUMN "netPayReporting" DECIMAL(14,2);

ALTER TABLE "PayrollRunLineItem"
  ADD COLUMN "reportingAmount" DECIMAL(14,2),
  ADD COLUMN "reportingCurrency" TEXT,
  ADD COLUMN "exchangeRate" DECIMAL(18,8);

ALTER TABLE "PayrollException"
  ADD COLUMN "acknowledgedAt" TIMESTAMP(3),
  ADD COLUMN "acknowledgedBy" TEXT,
  ADD COLUMN "resolutionNote" TEXT;

CREATE TABLE "PayrollExchangeRateLock" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "payrollRunId" TEXT NOT NULL,
  "fromCurrency" TEXT NOT NULL,
  "toCurrency" TEXT NOT NULL,
  "rate" DECIMAL(18,8) NOT NULL,
  "effectiveDate" TIMESTAMP(3) NOT NULL,
  "source" TEXT,
  "provider" TEXT,
  "fetchedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "PayrollExchangeRateLock_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PayrollAdjustment" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "payrollRunId" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "payComponentId" TEXT,
  "label" TEXT NOT NULL,
  "amount" DECIMAL(12,2) NOT NULL,
  "currencyCode" TEXT NOT NULL,
  "category" "PayrollRunLineItemCategory" NOT NULL DEFAULT 'ADJUSTMENT',
  "reason" TEXT,
  "status" "PayrollAdjustmentStatus" NOT NULL DEFAULT 'DRAFT',
  "submittedAt" TIMESTAMP(3),
  "submittedBy" TEXT,
  "approvedAt" TIMESTAMP(3),
  "approvedBy" TEXT,
  "rejectedAt" TIMESTAMP(3),
  "rejectedBy" TEXT,
  "rejectionReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "createdBy" TEXT,
  "updatedBy" TEXT,

  CONSTRAINT "PayrollAdjustment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PayrollExchangeRateLock_payrollRunId_fromCurrency_toCurrency_key"
  ON "PayrollExchangeRateLock"("payrollRunId", "fromCurrency", "toCurrency");
CREATE INDEX "PayrollExchangeRateLock_tenantId_payrollRunId_idx"
  ON "PayrollExchangeRateLock"("tenantId", "payrollRunId");
CREATE INDEX "PayrollExchangeRateLock_tenantId_fromCurrency_toCurrency_idx"
  ON "PayrollExchangeRateLock"("tenantId", "fromCurrency", "toCurrency");

CREATE INDEX "PayrollAdjustment_tenantId_payrollRunId_idx"
  ON "PayrollAdjustment"("tenantId", "payrollRunId");
CREATE INDEX "PayrollAdjustment_tenantId_employeeId_idx"
  ON "PayrollAdjustment"("tenantId", "employeeId");
CREATE INDEX "PayrollAdjustment_tenantId_status_idx"
  ON "PayrollAdjustment"("tenantId", "status");

ALTER TABLE "PayrollExchangeRateLock"
  ADD CONSTRAINT "PayrollExchangeRateLock_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "PayrollExchangeRateLock_payrollRunId_tenantId_fkey"
    FOREIGN KEY ("payrollRunId", "tenantId") REFERENCES "PayrollRun"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PayrollAdjustment"
  ADD CONSTRAINT "PayrollAdjustment_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "PayrollAdjustment_payrollRunId_tenantId_fkey"
    FOREIGN KEY ("payrollRunId", "tenantId") REFERENCES "PayrollRun"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "PayrollAdjustment_employeeId_fkey"
    FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "PayrollAdjustment_payComponentId_fkey"
    FOREIGN KEY ("payComponentId") REFERENCES "PayComponent"("id") ON DELETE SET NULL ON UPDATE CASCADE;
