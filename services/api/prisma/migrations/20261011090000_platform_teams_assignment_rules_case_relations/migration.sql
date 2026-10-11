-- CreateEnum
CREATE TYPE "SupportCaseRelationType" AS ENUM ('RELATED', 'DUPLICATE', 'BLOCKS');

-- CreateEnum
CREATE TYPE "RecordAssignmentStrategy" AS ENUM ('SPECIFIC_USER', 'TEAM_ROUND_ROBIN', 'USER_ROUND_ROBIN');

-- AlterTable
ALTER TABLE "CustomerAccount" ADD COLUMN     "authorizedSignerEmail" TEXT,
ADD COLUMN     "authorizedSignerName" TEXT,
ADD COLUMN     "authorizedSignerTitle" TEXT;

-- AlterTable
ALTER TABLE "SupportCase" ADD COLUMN     "assignedTeamId" TEXT;

-- CreateTable
CREATE TABLE "PlatformTeam" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT NOT NULL DEFAULT 'GENERAL',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "leadUserId" TEXT,
    "email" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "archivedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformTeam_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformTeamMember" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "platformUserId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'MEMBER',
    "receivesAssignments" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformTeamMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupportCaseRelation" (
    "id" TEXT NOT NULL,
    "sourceCaseId" TEXT NOT NULL,
    "targetCaseId" TEXT NOT NULL,
    "relationType" "SupportCaseRelationType" NOT NULL DEFAULT 'RELATED',
    "note" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupportCaseRelation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecordAssignmentRule" (
    "id" TEXT NOT NULL,
    "moduleKey" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "conditions" JSONB NOT NULL DEFAULT '{}',
    "strategy" "RecordAssignmentStrategy" NOT NULL,
    "targetUserId" TEXT,
    "targetTeamId" TEXT,
    "candidateUserIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "roundRobinCursor" INTEGER NOT NULL DEFAULT 0,
    "matchCount" INTEGER NOT NULL DEFAULT 0,
    "lastAssignedAt" TIMESTAMP(3),
    "lastAssignedUserId" TEXT,
    "lastFailureAt" TIMESTAMP(3),
    "lastFailureReason" TEXT,
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecordAssignmentRule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PlatformTeam_name_key" ON "PlatformTeam"("name");

-- CreateIndex
CREATE INDEX "PlatformTeam_isActive_sortOrder_idx" ON "PlatformTeam"("isActive", "sortOrder");

-- CreateIndex
CREATE INDEX "PlatformTeam_category_isActive_idx" ON "PlatformTeam"("category", "isActive");

-- CreateIndex
CREATE INDEX "PlatformTeamMember_platformUserId_idx" ON "PlatformTeamMember"("platformUserId");

-- CreateIndex
CREATE UNIQUE INDEX "PlatformTeamMember_teamId_platformUserId_key" ON "PlatformTeamMember"("teamId", "platformUserId");

-- CreateIndex
CREATE INDEX "SupportCaseRelation_targetCaseId_idx" ON "SupportCaseRelation"("targetCaseId");

-- CreateIndex
CREATE UNIQUE INDEX "SupportCaseRelation_sourceCaseId_targetCaseId_relationType_key" ON "SupportCaseRelation"("sourceCaseId", "targetCaseId", "relationType");

-- CreateIndex
CREATE INDEX "RecordAssignmentRule_moduleKey_isActive_priority_idx" ON "RecordAssignmentRule"("moduleKey", "isActive", "priority");

-- CreateIndex
CREATE INDEX "RecordAssignmentRule_targetTeamId_idx" ON "RecordAssignmentRule"("targetTeamId");

-- CreateIndex
CREATE INDEX "SupportCase_assignedTeamId_status_idx" ON "SupportCase"("assignedTeamId", "status");

-- AddForeignKey
ALTER TABLE "SupportCase" ADD CONSTRAINT "SupportCase_assignedTeamId_fkey" FOREIGN KEY ("assignedTeamId") REFERENCES "PlatformTeam"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformTeam" ADD CONSTRAINT "PlatformTeam_leadUserId_fkey" FOREIGN KEY ("leadUserId") REFERENCES "PlatformUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformTeamMember" ADD CONSTRAINT "PlatformTeamMember_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "PlatformTeam"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformTeamMember" ADD CONSTRAINT "PlatformTeamMember_platformUserId_fkey" FOREIGN KEY ("platformUserId") REFERENCES "PlatformUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportCaseRelation" ADD CONSTRAINT "SupportCaseRelation_sourceCaseId_fkey" FOREIGN KEY ("sourceCaseId") REFERENCES "SupportCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportCaseRelation" ADD CONSTRAINT "SupportCaseRelation_targetCaseId_fkey" FOREIGN KEY ("targetCaseId") REFERENCES "SupportCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecordAssignmentRule" ADD CONSTRAINT "RecordAssignmentRule_targetUserId_fkey" FOREIGN KEY ("targetUserId") REFERENCES "PlatformUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecordAssignmentRule" ADD CONSTRAINT "RecordAssignmentRule_targetTeamId_fkey" FOREIGN KEY ("targetTeamId") REFERENCES "PlatformTeam"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

