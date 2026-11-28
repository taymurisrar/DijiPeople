-- DP-MASTER WP-36.S1, WP-28.S1, WP-04.S2: duties/handovers, meetings/decisions, immutable template revisions. Additive only.

-- CreateEnum
CREATE TYPE "DutyHandoverStatus" AS ENUM ('OPEN', 'ACKNOWLEDGED');

-- CreateEnum
CREATE TYPE "MeetingStatus" AS ENUM ('PLANNED', 'HELD', 'CANCELLED');

-- CreateEnum
CREATE TYPE "DecisionStatus" AS ENUM ('PROPOSED', 'DECIDED', 'SUPERSEDED', 'REVERSED');

-- AlterTable
ALTER TABLE "WorkflowRunStep" ADD COLUMN     "templateRevisionId" TEXT;

-- CreateTable
CREATE TABLE "EmailTemplateRevision" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "templateId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "subjectTemplate" TEXT NOT NULL,
    "htmlTemplate" TEXT NOT NULL,
    "textTemplate" TEXT,
    "availableVariables" JSONB NOT NULL,
    "checksum" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailTemplateRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DutyTemplate" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "weekdays" INTEGER[],
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "startMinutes" INTEGER,
    "dueMinutes" INTEGER,
    "assigneeEmployeeId" TEXT,
    "teamId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DutyTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DutyChecklistItem" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "dutyTemplateId" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "label" TEXT NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "DutyChecklistItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DutyOccurrence" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "dutyTemplateId" TEXT NOT NULL,
    "forDate" DATE NOT NULL,
    "workItemId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DutyOccurrence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DutyOccurrenceCheck" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "occurrenceId" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "label" TEXT NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "completedAt" TIMESTAMP(3),
    "completedById" TEXT,
    "note" TEXT,

    CONSTRAINT "DutyOccurrenceCheck_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DutyHandover" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "occurrenceId" TEXT,
    "fromEmployeeId" TEXT NOT NULL,
    "toEmployeeId" TEXT,
    "teamId" TEXT,
    "note" TEXT NOT NULL,
    "status" "DutyHandoverStatus" NOT NULL DEFAULT 'OPEN',
    "acknowledgedById" TEXT,
    "acknowledgedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DutyHandover_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MeetingRecord" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "agenda" TEXT,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "heldAt" TIMESTAMP(3),
    "facilitatorEmployeeId" TEXT,
    "notes" TEXT,
    "status" "MeetingStatus" NOT NULL DEFAULT 'PLANNED',
    "workItemId" TEXT,
    "blockerId" TEXT,
    "projectId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MeetingRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MeetingAttendee" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "attended" BOOLEAN,

    CONSTRAINT "MeetingAttendee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkDecision" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "context" TEXT,
    "decision" TEXT NOT NULL,
    "status" "DecisionStatus" NOT NULL DEFAULT 'DECIDED',
    "ownerEmployeeId" TEXT,
    "decidedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "meetingId" TEXT,
    "workItemId" TEXT,
    "blockerId" TEXT,
    "projectId" TEXT,
    "supersedesId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkDecision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DecisionAction" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "decisionId" TEXT NOT NULL,
    "workItemId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DecisionAction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EmailTemplateRevision_tenantId_templateId_idx" ON "EmailTemplateRevision"("tenantId", "templateId");

-- CreateIndex
CREATE UNIQUE INDEX "EmailTemplateRevision_templateId_version_key" ON "EmailTemplateRevision"("templateId", "version");

