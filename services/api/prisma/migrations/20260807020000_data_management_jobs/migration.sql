-- Data Management: tenant-scoped import/export jobs, per-row results,
-- batch progress and reusable mapping profiles.
-- Workbook binaries live in object storage; only storage keys are stored here.

-- CreateEnum
CREATE TYPE "DataJobKind" AS ENUM ('IMPORT', 'EXPORT');

-- CreateEnum
CREATE TYPE "DataJobStatus" AS ENUM ('UPLOADED', 'ANALYSING', 'VALIDATION_FAILED', 'READY', 'QUEUED', 'PROCESSING', 'PARTIALLY_COMPLETED', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "DataImportMode" AS ENUM ('CREATE_ONLY', 'UPDATE_ONLY', 'CREATE_OR_UPDATE', 'VALIDATE_ONLY');

-- CreateEnum
CREATE TYPE "DataRowStatus" AS ENUM ('PENDING', 'VALID', 'INVALID', 'CREATED', 'UPDATED', 'SKIPPED', 'FAILED');

-- CreateEnum
CREATE TYPE "DataIssueSeverity" AS ENUM ('ERROR', 'WARNING', 'INFO');

-- CreateTable
CREATE TABLE "DataJob" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "kind" "DataJobKind" NOT NULL,
    "moduleKey" TEXT NOT NULL,
    "status" "DataJobStatus" NOT NULL DEFAULT 'UPLOADED',
    "importMode" "DataImportMode",
    "idempotencyKey" TEXT NOT NULL,
    "name" TEXT,
    "fileName" TEXT,
    "sourceFileKey" TEXT,
    "resultFileKey" TEXT,
    "errorFileKey" TEXT,
    "sheetName" TEXT,
    "mappingJson" JSONB,
    "cleansingJson" JSONB,
    "optionsJson" JSONB,
    "matchingKey" TEXT,
    "totalRows" INTEGER NOT NULL DEFAULT 0,
    "validRows" INTEGER NOT NULL DEFAULT 0,
    "createdRows" INTEGER NOT NULL DEFAULT 0,
    "updatedRows" INTEGER NOT NULL DEFAULT 0,
    "skippedRows" INTEGER NOT NULL DEFAULT 0,
    "failedRows" INTEGER NOT NULL DEFAULT 0,
    "processedRows" INTEGER NOT NULL DEFAULT 0,
    "batchSize" INTEGER NOT NULL DEFAULT 500,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "progressPercent" INTEGER NOT NULL DEFAULT 0,
    "failureReason" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "submittedByUserId" TEXT,

    CONSTRAINT "DataJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DataJobRow" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "rowNumber" INTEGER NOT NULL,
    "status" "DataRowStatus" NOT NULL DEFAULT 'PENDING',
    "sourceJson" JSONB,
    "mappedJson" JSONB,
    "recordId" TEXT,
    "issuesJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DataJobRow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DataJobBatch" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "startRow" INTEGER NOT NULL,
    "endRow" INTEGER NOT NULL,
    "status" "DataJobStatus" NOT NULL DEFAULT 'QUEUED',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "failureReason" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DataJobBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DataMappingProfile" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "moduleKey" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "mappingJson" JSONB NOT NULL,
    "cleansingJson" JSONB,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,

    CONSTRAINT "DataMappingProfile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DataJob_tenantId_kind_status_createdAt_idx" ON "DataJob"("tenantId", "kind", "status", "createdAt");

-- CreateIndex
CREATE INDEX "DataJob_tenantId_moduleKey_createdAt_idx" ON "DataJob"("tenantId", "moduleKey", "createdAt");

-- CreateIndex
CREATE INDEX "DataJob_tenantId_submittedByUserId_idx" ON "DataJob"("tenantId", "submittedByUserId");

-- CreateIndex
CREATE UNIQUE INDEX "DataJob_tenantId_kind_idempotencyKey_key" ON "DataJob"("tenantId", "kind", "idempotencyKey");

-- CreateIndex
CREATE INDEX "DataJobRow_tenantId_jobId_status_idx" ON "DataJobRow"("tenantId", "jobId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "DataJobRow_jobId_rowNumber_key" ON "DataJobRow"("jobId", "rowNumber");

-- CreateIndex
CREATE INDEX "DataJobBatch_tenantId_jobId_status_idx" ON "DataJobBatch"("tenantId", "jobId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "DataJobBatch_jobId_sequence_key" ON "DataJobBatch"("jobId", "sequence");

-- CreateIndex
CREATE INDEX "DataMappingProfile_tenantId_moduleKey_idx" ON "DataMappingProfile"("tenantId", "moduleKey");

-- CreateIndex
CREATE UNIQUE INDEX "DataMappingProfile_tenantId_moduleKey_name_key" ON "DataMappingProfile"("tenantId", "moduleKey", "name");

-- AddForeignKey
ALTER TABLE "DataJob" ADD CONSTRAINT "DataJob_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DataJob" ADD CONSTRAINT "DataJob_submittedByUserId_fkey" FOREIGN KEY ("submittedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DataJobRow" ADD CONSTRAINT "DataJobRow_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DataJobRow" ADD CONSTRAINT "DataJobRow_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "DataJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DataJobBatch" ADD CONSTRAINT "DataJobBatch_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DataJobBatch" ADD CONSTRAINT "DataJobBatch_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "DataJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DataMappingProfile" ADD CONSTRAINT "DataMappingProfile_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
