-- DP-MASTER WP-03.S4: per-recipient steps, pinned template, delivery reconciliation columns. Additive only.

-- AlterTable
ALTER TABLE "WorkflowRunStep" ADD COLUMN     "deliveryLogId" TEXT,
ADD COLUMN     "deliveryStatus" "EmailDeliveryStatus",
ADD COLUMN     "recipientIndex" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "reconciledAt" TIMESTAMP(3),
ADD COLUMN     "templateDrift" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "templateId" TEXT,
ADD COLUMN     "templateVersion" INTEGER;

-- CreateIndex
CREATE INDEX "WorkflowRunStep_tenantId_deliveryStatus_idx" ON "WorkflowRunStep"("tenantId", "deliveryStatus");
