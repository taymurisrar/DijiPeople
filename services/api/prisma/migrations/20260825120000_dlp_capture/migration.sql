
-- CreateEnum
CREATE TYPE "DlpRuleAction" AS ENUM ('OBSERVE', 'ALERT', 'BLOCK');

-- AlterTable
ALTER TABLE "AgentTrackingSettings" ADD COLUMN     "allowClipboardCapture" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "allowScreenshotCapture" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "clipboardFullContent" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "dlpConsentRequired" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "screenshotRetentionDays" INTEGER NOT NULL DEFAULT 30;

-- CreateTable
CREATE TABLE "DlpRule" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "sourceAppPatterns" JSONB NOT NULL,
    "channelAppPatterns" JSONB NOT NULL,
    "action" "DlpRuleAction" NOT NULL DEFAULT 'OBSERVE',
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DlpRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClipboardCaptureEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sourceApp" TEXT,
    "sourceAppPath" TEXT,
    "destinationApp" TEXT,
    "contentBytes" INTEGER NOT NULL,
    "contentSha256" TEXT NOT NULL,
    "encryptedContent" TEXT,
    "overCap" BOOLEAN NOT NULL DEFAULT false,
    "firedRuleId" TEXT,
    "agentVersion" TEXT NOT NULL,
    "dedupeKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClipboardCaptureEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScreenCaptureEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "firedRuleId" TEXT,
    "capturedReason" TEXT,
    "storageKey" TEXT,
    "contentBytes" INTEGER NOT NULL,
    "contentSha256" TEXT NOT NULL,
    "agentVersion" TEXT NOT NULL,
    "dedupeKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScreenCaptureEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DlpAlert" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "clipboardEventId" TEXT,
    "screenshotEventId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DlpAlert_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DlpRule_tenantId_enabled_idx" ON "DlpRule"("tenantId", "enabled");

-- CreateIndex
CREATE UNIQUE INDEX "ClipboardCaptureEvent_dedupeKey_key" ON "ClipboardCaptureEvent"("dedupeKey");

-- CreateIndex
CREATE INDEX "ClipboardCaptureEvent_tenantId_employeeId_occurredAt_idx" ON "ClipboardCaptureEvent"("tenantId", "employeeId", "occurredAt");

-- CreateIndex
CREATE INDEX "ClipboardCaptureEvent_tenantId_occurredAt_idx" ON "ClipboardCaptureEvent"("tenantId", "occurredAt");

-- CreateIndex
CREATE INDEX "ClipboardCaptureEvent_tenantId_firedRuleId_idx" ON "ClipboardCaptureEvent"("tenantId", "firedRuleId");

-- CreateIndex
CREATE UNIQUE INDEX "ScreenCaptureEvent_dedupeKey_key" ON "ScreenCaptureEvent"("dedupeKey");

-- CreateIndex
CREATE INDEX "ScreenCaptureEvent_tenantId_employeeId_occurredAt_idx" ON "ScreenCaptureEvent"("tenantId", "employeeId", "occurredAt");

-- CreateIndex
CREATE INDEX "ScreenCaptureEvent_tenantId_occurredAt_idx" ON "ScreenCaptureEvent"("tenantId", "occurredAt");

-- CreateIndex
CREATE INDEX "ScreenCaptureEvent_tenantId_firedRuleId_idx" ON "ScreenCaptureEvent"("tenantId", "firedRuleId");

-- CreateIndex
CREATE INDEX "DlpAlert_tenantId_occurredAt_idx" ON "DlpAlert"("tenantId", "occurredAt");

-- CreateIndex
CREATE INDEX "DlpAlert_tenantId_employeeId_occurredAt_idx" ON "DlpAlert"("tenantId", "employeeId", "occurredAt");

-- CreateIndex
CREATE INDEX "DlpAlert_tenantId_ruleId_idx" ON "DlpAlert"("tenantId", "ruleId");

-- CreateIndex
CREATE INDEX "DlpAlert_tenantId_status_idx" ON "DlpAlert"("tenantId", "status");

-- AddForeignKey
ALTER TABLE "DlpRule" ADD CONSTRAINT "DlpRule_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClipboardCaptureEvent" ADD CONSTRAINT "ClipboardCaptureEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScreenCaptureEvent" ADD CONSTRAINT "ScreenCaptureEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DlpAlert" ADD CONSTRAINT "DlpAlert_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

