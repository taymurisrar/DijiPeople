ALTER TABLE "ApprovalMatrix"
  ADD COLUMN "currencyCode" TEXT;

CREATE INDEX "ApprovalMatrix_tenantId_moduleKey_currencyCode_isActive_idx"
  ON "ApprovalMatrix"("tenantId", "moduleKey", "currencyCode", "isActive");
