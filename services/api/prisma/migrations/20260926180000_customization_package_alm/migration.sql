-- TASK-0033 / EXECPLAN-0052 — package ALM: publishers, released versions,
-- package dependencies, import/uninstall operations, environment variables.
-- Additive only: every new column is nullable or defaulted, no data moves.

-- CreateEnum
CREATE TYPE "CustomizationPackageOrigin" AS ENUM ('LOCAL', 'IMPORTED');

-- CreateEnum
CREATE TYPE "CustomizationPackageOperationKind" AS ENUM ('IMPORT', 'UNINSTALL');

-- CreateEnum
CREATE TYPE "CustomizationPackageOperationStatus" AS ENUM ('ANALYZING', 'READY', 'BLOCKED', 'IMPORTING', 'COMPLETED', 'FAILED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "CustomizationEnvironmentVariableType" AS ENUM ('text', 'number', 'boolean', 'url', 'secret');

-- AlterEnum
ALTER TYPE "CustomizationSolutionComponentType" ADD VALUE 'environmentVariable';

-- AlterTable
ALTER TABLE "CustomizationSolution" ADD COLUMN     "installedAt" TIMESTAMP(3),
ADD COLUMN     "installedVersion" TEXT,
ADD COLUMN     "isTenantDefault" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "origin" "CustomizationPackageOrigin" NOT NULL DEFAULT 'LOCAL',
ADD COLUMN     "publisherId" TEXT,
ADD COLUMN     "sourceEnvironmentType" "TenantEnvironmentType",
ADD COLUMN     "version" TEXT NOT NULL DEFAULT '1.0.0';

-- CreateTable
CREATE TABLE "CustomizationPublisher" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "publisherKey" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "description" TEXT,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "createdByUserId" TEXT,
    "updatedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomizationPublisher_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomizationPackageVersion" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "packageId" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "artifactJson" JSONB NOT NULL,
    "checksum" TEXT NOT NULL,
    "componentCount" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "releasedByUserId" TEXT,
    "releasedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomizationPackageVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomizationPackageDependency" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "packageId" TEXT NOT NULL,
    "dependsOnPackageKey" TEXT NOT NULL,
    "dependsOnPublisherKey" TEXT,
    "dependsOnDisplayName" TEXT,
    "minVersion" TEXT NOT NULL,
    "maxVersion" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomizationPackageDependency_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomizationPackageOperation" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "packageId" TEXT,
    "kind" "CustomizationPackageOperationKind" NOT NULL,
    "status" "CustomizationPackageOperationStatus" NOT NULL DEFAULT 'ANALYZING',
    "packageKey" TEXT NOT NULL,
    "packageDisplayName" TEXT NOT NULL,
    "publisherKey" TEXT,
    "version" TEXT NOT NULL,
    "previousVersion" TEXT,
    "artifactChecksum" TEXT,
    "artifactJson" JSONB,
    "planJson" JSONB,
    "resultJson" JSONB,
    "errorJson" JSONB,
    "correlationId" TEXT NOT NULL,
    "createdCount" INTEGER NOT NULL DEFAULT 0,
    "updatedCount" INTEGER NOT NULL DEFAULT 0,
    "unchangedCount" INTEGER NOT NULL DEFAULT 0,
    "skippedCount" INTEGER NOT NULL DEFAULT 0,
    "conflictCount" INTEGER NOT NULL DEFAULT 0,
    "warningCount" INTEGER NOT NULL DEFAULT 0,
    "actorUserId" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomizationPackageOperation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomizationEnvironmentVariable" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "packageId" TEXT,
    "variableKey" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "description" TEXT,
    "type" "CustomizationEnvironmentVariableType" NOT NULL DEFAULT 'text',
    "isRequired" BOOLEAN NOT NULL DEFAULT false,
    "defaultValue" TEXT,
    "createdByUserId" TEXT,
    "updatedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomizationEnvironmentVariable_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomizationEnvironmentVariableValue" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "variableId" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomizationEnvironmentVariableValue_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CustomizationPublisher_tenantId_idx" ON "CustomizationPublisher"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "CustomizationPublisher_tenantId_publisherKey_key" ON "CustomizationPublisher"("tenantId", "publisherKey");

-- CreateIndex
CREATE UNIQUE INDEX "CustomizationPublisher_tenantId_prefix_key" ON "CustomizationPublisher"("tenantId", "prefix");

-- CreateIndex
CREATE INDEX "CustomizationPackageVersion_tenantId_packageId_idx" ON "CustomizationPackageVersion"("tenantId", "packageId");

-- CreateIndex
CREATE UNIQUE INDEX "CustomizationPackageVersion_packageId_version_key" ON "CustomizationPackageVersion"("packageId", "version");

-- CreateIndex
CREATE INDEX "CustomizationPackageDependency_tenantId_dependsOnPackageKey_idx" ON "CustomizationPackageDependency"("tenantId", "dependsOnPackageKey");

-- CreateIndex
CREATE UNIQUE INDEX "CustomizationPackageDependency_packageId_dependsOnPackageKe_key" ON "CustomizationPackageDependency"("packageId", "dependsOnPackageKey");

-- CreateIndex
CREATE INDEX "CustomizationPackageOperation_tenantId_createdAt_idx" ON "CustomizationPackageOperation"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "CustomizationPackageOperation_tenantId_packageKey_idx" ON "CustomizationPackageOperation"("tenantId", "packageKey");

-- CreateIndex
CREATE INDEX "CustomizationPackageOperation_tenantId_status_idx" ON "CustomizationPackageOperation"("tenantId", "status");

-- CreateIndex
CREATE INDEX "CustomizationPackageOperation_packageId_idx" ON "CustomizationPackageOperation"("packageId");

-- CreateIndex
CREATE INDEX "CustomizationEnvironmentVariable_tenantId_packageId_idx" ON "CustomizationEnvironmentVariable"("tenantId", "packageId");

-- CreateIndex
CREATE UNIQUE INDEX "CustomizationEnvironmentVariable_tenantId_variableKey_key" ON "CustomizationEnvironmentVariable"("tenantId", "variableKey");

-- CreateIndex
CREATE INDEX "CustomizationEnvironmentVariableValue_variableId_idx" ON "CustomizationEnvironmentVariableValue"("variableId");

-- CreateIndex
CREATE UNIQUE INDEX "CustomizationEnvironmentVariableValue_tenantId_variableId_key" ON "CustomizationEnvironmentVariableValue"("tenantId", "variableId");

-- CreateIndex
CREATE INDEX "CustomizationSolution_tenantId_isTenantDefault_idx" ON "CustomizationSolution"("tenantId", "isTenantDefault");

-- CreateIndex
CREATE INDEX "CustomizationSolution_publisherId_idx" ON "CustomizationSolution"("publisherId");

-- AddForeignKey
ALTER TABLE "CustomizationSolution" ADD CONSTRAINT "CustomizationSolution_publisherId_fkey" FOREIGN KEY ("publisherId") REFERENCES "CustomizationPublisher"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomizationPublisher" ADD CONSTRAINT "CustomizationPublisher_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomizationPackageVersion" ADD CONSTRAINT "CustomizationPackageVersion_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomizationPackageVersion" ADD CONSTRAINT "CustomizationPackageVersion_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "CustomizationSolution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomizationPackageDependency" ADD CONSTRAINT "CustomizationPackageDependency_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomizationPackageDependency" ADD CONSTRAINT "CustomizationPackageDependency_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "CustomizationSolution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomizationPackageOperation" ADD CONSTRAINT "CustomizationPackageOperation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomizationPackageOperation" ADD CONSTRAINT "CustomizationPackageOperation_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "CustomizationSolution"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomizationEnvironmentVariable" ADD CONSTRAINT "CustomizationEnvironmentVariable_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomizationEnvironmentVariable" ADD CONSTRAINT "CustomizationEnvironmentVariable_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "CustomizationSolution"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomizationEnvironmentVariableValue" ADD CONSTRAINT "CustomizationEnvironmentVariableValue_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomizationEnvironmentVariableValue" ADD CONSTRAINT "CustomizationEnvironmentVariableValue_variableId_fkey" FOREIGN KEY ("variableId") REFERENCES "CustomizationEnvironmentVariable"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ---------------------------------------------------------------------------
-- Backfill. Idempotent: every statement only touches rows still in their
-- pre-migration state, so re-running it is a no-op.
-- ---------------------------------------------------------------------------

-- DijiPeople Core: the per-tenant system package keeps its key and identity;
-- only the name the product shows changes.
UPDATE "CustomizationSolution"
SET "displayName" = 'DijiPeople Core'
WHERE "solutionKey" = 'default' AND "isDefault" = true AND "displayName" <> 'DijiPeople Core';

-- Default Customizations: the tenant package every unassigned draft lands in
-- (BUG-3493), recognised until now only by its key suffix. The earliest one
-- per tenant wins, matching getOrCreateTenantCustomPackage's ordering.
UPDATE "CustomizationSolution" s
SET "isTenantDefault" = true, "displayName" = 'Default Customizations'
FROM (
  SELECT DISTINCT ON ("tenantId") id
  FROM "CustomizationSolution"
  WHERE "tenantId" IS NOT NULL
    AND "isDefault" = false AND "isSystem" = false AND "isManaged" = false
    AND "solutionKey" LIKE '%\_tenantCustomizations' ESCAPE '\'
  ORDER BY "tenantId", "createdAt" ASC, id ASC
) first_package
WHERE s.id = first_package.id
  AND NOT EXISTS (
    SELECT 1 FROM "CustomizationSolution" d
    WHERE d."tenantId" = s."tenantId" AND d."isTenantDefault" = true
  );

-- Publishers: until now derived from each package key's leading prefix and
-- never stored. One publisher per distinct (tenant, prefix); the name typed at
-- creation was discarded, so the tenant name is the best available display
-- name. Keys with no prefix (the legacy unassigned package) get no publisher.
INSERT INTO "CustomizationPublisher" ("id", "tenantId", "publisherKey", "displayName", "prefix", "isSystem", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, p."tenantId", p.prefix, COALESCE(t."name", p.prefix), p.prefix, false, now(), now()
FROM (
  SELECT DISTINCT "tenantId", substring("solutionKey" from '^([a-z][a-z0-9]*)_') AS prefix
  FROM "CustomizationSolution"
  WHERE "tenantId" IS NOT NULL AND "isDefault" = false AND "isSystem" = false
) p
JOIN "Tenant" t ON t.id = p."tenantId"
WHERE p.prefix IS NOT NULL
ON CONFLICT DO NOTHING;

UPDATE "CustomizationSolution" s
SET "publisherId" = pub.id
FROM "CustomizationPublisher" pub
WHERE s."publisherId" IS NULL
  AND s."tenantId" = pub."tenantId"
  AND s."isDefault" = false AND s."isSystem" = false
  AND substring(s."solutionKey" from '^([a-z][a-z0-9]*)_') = pub.prefix;