-- CreateIndex
CREATE INDEX "DutyTemplate_tenantId_isActive_idx" ON "DutyTemplate"("tenantId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "DutyTemplate_tenantId_key_key" ON "DutyTemplate"("tenantId", "key");

-- CreateIndex
CREATE INDEX "DutyChecklistItem_tenantId_dutyTemplateId_idx" ON "DutyChecklistItem"("tenantId", "dutyTemplateId");

-- CreateIndex
CREATE UNIQUE INDEX "DutyOccurrence_workItemId_key" ON "DutyOccurrence"("workItemId");

-- CreateIndex
CREATE INDEX "DutyOccurrence_tenantId_forDate_idx" ON "DutyOccurrence"("tenantId", "forDate");

-- CreateIndex
CREATE UNIQUE INDEX "DutyOccurrence_tenantId_dutyTemplateId_forDate_key" ON "DutyOccurrence"("tenantId", "dutyTemplateId", "forDate");

-- CreateIndex
CREATE INDEX "DutyOccurrenceCheck_tenantId_occurrenceId_idx" ON "DutyOccurrenceCheck"("tenantId", "occurrenceId");

-- CreateIndex
CREATE INDEX "DutyHandover_tenantId_status_createdAt_idx" ON "DutyHandover"("tenantId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "DutyHandover_tenantId_toEmployeeId_status_idx" ON "DutyHandover"("tenantId", "toEmployeeId", "status");

-- CreateIndex
CREATE INDEX "MeetingRecord_tenantId_scheduledAt_idx" ON "MeetingRecord"("tenantId", "scheduledAt");

-- CreateIndex
CREATE INDEX "MeetingRecord_tenantId_status_idx" ON "MeetingRecord"("tenantId", "status");

-- CreateIndex
CREATE INDEX "MeetingAttendee_tenantId_employeeId_idx" ON "MeetingAttendee"("tenantId", "employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "MeetingAttendee_meetingId_employeeId_key" ON "MeetingAttendee"("meetingId", "employeeId");

-- CreateIndex
CREATE INDEX "WorkDecision_tenantId_status_decidedAt_idx" ON "WorkDecision"("tenantId", "status", "decidedAt");

-- CreateIndex
CREATE INDEX "WorkDecision_tenantId_workItemId_idx" ON "WorkDecision"("tenantId", "workItemId");

-- CreateIndex
CREATE INDEX "WorkDecision_tenantId_blockerId_idx" ON "WorkDecision"("tenantId", "blockerId");

-- CreateIndex
CREATE INDEX "DecisionAction_tenantId_workItemId_idx" ON "DecisionAction"("tenantId", "workItemId");

-- CreateIndex
CREATE UNIQUE INDEX "DecisionAction_decisionId_workItemId_key" ON "DecisionAction"("decisionId", "workItemId");

-- AddForeignKey
ALTER TABLE "DutyTemplate" ADD CONSTRAINT "DutyTemplate_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DutyChecklistItem" ADD CONSTRAINT "DutyChecklistItem_dutyTemplateId_fkey" FOREIGN KEY ("dutyTemplateId") REFERENCES "DutyTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DutyOccurrence" ADD CONSTRAINT "DutyOccurrence_dutyTemplateId_fkey" FOREIGN KEY ("dutyTemplateId") REFERENCES "DutyTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DutyOccurrenceCheck" ADD CONSTRAINT "DutyOccurrenceCheck_occurrenceId_fkey" FOREIGN KEY ("occurrenceId") REFERENCES "DutyOccurrence"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DutyHandover" ADD CONSTRAINT "DutyHandover_occurrenceId_fkey" FOREIGN KEY ("occurrenceId") REFERENCES "DutyOccurrence"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingRecord" ADD CONSTRAINT "MeetingRecord_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingAttendee" ADD CONSTRAINT "MeetingAttendee_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "MeetingRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkDecision" ADD CONSTRAINT "WorkDecision_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkDecision" ADD CONSTRAINT "WorkDecision_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "MeetingRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkDecision" ADD CONSTRAINT "WorkDecision_supersedesId_fkey" FOREIGN KEY ("supersedesId") REFERENCES "WorkDecision"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DecisionAction" ADD CONSTRAINT "DecisionAction_decisionId_fkey" FOREIGN KEY ("decisionId") REFERENCES "WorkDecision"("id") ON DELETE CASCADE ON UPDATE CASCADE;
