-- Align customization metadata with the tenant-scoped D365-style model.
-- Metadata only: no tenant runtime database tables are created.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE "CustomizationFieldDataType" AS ENUM (
  'text',
  'textarea',
  'number',
  'decimal',
  'date',
  'datetime',
  'boolean',
  'select',
  'multiselect',
  'lookup',
  'email',
  'phone',
  'url',
  'currency'
);

CREATE TYPE "CustomizationPublishStatus" AS ENUM (
  'draft',
  'published',
  'failed'
);

CREATE TYPE "CustomizationFormType_new" AS ENUM (
  'main',
  'quick',
  'create',
  'edit'
);

ALTER TABLE "CustomizationTable"
  ADD COLUMN "systemName" TEXT,
  ADD COLUMN "pluralDisplayName" TEXT,
  ADD COLUMN "icon" TEXT,
  ADD COLUMN "isCustomizable" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;

UPDATE "CustomizationTable"
SET
  "systemName" = COALESCE("systemName", "tableKey"),
  "displayName" = COALESCE("displayName", "tableKey"),
  "pluralDisplayName" = COALESCE("pluralDisplayName", "pluralName", "displayName", "tableKey"),
  "isActive" = COALESCE("isEnabled", true);

ALTER TABLE "CustomizationTable"
  ALTER COLUMN "systemName" SET NOT NULL,
  ALTER COLUMN "displayName" SET NOT NULL,
  ALTER COLUMN "pluralDisplayName" SET NOT NULL;

DROP INDEX IF EXISTS "CustomizationTable_tenantId_moduleKey_idx";
DROP INDEX IF EXISTS "CustomizationTable_tenantId_isEnabled_idx";

ALTER TABLE "CustomizationTable"
  DROP COLUMN IF EXISTS "moduleKey",
  DROP COLUMN IF EXISTS "pluralName",
  DROP COLUMN IF EXISTS "isEnabled",
  DROP COLUMN IF EXISTS "configJson",
  DROP COLUMN IF EXISTS "publishedAt",
  DROP COLUMN IF EXISTS "publishedByUserId",
  DROP COLUMN IF EXISTS "createdById",
  DROP COLUMN IF EXISTS "updatedById";

CREATE INDEX "CustomizationTable_tenantId_isActive_idx" ON "CustomizationTable"("tenantId", "isActive");
CREATE INDEX "CustomizationTable_tenantId_isCustomizable_idx" ON "CustomizationTable"("tenantId", "isCustomizable");

-- Preserve any existing column/form metadata by creating table rows for their legacy tableKey.
INSERT INTO "CustomizationTable" (
  "id",
  "tenantId",
  "tableKey",
  "systemName",
  "displayName",
  "pluralDisplayName",
  "isCustomizable",
  "isActive",
  "createdAt",
  "updatedAt"
)
SELECT
  gen_random_uuid()::text,
  legacy."tenantId",
  legacy."tableKey",
  legacy."tableKey",
  legacy."tableKey",
  legacy."tableKey",
  true,
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM (
  SELECT DISTINCT "tenantId", "tableKey" FROM "CustomizationColumn"
  UNION
  SELECT DISTINCT "tenantId", "tableKey" FROM "CustomizationForm"
) legacy
WHERE NOT EXISTS (
  SELECT 1
  FROM "CustomizationTable" existing
  WHERE existing."tenantId" = legacy."tenantId"
    AND existing."tableKey" = legacy."tableKey"
);

ALTER TABLE "CustomizationColumn"
  ADD COLUMN "tableId" TEXT,
  ADD COLUMN "systemName" TEXT,
  ADD COLUMN "fieldType" "CustomizationFieldDataType",
  ADD COLUMN "isSystem" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "isSortable" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "maxLength" INTEGER,
  ADD COLUMN "minValue" DECIMAL(65,30),
  ADD COLUMN "maxValue" DECIMAL(65,30),
  ADD COLUMN "defaultValue" TEXT,
  ADD COLUMN "lookupTargetTableKey" TEXT,
  ADD COLUMN "optionSetJson" JSONB,
  ADD COLUMN "validationJson" JSONB,
  ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 0;

