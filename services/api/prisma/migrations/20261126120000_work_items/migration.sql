-- DP-MASTER WP-02.S1 (ADR-0030): the work item, its contributors and dependencies.
-- Additive only: three new tables and three new enums; no existing table is
-- altered. The module is not wired to any plan or role beyond HR (no entitlement
-- change), so this migration changes no existing right.
-- Rollback: remove "WorkItemDependency", "WorkItemContributor" and "WorkItem"
-- (in that order), then the types "WorkItemPriority", "WorkItemStatus" and
-- "WorkItemKind". Nothing else references them.

-- CreateEnum
CREATE TYPE "WorkItemKind" AS ENUM ('TASK', 'SERVICE_JOB', 'DUTY_OCCURRENCE');

-- CreateEnum
CREATE TYPE "WorkItemStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'BLOCKED', 'IN_REVIEW', 'DONE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "WorkItemPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');

-- CreateTable
CREATE TABLE "WorkItem" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "kind" "WorkItemKind" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "WorkItemStatus" NOT NULL DEFAULT 'OPEN',
    "priority" "WorkItemPriority" NOT NULL DEFAULT 'NORMAL',
    "ownerEmployeeId" TEXT,
    "projectId" TEXT,
    "parentId" TEXT,
    "workTypeKey" TEXT,
    "workProfileVersionId" TEXT,
    "businessUnitId" TEXT,
    "teamId" TEXT,
    "departmentId" TEXT,
    "dueAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "externalSystem" TEXT,
    "externalRef" TEXT,
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkItemContributor" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "workItemId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "estimateMinutes" INTEGER,
    "actualMinutes" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkItemContributor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkItemDependency" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "workItemId" TEXT NOT NULL,
    "dependsOnId" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkItemDependency_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WorkItem_tenantId_status_idx" ON "WorkItem"("tenantId", "status");

-- CreateIndex
CREATE INDEX "WorkItem_tenantId_ownerEmployeeId_status_idx" ON "WorkItem"("tenantId", "ownerEmployeeId", "status");

-- CreateIndex
CREATE INDEX "WorkItem_tenantId_projectId_idx" ON "WorkItem"("tenantId", "projectId");

-- CreateIndex
CREATE INDEX "WorkItem_tenantId_parentId_idx" ON "WorkItem"("tenantId", "parentId");

-- CreateIndex
CREATE INDEX "WorkItem_tenantId_kind_status_idx" ON "WorkItem"("tenantId", "kind", "status");

-- CreateIndex
CREATE INDEX "WorkItem_tenantId_archivedAt_idx" ON "WorkItem"("tenantId", "archivedAt");

-- CreateIndex
CREATE INDEX "WorkItem_tenantId_externalSystem_externalRef_idx" ON "WorkItem"("tenantId", "externalSystem", "externalRef");

-- CreateIndex
CREATE INDEX "WorkItemContributor_tenantId_employeeId_idx" ON "WorkItemContributor"("tenantId", "employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkItemContributor_workItemId_employeeId_key" ON "WorkItemContributor"("workItemId", "employeeId");

-- CreateIndex
CREATE INDEX "WorkItemDependency_tenantId_dependsOnId_idx" ON "WorkItemDependency"("tenantId", "dependsOnId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkItemDependency_workItemId_dependsOnId_key" ON "WorkItemDependency"("workItemId", "dependsOnId");

-- AddForeignKey
ALTER TABLE "WorkItem" ADD CONSTRAINT "WorkItem_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkItem" ADD CONSTRAINT "WorkItem_ownerEmployeeId_fkey" FOREIGN KEY ("ownerEmployeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkItem" ADD CONSTRAINT "WorkItem_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkItem" ADD CONSTRAINT "WorkItem_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "WorkItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkItemContributor" ADD CONSTRAINT "WorkItemContributor_workItemId_fkey" FOREIGN KEY ("workItemId") REFERENCES "WorkItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkItemContributor" ADD CONSTRAINT "WorkItemContributor_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkItemDependency" ADD CONSTRAINT "WorkItemDependency_workItemId_fkey" FOREIGN KEY ("workItemId") REFERENCES "WorkItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkItemDependency" ADD CONSTRAINT "WorkItemDependency_dependsOnId_fkey" FOREIGN KEY ("dependsOnId") REFERENCES "WorkItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
