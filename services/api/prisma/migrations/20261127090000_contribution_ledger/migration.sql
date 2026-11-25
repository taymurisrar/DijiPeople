-- DP-MASTER WP-30.S1: the contribution/evidence ledger. Additive only.

-- CreateEnum
CREATE TYPE "ContributionWorkKind" AS ENUM ('TASK', 'TRANSACTION', 'DUTY', 'OUTPUT', 'SERVICE', 'EVENT', 'CONTRIBUTION');

-- CreateEnum
CREATE TYPE "ContributionCategory" AS ENUM ('PLANNED', 'UNPLANNED', 'SUPPORT', 'MENTORING', 'KNOWLEDGE', 'QUALITY', 'SALES', 'ADMIN', 'TRAINING', 'COVER', 'DOWNTIME', 'BLOCKED');

-- CreateEnum
CREATE TYPE "ContributionMeasure" AS ENUM ('INTERVAL', 'QUANTITY', 'OCCURRENCE');

-- CreateEnum
CREATE TYPE "ContributionSource" AS ENUM ('SELF_REPORT', 'SUPERVISOR', 'MANUAL_IMPORT', 'INTEGRATION', 'WORK_RECORD', 'TIME_RECORD');

-- CreateEnum
CREATE TYPE "ContributionVerification" AS ENUM ('UNVERIFIED', 'VERIFIED', 'DISPUTED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ContributionState" AS ENUM ('ACTIVE', 'SUPERSEDED', 'WITHDRAWN');

-- CreateTable
CREATE TABLE "ContributionEntry" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "workKind" "ContributionWorkKind" NOT NULL,
    "workTypeKey" TEXT,
    "workProfileVersionId" TEXT,
    "workItemId" TEXT,
    "category" "ContributionCategory" NOT NULL DEFAULT 'PLANNED',
    "measure" "ContributionMeasure" NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "timezone" TEXT NOT NULL,
    "quantity" DECIMAL(18,4),
    "unitKey" TEXT,
    "source" "ContributionSource" NOT NULL,
    "sourceSystem" TEXT,
    "sourceRef" TEXT,
    "dedupeKey" TEXT,
    "verification" "ContributionVerification" NOT NULL DEFAULT 'UNVERIFIED',
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNote" TEXT,
    "capturedOffline" BOOLEAN NOT NULL DEFAULT false,
    "capturedAt" TIMESTAMP(3),
    "retrospective" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT,
    "state" "ContributionState" NOT NULL DEFAULT 'ACTIVE',
    "revision" INTEGER NOT NULL DEFAULT 1,
    "supersedesId" TEXT,
    "correctionReason" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContributionEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ContributionEntry_tenantId_employeeId_occurredAt_idx" ON "ContributionEntry"("tenantId", "employeeId", "occurredAt");

-- CreateIndex
CREATE INDEX "ContributionEntry_tenantId_employeeId_state_verification_idx" ON "ContributionEntry"("tenantId", "employeeId", "state", "verification");

-- CreateIndex
CREATE INDEX "ContributionEntry_tenantId_workItemId_idx" ON "ContributionEntry"("tenantId", "workItemId");

-- CreateIndex
CREATE INDEX "ContributionEntry_tenantId_workKind_occurredAt_idx" ON "ContributionEntry"("tenantId", "workKind", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "ContributionEntry_tenantId_dedupeKey_key" ON "ContributionEntry"("tenantId", "dedupeKey");

-- AddForeignKey
ALTER TABLE "ContributionEntry" ADD CONSTRAINT "ContributionEntry_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContributionEntry" ADD CONSTRAINT "ContributionEntry_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContributionEntry" ADD CONSTRAINT "ContributionEntry_workItemId_fkey" FOREIGN KEY ("workItemId") REFERENCES "WorkItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContributionEntry" ADD CONSTRAINT "ContributionEntry_supersedesId_fkey" FOREIGN KEY ("supersedesId") REFERENCES "ContributionEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;
