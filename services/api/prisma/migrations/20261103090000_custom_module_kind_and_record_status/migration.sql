-- Custom modules gain a kind (which system components they are provisioned with)
-- and custom records gain an Active/Inactive status.
--
-- EXPAND-ONLY: new enum, one new column per table, each NOT NULL with a default,
-- so existing rows are valid immediately and the previous release (which never
-- reads either column) keeps working against the migrated schema. No backfill,
-- no rewrite of existing values, no constraint change on existing columns.
-- Rollback = ignore the columns; do not drop them while any release reads them.

-- CreateEnum
CREATE TYPE "CustomizationModuleKind" AS ENUM ('STANDARD', 'ORGANIZATION_OWNED', 'IMMUTABLE', 'CONFIGURATION');

-- AlterTable
ALTER TABLE "CustomizationTable" ADD COLUMN     "moduleKind" "CustomizationModuleKind" NOT NULL DEFAULT 'STANDARD';

-- AlterTable
ALTER TABLE "CustomDataRecord" ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true;

-- CreateIndex
CREATE INDEX "CustomDataRecord_tenantId_tableId_isActive_isDeleted_idx" ON "CustomDataRecord"("tenantId", "tableId", "isActive", "isDeleted");
