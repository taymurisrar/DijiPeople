-- CreateEnum
CREATE TYPE "AttendanceMode" AS ENUM ('OFFICE', 'REMOTE', 'HYBRID', 'MACHINE', 'MANUAL');

-- CreateEnum
CREATE TYPE "AttendanceImportBatchStatus" AS ENUM ('PROCESSING', 'COMPLETED', 'PARTIAL', 'FAILED');

-- CreateEnum
CREATE TYPE "AttendanceIntegrationType" AS ENUM ('API_PUSH', 'FILE_IMPORT', 'MACHINE_SYNC', 'WEBHOOK', 'MANUAL', 'BROWSER');

-- AlterEnum
ALTER TYPE "AttendanceEntrySource" ADD VALUE 'IMPORT';
ALTER TYPE "AttendanceEntrySource" ADD VALUE 'MACHINE';
ALTER TYPE "AttendanceEntrySource" ADD VALUE 'INTEGRATION';

-- AlterEnum
ALTER TYPE "AttendanceEntryStatus" ADD VALUE 'ON_LEAVE';

-- AlterTable
ALTER TABLE "AttendanceEntry"
ADD COLUMN "attendanceMode" "AttendanceMode" NOT NULL DEFAULT 'OFFICE',
ADD COLUMN "checkInNote" TEXT,
ADD COLUMN "checkOutNote" TEXT,
ADD COLUMN "importedBatchId" TEXT,
ADD COLUMN "isLateCheckIn" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "isLateCheckOut" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "lateCheckInMinutes" INTEGER,
ADD COLUMN "lateCheckOutMinutes" INTEGER,
ADD COLUMN "machineDeviceId" TEXT,
ADD COLUMN "officeLocationId" TEXT,
ADD COLUMN "remoteAddressText" TEXT,
ADD COLUMN "remoteLatitude" DOUBLE PRECISION,
ADD COLUMN "remoteLongitude" DOUBLE PRECISION,
ADD COLUMN "workSummary" TEXT;

-- CreateTable
CREATE TABLE "AttendancePolicy" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "lateCheckInGraceMinutes" INTEGER NOT NULL DEFAULT 0,
    "lateCheckOutGraceMinutes" INTEGER NOT NULL DEFAULT 0,
    "requireOfficeLocationForOfficeMode" BOOLEAN NOT NULL DEFAULT true,
    "requireRemoteLocationForRemoteMode" BOOLEAN NOT NULL DEFAULT false,
    "allowRemoteWithoutLocation" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,
    CONSTRAINT "AttendancePolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttendanceImportBatch" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "status" "AttendanceImportBatchStatus" NOT NULL DEFAULT 'PROCESSING',
    "sourceLabel" TEXT,
    "importedByUserId" TEXT,
    "importedAt" TIMESTAMP(3),
    "totalRows" INTEGER NOT NULL DEFAULT 0,
    "successCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "errorSummary" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AttendanceImportBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttendanceIntegrationConfig" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "integrationType" "AttendanceIntegrationType" NOT NULL,
    "description" TEXT,
    "endpointUrl" TEXT,
    "username" TEXT,
    "configJson" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,
    CONSTRAINT "AttendanceIntegrationConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AttendancePolicy_tenantId_key" ON "AttendancePolicy"("tenantId");

-- CreateIndex
CREATE INDEX "AttendanceImportBatch_tenantId_idx" ON "AttendanceImportBatch"("tenantId");

-- CreateIndex
CREATE INDEX "AttendanceImportBatch_tenantId_status_createdAt_idx" ON "AttendanceImportBatch"("tenantId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "AttendanceIntegrationConfig_tenantId_idx" ON "AttendanceIntegrationConfig"("tenantId");

-- CreateIndex
CREATE INDEX "AttendanceIntegrationConfig_tenantId_integrationType_isActi_idx" ON "AttendanceIntegrationConfig"("tenantId", "integrationType", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "AttendanceIntegrationConfig_tenantId_name_key" ON "AttendanceIntegrationConfig"("tenantId", "name");

-- CreateIndex
CREATE INDEX "AttendanceEntry_tenantId_attendanceMode_status_date_idx" ON "AttendanceEntry"("tenantId", "attendanceMode", "status", "date");

-- CreateIndex
CREATE INDEX "AttendanceEntry_tenantId_source_date_idx" ON "AttendanceEntry"("tenantId", "source", "date");

-- CreateIndex
CREATE INDEX "AttendanceEntry_tenantId_officeLocationId_date_idx" ON "AttendanceEntry"("tenantId", "officeLocationId", "date");

-- CreateIndex
CREATE INDEX "AttendanceEntry_tenantId_importedBatchId_idx" ON "AttendanceEntry"("tenantId", "importedBatchId");

-- AddForeignKey
ALTER TABLE "AttendanceEntry"
ADD CONSTRAINT "AttendanceEntry_officeLocationId_fkey"
FOREIGN KEY ("officeLocationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceEntry"
ADD CONSTRAINT "AttendanceEntry_importedBatchId_fkey"
FOREIGN KEY ("importedBatchId") REFERENCES "AttendanceImportBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendancePolicy"
ADD CONSTRAINT "AttendancePolicy_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceImportBatch"
ADD CONSTRAINT "AttendanceImportBatch_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceIntegrationConfig"
ADD CONSTRAINT "AttendanceIntegrationConfig_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
