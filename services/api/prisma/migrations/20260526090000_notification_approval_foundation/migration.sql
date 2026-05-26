-- Notification, inbox, approval tracking, and SLA foundation for employee,
-- attendance, and leave workflows.

ALTER TYPE "NotificationEventCategory" ADD VALUE IF NOT EXISTS 'APPROVALS';
ALTER TYPE "NotificationEventCategory" ADD VALUE IF NOT EXISTS 'ATTENDANCE';
ALTER TYPE "NotificationEventCategory" ADD VALUE IF NOT EXISTS 'TASKS';

ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'SUCCESS';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'ERROR';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'APPROVAL_REQUIRED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'ESCALATION';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'SYSTEM_ALERT';

CREATE TYPE "NotificationStatus" AS ENUM ('UNREAD', 'READ', 'DISMISSED', 'ARCHIVED', 'EXPIRED', 'SUPERSEDED', 'ACTIONED');
CREATE TYPE "NotificationInteractionAction" AS ENUM ('CREATED', 'POPUP_SHOWN', 'READ', 'OPENED', 'DISMISSED', 'ARCHIVED', 'EXPIRED', 'SUPERSEDED', 'NAVIGATION_DENIED');
CREATE TYPE "NotificationDisplayMode" AS ENUM ('POPUP_AND_BELL', 'BELL_ONLY', 'INBOX_ONLY', 'EMAIL_ONLY');
CREATE TYPE "NotificationRecipientResolverType" AS ENUM ('SELF', 'REPORTING_MANAGER', 'RECORD_OWNER', 'APPROVAL_ASSIGNEE', 'HR_ROLE', 'MANAGER_ROLE', 'CUSTOM_ROLE', 'CUSTOM_USER');
CREATE TYPE "ApprovalRequestStatus" AS ENUM ('DRAFT', 'PENDING', 'APPROVED', 'REJECTED', 'RETURNED', 'CANCELLED', 'ESCALATED', 'COMPLETED');
CREATE TYPE "GenericApprovalStepStatus" AS ENUM ('NOT_STARTED', 'PENDING', 'APPROVED', 'REJECTED', 'RETURNED', 'SKIPPED', 'ESCALATED');
CREATE TYPE "ApprovalAssignmentStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'RETURNED', 'DELEGATED', 'EXPIRED', 'SUPERSEDED');
CREATE TYPE "ApprovalActionType" AS ENUM ('SUBMITTED', 'APPROVED', 'REJECTED', 'RETURNED', 'DELEGATED', 'ESCALATED', 'CANCELLED', 'COMMENTED');
CREATE TYPE "SlaStatus" AS ENUM ('NOT_APPLICABLE', 'ON_TRACK', 'DUE_SOON', 'BREACHED', 'ESCALATED');
CREATE TYPE "SlaTargetType" AS ENUM ('APPROVAL_REQUEST', 'APPROVAL_STEP', 'NOTIFICATION', 'RECORD');
CREATE TYPE "SlaEventType" AS ENUM ('STARTED', 'MILESTONE_REACHED', 'DUE_SOON', 'BREACHED', 'ESCALATED', 'COMPLETED', 'CANCELLED');

ALTER TABLE "Notification"
  ADD COLUMN "recipientUserId" TEXT,
  ADD COLUMN "actorUserId" TEXT,
  ADD COLUMN "eventKey" TEXT,
  ADD COLUMN "moduleKey" TEXT,
  ADD COLUMN "severity" TEXT NOT NULL DEFAULT 'normal',
  ADD COLUMN "priority" INTEGER NOT NULL DEFAULT 3,
  ADD COLUMN "summary" TEXT,
  ADD COLUMN "relatedEntityType" TEXT,
  ADD COLUMN "relatedEntityId" TEXT,
  ADD COLUMN "relatedRecordNumber" TEXT,
  ADD COLUMN "routeName" TEXT,
  ADD COLUMN "actionLabel" TEXT,
  ADD COLUMN "status" "NotificationStatus" NOT NULL DEFAULT 'UNREAD',
  ADD COLUMN "requiresAction" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "createdAtUtc" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "readAtUtc" TIMESTAMP(3),
  ADD COLUMN "openedAtUtc" TIMESTAMP(3),
  ADD COLUMN "dismissedAtUtc" TIMESTAMP(3),
  ADD COLUMN "archivedAtUtc" TIMESTAMP(3),
  ADD COLUMN "expiresAtUtc" TIMESTAMP(3),
  ADD COLUMN "userTimeZone" TEXT,
  ADD COLUMN "tenantTimeZone" TEXT,
  ADD COLUMN "dedupeKey" TEXT;

