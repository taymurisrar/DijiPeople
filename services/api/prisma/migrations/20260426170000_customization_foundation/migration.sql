-- DijiPeople tenant-level customization foundation.
-- This stores metadata for existing system tables/modules only; it does not create runtime tenant tables.

CREATE TYPE "CustomizationColumnSource" AS ENUM ('system', 'tenant');
CREATE TYPE "CustomizationColumnDataType" AS ENUM ('string', 'text', 'number', 'decimal', 'boolean', 'date', 'datetime', 'lookup', 'choice', 'multichoice', 'json');
CREATE TYPE "CustomizationFormType" AS ENUM ('main', 'quick_create', 'quick_view');

CREATE TABLE "CustomizationTable" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "tableKey" TEXT NOT NULL,
  "moduleKey" TEXT NOT NULL,
  "displayName" TEXT,
  "pluralName" TEXT,
  "description" TEXT,
  "isEnabled" BOOLEAN NOT NULL DEFAULT true,
  "configJson" JSONB,
  "publishedAt" TIMESTAMP(3),
  "publishedByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "createdById" TEXT,
  "updatedById" TEXT,
  CONSTRAINT "CustomizationTable_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CustomizationColumn" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "tableKey" TEXT NOT NULL,
  "columnKey" TEXT NOT NULL,
  "displayName" TEXT NOT NULL,
  "description" TEXT,
  "source" "CustomizationColumnSource" NOT NULL DEFAULT 'tenant',
  "dataType" "CustomizationColumnDataType" NOT NULL,
  "isRequired" BOOLEAN NOT NULL DEFAULT false,
  "isVisible" BOOLEAN NOT NULL DEFAULT true,
  "isSearchable" BOOLEAN NOT NULL DEFAULT false,
  "isReadOnly" BOOLEAN NOT NULL DEFAULT false,
  "configJson" JSONB,
  "publishedAt" TIMESTAMP(3),
  "publishedByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "createdById" TEXT,
  "updatedById" TEXT,
  CONSTRAINT "CustomizationColumn_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CustomizationForm" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "tableKey" TEXT NOT NULL,
  "formKey" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "type" "CustomizationFormType" NOT NULL DEFAULT 'main',
  "isDefault" BOOLEAN NOT NULL DEFAULT false,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "layoutJson" JSONB NOT NULL,
  "configJson" JSONB,
  "publishedAt" TIMESTAMP(3),
  "publishedByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "createdById" TEXT,
  "updatedById" TEXT,
  CONSTRAINT "CustomizationForm_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CustomizationTable_tenantId_tableKey_key" ON "CustomizationTable"("tenantId", "tableKey");
CREATE INDEX "CustomizationTable_tenantId_moduleKey_idx" ON "CustomizationTable"("tenantId", "moduleKey");
CREATE INDEX "CustomizationTable_tenantId_isEnabled_idx" ON "CustomizationTable"("tenantId", "isEnabled");

CREATE UNIQUE INDEX "CustomizationColumn_tenantId_tableKey_columnKey_key" ON "CustomizationColumn"("tenantId", "tableKey", "columnKey");
CREATE INDEX "CustomizationColumn_tenantId_tableKey_idx" ON "CustomizationColumn"("tenantId", "tableKey");
CREATE INDEX "CustomizationColumn_tenantId_source_idx" ON "CustomizationColumn"("tenantId", "source");

CREATE UNIQUE INDEX "CustomizationForm_tenantId_tableKey_formKey_key" ON "CustomizationForm"("tenantId", "tableKey", "formKey");
CREATE INDEX "CustomizationForm_tenantId_tableKey_idx" ON "CustomizationForm"("tenantId", "tableKey");
CREATE INDEX "CustomizationForm_tenantId_tableKey_isActive_idx" ON "CustomizationForm"("tenantId", "tableKey", "isActive");

ALTER TABLE "CustomizationTable" ADD CONSTRAINT "CustomizationTable_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CustomizationColumn" ADD CONSTRAINT "CustomizationColumn_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CustomizationForm" ADD CONSTRAINT "CustomizationForm_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
