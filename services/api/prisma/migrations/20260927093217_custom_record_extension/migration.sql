-- TASK-0034 / BUG-3697 — values of custom fields on system modules' records.
-- Additive: one new table, no existing data touched.

-- CreateTable
CREATE TABLE "CustomRecordExtension" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "tableKey" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "values" JSONB NOT NULL,
    "updatedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomRecordExtension_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CustomRecordExtension_tenantId_tableKey_idx" ON "CustomRecordExtension"("tenantId", "tableKey");

-- CreateIndex
CREATE UNIQUE INDEX "CustomRecordExtension_tenantId_tableKey_recordId_key" ON "CustomRecordExtension"("tenantId", "tableKey", "recordId");

-- AddForeignKey
ALTER TABLE "CustomRecordExtension" ADD CONSTRAINT "CustomRecordExtension_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

