-- Candidate identity resolution + richer resume metadata

CREATE TYPE "CandidateIdentityType" AS ENUM ('EMAIL', 'PHONE', 'LINKEDIN', 'NATIONAL_ID');

CREATE TABLE "CandidateIdentity" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "candidateId" TEXT NOT NULL,
  "type" "CandidateIdentityType" NOT NULL,
  "value" TEXT NOT NULL,
  "normalizedValue" TEXT NOT NULL,
  "isPrimary" BOOLEAN NOT NULL DEFAULT false,
  "source" TEXT,
  "confidence" INTEGER NOT NULL DEFAULT 100,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "createdById" TEXT,
  "updatedById" TEXT,
  CONSTRAINT "CandidateIdentity_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Candidate" ADD COLUMN "latestResumeDocumentId" TEXT;

ALTER TABLE "DocumentReference"
  ADD COLUMN "isResume" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "isPrimaryResume" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "isLatestResume" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "sourceChannel" TEXT,
  ADD COLUMN "checksumSha256" TEXT,
  ADD COLUMN "parserVersion" TEXT,
  ADD COLUMN "parsingStatus" "DocumentParsingStatus",
  ADD COLUMN "parsedAt" TIMESTAMP(3),
  ADD COLUMN "extractionConfidence" DECIMAL(5,2),
  ADD COLUMN "parsingWarnings" JSONB;

ALTER TABLE "Candidate" DROP CONSTRAINT IF EXISTS "Candidate_tenantId_email_key";

CREATE UNIQUE INDEX "Candidate_latestResumeDocumentId_key" ON "Candidate"("latestResumeDocumentId");
CREATE INDEX "Candidate_tenantId_latestResumeDocumentId_idx" ON "Candidate"("tenantId", "latestResumeDocumentId");

CREATE UNIQUE INDEX "CandidateIdentity_tenantId_type_normalizedValue_key"
  ON "CandidateIdentity"("tenantId", "type", "normalizedValue");
CREATE INDEX "CandidateIdentity_tenantId_candidateId_idx"
  ON "CandidateIdentity"("tenantId", "candidateId");
CREATE INDEX "CandidateIdentity_tenantId_type_normalizedValue_idx"
  ON "CandidateIdentity"("tenantId", "type", "normalizedValue");

ALTER TABLE "CandidateIdentity"
  ADD CONSTRAINT "CandidateIdentity_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CandidateIdentity"
  ADD CONSTRAINT "CandidateIdentity_candidateId_fkey"
  FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Candidate"
  ADD CONSTRAINT "Candidate_latestResumeDocumentId_fkey"
  FOREIGN KEY ("latestResumeDocumentId") REFERENCES "DocumentReference"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
