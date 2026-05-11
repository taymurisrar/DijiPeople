-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('INFO', 'ACTION_REQUIRED', 'APPROVAL', 'REMINDER', 'WARNING', 'SYSTEM');

-- AlterTable
ALTER TABLE "EmailDeliveryLog" ADD COLUMN     "lastRetryAt" TIMESTAMP(3),
ADD COLUMN     "maxRetryCount" INTEGER NOT NULL DEFAULT 3,
ADD COLUMN     "nextRetryAt" TIMESTAMP(3),
ADD COLUMN     "retryCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "retryable" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "eventCode" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL DEFAULT 'INFO',
    "category" "NotificationEventCategory" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "targetUrl" TEXT,
    "payload" JSONB,
    "metadata" JSONB,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationRecipient" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "notificationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "readAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationRecipient_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Notification_tenantId_idx" ON "Notification"("tenantId");

-- CreateIndex
CREATE INDEX "Notification_tenantId_eventCode_idx" ON "Notification"("tenantId", "eventCode");

-- CreateIndex
CREATE INDEX "Notification_tenantId_category_idx" ON "Notification"("tenantId", "category");

-- CreateIndex
CREATE INDEX "Notification_tenantId_createdAt_idx" ON "Notification"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "NotificationRecipient_tenantId_idx" ON "NotificationRecipient"("tenantId");

-- CreateIndex
CREATE INDEX "NotificationRecipient_tenantId_userId_idx" ON "NotificationRecipient"("tenantId", "userId");

-- CreateIndex
CREATE INDEX "NotificationRecipient_tenantId_userId_readAt_idx" ON "NotificationRecipient"("tenantId", "userId", "readAt");

-- CreateIndex
CREATE INDEX "NotificationRecipient_tenantId_userId_archivedAt_idx" ON "NotificationRecipient"("tenantId", "userId", "archivedAt");

-- CreateIndex
CREATE INDEX "NotificationRecipient_notificationId_idx" ON "NotificationRecipient"("notificationId");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationRecipient_notificationId_userId_key" ON "NotificationRecipient"("notificationId", "userId");

-- CreateIndex
CREATE INDEX "EmailDeliveryLog_tenantId_retryable_nextRetryAt_idx" ON "EmailDeliveryLog"("tenantId", "retryable", "nextRetryAt");

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_eventCode_fkey" FOREIGN KEY ("eventCode") REFERENCES "NotificationEvent"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationRecipient" ADD CONSTRAINT "NotificationRecipient_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationRecipient" ADD CONSTRAINT "NotificationRecipient_notificationId_fkey" FOREIGN KEY ("notificationId") REFERENCES "Notification"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationRecipient" ADD CONSTRAINT "NotificationRecipient_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
