CREATE TYPE "PlatformEventSource" AS ENUM ('LANDING', 'WEB_APP', 'ADMIN', 'API', 'BACKGROUND', 'STRIPE', 'EMAIL', 'INTEGRATION');
CREATE TYPE "PlatformEventResult" AS ENUM ('SUCCEEDED', 'FAILED', 'PENDING', 'IGNORED');

CREATE TABLE "PlatformEvent" (
  "id" TEXT NOT NULL,
  "eventCode" TEXT NOT NULL,
  "source" "PlatformEventSource" NOT NULL,
  "result" "PlatformEventResult" NOT NULL DEFAULT 'SUCCEEDED',
  "severity" TEXT NOT NULL DEFAULT 'INFO',
  "environment" TEXT NOT NULL,
  "correlationId" TEXT NOT NULL,
  "entityType" TEXT,
  "entityId" TEXT,
  "tenantId" TEXT,
  "customerAccountId" TEXT,
  "actorType" TEXT,
  "actorId" TEXT,
  "route" TEXT,
  "metadata" JSONB,
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PlatformEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PlatformEvent_occurredAt_idx" ON "PlatformEvent"("occurredAt");
CREATE INDEX "PlatformEvent_eventCode_occurredAt_idx" ON "PlatformEvent"("eventCode", "occurredAt");
CREATE INDEX "PlatformEvent_source_occurredAt_idx" ON "PlatformEvent"("source", "occurredAt");
CREATE INDEX "PlatformEvent_result_severity_occurredAt_idx" ON "PlatformEvent"("result", "severity", "occurredAt");
CREATE INDEX "PlatformEvent_correlationId_idx" ON "PlatformEvent"("correlationId");
CREATE INDEX "PlatformEvent_tenantId_occurredAt_idx" ON "PlatformEvent"("tenantId", "occurredAt");
CREATE INDEX "PlatformEvent_customerAccountId_occurredAt_idx" ON "PlatformEvent"("customerAccountId", "occurredAt");
CREATE INDEX "PlatformEvent_entityType_entityId_idx" ON "PlatformEvent"("entityType", "entityId");
