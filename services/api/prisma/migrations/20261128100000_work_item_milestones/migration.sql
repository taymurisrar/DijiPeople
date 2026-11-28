-- DP-MASTER WP-06.S2: project milestones on work items. Additive only.

-- AlterEnum
ALTER TYPE "WorkItemKind" ADD VALUE 'MILESTONE';

-- AlterTable
ALTER TABLE "WorkItem" ADD COLUMN     "milestoneId" TEXT;

-- CreateIndex
CREATE INDEX "WorkItem_tenantId_projectId_kind_idx" ON "WorkItem"("tenantId", "projectId", "kind");

-- CreateIndex
CREATE INDEX "WorkItem_tenantId_milestoneId_idx" ON "WorkItem"("tenantId", "milestoneId");

-- AddForeignKey
ALTER TABLE "WorkItem" ADD CONSTRAINT "WorkItem_milestoneId_fkey" FOREIGN KEY ("milestoneId") REFERENCES "WorkItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
