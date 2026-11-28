-- DP-MASTER WP-03.S3: durable workflow execution on the outbox.
-- Adds the outbox event type, a RUNNING run status, the run's event id (one run
-- per workflow per event) and the per-action/recipient step ledger.
-- Additive only: nothing existing is altered, narrowed or removed.
-- Rollback (nothing depends on these until the code that writes them runs):
--   remove the "WorkflowRunStep" table and the "WorkflowStepStatus" type,
--   remove the "WorkflowRun_workflowId_eventId_key" index and "WorkflowRun"."eventId".
--   PostgreSQL cannot remove enum values; the two added values are harmless unused.

-- CreateEnum
CREATE TYPE "WorkflowStepStatus" AS ENUM ('IN_PROGRESS', 'SUCCEEDED', 'FAILED', 'SKIPPED');

-- AlterEnum
ALTER TYPE "DomainEventType" ADD VALUE 'WORKFLOW_EVENT_RECEIVED';

-- AlterEnum
ALTER TYPE "WorkflowRunStatus" ADD VALUE 'RUNNING';

-- AlterTable
ALTER TABLE "WorkflowRun" ADD COLUMN     "eventId" TEXT;

-- CreateTable
CREATE TABLE "WorkflowRunStep" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "stepKey" TEXT NOT NULL,
    "actionIndex" INTEGER NOT NULL,
    "actionType" "WorkflowActionType" NOT NULL,
    "recipientMode" TEXT NOT NULL,
    "status" "WorkflowStepStatus" NOT NULL,
    "permanent" BOOLEAN NOT NULL DEFAULT false,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "WorkflowRunStep_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WorkflowRunStep_runId_idx" ON "WorkflowRunStep"("runId");

-- CreateIndex
CREATE INDEX "WorkflowRunStep_tenantId_status_idx" ON "WorkflowRunStep"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "WorkflowRunStep_tenantId_stepKey_key" ON "WorkflowRunStep"("tenantId", "stepKey");

-- CreateIndex
CREATE UNIQUE INDEX "WorkflowRun_workflowId_eventId_key" ON "WorkflowRun"("workflowId", "eventId");

-- AddForeignKey
ALTER TABLE "WorkflowRunStep" ADD CONSTRAINT "WorkflowRunStep_runId_fkey" FOREIGN KEY ("runId") REFERENCES "WorkflowRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
