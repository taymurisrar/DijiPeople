CREATE TYPE "CustomizationSolutionScope" AS ENUM ('tenant', 'platform');
CREATE TYPE "CustomizationSolutionComponentType" AS ENUM ('table', 'column', 'form', 'view', 'optionSet', 'lookup');

CREATE TABLE "CustomizationSolution" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT,
  "solutionKey" TEXT NOT NULL,
  "displayName" TEXT NOT NULL,
  "description" TEXT,
  "scope" "CustomizationSolutionScope" NOT NULL DEFAULT 'tenant',
  "isDefault" BOOLEAN NOT NULL DEFAULT false,
  "isSystem" BOOLEAN NOT NULL DEFAULT false,
  "isManaged" BOOLEAN NOT NULL DEFAULT false,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdByUserId" TEXT,
  "updatedByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CustomizationSolution_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CustomizationSolutionComponent" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT,
  "solutionId" TEXT NOT NULL,
  "componentType" "CustomizationSolutionComponentType" NOT NULL,
  "objectId" TEXT NOT NULL,
  "objectKey" TEXT NOT NULL,
  "tableId" TEXT,
  "isSystem" BOOLEAN NOT NULL DEFAULT false,
  "isCustom" BOOLEAN NOT NULL DEFAULT true,
  "isManaged" BOOLEAN NOT NULL DEFAULT false,
  "createdByUserId" TEXT,
  "updatedByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CustomizationSolutionComponent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CustomizationSolution_tenantId_solutionKey_key"
ON "CustomizationSolution"("tenantId", "solutionKey");

CREATE INDEX "CustomizationSolution_tenantId_isDefault_idx"
ON "CustomizationSolution"("tenantId", "isDefault");

CREATE INDEX "CustomizationSolution_scope_solutionKey_idx"
ON "CustomizationSolution"("scope", "solutionKey");

CREATE UNIQUE INDEX "CustomizationSolutionComponent_solutionId_componentType_objectId_key"
ON "CustomizationSolutionComponent"("solutionId", "componentType", "objectId");

CREATE INDEX "CustomizationSolutionComponent_tenantId_componentType_idx"
ON "CustomizationSolutionComponent"("tenantId", "componentType");

CREATE INDEX "CustomizationSolutionComponent_solutionId_componentType_idx"
ON "CustomizationSolutionComponent"("solutionId", "componentType");

CREATE INDEX "CustomizationSolutionComponent_tableId_idx"
ON "CustomizationSolutionComponent"("tableId");

ALTER TABLE "CustomizationSolution"
ADD CONSTRAINT "CustomizationSolution_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CustomizationSolutionComponent"
ADD CONSTRAINT "CustomizationSolutionComponent_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CustomizationSolutionComponent"
ADD CONSTRAINT "CustomizationSolutionComponent_solutionId_fkey"
FOREIGN KEY ("solutionId") REFERENCES "CustomizationSolution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CustomizationSolutionComponent"
ADD CONSTRAINT "CustomizationSolutionComponent_tableId_fkey"
FOREIGN KEY ("tableId") REFERENCES "CustomizationTable"("id") ON DELETE CASCADE ON UPDATE CASCADE;
