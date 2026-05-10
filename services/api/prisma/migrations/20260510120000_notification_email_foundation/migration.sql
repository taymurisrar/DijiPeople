CREATE TYPE "NotificationChannel" AS ENUM ('IN_APP', 'EMAIL', 'SMS', 'PUSH');
CREATE TYPE "NotificationEventCategory" AS ENUM ('AUTH', 'APPROVAL', 'LEAVE', 'TIMESHEET', 'PAYROLL', 'EMPLOYEE', 'ONBOARDING', 'DOCUMENT', 'SYSTEM');
CREATE TYPE "EmailTemplateStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED');
CREATE TYPE "EmailProviderType" AS ENUM ('CONSOLE', 'DEV', 'SMTP', 'SES', 'SENDGRID', 'MAILGUN', 'POSTMARK', 'CUSTOM');
CREATE TYPE "EmailDeliveryStatus" AS ENUM ('REQUESTED', 'PENDING', 'PROCESSING', 'QUEUED', 'SENT', 'DELIVERED', 'FAILED', 'SKIPPED', 'DRY_RUN');

CREATE TABLE "NotificationEvent" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "category" "NotificationEventCategory" NOT NULL,
  "enabledByDefault" BOOLEAN NOT NULL DEFAULT true,
  "supportedChannels" "NotificationChannel"[] NOT NULL,
  "systemDefined" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "NotificationEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EmailTemplate" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT,
  "scopeKey" TEXT NOT NULL,
  "eventCode" TEXT NOT NULL,
  "templateKey" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "subjectTemplate" TEXT NOT NULL,
  "htmlTemplate" TEXT NOT NULL,
  "textTemplate" TEXT,
  "availableVariables" JSONB NOT NULL,
  "status" "EmailTemplateStatus" NOT NULL DEFAULT 'DRAFT',
  "version" INTEGER NOT NULL DEFAULT 1,
  "isSystem" BOOLEAN NOT NULL DEFAULT false,
  "createdBy" TEXT,
  "updatedBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EmailTemplate_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EmailProviderSetting" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "providerType" "EmailProviderType" NOT NULL,
  "providerName" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "isDefault" BOOLEAN NOT NULL DEFAULT false,
  "fromEmail" TEXT NOT NULL,
  "fromName" TEXT NOT NULL,
  "replyToEmail" TEXT,
  "configuration" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EmailProviderSetting_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EmailDeliveryLog" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "eventCode" TEXT NOT NULL,
  "templateId" TEXT,
  "providerType" "EmailProviderType",
  "recipient" TEXT NOT NULL,
  "cc" TEXT,
  "bcc" TEXT,
  "subject" TEXT NOT NULL,
  "channel" "NotificationChannel" NOT NULL DEFAULT 'EMAIL',
  "status" "EmailDeliveryStatus" NOT NULL DEFAULT 'REQUESTED',
  "providerMessageId" TEXT,
  "errorMessage" TEXT,
  "metadata" JSONB,
  "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processedAt" TIMESTAMP(3),
  "deliveredAt" TIMESTAMP(3),
  "failedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EmailDeliveryLog_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "NotificationPreference" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "userId" TEXT,
  "scopeKey" TEXT NOT NULL,
  "eventCode" TEXT NOT NULL,
  "channel" "NotificationChannel" NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "NotificationEvent_code_key" ON "NotificationEvent"("code");
CREATE INDEX "NotificationEvent_category_idx" ON "NotificationEvent"("category");
CREATE INDEX "NotificationEvent_systemDefined_idx" ON "NotificationEvent"("systemDefined");
CREATE INDEX "NotificationEvent_enabledByDefault_idx" ON "NotificationEvent"("enabledByDefault");