ALTER TABLE "NotificationRecipient"
  ADD COLUMN "status" "NotificationStatus" NOT NULL DEFAULT 'UNREAD',
  ADD COLUMN "openedAt" TIMESTAMP(3),
  ADD COLUMN "dismissedAt" TIMESTAMP(3),
  ADD COLUMN "popupShownAt" TIMESTAMP(3);

CREATE TABLE "NotificationInteractionLog" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "notificationId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "action" "NotificationInteractionAction" NOT NULL,
  "eventAtUtc" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "userTimeZone" TEXT,
  "eventLocalTime" TIMESTAMP(3),
  "ipAddress" TEXT,
  "userAgent" TEXT,
  "metadata" JSONB,
  "retentionUntilUtc" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "NotificationInteractionLog_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "NotificationRule" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "moduleKey" TEXT NOT NULL,
  "eventKey" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "recipientResolverType" "NotificationRecipientResolverType" NOT NULL,
  "templateKey" TEXT NOT NULL,
  "channels" "NotificationChannel"[],
  "displayMode" "NotificationDisplayMode" NOT NULL DEFAULT 'BELL_ONLY',
  "priority" INTEGER NOT NULL DEFAULT 3,
  "requiresAction" BOOLEAN NOT NULL DEFAULT false,
  "expireOnEvents" JSONB,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "NotificationRule_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "NotificationTemplate" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT,
  "templateKey" TEXT NOT NULL,
  "moduleKey" TEXT NOT NULL,
  "titleTemplate" TEXT NOT NULL,
  "summaryTemplate" TEXT NOT NULL,
  "bodyTemplate" TEXT,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "NotificationTemplate_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ApprovalRequest" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "moduleKey" TEXT NOT NULL,
  "entityType" TEXT NOT NULL,
  "entityId" TEXT NOT NULL,
  "requestNumber" TEXT,
  "title" TEXT NOT NULL,
  "submittedByUserId" TEXT NOT NULL,
  "submittedForEmployeeId" TEXT,
  "status" "ApprovalRequestStatus" NOT NULL DEFAULT 'PENDING',
  "currentStepId" TEXT,
  "createdAtUtc" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "submittedAtUtc" TIMESTAMP(3),
  "completedAtUtc" TIMESTAMP(3),
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ApprovalRequest_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ApprovalStep" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "approvalRequestId" TEXT NOT NULL,
  "stepOrder" INTEGER NOT NULL,
  "stepName" TEXT NOT NULL,
  "approverResolverType" "NotificationRecipientResolverType" NOT NULL,
  "status" "GenericApprovalStepStatus" NOT NULL DEFAULT 'NOT_STARTED',
  "startedAtUtc" TIMESTAMP(3),
  "dueAtUtc" TIMESTAMP(3),
  "completedAtUtc" TIMESTAMP(3),
  "slaStatus" "SlaStatus" NOT NULL DEFAULT 'NOT_APPLICABLE',
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ApprovalStep_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ApprovalAssignment" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "approvalRequestId" TEXT NOT NULL,
  "approvalStepId" TEXT NOT NULL,
  "assignedToUserId" TEXT,
  "assignedToRoleId" TEXT,
  "status" "ApprovalAssignmentStatus" NOT NULL DEFAULT 'PENDING',
  "assignedAtUtc" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "actionedAtUtc" TIMESTAMP(3),
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ApprovalAssignment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ApprovalAction" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "approvalRequestId" TEXT NOT NULL,
  "approvalStepId" TEXT,
  "approvalAssignmentId" TEXT,
  "actionType" "ApprovalActionType" NOT NULL,
  "actionByUserId" TEXT NOT NULL,
  "comment" TEXT,
  "actionAtUtc" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "actionTimeZone" TEXT,
  "actionLocalTime" TIMESTAMP(3),
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ApprovalAction_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SlaPolicy" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "moduleKey" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SlaPolicy_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SlaRule" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "slaPolicyId" TEXT NOT NULL,
  "targetType" "SlaTargetType" NOT NULL,
  "targetStatus" TEXT,
  "durationMinutes" INTEGER NOT NULL,
  "dueSoonOffsetMinutes" INTEGER,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SlaRule_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SlaMilestone" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "slaRuleId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "offsetMinutes" INTEGER NOT NULL,
  "notificationEventKey" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SlaMilestone_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SlaEscalationLevel" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "slaRuleId" TEXT NOT NULL,
  "level" INTEGER NOT NULL,
  "offsetMinutes" INTEGER NOT NULL,
  "recipientResolverType" "NotificationRecipientResolverType" NOT NULL,
  "notificationEventKey" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SlaEscalationLevel_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SlaTracking" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "slaPolicyId" TEXT,
  "targetType" "SlaTargetType" NOT NULL,
  "targetId" TEXT NOT NULL,
  "status" "SlaStatus" NOT NULL DEFAULT 'ON_TRACK',
  "startedAtUtc" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "dueAtUtc" TIMESTAMP(3),
  "breachedAtUtc" TIMESTAMP(3),
  "completedAtUtc" TIMESTAMP(3),
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SlaTracking_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SlaEventLog" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "slaTrackingId" TEXT NOT NULL,
  "eventType" "SlaEventType" NOT NULL,
  "eventAtUtc" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "metadata" JSONB,
  CONSTRAINT "SlaEventLog_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Notification" ADD CONSTRAINT "Notification_recipientUserId_fkey" FOREIGN KEY ("recipientUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "NotificationInteractionLog" ADD CONSTRAINT "NotificationInteractionLog_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "NotificationInteractionLog" ADD CONSTRAINT "NotificationInteractionLog_notificationId_fkey" FOREIGN KEY ("notificationId") REFERENCES "Notification"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "NotificationInteractionLog" ADD CONSTRAINT "NotificationInteractionLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "NotificationRule" ADD CONSTRAINT "NotificationRule_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "NotificationTemplate" ADD CONSTRAINT "NotificationTemplate_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ApprovalRequest" ADD CONSTRAINT "ApprovalRequest_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ApprovalRequest" ADD CONSTRAINT "ApprovalRequest_submittedByUserId_fkey" FOREIGN KEY ("submittedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ApprovalRequest" ADD CONSTRAINT "ApprovalRequest_submittedForEmployeeId_fkey" FOREIGN KEY ("submittedForEmployeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ApprovalStep" ADD CONSTRAINT "ApprovalStep_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ApprovalStep" ADD CONSTRAINT "ApprovalStep_approvalRequestId_fkey" FOREIGN KEY ("approvalRequestId") REFERENCES "ApprovalRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ApprovalAssignment" ADD CONSTRAINT "ApprovalAssignment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ApprovalAssignment" ADD CONSTRAINT "ApprovalAssignment_approvalRequestId_fkey" FOREIGN KEY ("approvalRequestId") REFERENCES "ApprovalRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ApprovalAssignment" ADD CONSTRAINT "ApprovalAssignment_approvalStepId_fkey" FOREIGN KEY ("approvalStepId") REFERENCES "ApprovalStep"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ApprovalAssignment" ADD CONSTRAINT "ApprovalAssignment_assignedToUserId_fkey" FOREIGN KEY ("assignedToUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ApprovalAssignment" ADD CONSTRAINT "ApprovalAssignment_assignedToRoleId_fkey" FOREIGN KEY ("assignedToRoleId") REFERENCES "Role"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ApprovalAction" ADD CONSTRAINT "ApprovalAction_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ApprovalAction" ADD CONSTRAINT "ApprovalAction_approvalRequestId_fkey" FOREIGN KEY ("approvalRequestId") REFERENCES "ApprovalRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ApprovalAction" ADD CONSTRAINT "ApprovalAction_approvalStepId_fkey" FOREIGN KEY ("approvalStepId") REFERENCES "ApprovalStep"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ApprovalAction" ADD CONSTRAINT "ApprovalAction_approvalAssignmentId_fkey" FOREIGN KEY ("approvalAssignmentId") REFERENCES "ApprovalAssignment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ApprovalAction" ADD CONSTRAINT "ApprovalAction_actionByUserId_fkey" FOREIGN KEY ("actionByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SlaPolicy" ADD CONSTRAINT "SlaPolicy_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SlaRule" ADD CONSTRAINT "SlaRule_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SlaRule" ADD CONSTRAINT "SlaRule_slaPolicyId_fkey" FOREIGN KEY ("slaPolicyId") REFERENCES "SlaPolicy"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SlaMilestone" ADD CONSTRAINT "SlaMilestone_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SlaMilestone" ADD CONSTRAINT "SlaMilestone_slaRuleId_fkey" FOREIGN KEY ("slaRuleId") REFERENCES "SlaRule"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SlaEscalationLevel" ADD CONSTRAINT "SlaEscalationLevel_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SlaEscalationLevel" ADD CONSTRAINT "SlaEscalationLevel_slaRuleId_fkey" FOREIGN KEY ("slaRuleId") REFERENCES "SlaRule"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SlaTracking" ADD CONSTRAINT "SlaTracking_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SlaTracking" ADD CONSTRAINT "SlaTracking_slaPolicyId_fkey" FOREIGN KEY ("slaPolicyId") REFERENCES "SlaPolicy"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SlaEventLog" ADD CONSTRAINT "SlaEventLog_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SlaEventLog" ADD CONSTRAINT "SlaEventLog_slaTrackingId_fkey" FOREIGN KEY ("slaTrackingId") REFERENCES "SlaTracking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "Notification_tenantId_eventKey_idx" ON "Notification"("tenantId", "eventKey");
CREATE INDEX "Notification_tenantId_recipientUserId_idx" ON "Notification"("tenantId", "recipientUserId");
CREATE INDEX "Notification_tenantId_recipientUserId_status_idx" ON "Notification"("tenantId", "recipientUserId", "status");
CREATE INDEX "Notification_tenantId_moduleKey_idx" ON "Notification"("tenantId", "moduleKey");
CREATE INDEX "Notification_tenantId_status_idx" ON "Notification"("tenantId", "status");
CREATE INDEX "Notification_tenantId_createdAtUtc_idx" ON "Notification"("tenantId", "createdAtUtc");
CREATE INDEX "Notification_tenantId_dedupeKey_idx" ON "Notification"("tenantId", "dedupeKey");
CREATE INDEX "NotificationRecipient_tenantId_userId_status_idx" ON "NotificationRecipient"("tenantId", "userId", "status");
CREATE INDEX "NotificationInteractionLog_tenantId_idx" ON "NotificationInteractionLog"("tenantId");
CREATE INDEX "NotificationInteractionLog_tenantId_notificationId_idx" ON "NotificationInteractionLog"("tenantId", "notificationId");
CREATE INDEX "NotificationInteractionLog_tenantId_userId_idx" ON "NotificationInteractionLog"("tenantId", "userId");
CREATE INDEX "NotificationInteractionLog_tenantId_action_idx" ON "NotificationInteractionLog"("tenantId", "action");
CREATE INDEX "NotificationInteractionLog_tenantId_eventAtUtc_idx" ON "NotificationInteractionLog"("tenantId", "eventAtUtc");
CREATE INDEX "NotificationInteractionLog_retentionUntilUtc_idx" ON "NotificationInteractionLog"("retentionUntilUtc");
CREATE UNIQUE INDEX "NotificationRule_tenantId_moduleKey_eventKey_recipientResolverType_key" ON "NotificationRule"("tenantId", "moduleKey", "eventKey", "recipientResolverType");
CREATE INDEX "NotificationRule_tenantId_idx" ON "NotificationRule"("tenantId");
CREATE INDEX "NotificationRule_tenantId_moduleKey_idx" ON "NotificationRule"("tenantId", "moduleKey");
CREATE INDEX "NotificationRule_tenantId_eventKey_idx" ON "NotificationRule"("tenantId", "eventKey");
CREATE INDEX "NotificationRule_tenantId_enabled_idx" ON "NotificationRule"("tenantId", "enabled");
CREATE UNIQUE INDEX "NotificationTemplate_tenantId_templateKey_key" ON "NotificationTemplate"("tenantId", "templateKey");
CREATE INDEX "NotificationTemplate_tenantId_idx" ON "NotificationTemplate"("tenantId");
CREATE INDEX "NotificationTemplate_moduleKey_idx" ON "NotificationTemplate"("moduleKey");
CREATE INDEX "NotificationTemplate_templateKey_idx" ON "NotificationTemplate"("templateKey");
CREATE INDEX "NotificationTemplate_enabled_idx" ON "NotificationTemplate"("enabled");
CREATE UNIQUE INDEX "ApprovalRequest_tenantId_moduleKey_entityType_entityId_key" ON "ApprovalRequest"("tenantId", "moduleKey", "entityType", "entityId");
CREATE INDEX "ApprovalRequest_tenantId_idx" ON "ApprovalRequest"("tenantId");
CREATE INDEX "ApprovalRequest_tenantId_moduleKey_idx" ON "ApprovalRequest"("tenantId", "moduleKey");
CREATE INDEX "ApprovalRequest_tenantId_status_idx" ON "ApprovalRequest"("tenantId", "status");
CREATE INDEX "ApprovalRequest_tenantId_submittedByUserId_idx" ON "ApprovalRequest"("tenantId", "submittedByUserId");
CREATE INDEX "ApprovalRequest_tenantId_submittedForEmployeeId_idx" ON "ApprovalRequest"("tenantId", "submittedForEmployeeId");
CREATE INDEX "ApprovalRequest_tenantId_createdAtUtc_idx" ON "ApprovalRequest"("tenantId", "createdAtUtc");
CREATE UNIQUE INDEX "ApprovalStep_approvalRequestId_stepOrder_key" ON "ApprovalStep"("approvalRequestId", "stepOrder");
CREATE INDEX "ApprovalStep_tenantId_idx" ON "ApprovalStep"("tenantId");
CREATE INDEX "ApprovalStep_tenantId_approvalRequestId_idx" ON "ApprovalStep"("tenantId", "approvalRequestId");
CREATE INDEX "ApprovalStep_tenantId_status_idx" ON "ApprovalStep"("tenantId", "status");
CREATE INDEX "ApprovalStep_tenantId_dueAtUtc_idx" ON "ApprovalStep"("tenantId", "dueAtUtc");
CREATE INDEX "ApprovalStep_tenantId_slaStatus_idx" ON "ApprovalStep"("tenantId", "slaStatus");
CREATE INDEX "ApprovalAssignment_tenantId_idx" ON "ApprovalAssignment"("tenantId");
CREATE INDEX "ApprovalAssignment_tenantId_approvalRequestId_idx" ON "ApprovalAssignment"("tenantId", "approvalRequestId");
CREATE INDEX "ApprovalAssignment_tenantId_approvalStepId_idx" ON "ApprovalAssignment"("tenantId", "approvalStepId");
CREATE INDEX "ApprovalAssignment_tenantId_assignedToUserId_status_idx" ON "ApprovalAssignment"("tenantId", "assignedToUserId", "status");
CREATE INDEX "ApprovalAssignment_tenantId_assignedToRoleId_status_idx" ON "ApprovalAssignment"("tenantId", "assignedToRoleId", "status");
CREATE INDEX "ApprovalAssignment_tenantId_status_idx" ON "ApprovalAssignment"("tenantId", "status");
CREATE INDEX "ApprovalAction_tenantId_idx" ON "ApprovalAction"("tenantId");
CREATE INDEX "ApprovalAction_tenantId_approvalRequestId_idx" ON "ApprovalAction"("tenantId", "approvalRequestId");
CREATE INDEX "ApprovalAction_tenantId_approvalStepId_idx" ON "ApprovalAction"("tenantId", "approvalStepId");
CREATE INDEX "ApprovalAction_tenantId_approvalAssignmentId_idx" ON "ApprovalAction"("tenantId", "approvalAssignmentId");
CREATE INDEX "ApprovalAction_tenantId_actionByUserId_idx" ON "ApprovalAction"("tenantId", "actionByUserId");
CREATE INDEX "ApprovalAction_tenantId_actionType_idx" ON "ApprovalAction"("tenantId", "actionType");
CREATE INDEX "ApprovalAction_tenantId_actionAtUtc_idx" ON "ApprovalAction"("tenantId", "actionAtUtc");
CREATE UNIQUE INDEX "SlaPolicy_tenantId_moduleKey_name_key" ON "SlaPolicy"("tenantId", "moduleKey", "name");
CREATE INDEX "SlaPolicy_tenantId_idx" ON "SlaPolicy"("tenantId");
CREATE INDEX "SlaPolicy_tenantId_moduleKey_idx" ON "SlaPolicy"("tenantId", "moduleKey");
CREATE INDEX "SlaPolicy_tenantId_enabled_idx" ON "SlaPolicy"("tenantId", "enabled");
CREATE INDEX "SlaRule_tenantId_idx" ON "SlaRule"("tenantId");
CREATE INDEX "SlaRule_tenantId_slaPolicyId_idx" ON "SlaRule"("tenantId", "slaPolicyId");
CREATE INDEX "SlaRule_tenantId_targetType_idx" ON "SlaRule"("tenantId", "targetType");
CREATE INDEX "SlaRule_tenantId_enabled_idx" ON "SlaRule"("tenantId", "enabled");
CREATE INDEX "SlaMilestone_tenantId_idx" ON "SlaMilestone"("tenantId");
CREATE INDEX "SlaMilestone_tenantId_slaRuleId_idx" ON "SlaMilestone"("tenantId", "slaRuleId");
CREATE UNIQUE INDEX "SlaEscalationLevel_slaRuleId_level_key" ON "SlaEscalationLevel"("slaRuleId", "level");
CREATE INDEX "SlaEscalationLevel_tenantId_idx" ON "SlaEscalationLevel"("tenantId");
CREATE INDEX "SlaEscalationLevel_tenantId_slaRuleId_idx" ON "SlaEscalationLevel"("tenantId", "slaRuleId");
CREATE UNIQUE INDEX "SlaTracking_tenantId_targetType_targetId_key" ON "SlaTracking"("tenantId", "targetType", "targetId");
CREATE INDEX "SlaTracking_tenantId_idx" ON "SlaTracking"("tenantId");
CREATE INDEX "SlaTracking_tenantId_status_idx" ON "SlaTracking"("tenantId", "status");
CREATE INDEX "SlaTracking_tenantId_dueAtUtc_idx" ON "SlaTracking"("tenantId", "dueAtUtc");
CREATE INDEX "SlaTracking_tenantId_slaPolicyId_idx" ON "SlaTracking"("tenantId", "slaPolicyId");
CREATE INDEX "SlaEventLog_tenantId_idx" ON "SlaEventLog"("tenantId");
CREATE INDEX "SlaEventLog_tenantId_slaTrackingId_idx" ON "SlaEventLog"("tenantId", "slaTrackingId");
CREATE INDEX "SlaEventLog_tenantId_eventType_idx" ON "SlaEventLog"("tenantId", "eventType");
CREATE INDEX "SlaEventLog_tenantId_eventAtUtc_idx" ON "SlaEventLog"("tenantId", "eventAtUtc");