UPDATE "CustomizationColumn" c
SET
  "tableId" = t."id",
  "systemName" = COALESCE(c."systemName", c."columnKey"),
  "isSystem" = CASE WHEN c."source"::text = 'system' THEN true ELSE false END,
  "fieldType" = CASE c."dataType"::text
    WHEN 'string' THEN 'text'::"CustomizationFieldDataType"
    WHEN 'text' THEN 'textarea'::"CustomizationFieldDataType"
    WHEN 'number' THEN 'number'::"CustomizationFieldDataType"
    WHEN 'decimal' THEN 'decimal'::"CustomizationFieldDataType"
    WHEN 'boolean' THEN 'boolean'::"CustomizationFieldDataType"
    WHEN 'date' THEN 'date'::"CustomizationFieldDataType"
    WHEN 'datetime' THEN 'datetime'::"CustomizationFieldDataType"
    WHEN 'lookup' THEN 'lookup'::"CustomizationFieldDataType"
    WHEN 'choice' THEN 'select'::"CustomizationFieldDataType"
    WHEN 'multichoice' THEN 'multiselect'::"CustomizationFieldDataType"
    ELSE 'text'::"CustomizationFieldDataType"
  END
FROM "CustomizationTable" t
WHERE t."tenantId" = c."tenantId"
  AND t."tableKey" = c."tableKey";

ALTER TABLE "CustomizationColumn"
  ADD COLUMN "dataType_new" "CustomizationFieldDataType";

UPDATE "CustomizationColumn"
SET "dataType_new" = COALESCE("fieldType", 'text'::"CustomizationFieldDataType");

ALTER TABLE "CustomizationColumn"
  ALTER COLUMN "tableId" SET NOT NULL,
  ALTER COLUMN "systemName" SET NOT NULL,
  ALTER COLUMN "fieldType" SET NOT NULL,
  ALTER COLUMN "dataType_new" SET NOT NULL;

DROP INDEX IF EXISTS "CustomizationColumn_tenantId_tableKey_columnKey_key";
DROP INDEX IF EXISTS "CustomizationColumn_tenantId_tableKey_idx";
DROP INDEX IF EXISTS "CustomizationColumn_tenantId_source_idx";

ALTER TABLE "CustomizationColumn"
  DROP COLUMN IF EXISTS "tableKey",
  DROP COLUMN IF EXISTS "source",
  DROP COLUMN IF EXISTS "dataType",
  DROP COLUMN IF EXISTS "description",
  DROP COLUMN IF EXISTS "configJson",
  DROP COLUMN IF EXISTS "publishedAt",
  DROP COLUMN IF EXISTS "publishedByUserId",
  DROP COLUMN IF EXISTS "createdById",
  DROP COLUMN IF EXISTS "updatedById";

ALTER TABLE "CustomizationColumn"
  RENAME COLUMN "dataType_new" TO "dataType";

ALTER TABLE "CustomizationColumn"
  ADD CONSTRAINT "CustomizationColumn_tableId_fkey"
  FOREIGN KEY ("tableId") REFERENCES "CustomizationTable"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "CustomizationColumn_tenantId_tableId_columnKey_key" ON "CustomizationColumn"("tenantId", "tableId", "columnKey");
CREATE INDEX "CustomizationColumn_tenantId_tableId_idx" ON "CustomizationColumn"("tenantId", "tableId");
CREATE INDEX "CustomizationColumn_tenantId_isSystem_idx" ON "CustomizationColumn"("tenantId", "isSystem");
CREATE INDEX "CustomizationColumn_tenantId_tableId_sortOrder_idx" ON "CustomizationColumn"("tenantId", "tableId", "sortOrder");

CREATE TABLE "CustomizationView" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "tableId" TEXT NOT NULL,
  "viewKey" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "type" "ModuleViewType" NOT NULL DEFAULT 'custom',
  "isDefault" BOOLEAN NOT NULL DEFAULT false,
  "isHidden" BOOLEAN NOT NULL DEFAULT false,
  "columnsJson" JSONB NOT NULL,
  "filtersJson" JSONB,
  "sortingJson" JSONB,
  "visibilityScope" "ModuleViewVisibilityScope" NOT NULL DEFAULT 'tenant',
  "createdByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CustomizationView_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "CustomizationForm"
  ADD COLUMN "tableId" TEXT,
  ADD COLUMN "description" TEXT,
  ADD COLUMN "createdByUserId" TEXT,
  ADD COLUMN "type_new" "CustomizationFormType_new";