CREATE UNIQUE INDEX "EmailTemplate_scopeKey_templateKey_key" ON "EmailTemplate"("scopeKey", "templateKey");
CREATE INDEX "EmailTemplate_tenantId_idx" ON "EmailTemplate"("tenantId");
CREATE INDEX "EmailTemplate_eventCode_idx" ON "EmailTemplate"("eventCode");
CREATE INDEX "EmailTemplate_scopeKey_eventCode_version_idx" ON "EmailTemplate"("scopeKey", "eventCode", "version");
CREATE INDEX "EmailTemplate_status_idx" ON "EmailTemplate"("status");
CREATE INDEX "EmailTemplate_isSystem_idx" ON "EmailTemplate"("isSystem");
CREATE INDEX "EmailTemplate_tenantId_eventCode_status_idx" ON "EmailTemplate"("tenantId", "eventCode", "status");

CREATE UNIQUE INDEX "EmailProviderSetting_tenantId_providerName_key" ON "EmailProviderSetting"("tenantId", "providerName");
CREATE INDEX "EmailProviderSetting_tenantId_idx" ON "EmailProviderSetting"("tenantId");
CREATE INDEX "EmailProviderSetting_tenantId_providerType_idx" ON "EmailProviderSetting"("tenantId", "providerType");
CREATE INDEX "EmailProviderSetting_tenantId_enabled_idx" ON "EmailProviderSetting"("tenantId", "enabled");
CREATE INDEX "EmailProviderSetting_tenantId_isDefault_idx" ON "EmailProviderSetting"("tenantId", "isDefault");

CREATE INDEX "EmailDeliveryLog_tenantId_idx" ON "EmailDeliveryLog"("tenantId");
CREATE INDEX "EmailDeliveryLog_tenantId_eventCode_idx" ON "EmailDeliveryLog"("tenantId", "eventCode");
CREATE INDEX "EmailDeliveryLog_tenantId_status_idx" ON "EmailDeliveryLog"("tenantId", "status");
CREATE INDEX "EmailDeliveryLog_tenantId_recipient_idx" ON "EmailDeliveryLog"("tenantId", "recipient");
CREATE INDEX "EmailDeliveryLog_tenantId_requestedAt_idx" ON "EmailDeliveryLog"("tenantId", "requestedAt");
CREATE INDEX "EmailDeliveryLog_templateId_idx" ON "EmailDeliveryLog"("templateId");
CREATE INDEX "EmailDeliveryLog_providerMessageId_idx" ON "EmailDeliveryLog"("providerMessageId");

CREATE UNIQUE INDEX "NotificationPreference_scopeKey_eventCode_channel_key" ON "NotificationPreference"("scopeKey", "eventCode", "channel");
CREATE INDEX "NotificationPreference_tenantId_idx" ON "NotificationPreference"("tenantId");
CREATE INDEX "NotificationPreference_tenantId_userId_idx" ON "NotificationPreference"("tenantId", "userId");
CREATE INDEX "NotificationPreference_tenantId_eventCode_idx" ON "NotificationPreference"("tenantId", "eventCode");
CREATE INDEX "NotificationPreference_tenantId_channel_idx" ON "NotificationPreference"("tenantId", "channel");
CREATE INDEX "NotificationPreference_enabled_idx" ON "NotificationPreference"("enabled");

ALTER TABLE "EmailTemplate" ADD CONSTRAINT "EmailTemplate_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmailTemplate" ADD CONSTRAINT "EmailTemplate_eventCode_fkey" FOREIGN KEY ("eventCode") REFERENCES "NotificationEvent"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "EmailProviderSetting" ADD CONSTRAINT "EmailProviderSetting_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EmailDeliveryLog" ADD CONSTRAINT "EmailDeliveryLog_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmailDeliveryLog" ADD CONSTRAINT "EmailDeliveryLog_eventCode_fkey" FOREIGN KEY ("eventCode") REFERENCES "NotificationEvent"("code") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EmailDeliveryLog" ADD CONSTRAINT "EmailDeliveryLog_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "EmailTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "NotificationPreference" ADD CONSTRAINT "NotificationPreference_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "NotificationPreference" ADD CONSTRAINT "NotificationPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "NotificationPreference" ADD CONSTRAINT "NotificationPreference_eventCode_fkey" FOREIGN KEY ("eventCode") REFERENCES "NotificationEvent"("code") ON DELETE CASCADE ON UPDATE CASCADE;
