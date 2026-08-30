-- CreateEnum
CREATE TYPE "ReportVisibilityScope" AS ENUM ('PRIVATE', 'ROLE', 'USER', 'TENANT');

-- CreateEnum
CREATE TYPE "ReportScheduleFrequency" AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY');

-- CreateEnum
CREATE TYPE "ReportExportFormat" AS ENUM ('CSV', 'XLSX', 'PDF');

-- CreateEnum
CREATE TYPE "ReportRunTrigger" AS ENUM ('MANUAL', 'SCHEDULED', 'PREVIEW');

-- CreateEnum
CREATE TYPE "ReportRunStatus" AS ENUM ('QUEUED', 'RUNNING', 'COMPLETED', 'FAILED', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "WorkforceSnapshotDerivation" AS ENUM ('OBSERVED', 'BACKFILLED');

-- CreateTable
CREATE TABLE "ReportDefinition" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT NOT NULL,
    "dataSourceKey" TEXT NOT NULL,
    "visibilityScope" "ReportVisibilityScope" NOT NULL DEFAULT 'PRIVATE',
    "allowedRoleKeys" JSONB,
    "allowedUserIds" JSONB,
    "configJson" JSONB NOT NULL,
    "configVersion" INTEGER NOT NULL DEFAULT 1,
    "ownerUserId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastRunAt" TIMESTAMP(3),
    "runCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,

    CONSTRAINT "ReportDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReportSavedView" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "surfaceKey" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "ownerUserId" TEXT,
    "visibilityScope" "ReportVisibilityScope" NOT NULL DEFAULT 'PRIVATE',
    "allowedRoleKeys" JSONB,
    "allowedUserIds" JSONB,
    "configJson" JSONB NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,

    CONSTRAINT "ReportSavedView_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReportFavorite" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "targetKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReportFavorite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReportRecentView" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "targetKey" TEXT NOT NULL,
    "viewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "viewCount" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "ReportRecentView_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReportSchedule" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "targetKey" TEXT NOT NULL,
    "reportDefinitionId" TEXT,
    "ownerUserId" TEXT NOT NULL,
    "frequency" "ReportScheduleFrequency" NOT NULL,
    "hour" INTEGER NOT NULL,
    "minute" INTEGER NOT NULL DEFAULT 0,
    "dayOfWeek" INTEGER,
    "dayOfMonth" INTEGER,
    "timezone" TEXT NOT NULL,
    "format" "ReportExportFormat" NOT NULL DEFAULT 'XLSX',
    "periodPreset" TEXT NOT NULL,
    "filtersJson" JSONB,
    "recipientUserIds" JSONB NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "nextRunAt" TIMESTAMP(3),
    "lastRunAt" TIMESTAMP(3),
    "lastRunStatus" "ReportRunStatus",
    "lastFailureReason" TEXT,
    "consecutiveFailureCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,

    CONSTRAINT "ReportSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReportRun" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "targetKey" TEXT NOT NULL,
    "reportDefinitionId" TEXT,
    "scheduleId" TEXT,
    "trigger" "ReportRunTrigger" NOT NULL DEFAULT 'MANUAL',
    "format" "ReportExportFormat",
    "status" "ReportRunStatus" NOT NULL DEFAULT 'QUEUED',
    "requestedByUserId" TEXT,
    "executedAsUserId" TEXT,
    "paramsJson" JSONB,
    "rowCount" INTEGER,
    "durationMs" INTEGER,
    "resultFileKey" TEXT,
    "fileName" TEXT,
    "contentType" TEXT,
    "fileSizeBytes" INTEGER,
    "expiresAt" TIMESTAMP(3),
    "failureReason" TEXT,
    "claimedAt" TIMESTAMP(3),
    "claimedBy" TEXT,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReportRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkforceSnapshotDaily" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "snapshotDate" DATE NOT NULL,
    "employeeId" TEXT NOT NULL,
    "organizationId" TEXT,
    "businessUnitId" TEXT,
    "departmentId" TEXT,
    "teamId" TEXT,
    "designationId" TEXT,
    "employeeLevelId" TEXT,
    "employmentTypeId" TEXT,
    "locationId" TEXT,
    "managerEmployeeId" TEXT,
    "employmentStatus" "EmployeeEmploymentStatus" NOT NULL,
    "employeeType" "EmployeeType",
    "workMode" "EmployeeWorkMode",
    "gender" "EmployeeGender",
    "hireDate" TIMESTAMP(3) NOT NULL,
    "terminationDate" TIMESTAMP(3),
    "isJoiner" BOOLEAN NOT NULL DEFAULT false,
    "isLeaver" BOOLEAN NOT NULL DEFAULT false,
    "tenureDays" INTEGER NOT NULL DEFAULT 0,
    "derivation" "WorkforceSnapshotDerivation" NOT NULL DEFAULT 'OBSERVED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkforceSnapshotDaily_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReportDefinition_tenantId_category_idx" ON "ReportDefinition"("tenantId", "category");

-- CreateIndex
CREATE INDEX "ReportDefinition_tenantId_dataSourceKey_idx" ON "ReportDefinition"("tenantId", "dataSourceKey");

-- CreateIndex
CREATE INDEX "ReportDefinition_tenantId_ownerUserId_idx" ON "ReportDefinition"("tenantId", "ownerUserId");

-- CreateIndex
CREATE INDEX "ReportDefinition_tenantId_isActive_idx" ON "ReportDefinition"("tenantId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "ReportDefinition_tenantId_key_key" ON "ReportDefinition"("tenantId", "key");

-- CreateIndex
CREATE INDEX "ReportSavedView_tenantId_surfaceKey_idx" ON "ReportSavedView"("tenantId", "surfaceKey");

-- CreateIndex
CREATE INDEX "ReportSavedView_tenantId_ownerUserId_idx" ON "ReportSavedView"("tenantId", "ownerUserId");

-- CreateIndex
CREATE INDEX "ReportSavedView_tenantId_surfaceKey_isActive_idx" ON "ReportSavedView"("tenantId", "surfaceKey", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "ReportSavedView_tenantId_surfaceKey_slug_key" ON "ReportSavedView"("tenantId", "surfaceKey", "slug");

-- CreateIndex
CREATE INDEX "ReportFavorite_tenantId_userId_idx" ON "ReportFavorite"("tenantId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "ReportFavorite_tenantId_userId_targetKey_key" ON "ReportFavorite"("tenantId", "userId", "targetKey");

-- CreateIndex
CREATE INDEX "ReportRecentView_tenantId_userId_viewedAt_idx" ON "ReportRecentView"("tenantId", "userId", "viewedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ReportRecentView_tenantId_userId_targetKey_key" ON "ReportRecentView"("tenantId", "userId", "targetKey");

-- CreateIndex
CREATE INDEX "ReportSchedule_tenantId_isEnabled_nextRunAt_idx" ON "ReportSchedule"("tenantId", "isEnabled", "nextRunAt");

-- CreateIndex
CREATE INDEX "ReportSchedule_tenantId_ownerUserId_idx" ON "ReportSchedule"("tenantId", "ownerUserId");

-- CreateIndex
CREATE INDEX "ReportSchedule_tenantId_targetKey_idx" ON "ReportSchedule"("tenantId", "targetKey");

-- CreateIndex
CREATE INDEX "ReportSchedule_isEnabled_nextRunAt_idx" ON "ReportSchedule"("isEnabled", "nextRunAt");

-- CreateIndex
CREATE INDEX "ReportRun_tenantId_status_createdAt_idx" ON "ReportRun"("tenantId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "ReportRun_tenantId_targetKey_createdAt_idx" ON "ReportRun"("tenantId", "targetKey", "createdAt");

-- CreateIndex
CREATE INDEX "ReportRun_tenantId_requestedByUserId_createdAt_idx" ON "ReportRun"("tenantId", "requestedByUserId", "createdAt");

-- CreateIndex
CREATE INDEX "ReportRun_status_claimedAt_idx" ON "ReportRun"("status", "claimedAt");

-- CreateIndex
CREATE INDEX "ReportRun_expiresAt_idx" ON "ReportRun"("expiresAt");

-- CreateIndex
CREATE INDEX "WorkforceSnapshotDaily_tenantId_snapshotDate_idx" ON "WorkforceSnapshotDaily"("tenantId", "snapshotDate");

-- CreateIndex
CREATE INDEX "WorkforceSnapshotDaily_tenantId_snapshotDate_employmentStat_idx" ON "WorkforceSnapshotDaily"("tenantId", "snapshotDate", "employmentStatus");

-- CreateIndex
CREATE INDEX "WorkforceSnapshotDaily_tenantId_snapshotDate_departmentId_idx" ON "WorkforceSnapshotDaily"("tenantId", "snapshotDate", "departmentId");

-- CreateIndex
CREATE INDEX "WorkforceSnapshotDaily_tenantId_snapshotDate_businessUnitId_idx" ON "WorkforceSnapshotDaily"("tenantId", "snapshotDate", "businessUnitId");

-- CreateIndex
CREATE INDEX "WorkforceSnapshotDaily_tenantId_snapshotDate_locationId_idx" ON "WorkforceSnapshotDaily"("tenantId", "snapshotDate", "locationId");

-- CreateIndex
CREATE INDEX "WorkforceSnapshotDaily_tenantId_employeeId_snapshotDate_idx" ON "WorkforceSnapshotDaily"("tenantId", "employeeId", "snapshotDate");

-- CreateIndex
CREATE INDEX "WorkforceSnapshotDaily_tenantId_snapshotDate_isJoiner_idx" ON "WorkforceSnapshotDaily"("tenantId", "snapshotDate", "isJoiner");

-- CreateIndex
CREATE INDEX "WorkforceSnapshotDaily_tenantId_snapshotDate_isLeaver_idx" ON "WorkforceSnapshotDaily"("tenantId", "snapshotDate", "isLeaver");

-- CreateIndex
CREATE UNIQUE INDEX "WorkforceSnapshotDaily_tenantId_snapshotDate_employeeId_key" ON "WorkforceSnapshotDaily"("tenantId", "snapshotDate", "employeeId");

-- AddForeignKey
ALTER TABLE "ReportDefinition" ADD CONSTRAINT "ReportDefinition_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportDefinition" ADD CONSTRAINT "ReportDefinition_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportSavedView" ADD CONSTRAINT "ReportSavedView_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportSavedView" ADD CONSTRAINT "ReportSavedView_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportFavorite" ADD CONSTRAINT "ReportFavorite_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportFavorite" ADD CONSTRAINT "ReportFavorite_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportRecentView" ADD CONSTRAINT "ReportRecentView_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportRecentView" ADD CONSTRAINT "ReportRecentView_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportSchedule" ADD CONSTRAINT "ReportSchedule_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportSchedule" ADD CONSTRAINT "ReportSchedule_reportDefinitionId_fkey" FOREIGN KEY ("reportDefinitionId") REFERENCES "ReportDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportSchedule" ADD CONSTRAINT "ReportSchedule_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportRun" ADD CONSTRAINT "ReportRun_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportRun" ADD CONSTRAINT "ReportRun_reportDefinitionId_fkey" FOREIGN KEY ("reportDefinitionId") REFERENCES "ReportDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportRun" ADD CONSTRAINT "ReportRun_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "ReportSchedule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkforceSnapshotDaily" ADD CONSTRAINT "WorkforceSnapshotDaily_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkforceSnapshotDaily" ADD CONSTRAINT "WorkforceSnapshotDaily_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

