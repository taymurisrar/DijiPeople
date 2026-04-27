-- CreateEnum
CREATE TYPE "DocumentOwnerType" AS ENUM ('CANDIDATE', 'EMPLOYEE');

-- CreateEnum
CREATE TYPE "DocumentParsingStatus" AS ENUM ('PENDING', 'QUEUED', 'PROCESSING', 'SUCCEEDED', 'FAILED');

-- AlterTable
ALTER TABLE "Candidate"
ADD COLUMN "resumeDocumentId" TEXT;

-- CreateTable
CREATE TABLE "DocumentReference" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "ownerType" "DocumentOwnerType" NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "contentType" TEXT,
    "fileSizeBytes" INTEGER,
    "storageKey" TEXT,
    "uploadedAt" TIMESTAMP(3),
    "candidateId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,

    CONSTRAINT "DocumentReference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentParsingJob" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "documentReferenceId" TEXT NOT NULL,
    "candidateId" TEXT,
    "parserKey" TEXT,
    "status" "DocumentParsingStatus" NOT NULL DEFAULT 'PENDING',
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "queuedAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "resultMetadata" JSONB,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,

    CONSTRAINT "DocumentParsingJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Candidate_tenantId_resumeDocumentId_idx" ON "Candidate"("tenantId", "resumeDocumentId");

-- CreateIndex
CREATE INDEX "DocumentReference_tenantId_idx" ON "DocumentReference"("tenantId");
CREATE INDEX "DocumentReference_tenantId_ownerType_idx" ON "DocumentReference"("tenantId", "ownerType");
CREATE INDEX "DocumentReference_tenantId_candidateId_idx" ON "DocumentReference"("tenantId", "candidateId");
CREATE INDEX "DocumentReference_tenantId_ownerType_kind_idx" ON "DocumentReference"("tenantId", "ownerType", "kind");

-- CreateIndex
CREATE INDEX "DocumentParsingJob_tenantId_idx" ON "DocumentParsingJob"("tenantId");
CREATE INDEX "DocumentParsingJob_tenantId_status_idx" ON "DocumentParsingJob"("tenantId", "status");
CREATE INDEX "DocumentParsingJob_tenantId_candidateId_idx" ON "DocumentParsingJob"("tenantId", "candidateId");
CREATE INDEX "DocumentParsingJob_tenantId_documentReferenceId_idx" ON "DocumentParsingJob"("tenantId", "documentReferenceId");

-- AddForeignKey
ALTER TABLE "Candidate"
ADD CONSTRAINT "Candidate_resumeDocumentId_fkey"
FOREIGN KEY ("resumeDocumentId") REFERENCES "DocumentReference"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "DocumentReference"
ADD CONSTRAINT "DocumentReference_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DocumentReference"
ADD CONSTRAINT "DocumentReference_candidateId_fkey"
FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DocumentParsingJob"
ADD CONSTRAINT "DocumentParsingJob_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DocumentParsingJob"
ADD CONSTRAINT "DocumentParsingJob_documentReferenceId_fkey"
FOREIGN KEY ("documentReferenceId") REFERENCES "DocumentReference"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DocumentParsingJob"
ADD CONSTRAINT "DocumentParsingJob_candidateId_fkey"
FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
