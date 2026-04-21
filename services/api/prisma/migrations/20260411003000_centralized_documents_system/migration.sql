-- CreateEnum
CREATE TYPE "DocumentEntityType" AS ENUM ('EMPLOYEE', 'LEAVE_REQUEST', 'PAYROLL_RECORD', 'CANDIDATE', 'ONBOARDING_RECORD', 'TENANT', 'INVOICE', 'POLICY', 'OTHER');

-- DropIndex
DROP INDEX "Document_tenantId_category_idx";

-- AlterTable
ALTER TABLE "Document"
ADD COLUMN     "description" TEXT,
ADD COLUMN     "documentCategoryId" TEXT,
ADD COLUMN     "fileExtension" TEXT,
ADD COLUMN     "isArchived" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "originalFileName" TEXT,
ADD COLUMN     "sizeInBytes" INTEGER,
ADD COLUMN     "storedFileName" TEXT;

-- AlterTable
ALTER TABLE "DocumentLink"
ADD COLUMN     "entityId" TEXT,
ADD COLUMN     "entityType" "DocumentEntityType";

-- CreateTable
CREATE TABLE "DocumentCategory" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,

    CONSTRAINT "DocumentCategory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DocumentCategory_tenantId_isActive_sortOrder_idx" ON "DocumentCategory"("tenantId", "isActive", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentCategory_tenantId_code_key" ON "DocumentCategory"("tenantId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentCategory_tenantId_name_key" ON "DocumentCategory"("tenantId", "name");

-- CreateIndex
CREATE INDEX "Document_tenantId_documentCategoryId_idx" ON "Document"("tenantId", "documentCategoryId");

-- CreateIndex
CREATE INDEX "Document_tenantId_isArchived_createdAt_idx" ON "Document"("tenantId", "isArchived", "createdAt");

-- CreateIndex
CREATE INDEX "DocumentLink_tenantId_entityType_entityId_idx" ON "DocumentLink"("tenantId", "entityType", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentLink_documentId_entityType_entityId_key" ON "DocumentLink"("documentId", "entityType", "entityId");

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_documentCategoryId_fkey" FOREIGN KEY ("documentCategoryId") REFERENCES "DocumentCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentCategory" ADD CONSTRAINT "DocumentCategory_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill Document from legacy fields
UPDATE "Document"
SET
  "originalFileName" = COALESCE("originalFileName", "fileName"),
  "description" = COALESCE("description", "notes"),
  "sizeInBytes" = COALESCE("sizeInBytes", "size"),
  "fileExtension" = CASE
    WHEN "fileName" IS NOT NULL AND POSITION('.' IN REVERSE("fileName")) > 0
      THEN LOWER(RIGHT("fileName", POSITION('.' IN REVERSE("fileName"))))
    ELSE NULL
  END
WHERE "originalFileName" IS NULL;

-- Backfill DocumentLink generic entity mapping from legacy foreign keys
UPDATE "DocumentLink"
SET
  "entityType" = CASE
    WHEN "employeeId" IS NOT NULL THEN 'EMPLOYEE'::"DocumentEntityType"
    WHEN "candidateId" IS NOT NULL THEN 'CANDIDATE'::"DocumentEntityType"
    WHEN "leaveRequestId" IS NOT NULL THEN 'LEAVE_REQUEST'::"DocumentEntityType"
    ELSE 'OTHER'::"DocumentEntityType"
  END,
  "entityId" = COALESCE("employeeId", "candidateId", "leaveRequestId", "id")
WHERE "entityType" IS NULL OR "entityId" IS NULL;

-- Finalize required columns after backfill
ALTER TABLE "Document"
ALTER COLUMN "originalFileName" SET NOT NULL;

ALTER TABLE "DocumentLink"
ALTER COLUMN "entityId" SET NOT NULL,
ALTER COLUMN "entityType" SET NOT NULL;

-- Remove legacy columns after data migration
ALTER TABLE "Document"
DROP COLUMN "category",
DROP COLUMN "fileName",
DROP COLUMN "notes",
DROP COLUMN "size";

