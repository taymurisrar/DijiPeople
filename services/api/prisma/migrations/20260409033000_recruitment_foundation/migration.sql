-- CreateEnum
CREATE TYPE "JobOpeningStatus" AS ENUM ('DRAFT', 'OPEN', 'ON_HOLD', 'CLOSED', 'FILLED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "RecruitmentStage" AS ENUM ('APPLIED', 'SCREENING', 'INTERVIEW', 'OFFER', 'HIRED', 'REJECTED', 'WITHDRAWN');

-- CreateTable
CREATE TABLE "JobOpening" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "code" TEXT,
    "description" TEXT,
    "status" "JobOpeningStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,

    CONSTRAINT "JobOpening_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Candidate" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "source" TEXT,
    "currentStatus" "RecruitmentStage" NOT NULL DEFAULT 'APPLIED',
    "resumeDocumentReference" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,

    CONSTRAINT "Candidate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Application" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "jobOpeningId" TEXT NOT NULL,
    "stage" "RecruitmentStage" NOT NULL DEFAULT 'APPLIED',
    "notes" TEXT,
    "appliedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "movedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,

    CONSTRAINT "Application_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "JobOpening_tenantId_title_key" ON "JobOpening"("tenantId", "title");
CREATE UNIQUE INDEX "JobOpening_tenantId_code_key" ON "JobOpening"("tenantId", "code");
CREATE INDEX "JobOpening_tenantId_idx" ON "JobOpening"("tenantId");
CREATE INDEX "JobOpening_tenantId_status_idx" ON "JobOpening"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Candidate_tenantId_email_key" ON "Candidate"("tenantId", "email");
CREATE INDEX "Candidate_tenantId_idx" ON "Candidate"("tenantId");
CREATE INDEX "Candidate_tenantId_currentStatus_idx" ON "Candidate"("tenantId", "currentStatus");
CREATE INDEX "Candidate_tenantId_lastName_firstName_idx" ON "Candidate"("tenantId", "lastName", "firstName");

-- CreateIndex
CREATE UNIQUE INDEX "Application_candidateId_jobOpeningId_key" ON "Application"("candidateId", "jobOpeningId");
CREATE INDEX "Application_tenantId_idx" ON "Application"("tenantId");
CREATE INDEX "Application_tenantId_stage_idx" ON "Application"("tenantId", "stage");
CREATE INDEX "Application_tenantId_candidateId_idx" ON "Application"("tenantId", "candidateId");
CREATE INDEX "Application_tenantId_jobOpeningId_idx" ON "Application"("tenantId", "jobOpeningId");

-- AddForeignKey
ALTER TABLE "JobOpening"
ADD CONSTRAINT "JobOpening_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Candidate"
ADD CONSTRAINT "Candidate_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Application"
ADD CONSTRAINT "Application_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Application"
ADD CONSTRAINT "Application_candidateId_fkey"
FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Application"
ADD CONSTRAINT "Application_jobOpeningId_fkey"
FOREIGN KEY ("jobOpeningId") REFERENCES "JobOpening"("id") ON DELETE CASCADE ON UPDATE CASCADE;
