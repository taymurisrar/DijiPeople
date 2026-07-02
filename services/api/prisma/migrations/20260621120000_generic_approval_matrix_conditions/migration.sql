ALTER TABLE "ApprovalMatrix"
  ADD COLUMN "recordType" TEXT,
  ADD COLUMN "claimTypeId" TEXT,
  ADD COLUMN "loanPolicyId" TEXT,
  ADD COLUMN "organizationId" TEXT,
  ADD COLUMN "businessUnitId" TEXT,
  ADD COLUMN "departmentId" TEXT,
  ADD COLUMN "employeeLevelId" TEXT,
  ADD COLUMN "minimumAmount" DECIMAL(18,2),
  ADD COLUMN "maximumAmount" DECIMAL(18,2),
  ADD COLUMN "minimumDuration" DECIMAL(10,2),
  ADD COLUMN "maximumDuration" DECIMAL(10,2),
  ADD COLUMN "effectiveFrom" TIMESTAMP(3),
  ADD COLUMN "effectiveTo" TIMESTAMP(3),
  ADD COLUMN "conditions" JSONB;

CREATE INDEX "ApprovalMatrix_tenantId_moduleKey_recordType_isActive_idx"
  ON "ApprovalMatrix"("tenantId", "moduleKey", "recordType", "isActive");
CREATE INDEX "ApprovalMatrix_tenantId_organizationId_businessUnitId_idx"
  ON "ApprovalMatrix"("tenantId", "organizationId", "businessUnitId");
CREATE INDEX "ApprovalMatrix_tenantId_departmentId_employeeLevelId_idx"
  ON "ApprovalMatrix"("tenantId", "departmentId", "employeeLevelId");
CREATE INDEX "ApprovalMatrix_tenantId_claimTypeId_loanPolicyId_idx"
  ON "ApprovalMatrix"("tenantId", "claimTypeId", "loanPolicyId");

ALTER TABLE "ApprovalMatrix"
  ADD CONSTRAINT "ApprovalMatrix_amount_range_check"
  CHECK ("minimumAmount" IS NULL OR "maximumAmount" IS NULL OR "minimumAmount" <= "maximumAmount"),
  ADD CONSTRAINT "ApprovalMatrix_duration_range_check"
  CHECK ("minimumDuration" IS NULL OR "maximumDuration" IS NULL OR "minimumDuration" <= "maximumDuration"),
  ADD CONSTRAINT "ApprovalMatrix_effective_range_check"
  CHECK ("effectiveFrom" IS NULL OR "effectiveTo" IS NULL OR "effectiveFrom" <= "effectiveTo");

ALTER TABLE "ApprovalMatrix"
  ADD CONSTRAINT "ApprovalMatrix_claimTypeId_fkey"
  FOREIGN KEY ("claimTypeId") REFERENCES "ClaimType"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "ApprovalMatrix_loanPolicyId_fkey"
  FOREIGN KEY ("loanPolicyId") REFERENCES "LoanPolicy"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "ApprovalMatrix_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "ApprovalMatrix_businessUnitId_fkey"
  FOREIGN KEY ("businessUnitId") REFERENCES "BusinessUnit"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "ApprovalMatrix_departmentId_fkey"
  FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "ApprovalMatrix_employeeLevelId_fkey"
  FOREIGN KEY ("employeeLevelId") REFERENCES "EmployeeLevel"("id") ON DELETE SET NULL ON UPDATE CASCADE;
