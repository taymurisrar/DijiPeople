-- DP-MASTER WP-27: daily update policy, updates and items. Additive only.

-- CreateEnum
CREATE TYPE "DailyUpdateStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'ACKNOWLEDGED');

-- CreateEnum
CREATE TYPE "DailyUpdateSection" AS ENUM ('COMPLETED', 'IN_PROGRESS', 'NEXT', 'BLOCKER', 'UNPLANNED', 'ACHIEVEMENT');

-- CreateEnum
CREATE TYPE "DailyUpdateItemOrigin" AS ENUM ('DRAFTED', 'MANUAL');

-- CreateTable
CREATE TABLE "DailyUpdatePolicy" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "workingDays" INTEGER[],
    "deadlineMinutes" INTEGER NOT NULL DEFAULT 1080,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "requireAcknowledgement" BOOLEAN NOT NULL DEFAULT false,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyUpdatePolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyUpdate" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "forDate" DATE NOT NULL,
    "status" "DailyUpdateStatus" NOT NULL DEFAULT 'DRAFT',
    "summary" TEXT,
    "late" BOOLEAN NOT NULL DEFAULT false,
    "submittedAt" TIMESTAMP(3),
    "acknowledgedById" TEXT,
    "acknowledgedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyUpdate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyUpdateItem" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "dailyUpdateId" TEXT NOT NULL,
    "section" "DailyUpdateSection" NOT NULL,
    "text" TEXT NOT NULL,
    "origin" "DailyUpdateItemOrigin" NOT NULL DEFAULT 'MANUAL',
    "contributionEntryId" TEXT,
    "workItemId" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "DailyUpdateItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DailyUpdatePolicy_tenantId_key" ON "DailyUpdatePolicy"("tenantId");

-- CreateIndex
CREATE INDEX "DailyUpdate_tenantId_forDate_status_idx" ON "DailyUpdate"("tenantId", "forDate", "status");

-- CreateIndex
CREATE UNIQUE INDEX "DailyUpdate_tenantId_employeeId_forDate_key" ON "DailyUpdate"("tenantId", "employeeId", "forDate");

-- CreateIndex
CREATE INDEX "DailyUpdateItem_tenantId_dailyUpdateId_idx" ON "DailyUpdateItem"("tenantId", "dailyUpdateId");

-- AddForeignKey
ALTER TABLE "DailyUpdatePolicy" ADD CONSTRAINT "DailyUpdatePolicy_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyUpdate" ADD CONSTRAINT "DailyUpdate_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyUpdate" ADD CONSTRAINT "DailyUpdate_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyUpdateItem" ADD CONSTRAINT "DailyUpdateItem_dailyUpdateId_fkey" FOREIGN KEY ("dailyUpdateId") REFERENCES "DailyUpdate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
