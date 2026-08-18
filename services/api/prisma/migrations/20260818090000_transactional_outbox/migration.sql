
-- CreateEnum
CREATE TYPE "OutboxEventStatus" AS ENUM ('PENDING', 'CLAIMED', 'PROCESSED', 'RETRY_SCHEDULED', 'FAILED', 'MANUAL_ACTION_REQUIRED', 'DISCARDED');

-- CreateEnum
CREATE TYPE "DomainEventType" AS ENUM ('LEAD_SUBMITTED', 'PARTNER_INQUIRY_SUBMITTED', 'CUSTOMER_CREATED', 'CUSTOMER_ACTIVATED', 'CHECKOUT_STARTED', 'PAYMENT_CONFIRMED', 'PAYMENT_FAILED', 'SUBSCRIPTION_ACTIVATED', 'SUBSCRIPTION_TERMINATED', 'ONBOARDING_REQUESTED', 'PROVISIONING_REQUESTED', 'PROVISIONING_STARTED', 'TENANT_READY', 'TENANT_PROVISIONING_FAILED', 'SEAT_OVERAGE_DETECTED', 'SEAT_CHANGE_REQUESTED', 'SEAT_CHANGE_APPLIED', 'PLAN_CHANGE_REQUESTED', 'PLAN_CHANGE_APPLIED', 'CANCELLATION_REQUESTED', 'RETENTION_STARTED', 'TENANT_DELETION_REQUESTED', 'TENANT_ERASURE_REQUESTED', 'TENANT_ERASED');

-- CreateTable
CREATE TABLE "OutboxEvent" (
    "id" TEXT NOT NULL,
    "eventType" "DomainEventType" NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "aggregateType" TEXT NOT NULL,
    "aggregateId" TEXT NOT NULL,
    "tenantId" TEXT,
    "customerAccountId" TEXT,
    "correlationId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "OutboxEventStatus" NOT NULL DEFAULT 'PENDING',
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 8,
    "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "claimedAt" TIMESTAMP(3),
    "claimedBy" TEXT,
    "processedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OutboxEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutboxEventConsumption" (
    "id" TEXT NOT NULL,
    "outboxEventId" TEXT NOT NULL,
    "consumerKey" TEXT NOT NULL,
    "succeeded" BOOLEAN NOT NULL,
    "attemptCount" INTEGER NOT NULL DEFAULT 1,
    "errorMessage" TEXT,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OutboxEventConsumption_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OutboxEvent_idempotencyKey_key" ON "OutboxEvent"("idempotencyKey");

-- CreateIndex
CREATE INDEX "OutboxEvent_status_availableAt_idx" ON "OutboxEvent"("status", "availableAt");

-- CreateIndex
CREATE INDEX "OutboxEvent_eventType_status_idx" ON "OutboxEvent"("eventType", "status");

-- CreateIndex
CREATE INDEX "OutboxEvent_aggregateType_aggregateId_idx" ON "OutboxEvent"("aggregateType", "aggregateId");

-- CreateIndex
CREATE INDEX "OutboxEvent_tenantId_createdAt_idx" ON "OutboxEvent"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "OutboxEvent_customerAccountId_createdAt_idx" ON "OutboxEvent"("customerAccountId", "createdAt");

-- CreateIndex
CREATE INDEX "OutboxEvent_correlationId_idx" ON "OutboxEvent"("correlationId");

-- CreateIndex
CREATE INDEX "OutboxEventConsumption_consumerKey_succeeded_idx" ON "OutboxEventConsumption"("consumerKey", "succeeded");

-- CreateIndex
CREATE UNIQUE INDEX "OutboxEventConsumption_outboxEventId_consumerKey_key" ON "OutboxEventConsumption"("outboxEventId", "consumerKey");

-- AddForeignKey
ALTER TABLE "OutboxEventConsumption" ADD CONSTRAINT "OutboxEventConsumption_outboxEventId_fkey" FOREIGN KEY ("outboxEventId") REFERENCES "OutboxEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

