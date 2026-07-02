CREATE TABLE "TenantConfigurationRecord" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "settingKey" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "configuration" JSONB,
  "effectiveFrom" TIMESTAMP(3),
  "effectiveTo" TIMESTAMP(3),
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "createdById" TEXT,
  "updatedById" TEXT,
  CONSTRAINT "TenantConfigurationRecord_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TenantConfigurationRecord_tenantId_settingKey_code_key"
  ON "TenantConfigurationRecord"("tenantId", "settingKey", "code");
CREATE INDEX "TenantConfigurationRecord_tenantId_settingKey_isActive_idx"
  ON "TenantConfigurationRecord"("tenantId", "settingKey", "isActive");
CREATE INDEX "TenantConfigurationRecord_tenantId_settingKey_effectiveFrom_effectiveTo_idx"
  ON "TenantConfigurationRecord"("tenantId", "settingKey", "effectiveFrom", "effectiveTo");
ALTER TABLE "TenantConfigurationRecord"
  ADD CONSTRAINT "TenantConfigurationRecord_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
