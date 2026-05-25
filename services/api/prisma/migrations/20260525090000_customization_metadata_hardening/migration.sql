-- Metadata customization hardening for tenant-scoped tables, columns, forms, and views.
ALTER TABLE "CustomizationTable" ADD COLUMN IF NOT EXISTS "isSystem" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "CustomizationTable" ADD COLUMN IF NOT EXISTS "isCustom" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "CustomizationTable" ADD COLUMN IF NOT EXISTS "createdByUserId" TEXT;
ALTER TABLE "CustomizationTable" ADD COLUMN IF NOT EXISTS "updatedByUserId" TEXT;

ALTER TABLE "CustomizationColumn" ADD COLUMN IF NOT EXISTS "description" TEXT;
ALTER TABLE "CustomizationColumn" ADD COLUMN IF NOT EXISTS "isCustom" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "CustomizationColumn" ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "CustomizationColumn" ADD COLUMN IF NOT EXISTS "isFilterable" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "CustomizationColumn" ADD COLUMN IF NOT EXISTS "createdByUserId" TEXT;
ALTER TABLE "CustomizationColumn" ADD COLUMN IF NOT EXISTS "updatedByUserId" TEXT;

ALTER TABLE "CustomizationView" ADD COLUMN IF NOT EXISTS "isSystem" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "CustomizationView" ADD COLUMN IF NOT EXISTS "isCustom" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "CustomizationView" ADD COLUMN IF NOT EXISTS "updatedByUserId" TEXT;

ALTER TABLE "CustomizationForm" ADD COLUMN IF NOT EXISTS "isSystem" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "CustomizationForm" ADD COLUMN IF NOT EXISTS "isCustom" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "CustomizationForm" ADD COLUMN IF NOT EXISTS "updatedByUserId" TEXT;

UPDATE "CustomizationTable" SET "isSystem" = true, "isCustom" = false WHERE "isCustom" = true AND "tableKey" IN (
  'candidates', 'leads', 'customers', 'employees', 'businessUnits', 'projects', 'timesheets', 'payrollCycles'
);
UPDATE "CustomizationColumn" SET "isCustom" = NOT "isSystem";
UPDATE "CustomizationView" SET "isSystem" = ("type" = 'system'), "isCustom" = ("type" <> 'system');
