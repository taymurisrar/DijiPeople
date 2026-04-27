-- CreateEnum
CREATE TYPE "CandidateHistoryReason" AS ENUM ('REUPLOAD', 'MERGE', 'PROFILE_UPDATE', 'PARSE_UPDATE', 'MANUAL_UPDATE');

-- CreateEnum
CREATE TYPE "ApplicationHistoryReason" AS ENUM ('REAPPLY', 'STAGE_CHANGE', 'MATCH_RECALCULATION', 'MANUAL_EDIT', 'DUPLICATE_RESOLUTION');

-- CreateTable
CREATE TABLE "CandidateHistory" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "snapshotVersion" INTEGER NOT NULL,
    "snapshotReason" "CandidateHistoryReason" NOT NULL,
    "snapshotTakenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "originalCreatedAt" TIMESTAMP(3) NOT NULL,
    "sourceDocumentId" TEXT,
    "sourceChannel" TEXT,
    "snapshotPayload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,

    CONSTRAINT "CandidateHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApplicationHistory" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "jobOpeningId" TEXT NOT NULL,
    "snapshotVersion" INTEGER NOT NULL,
    "snapshotReason" "ApplicationHistoryReason" NOT NULL,
    "snapshotTakenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "originalAppliedAt" TIMESTAMP(3) NOT NULL,
    "snapshotPayload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,

    CONSTRAINT "ApplicationHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CandidateHistory_tenantId_idx" ON "CandidateHistory"("tenantId");

-- CreateIndex
CREATE INDEX "CandidateHistory_tenantId_candidateId_snapshotVersion_idx" ON "CandidateHistory"("tenantId", "candidateId", "snapshotVersion");

-- CreateIndex
CREATE INDEX "CandidateHistory_tenantId_candidateId_snapshotTakenAt_idx" ON "CandidateHistory"("tenantId", "candidateId", "snapshotTakenAt");

-- CreateIndex
CREATE INDEX "ApplicationHistory_tenantId_idx" ON "ApplicationHistory"("tenantId");

-- CreateIndex
CREATE INDEX "ApplicationHistory_tenantId_applicationId_snapshotVersion_idx" ON "ApplicationHistory"("tenantId", "applicationId", "snapshotVersion");

-- CreateIndex
CREATE INDEX "ApplicationHistory_tenantId_applicationId_snapshotTakenAt_idx" ON "ApplicationHistory"("tenantId", "applicationId", "snapshotTakenAt");

-- CreateIndex
CREATE INDEX "ApplicationHistory_tenantId_candidateId_idx" ON "ApplicationHistory"("tenantId", "candidateId");

-- CreateIndex
CREATE INDEX "ApplicationHistory_tenantId_jobOpeningId_idx" ON "ApplicationHistory"("tenantId", "jobOpeningId");

-- AddForeignKey
ALTER TABLE "CandidateHistory" ADD CONSTRAINT "CandidateHistory_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CandidateHistory" ADD CONSTRAINT "CandidateHistory_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApplicationHistory" ADD CONSTRAINT "ApplicationHistory_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApplicationHistory" ADD CONSTRAINT "ApplicationHistory_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;
