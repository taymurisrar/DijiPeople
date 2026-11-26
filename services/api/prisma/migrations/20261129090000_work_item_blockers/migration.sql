-- DP-MASTER WP-38.S1: blockers and accountability on work items. Additive only.

-- CreateEnum
CREATE TYPE "WorkBlockerCategory" AS ENUM ('WAITING_ON_PERSON', 'WAITING_ON_APPROVAL', 'EQUIPMENT_OR_SYSTEM_DOWNTIME', 'EXTERNAL_PARTY', 'MATERIAL_OR_STOCK', 'DECISION_NEEDED', 'ACCESS_OR_TOOLING', 'OTHER');

-- CreateEnum
CREATE TYPE "WorkBlockerCause" AS ENUM ('UNDETERMINED', 'WORKER_CONTROLLABLE', 'TEAM_CONTROLLABLE', 'MANAGEMENT', 'EXTERNAL');

-- CreateEnum
CREATE TYPE "WorkBlockerStatus" AS ENUM ('OPEN', 'RESOLVED', 'CANCELLED');

-- CreateTable
CREATE TABLE "WorkItemBlocker" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "workItemId" TEXT NOT NULL,
    "category" "WorkBlockerCategory" NOT NULL,
    "cause" "WorkBlockerCause" NOT NULL DEFAULT 'UNDETERMINED',
    "causeSetById" TEXT,
    "reason" TEXT NOT NULL,
    "status" "WorkBlockerStatus" NOT NULL DEFAULT 'OPEN',
    "ownerEmployeeId" TEXT,
    "dueAt" TIMESTAMP(3),
    "raisedById" TEXT,
    "raisedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "escalationLevel" INTEGER NOT NULL DEFAULT 0,
    "escalatedAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "resolvedById" TEXT,
    "resolution" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkItemBlocker_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WorkItemBlocker_tenantId_workItemId_status_idx" ON "WorkItemBlocker"("tenantId", "workItemId", "status");

-- CreateIndex
CREATE INDEX "WorkItemBlocker_tenantId_status_dueAt_idx" ON "WorkItemBlocker"("tenantId", "status", "dueAt");

-- CreateIndex
CREATE INDEX "WorkItemBlocker_tenantId_ownerEmployeeId_status_idx" ON "WorkItemBlocker"("tenantId", "ownerEmployeeId", "status");

-- AddForeignKey
ALTER TABLE "WorkItemBlocker" ADD CONSTRAINT "WorkItemBlocker_workItemId_fkey" FOREIGN KEY ("workItemId") REFERENCES "WorkItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkItemBlocker" ADD CONSTRAINT "WorkItemBlocker_ownerEmployeeId_fkey" FOREIGN KEY ("ownerEmployeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
