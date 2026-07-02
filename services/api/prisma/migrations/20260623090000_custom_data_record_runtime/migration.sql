CREATE TABLE "CustomDataRecord" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "tableId" TEXT NOT NULL,
    "values" JSONB NOT NULL,
    "organizationId" TEXT,
    "businessUnitId" TEXT,
    "ownerUserId" TEXT,
    "ownerTeamId" TEXT,
    "createdById" TEXT,
    "updatedById" TEXT,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CustomDataRecord_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CustomDataRecord_tenantId_tableId_isDeleted_idx" ON "CustomDataRecord"("tenantId", "tableId", "isDeleted");
CREATE INDEX "CustomDataRecord_tenantId_businessUnitId_isDeleted_idx" ON "CustomDataRecord"("tenantId", "businessUnitId", "isDeleted");
CREATE INDEX "CustomDataRecord_tenantId_organizationId_isDeleted_idx" ON "CustomDataRecord"("tenantId", "organizationId", "isDeleted");
CREATE INDEX "CustomDataRecord_tenantId_ownerUserId_isDeleted_idx" ON "CustomDataRecord"("tenantId", "ownerUserId", "isDeleted");
CREATE INDEX "CustomDataRecord_tenantId_ownerTeamId_isDeleted_idx" ON "CustomDataRecord"("tenantId", "ownerTeamId", "isDeleted");
ALTER TABLE "CustomDataRecord" ADD CONSTRAINT "CustomDataRecord_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CustomDataRecord" ADD CONSTRAINT "CustomDataRecord_tableId_fkey" FOREIGN KEY ("tableId") REFERENCES "CustomizationTable"("id") ON DELETE CASCADE ON UPDATE CASCADE;
