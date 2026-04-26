-- CreateEnum
CREATE TYPE "TimesheetImportBatchStatus" AS ENUM ('PREVIEWED', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "TimesheetImportBatch" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "status" "TimesheetImportBatchStatus" NOT NULL DEFAULT 'PREVIEWED',
    "importedByUserId" TEXT,
    "importedAt" TIMESTAMP(3),
    "committedAt" TIMESTAMP(3),
    "totalRows" INTEGER NOT NULL DEFAULT 0,
    "successCount" INTEGER NOT NULL DEFAULT 0,
    "warningCount" INTEGER NOT NULL DEFAULT 0,
    "errorCount" INTEGER NOT NULL DEFAULT 0,
    "errorSummary" TEXT,
    "previewJson" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TimesheetImportBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_TimesheetToTimesheetImportBatch" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_TimesheetToTimesheetImportBatch_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "TimesheetImportBatch_tenantId_idx" ON "TimesheetImportBatch"("tenantId");

-- CreateIndex
CREATE INDEX "TimesheetImportBatch_tenantId_status_createdAt_idx" ON "TimesheetImportBatch"("tenantId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "_TimesheetToTimesheetImportBatch_B_index" ON "_TimesheetToTimesheetImportBatch"("B");

-- AddForeignKey
ALTER TABLE "TimesheetImportBatch" ADD CONSTRAINT "TimesheetImportBatch_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_TimesheetToTimesheetImportBatch" ADD CONSTRAINT "_TimesheetToTimesheetImportBatch_A_fkey" FOREIGN KEY ("A") REFERENCES "Timesheet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_TimesheetToTimesheetImportBatch" ADD CONSTRAINT "_TimesheetToTimesheetImportBatch_B_fkey" FOREIGN KEY ("B") REFERENCES "TimesheetImportBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
