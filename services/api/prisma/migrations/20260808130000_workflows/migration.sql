-- Tenant-authored workflows: when a notification event happens, run actions.
-- Placement and module reach mirror EmailTemplate so both are authored alike.

CREATE TYPE "WorkflowStatus" AS ENUM ('DRAFT', 'ACTIVE', 'INACTIVE');
CREATE TYPE "WorkflowActionType" AS ENUM ('SEND_EMAIL');
CREATE TYPE "WorkflowRunStatus" AS ENUM ('SUCCEEDED', 'FAILED', 'SKIPPED');

CREATE TABLE "Workflow" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "scopeKey" TEXT NOT NULL,
    "moduleKey" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "eventCode" TEXT NOT NULL,
    "status" "WorkflowStatus" NOT NULL DEFAULT 'DRAFT',
    "conditions" JSONB,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Workflow_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WorkflowAction" (
    "id" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "type" "WorkflowActionType" NOT NULL DEFAULT 'SEND_EMAIL',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "configuration" JSONB NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "WorkflowAction_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WorkflowRun" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "eventCode" TEXT NOT NULL,
    "status" "WorkflowRunStatus" NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "actionsRun" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "correlationId" TEXT,
    "context" JSONB,
    CONSTRAINT "WorkflowRun_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Workflow_tenantId_name_key" ON "Workflow"("tenantId", "name");
CREATE INDEX "Workflow_tenantId_eventCode_status_idx" ON "Workflow"("tenantId", "eventCode", "status");
CREATE INDEX "Workflow_tenantId_moduleKey_idx" ON "Workflow"("tenantId", "moduleKey");
CREATE INDEX "Workflow_scopeKey_idx" ON "Workflow"("scopeKey");
CREATE INDEX "WorkflowAction_workflowId_sortOrder_idx" ON "WorkflowAction"("workflowId", "sortOrder");
CREATE INDEX "WorkflowRun_tenantId_workflowId_startedAt_idx" ON "WorkflowRun"("tenantId", "workflowId", "startedAt");
CREATE INDEX "WorkflowRun_tenantId_status_idx" ON "WorkflowRun"("tenantId", "status");

ALTER TABLE "Workflow" ADD CONSTRAINT "Workflow_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Workflow" ADD CONSTRAINT "Workflow_eventCode_fkey" FOREIGN KEY ("eventCode") REFERENCES "NotificationEvent"("code") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WorkflowAction" ADD CONSTRAINT "WorkflowAction_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "Workflow"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkflowRun" ADD CONSTRAINT "WorkflowRun_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "Workflow"("id") ON DELETE CASCADE ON UPDATE CASCADE;
