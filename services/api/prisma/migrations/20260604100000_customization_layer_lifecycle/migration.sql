-- Add metadata layering lifecycle fields to the existing package component bridge.
ALTER TABLE "CustomizationSolutionComponent"
  ADD COLUMN "baseComponentId" TEXT,
  ADD COLUMN "layerAction" TEXT NOT NULL DEFAULT 'reference',
  ADD COLUMN "lifecycleState" TEXT NOT NULL DEFAULT 'draft',
  ADD COLUMN "layerOrder" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "version" TEXT NOT NULL DEFAULT '1.0.0',
  ADD COLUMN "checksum" TEXT,
  ADD COLUMN "metadataJson" JSONB,
  ADD COLUMN "publishedAt" TIMESTAMP(3),
  ADD COLUMN "publishedByUserId" TEXT;

UPDATE "CustomizationSolutionComponent"
SET
  "layerAction" = CASE
    WHEN "isSystem" = true THEN 'reference'
    WHEN "isCustom" = true THEN 'create'
    ELSE 'reference'
  END,
  "lifecycleState" = CASE
    WHEN "isSystem" = true THEN 'published'
    ELSE 'draft'
  END,
  "layerOrder" = CASE
    WHEN "isSystem" = true THEN 100
    WHEN "isManaged" = true THEN 200
    ELSE 300
  END;

CREATE INDEX "CustomizationSolutionComponent_solutionId_lifecycleState_idx"
  ON "CustomizationSolutionComponent"("solutionId", "lifecycleState");

CREATE INDEX "CustomizationSolutionComponent_baseComponentId_idx"
  ON "CustomizationSolutionComponent"("baseComponentId");