UPDATE "CustomizationForm" f
SET
  "tableId" = t."id",
  "createdByUserId" = COALESCE(f."createdByUserId", f."createdById"),
  "type_new" = CASE f."type"::text
    WHEN 'quick_create' THEN 'create'::"CustomizationFormType_new"
    WHEN 'quick_view' THEN 'quick'::"CustomizationFormType_new"
    ELSE 'main'::"CustomizationFormType_new"
  END
FROM "CustomizationTable" t
WHERE t."tenantId" = f."tenantId"
  AND t."tableKey" = f."tableKey";

ALTER TABLE "CustomizationForm"
  ALTER COLUMN "tableId" SET NOT NULL,
  ALTER COLUMN "type_new" SET NOT NULL;

DROP INDEX IF EXISTS "CustomizationForm_tenantId_tableKey_formKey_key";
DROP INDEX IF EXISTS "CustomizationForm_tenantId_tableKey_idx";
DROP INDEX IF EXISTS "CustomizationForm_tenantId_tableKey_isActive_idx";

ALTER TABLE "CustomizationForm"
  DROP COLUMN IF EXISTS "tableKey",
  DROP COLUMN IF EXISTS "type",
  DROP COLUMN IF EXISTS "configJson",
  DROP COLUMN IF EXISTS "publishedAt",
  DROP COLUMN IF EXISTS "publishedByUserId",
  DROP COLUMN IF EXISTS "createdById",
  DROP COLUMN IF EXISTS "updatedById";

ALTER TABLE "CustomizationForm"
  RENAME COLUMN "type_new" TO "type";

ALTER TYPE "CustomizationFormType" RENAME TO "CustomizationFormType_old";
ALTER TYPE "CustomizationFormType_new" RENAME TO "CustomizationFormType";
DROP TYPE "CustomizationFormType_old";

ALTER TABLE "CustomizationForm"
  ADD CONSTRAINT "CustomizationForm_tableId_fkey"
  FOREIGN KEY ("tableId") REFERENCES "CustomizationTable"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "CustomizationForm_tenantId_tableId_formKey_key" ON "CustomizationForm"("tenantId", "tableId", "formKey");
CREATE INDEX "CustomizationForm_tenantId_tableId_idx" ON "CustomizationForm"("tenantId", "tableId");
CREATE INDEX "CustomizationForm_tenantId_tableId_isActive_idx" ON "CustomizationForm"("tenantId", "tableId", "isActive");
CREATE INDEX "CustomizationForm_tenantId_tableId_isDefault_idx" ON "CustomizationForm"("tenantId", "tableId", "isDefault");

ALTER TABLE "CustomizationView"
  ADD CONSTRAINT "CustomizationView_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CustomizationView"
  ADD CONSTRAINT "CustomizationView_tableId_fkey"
  FOREIGN KEY ("tableId") REFERENCES "CustomizationTable"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "CustomizationView_tenantId_tableId_viewKey_key" ON "CustomizationView"("tenantId", "tableId", "viewKey");
CREATE INDEX "CustomizationView_tenantId_tableId_idx" ON "CustomizationView"("tenantId", "tableId");
CREATE INDEX "CustomizationView_tenantId_tableId_isDefault_idx" ON "CustomizationView"("tenantId", "tableId", "isDefault");
CREATE INDEX "CustomizationView_tenantId_tableId_isHidden_idx" ON "CustomizationView"("tenantId", "tableId", "isHidden");

CREATE TABLE "CustomizationPublishSnapshot" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "status" "CustomizationPublishStatus" NOT NULL DEFAULT 'draft',
  "publishedByUserId" TEXT,
  "publishedAt" TIMESTAMP(3),
  "snapshotJson" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CustomizationPublishSnapshot_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "CustomizationPublishSnapshot"
  ADD CONSTRAINT "CustomizationPublishSnapshot_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "CustomizationPublishSnapshot_tenantId_version_key" ON "CustomizationPublishSnapshot"("tenantId", "version");
CREATE INDEX "CustomizationPublishSnapshot_tenantId_status_idx" ON "CustomizationPublishSnapshot"("tenantId", "status");
CREATE INDEX "CustomizationPublishSnapshot_tenantId_createdAt_idx" ON "CustomizationPublishSnapshot"("tenantId", "createdAt");

DROP TYPE IF EXISTS "CustomizationColumnSource";
DROP TYPE IF EXISTS "CustomizationColumnDataType";
