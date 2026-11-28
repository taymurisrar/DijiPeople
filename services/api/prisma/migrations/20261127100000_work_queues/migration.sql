-- DP-MASTER WP-06.S1: work queues, SLA stamps on work items, owner-change history. Additive only.

-- AlterTable
ALTER TABLE "WorkItem" ADD COLUMN     "queueId" TEXT,
ADD COLUMN     "resolutionDueAt" TIMESTAMP(3),
ADD COLUMN     "respondedAt" TIMESTAMP(3),
ADD COLUMN     "responseDueAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "WorkQueue" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "teamId" TEXT,
    "businessUnitId" TEXT,
    "responseSlaMinutes" INTEGER,
    "resolutionSlaMinutes" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkQueue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkItemOwnerChange" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "workItemId" TEXT NOT NULL,
    "fromEmployeeId" TEXT,
    "toEmployeeId" TEXT,
    "reason" TEXT,
    "changedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkItemOwnerChange_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WorkQueue_tenantId_isActive_idx" ON "WorkQueue"("tenantId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "WorkQueue_tenantId_key_key" ON "WorkQueue"("tenantId", "key");

-- CreateIndex
CREATE INDEX "WorkItemOwnerChange_tenantId_workItemId_createdAt_idx" ON "WorkItemOwnerChange"("tenantId", "workItemId", "createdAt");

-- CreateIndex
CREATE INDEX "WorkItemOwnerChange_tenantId_toEmployeeId_idx" ON "WorkItemOwnerChange"("tenantId", "toEmployeeId");

-- CreateIndex
CREATE INDEX "WorkItem_tenantId_queueId_status_idx" ON "WorkItem"("tenantId", "queueId", "status");

-- CreateIndex
CREATE INDEX "WorkItem_tenantId_resolutionDueAt_idx" ON "WorkItem"("tenantId", "resolutionDueAt");

-- AddForeignKey
ALTER TABLE "WorkItem" ADD CONSTRAINT "WorkItem_queueId_fkey" FOREIGN KEY ("queueId") REFERENCES "WorkQueue"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkQueue" ADD CONSTRAINT "WorkQueue_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkItemOwnerChange" ADD CONSTRAINT "WorkItemOwnerChange_workItemId_fkey" FOREIGN KEY ("workItemId") REFERENCES "WorkItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
