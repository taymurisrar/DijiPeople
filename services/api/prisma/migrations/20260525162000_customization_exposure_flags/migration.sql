ALTER TABLE "CustomizationTable"
  ADD COLUMN "ownershipType" TEXT,
  ADD COLUMN "moduleKey" TEXT,
  ADD COLUMN "displayOrder" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "isVisibleInCustomization" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "isValidForAdvancedFind" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "isValidForFormDesigner" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "isValidForViewDesigner" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "CustomizationColumn"
  ADD COLUMN "isVisibleInCustomization" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "isValidForFormDesigner" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "isValidForViewDesigner" BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX "CustomizationTable_tenantId_isVisibleInCustomization_idx" ON "CustomizationTable"("tenantId", "isVisibleInCustomization");
CREATE INDEX "CustomizationColumn_tenantId_tableId_isVisibleInCustomization_idx" ON "CustomizationColumn"("tenantId", "tableId", "isVisibleInCustomization");
