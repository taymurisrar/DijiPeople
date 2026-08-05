CREATE TABLE "PlatformOutboundEmail" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "eventCode" TEXT NOT NULL,
  "recipient" TEXT NOT NULL,
  "subject" TEXT NOT NULL,
  "htmlBody" TEXT NOT NULL,
  "textBody" TEXT,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "providerType" TEXT,
  "providerMessageId" TEXT,
  "entityType" TEXT,
  "entityId" TEXT,
  "requestedById" TEXT,
  "metadata" JSONB,
  "errorMessage" TEXT,
  "sentAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PlatformOutboundEmail_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PlatformOutboundEmail_eventCode_createdAt_idx"
  ON "PlatformOutboundEmail"("eventCode", "createdAt");
CREATE INDEX "PlatformOutboundEmail_entityType_entityId_createdAt_idx"
  ON "PlatformOutboundEmail"("entityType", "entityId", "createdAt");
CREATE INDEX "PlatformOutboundEmail_recipient_createdAt_idx"
  ON "PlatformOutboundEmail"("recipient", "createdAt");
CREATE INDEX "PlatformOutboundEmail_status_createdAt_idx"
  ON "PlatformOutboundEmail"("status", "createdAt");
