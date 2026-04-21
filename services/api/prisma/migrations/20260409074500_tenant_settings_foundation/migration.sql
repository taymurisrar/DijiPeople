-- CreateTable
CREATE TABLE "TenantSetting" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,

    CONSTRAINT "TenantSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TenantFeature" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,

    CONSTRAINT "TenantFeature_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TenantSetting_tenantId_idx" ON "TenantSetting"("tenantId");

-- CreateIndex
CREATE INDEX "TenantSetting_tenantId_category_idx" ON "TenantSetting"("tenantId", "category");

-- CreateIndex
CREATE UNIQUE INDEX "TenantSetting_tenantId_category_key_key" ON "TenantSetting"("tenantId", "category", "key");

-- CreateIndex
CREATE INDEX "TenantFeature_tenantId_idx" ON "TenantFeature"("tenantId");

-- CreateIndex
CREATE INDEX "TenantFeature_tenantId_isEnabled_idx" ON "TenantFeature"("tenantId", "isEnabled");

-- CreateIndex
CREATE UNIQUE INDEX "TenantFeature_tenantId_key_key" ON "TenantFeature"("tenantId", "key");

-- AddForeignKey
ALTER TABLE "TenantSetting" ADD CONSTRAINT "TenantSetting_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantFeature" ADD CONSTRAINT "TenantFeature_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

