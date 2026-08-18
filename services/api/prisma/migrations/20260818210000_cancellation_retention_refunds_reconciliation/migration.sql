-- CreateEnum
CREATE TYPE "CancellationType" AS ENUM ('CANCEL_RENEWAL', 'TERMINATE_NOW');

-- CreateEnum
CREATE TYPE "CancellationStatus" AS ENUM ('PENDING_PERIOD_END', 'TERMINATED', 'REVOKED');

-- CreateEnum
CREATE TYPE "RetentionStatus" AS ENUM ('RETAINING', 'ON_HOLD', 'ERASURE_SCHEDULED', 'ERASED', 'RESTORED');

-- CreateEnum
CREATE TYPE "RetentionHoldType" AS ENUM ('LEGAL', 'SECURITY', 'BILLING_DISPUTE', 'ADMINISTRATIVE');

-- CreateEnum
CREATE TYPE "DeletionRequestOrigin" AS ENUM ('TENANT_OWNER', 'PLATFORM_ADMIN');

-- CreateEnum
CREATE TYPE "DeletionRequestStatus" AS ENUM ('REQUESTED', 'APPROVED', 'REJECTED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "RefundStatus" AS ENUM ('REQUESTED', 'APPROVED', 'REJECTED', 'PROCESSED', 'FAILED');

-- CreateEnum
CREATE TYPE "RefundReasonCode" AS ENUM ('DUPLICATE_PAYMENT', 'BILLING_ERROR', 'LEGAL_REQUIREMENT', 'GOODWILL', 'MANUAL_CORRECTION');

-- CreateEnum
CREATE TYPE "ReconciliationScope" AS ENUM ('STRIPE', 'INTERNAL');

-- CreateEnum
CREATE TYPE "ReconciliationRunStatus" AS ENUM ('RUNNING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "ReconciliationOutcome" AS ENUM ('HEALTHY', 'WARNING', 'MISMATCH', 'AUTO_FIXED', 'MANUAL_ACTION_REQUIRED');

-- CreateTable
CREATE TABLE "SubscriptionCancellation" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "type" "CancellationType" NOT NULL,
    "status" "CancellationStatus" NOT NULL DEFAULT 'PENDING_PERIOD_END',
    "paidThroughDate" TIMESTAMP(3),
    "effectiveAt" TIMESTAMP(3) NOT NULL,
    "terminatedAt" TIMESTAMP(3),
    "reason" TEXT,
    "feedback" TEXT,
    "requestedByUserId" TEXT,
    "revokedAt" TIMESTAMP(3),
    "revokedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SubscriptionCancellation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TenantRetention" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "status" "RetentionStatus" NOT NULL DEFAULT 'RETAINING',
    "retentionStartedAt" TIMESTAMP(3) NOT NULL,
    "scheduledErasureAt" TIMESTAMP(3) NOT NULL,
    "retentionDays" INTEGER NOT NULL,
    "policyVersion" TEXT,
    "erasureRequestedAt" TIMESTAMP(3),
    "erasedAt" TIMESTAMP(3),
    "restoredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenantRetention_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RetentionHold" (
    "id" TEXT NOT NULL,
    "tenantRetentionId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "type" "RetentionHoldType" NOT NULL,
    "reason" TEXT NOT NULL,
    "placedByPlatformUser" TEXT,
    "placedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "releasedByPlatformUser" TEXT,
    "releasedAt" TIMESTAMP(3),
    "releaseReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RetentionHold_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TenantDeletionRequest" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "origin" "DeletionRequestOrigin" NOT NULL,
    "status" "DeletionRequestStatus" NOT NULL DEFAULT 'REQUESTED',
    "reason" TEXT NOT NULL,
    "confirmationPhrase" TEXT,
    "requestedByUserId" TEXT,
    "requestedByPlatformUser" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedByPlatformUser" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNote" TEXT,
    "scheduledFor" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenantDeletionRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefundRequest" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "customerAccountId" TEXT NOT NULL,
    "paymentId" TEXT,
    "invoiceId" TEXT,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "reasonCode" "RefundReasonCode" NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "RefundStatus" NOT NULL DEFAULT 'REQUESTED',
    "requestedByPlatformUser" TEXT,
    "approvedByPlatformUser" TEXT,
    "approvedAt" TIMESTAMP(3),
    "processedAt" TIMESTAMP(3),
    "providerRefundId" TEXT,
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RefundRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReconciliationRun" (
    "id" TEXT NOT NULL,
    "scope" "ReconciliationScope" NOT NULL,
    "status" "ReconciliationRunStatus" NOT NULL DEFAULT 'RUNNING',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "checkedCount" INTEGER NOT NULL DEFAULT 0,
    "healthyCount" INTEGER NOT NULL DEFAULT 0,
    "warningCount" INTEGER NOT NULL DEFAULT 0,
    "mismatchCount" INTEGER NOT NULL DEFAULT 0,
    "autoFixedCount" INTEGER NOT NULL DEFAULT 0,
    "manualActionRequiredCount" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,

    CONSTRAINT "ReconciliationRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReconciliationFinding" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "outcome" "ReconciliationOutcome" NOT NULL,
    "checkKey" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "tenantId" TEXT,
    "expectedValue" TEXT,
    "actualValue" TEXT,
    "detail" TEXT,
    "autoFixApplied" BOOLEAN NOT NULL DEFAULT false,
    "autoFixDetail" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReconciliationFinding_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SubscriptionCancellation_subscriptionId_status_idx" ON "SubscriptionCancellation"("subscriptionId", "status");

-- CreateIndex
CREATE INDEX "SubscriptionCancellation_status_effectiveAt_idx" ON "SubscriptionCancellation"("status", "effectiveAt");

-- CreateIndex
CREATE INDEX "SubscriptionCancellation_tenantId_createdAt_idx" ON "SubscriptionCancellation"("tenantId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "TenantRetention_tenantId_key" ON "TenantRetention"("tenantId");

-- CreateIndex
CREATE INDEX "TenantRetention_status_scheduledErasureAt_idx" ON "TenantRetention"("status", "scheduledErasureAt");

-- CreateIndex
CREATE INDEX "RetentionHold_tenantRetentionId_releasedAt_idx" ON "RetentionHold"("tenantRetentionId", "releasedAt");

-- CreateIndex
CREATE INDEX "RetentionHold_tenantId_type_idx" ON "RetentionHold"("tenantId", "type");

-- CreateIndex
CREATE INDEX "TenantDeletionRequest_tenantId_status_idx" ON "TenantDeletionRequest"("tenantId", "status");

-- CreateIndex
CREATE INDEX "TenantDeletionRequest_status_scheduledFor_idx" ON "TenantDeletionRequest"("status", "scheduledFor");

-- CreateIndex
CREATE INDEX "RefundRequest_customerAccountId_status_idx" ON "RefundRequest"("customerAccountId", "status");

-- CreateIndex
CREATE INDEX "RefundRequest_status_createdAt_idx" ON "RefundRequest"("status", "createdAt");

-- CreateIndex
CREATE INDEX "ReconciliationRun_scope_startedAt_idx" ON "ReconciliationRun"("scope", "startedAt");

-- CreateIndex
CREATE INDEX "ReconciliationRun_status_idx" ON "ReconciliationRun"("status");

-- CreateIndex
CREATE INDEX "ReconciliationFinding_runId_outcome_idx" ON "ReconciliationFinding"("runId", "outcome");

-- CreateIndex
CREATE INDEX "ReconciliationFinding_entityType_entityId_idx" ON "ReconciliationFinding"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "ReconciliationFinding_tenantId_idx" ON "ReconciliationFinding"("tenantId");

-- AddForeignKey
ALTER TABLE "SubscriptionCancellation" ADD CONSTRAINT "SubscriptionCancellation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubscriptionCancellation" ADD CONSTRAINT "SubscriptionCancellation_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantRetention" ADD CONSTRAINT "TenantRetention_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetentionHold" ADD CONSTRAINT "RetentionHold_tenantRetentionId_fkey" FOREIGN KEY ("tenantRetentionId") REFERENCES "TenantRetention"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantDeletionRequest" ADD CONSTRAINT "TenantDeletionRequest_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefundRequest" ADD CONSTRAINT "RefundRequest_customerAccountId_fkey" FOREIGN KEY ("customerAccountId") REFERENCES "CustomerAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReconciliationFinding" ADD CONSTRAINT "ReconciliationFinding_runId_fkey" FOREIGN KEY ("runId") REFERENCES "ReconciliationRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

