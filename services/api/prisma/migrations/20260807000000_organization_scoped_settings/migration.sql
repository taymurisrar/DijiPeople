-- Organization-scoped overrides for tenant settings.
-- Tenant rows remain the base; a row here overrides one (category, key) pair
-- for a single organization so one tenant can run several brandings.

-- CreateTable
CREATE TABLE "OrganizationSetting" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,

    CONSTRAINT "OrganizationSetting_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OrganizationSetting_tenantId_idx" ON "OrganizationSetting"("tenantId");

-- CreateIndex
CREATE INDEX "OrganizationSetting_tenantId_organizationId_idx" ON "OrganizationSetting"("tenantId", "organizationId");

-- CreateIndex
CREATE INDEX "OrganizationSetting_tenantId_organizationId_category_idx" ON "OrganizationSetting"("tenantId", "organizationId", "category");

-- CreateIndex
CREATE UNIQUE INDEX "OrganizationSetting_tenantId_organizationId_category_key_key" ON "OrganizationSetting"("tenantId", "organizationId", "category", "key");

-- AddForeignKey
ALTER TABLE "OrganizationSetting" ADD CONSTRAINT "OrganizationSetting_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationSetting" ADD CONSTRAINT "OrganizationSetting_organizationId_tenantId_fkey" FOREIGN KEY ("organizationId", "tenantId") REFERENCES "Organization"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;
