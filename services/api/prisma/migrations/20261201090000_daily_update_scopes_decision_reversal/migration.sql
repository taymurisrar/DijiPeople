-- DP-MASTER WP-27.S2 and WP-28.S2: scoped daily-update policies, escalation record, readable decision reversal. Additive only.

-- CreateEnum
CREATE TYPE "DailyUpdateCadence" AS ENUM ('WORKING_DAYS', 'PER_SHIFT');

-- AlterTable
ALTER TABLE "WorkDecision" ADD COLUMN     "reversedAt" TIMESTAMP(3),
ADD COLUMN     "reversedById" TEXT,
ADD COLUMN     "reversedReason" TEXT;

-- CreateTable
CREATE TABLE "DailyUpdateScopePolicy" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "teamId" TEXT,
    "businessUnitId" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "cadence" "DailyUpdateCadence" NOT NULL DEFAULT 'WORKING_DAYS',
    "workingDays" INTEGER[],
    "deadlineMinutes" INTEGER NOT NULL DEFAULT 1080,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "requireAcknowledgement" BOOLEAN NOT NULL DEFAULT false,
    "escalateAfterMinutes" INTEGER,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyUpdateScopePolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyUpdateEscalation" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "forDate" DATE NOT NULL,
    "notifiedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DailyUpdateEscalation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DailyUpdateScopePolicy_tenantId_enabled_idx" ON "DailyUpdateScopePolicy"("tenantId", "enabled");

-- CreateIndex
CREATE UNIQUE INDEX "DailyUpdateScopePolicy_tenantId_teamId_key" ON "DailyUpdateScopePolicy"("tenantId", "teamId");

-- CreateIndex
CREATE UNIQUE INDEX "DailyUpdateScopePolicy_tenantId_businessUnitId_key" ON "DailyUpdateScopePolicy"("tenantId", "businessUnitId");

-- CreateIndex
CREATE INDEX "DailyUpdateEscalation_tenantId_forDate_idx" ON "DailyUpdateEscalation"("tenantId", "forDate");

-- CreateIndex
CREATE UNIQUE INDEX "DailyUpdateEscalation_tenantId_employeeId_forDate_key" ON "DailyUpdateEscalation"("tenantId", "employeeId", "forDate");

-- AddForeignKey
ALTER TABLE "DailyUpdateScopePolicy" ADD CONSTRAINT "DailyUpdateScopePolicy_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
