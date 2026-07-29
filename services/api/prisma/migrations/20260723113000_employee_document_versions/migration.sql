CREATE TABLE "DocumentVersion" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "title" TEXT,
    "originalFileName" TEXT NOT NULL,
    "storedFileName" TEXT,
    "mimeType" TEXT,
    "fileExtension" TEXT,
    "sizeInBytes" INTEGER,
    "storageKey" TEXT,
    "documentTypeId" TEXT,
    "documentCategoryId" TEXT,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,

    CONSTRAINT "DocumentVersion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DocumentVersion_tenantId_documentId_versionNumber_key" ON "DocumentVersion"("tenantId", "documentId", "versionNumber");
CREATE INDEX "DocumentVersion_tenantId_documentId_idx" ON "DocumentVersion"("tenantId", "documentId");

ALTER TABLE "DocumentVersion" ADD CONSTRAINT "DocumentVersion_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;
