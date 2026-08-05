ALTER TYPE "ContractDocumentSource" ADD VALUE IF NOT EXISTS 'BLANK';
ALTER TYPE "ContractDocumentSource" ADD VALUE IF NOT EXISTS 'COPY';
ALTER TYPE "SignatureRequestStatus" ADD VALUE IF NOT EXISTS 'CHANGES_REQUESTED';
ALTER TYPE "SignatureRecipientStatus" ADD VALUE IF NOT EXISTS 'CHANGES_REQUESTED';

ALTER TABLE "Contract"
  ADD COLUMN "agreementCategory" TEXT,
  ADD COLUMN "counterpartyType" TEXT,
  ADD COLUMN "processStage" TEXT,
  ADD COLUMN "relatedLeadId" TEXT,
  ADD COLUMN "internalLegalOwnerId" TEXT,
  ADD COLUMN "documentSource" "ContractDocumentSource" NOT NULL DEFAULT 'BLANK',
  ADD COLUMN "commissionPercentage" DECIMAL(5,2),
  ADD COLUMN "commissionBasis" TEXT,
  ADD COLUMN "paymentTerms" TEXT,
  ADD COLUMN "governingLaw" TEXT,
  ADD COLUMN "jurisdiction" TEXT,
  ADD COLUMN "confidentialityClass" TEXT,
  ADD COLUMN "autoRenewal" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "terminationNoticeDays" INTEGER,
  ADD COLUMN "parentContractId" TEXT,
  ADD COLUMN "amendmentNumber" INTEGER,
  ADD COLUMN "signedAt" TIMESTAMP(3),
  ADD COLUMN "terminationReason" TEXT,
  ADD COLUMN "notes" TEXT;

ALTER TABLE "SignatureRecipient"
  ADD COLUMN "tokenUsedAt" TIMESTAMP(3),
  ADD COLUMN "identityVerifiedAt" TIMESTAMP(3),
  ADD COLUMN "verificationMethod" TEXT;

ALTER TABLE "SignatureEvidence"
  ADD COLUMN "timezone" TEXT,
  ADD COLUMN "authenticationMethod" TEXT,
  ADD COLUMN "verificationStatus" TEXT NOT NULL DEFAULT 'UNVERIFIED',
  ADD COLUMN "requestTokenId" TEXT,
  ADD COLUMN "requestExpiresAt" TIMESTAMP(3),
  ADD COLUMN "eventSequence" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "previousEventHash" TEXT,
  ADD COLUMN "eventHash" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "completionStatus" TEXT NOT NULL DEFAULT 'COMPLETED',
  ADD COLUMN "auditMetadata" JSONB;

ALTER TABLE "PlatformOutboundEmail"
  ADD COLUMN "idempotencyKey" TEXT,
  ADD COLUMN "attemptCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "lastAttemptAt" TIMESTAMP(3),
  ADD COLUMN "nextRetryAt" TIMESTAMP(3);

CREATE TABLE "SignatureEvent" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "signatureRequestId" TEXT NOT NULL,
  "recipientId" TEXT,
  "eventType" TEXT NOT NULL,
  "eventSequence" INTEGER NOT NULL,
  "previousEventHash" TEXT,
  "eventHash" TEXT NOT NULL,
  "ipAddress" TEXT,
  "userAgent" TEXT,
  "authenticationMethod" TEXT,
  "verificationStatus" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SignatureEvent_pkey" PRIMARY KEY ("id")
);

UPDATE "PlatformOutboundEmail"
SET "idempotencyKey" = "id"
WHERE "idempotencyKey" IS NULL;

ALTER TABLE "PlatformOutboundEmail"
  ALTER COLUMN "idempotencyKey" SET NOT NULL;

CREATE UNIQUE INDEX "PlatformOutboundEmail_idempotencyKey_key"
  ON "PlatformOutboundEmail"("idempotencyKey");
CREATE INDEX "PlatformOutboundEmail_status_nextRetryAt_idx"
  ON "PlatformOutboundEmail"("status", "nextRetryAt");

CREATE INDEX "Contract_relatedLeadId_status_idx"
  ON "Contract"("relatedLeadId", "status");
CREATE INDEX "Contract_internalLegalOwnerId_status_idx"
  ON "Contract"("internalLegalOwnerId", "status");
CREATE INDEX "Contract_parentContractId_amendmentNumber_idx"
  ON "Contract"("parentContractId", "amendmentNumber");
CREATE INDEX "Contract_signedAt_status_idx"
  ON "Contract"("signedAt", "status");
CREATE INDEX "SignatureRequest_signedDocumentId_idx"
  ON "SignatureRequest"("signedDocumentId");
CREATE INDEX "SignatureRequest_evidenceDocumentId_idx"
  ON "SignatureRequest"("evidenceDocumentId");
CREATE INDEX "SignatureEvidence_eventHash_idx"
  ON "SignatureEvidence"("eventHash");
CREATE UNIQUE INDEX "SignatureEvent_signatureRequestId_eventSequence_key"
  ON "SignatureEvent"("signatureRequestId", "eventSequence");
CREATE INDEX "SignatureEvent_recipientId_createdAt_idx"
  ON "SignatureEvent"("recipientId", "createdAt");
CREATE INDEX "SignatureEvent_eventHash_idx"
  ON "SignatureEvent"("eventHash");

ALTER TABLE "Contract"
  ADD CONSTRAINT "Contract_relatedLeadId_fkey"
  FOREIGN KEY ("relatedLeadId") REFERENCES "Lead"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Contract"
  ADD CONSTRAINT "Contract_ownerPlatformUserId_fkey"
  FOREIGN KEY ("ownerPlatformUserId") REFERENCES "PlatformUser"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Contract"
  ADD CONSTRAINT "Contract_internalLegalOwnerId_fkey"
  FOREIGN KEY ("internalLegalOwnerId") REFERENCES "PlatformUser"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Contract"
  ADD CONSTRAINT "Contract_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "PlatformUser"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Contract"
  ADD CONSTRAINT "Contract_updatedById_fkey"
  FOREIGN KEY ("updatedById") REFERENCES "PlatformUser"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Contract"
  ADD CONSTRAINT "Contract_parentContractId_fkey"
  FOREIGN KEY ("parentContractId") REFERENCES "Contract"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SignatureRequest"
  ADD CONSTRAINT "SignatureRequest_signedDocumentId_fkey"
  FOREIGN KEY ("signedDocumentId") REFERENCES "ContractDocument"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SignatureEvent"
  ADD CONSTRAINT "SignatureEvent_signatureRequestId_fkey"
  FOREIGN KEY ("signatureRequestId") REFERENCES "SignatureRequest"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SignatureEvent"
  ADD CONSTRAINT "SignatureEvent_recipientId_fkey"
  FOREIGN KEY ("recipientId") REFERENCES "SignatureRecipient"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SignatureRequest"
  ADD CONSTRAINT "SignatureRequest_evidenceDocumentId_fkey"
  FOREIGN KEY ("evidenceDocumentId") REFERENCES "ContractDocument"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
