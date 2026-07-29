ALTER TABLE "PayComponent"
  ADD COLUMN "organizationId" TEXT,
  ADD COLUMN "legalEntityId" TEXT,
  ADD COLUMN "ownerUserId" TEXT,
  ADD COLUMN "status" "ConfigurationStatus" NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN "isDefault" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "createdById" TEXT,
  ADD COLUMN "updatedById" TEXT;

UPDATE "PayComponent" AS component
SET
  "ownerUserId" = COALESCE(component."ownerUserId", tenant."ownerUserId"),
  "createdById" = COALESCE(component."createdById", tenant."ownerUserId"),
  "updatedById" = COALESCE(component."updatedById", tenant."ownerUserId"),
  "status" = CASE
    WHEN component."isActive" THEN 'ACTIVE'::"ConfigurationStatus"
    ELSE 'INACTIVE'::"ConfigurationStatus"
  END
FROM "Tenant" AS tenant
WHERE tenant."id" = component."tenantId";

CREATE INDEX "PayComponent_tenantId_organizationId_legalEntityId_idx"
  ON "PayComponent"("tenantId", "organizationId", "legalEntityId");
CREATE INDEX "PayComponent_tenantId_ownerUserId_idx"
  ON "PayComponent"("tenantId", "ownerUserId");
CREATE INDEX "PayComponent_tenantId_status_idx"
  ON "PayComponent"("tenantId", "status");
CREATE INDEX "PayComponent_tenantId_isDefault_idx"
  ON "PayComponent"("tenantId", "isDefault");
