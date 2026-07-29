-- Effective-dated, tenant-isolated employee tax profiles.
CREATE UNIQUE INDEX IF NOT EXISTS "Employee_id_tenantId_key"
  ON "Employee"("id", "tenantId");

CREATE TABLE IF NOT EXISTS "EmployeeTaxProfile" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "taxIdentificationNumber" TEXT,
  "taxResidencyCountryCode" TEXT,
  "workTaxJurisdiction" TEXT,
  "taxStatus" TEXT,
  "taxCategory" TEXT,
  "filingStatus" TEXT,
  "dependentAllowances" INTEGER NOT NULL DEFAULT 0,
  "taxRuleId" TEXT,
  "additionalTaxAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "taxExemptionAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "taxCreditAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "previousEmployerTaxableIncome" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "previousEmployerTaxDeducted" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "jurisdictionExtensions" JSONB,
  "effectiveFrom" TIMESTAMP(3) NOT NULL,
  "effectiveTo" TIMESTAMP(3),
  "overrideReason" TEXT,
  "status" "ConfigurationStatus" NOT NULL DEFAULT 'ACTIVE',
  "ownerUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "createdById" TEXT,
  "updatedById" TEXT,
  CONSTRAINT "EmployeeTaxProfile_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "EmployeeTaxProfile_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "EmployeeTaxProfile_employeeId_tenantId_fkey"
    FOREIGN KEY ("employeeId", "tenantId") REFERENCES "Employee"("id", "tenantId")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "EmployeeTaxProfile_taxRuleId_tenantId_fkey"
    FOREIGN KEY ("taxRuleId", "tenantId") REFERENCES "TaxRule"("id", "tenantId")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "EmployeeTaxProfile_id_tenantId_key"
  ON "EmployeeTaxProfile"("id", "tenantId");
CREATE UNIQUE INDEX IF NOT EXISTS "EmployeeTaxProfile_tenantId_employeeId_effectiveFrom_key"
  ON "EmployeeTaxProfile"("tenantId", "employeeId", "effectiveFrom");
CREATE INDEX IF NOT EXISTS "EmployeeTaxProfile_tenantId_employeeId_status_effectiveFrom_effectiveTo_idx"
  ON "EmployeeTaxProfile"("tenantId", "employeeId", "status", "effectiveFrom", "effectiveTo");
CREATE INDEX IF NOT EXISTS "EmployeeTaxProfile_tenantId_taxRuleId_idx"
  ON "EmployeeTaxProfile"("tenantId", "taxRuleId");
CREATE INDEX IF NOT EXISTS "EmployeeTaxProfile_tenantId_ownerUserId_idx"
  ON "EmployeeTaxProfile"("tenantId", "ownerUserId");
