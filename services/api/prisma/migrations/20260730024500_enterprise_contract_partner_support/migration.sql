-- CreateEnum
CREATE TYPE "ContractType" AS ENUM ('PARTNER_AGREEMENT', 'CUSTOMER_AGREEMENT', 'NDA', 'SERVICE_AGREEMENT', 'ADDENDUM', 'OTHER');

-- CreateEnum
CREATE TYPE "ContractStatus" AS ENUM ('DRAFT', 'INTERNAL_REVIEW', 'COMMERCIAL_APPROVAL', 'LEGAL_APPROVAL', 'COUNTERPARTY_REVIEW', 'READY_FOR_SIGNATURE', 'SIGNATURE_IN_PROGRESS', 'PARTIALLY_SIGNED', 'FULLY_SIGNED', 'ACTIVE', 'EXPIRING', 'EXPIRED', 'TERMINATED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ContractVersionStatus" AS ENUM ('DRAFT', 'REVIEW', 'APPROVED', 'SENT_FOR_SIGNATURE', 'SIGNED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "ContractDocumentKind" AS ENUM ('GENERATED_PREVIEW', 'GENERATED_PDF', 'SOURCE_UPLOAD', 'SIGNED_ORIGINAL', 'SIGNED_COPY', 'EVIDENCE_BUNDLE');

-- CreateEnum
CREATE TYPE "ContractDocumentSource" AS ENUM ('EDITOR', 'TEMPLATE', 'UPLOAD', 'SIGNATURE');

-- CreateEnum
CREATE TYPE "PlatformApprovalStatus" AS ENUM ('DRAFT', 'PENDING', 'APPROVED', 'REJECTED', 'RETURNED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PlatformApprovalStepStatus" AS ENUM ('NOT_STARTED', 'PENDING', 'APPROVED', 'REJECTED', 'RETURNED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "SignatureRequestStatus" AS ENUM ('DRAFT', 'SENT', 'VIEWED', 'PARTIALLY_SIGNED', 'COMPLETED', 'DECLINED', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "SignatureRecipientStatus" AS ENUM ('PENDING', 'SENT', 'VIEWED', 'SIGNED', 'DECLINED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "SignatureMethod" AS ENUM ('TYPED', 'DRAWN', 'UPLOADED');

-- CreateEnum
CREATE TYPE "PartnerInquiryStatus" AS ENUM ('NEW', 'QUALIFYING', 'QUALIFIED', 'REJECTED', 'CONVERTED');

-- CreateEnum
CREATE TYPE "PartnerOnboardingStatus" AS ENUM ('INVITED', 'IN_PROGRESS', 'SUBMITTED', 'UNDER_REVIEW', 'CHANGES_REQUESTED', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "PartnerLeadReviewStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'CHANGES_REQUESTED', 'APPROVED', 'REJECTED', 'CONVERTED');

-- CreateEnum
CREATE TYPE "SupportCaseStatus" AS ENUM ('NEW', 'TRIAGED', 'ASSIGNED', 'INVESTIGATING', 'WAITING_ON_CUSTOMER', 'WAITING_ON_INTERNAL_TEAM', 'FIX_IN_PROGRESS', 'MONITORING', 'RESOLVED', 'CLOSED', 'REOPENED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SupportCasePriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "SupportCaseSeverity" AS ENUM ('S1_CRITICAL', 'S2_HIGH', 'S3_MEDIUM', 'S4_LOW');

-- CreateEnum
CREATE TYPE "SupportCaseChannel" AS ENUM ('WEB', 'EMAIL', 'PHONE', 'CHAT', 'MONITORING', 'INTERNAL');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "PartnerStatus" ADD VALUE 'NEW_INQUIRY';

ALTER TYPE "PartnerStatus" ADD VALUE 'QUALIFIED';

ALTER TYPE "PartnerStatus" ADD VALUE 'ONBOARDING_INVITED';

ALTER TYPE "PartnerStatus" ADD VALUE 'ONBOARDING_IN_PROGRESS';

ALTER TYPE "PartnerStatus" ADD VALUE 'SUBMITTED';

ALTER TYPE "PartnerStatus" ADD VALUE 'UNDER_REVIEW';

ALTER TYPE "PartnerStatus" ADD VALUE 'INFORMATION_APPROVED';

ALTER TYPE "PartnerStatus" ADD VALUE 'AGREEMENT_DRAFTING';

ALTER TYPE "PartnerStatus" ADD VALUE 'INTERNAL_APPROVAL';

ALTER TYPE "PartnerStatus" ADD VALUE 'AWAITING_SIGNATURE';

ALTER TYPE "PartnerStatus" ADD VALUE 'FULLY_SIGNED';

ALTER TYPE "PartnerStatus" ADD VALUE 'APPROVED_FOR_ACTIVATION';

ALTER TYPE "PartnerStatus" ADD VALUE 'REJECTED';

-- CreateTable
CREATE TABLE "ContractTemplate" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contractType" "ContractType" NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContractTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContractTemplateVersion" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "contentHtml" TEXT NOT NULL,
    "contentText" TEXT NOT NULL,
    "placeholders" JSONB,
    "changeSummary" TEXT,
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "publishedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContractTemplateVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contract" (
    "id" TEXT NOT NULL,
    "contractNumber" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "contractType" "ContractType" NOT NULL,
    "status" "ContractStatus" NOT NULL DEFAULT 'DRAFT',
    "templateId" TEXT,
    "partnerId" TEXT,
    "customerAccountId" TEXT,
    "tenantId" TEXT,
    "ownerPlatformUserId" TEXT,
    "counterpartyName" TEXT NOT NULL,
    "counterpartyEmail" TEXT,
    "currencyCode" TEXT,
    "contractValue" DECIMAL(14,2),
    "effectiveDate" TIMESTAMP(3),
    "expiryDate" TIMESTAMP(3),
    "renewalNoticeDays" INTEGER,
    "currentVersionNumber" INTEGER NOT NULL DEFAULT 0,
    "activatedAt" TIMESTAMP(3),
    "terminatedAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Contract_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContractVersion" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "templateVersionId" TEXT,
    "version" INTEGER NOT NULL,
    "status" "ContractVersionStatus" NOT NULL DEFAULT 'DRAFT',
    "title" TEXT NOT NULL,
    "contentHtml" TEXT NOT NULL,
    "contentText" TEXT NOT NULL,
    "sourceFileName" TEXT,
    "sourceMimeType" TEXT,
    "sourceStorageKey" TEXT,
    "contentSha256" TEXT NOT NULL,
    "changeSummary" TEXT,
    "lockedAt" TIMESTAMP(3),
    "signedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContractVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContractDocument" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "contractVersionId" TEXT,
    "kind" "ContractDocumentKind" NOT NULL,
    "source" "ContractDocumentSource" NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "isImmutable" BOOLEAN NOT NULL DEFAULT false,
    "uploadedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContractDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContractPlaceholderValue" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "source" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContractPlaceholderValue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformApprovalRequest" (
    "id" TEXT NOT NULL,
    "requestNumber" TEXT NOT NULL,
    "moduleKey" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "contractId" TEXT,
    "title" TEXT NOT NULL,
    "status" "PlatformApprovalStatus" NOT NULL DEFAULT 'DRAFT',
    "currentStepOrder" INTEGER,
    "submittedById" TEXT NOT NULL,
    "submittedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformApprovalRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformApprovalStep" (
    "id" TEXT NOT NULL,
    "approvalRequestId" TEXT NOT NULL,
    "stepOrder" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "approverType" TEXT NOT NULL,
    "approverId" TEXT,
    "status" "PlatformApprovalStepStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "dueAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformApprovalStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformApprovalAction" (
    "id" TEXT NOT NULL,
    "approvalRequestId" TEXT NOT NULL,
    "approvalStepId" TEXT,
    "actorUserId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "comment" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlatformApprovalAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SignatureRequest" (
    "id" TEXT NOT NULL,
    "requestNumber" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "contractVersionId" TEXT NOT NULL,
    "status" "SignatureRequestStatus" NOT NULL DEFAULT 'DRAFT',
    "subject" TEXT NOT NULL,
    "message" TEXT,
    "expiresAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "signedDocumentId" TEXT,
    "evidenceDocumentId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SignatureRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SignatureRecipient" (
    "id" TEXT NOT NULL,
    "signatureRequestId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "signingOrder" INTEGER NOT NULL DEFAULT 1,
    "status" "SignatureRecipientStatus" NOT NULL DEFAULT 'PENDING',
    "accessTokenHash" TEXT NOT NULL,
    "tokenExpiresAt" TIMESTAMP(3) NOT NULL,
    "viewedAt" TIMESTAMP(3),
    "signedAt" TIMESTAMP(3),
    "declinedAt" TIMESTAMP(3),
    "declineReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SignatureRecipient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SignatureEvidence" (
    "id" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "method" "SignatureMethod" NOT NULL,
    "typedName" TEXT,
    "signatureStorageKey" TEXT,
    "signatureSha256" TEXT NOT NULL,
    "consentText" TEXT NOT NULL,
    "consentAcceptedAt" TIMESTAMP(3) NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "sessionId" TEXT,
    "documentSha256" TEXT NOT NULL,
    "signedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SignatureEvidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContractTimeline" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "actorType" TEXT NOT NULL,
    "actorId" TEXT,
    "message" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContractTimeline_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartnerInquiry" (
    "id" TEXT NOT NULL,
    "referenceNumber" TEXT NOT NULL,
    "status" "PartnerInquiryStatus" NOT NULL DEFAULT 'NEW',
    "partnerId" TEXT,
    "type" "PartnerType" NOT NULL,
    "companyName" TEXT,
    "contactFirstName" TEXT NOT NULL,
    "contactLastName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "country" TEXT,
    "website" TEXT,
    "message" TEXT,
    "consentAcceptedAt" TIMESTAMP(3) NOT NULL,
    "source" TEXT,
    "assignedToUserId" TEXT,
    "qualificationNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PartnerInquiry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartnerOnboardingApplication" (
    "id" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "status" "PartnerOnboardingStatus" NOT NULL DEFAULT 'INVITED',
    "invitationTokenHash" TEXT NOT NULL,
    "tokenExpiresAt" TIMESTAMP(3) NOT NULL,
    "submittedAt" TIMESTAMP(3),
    "reviewedAt" TIMESTAMP(3),
    "reviewedById" TEXT,
    "reviewNotes" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PartnerOnboardingApplication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartnerOnboardingSubmission" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "data" JSONB NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL,
    "submittedFromIp" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PartnerOnboardingSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartnerPortalUser" (
    "id" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'INVITED',
    "invitationTokenHash" TEXT,
    "invitationExpiresAt" TIMESTAMP(3),
    "activatedAt" TIMESTAMP(3),
    "lastActiveAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PartnerPortalUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartnerLeadReview" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "status" "PartnerLeadReviewStatus" NOT NULL DEFAULT 'DRAFT',
    "lockedAt" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3),
    "reviewedAt" TIMESTAMP(3),
    "reviewedById" TEXT,
    "reviewerNotes" TEXT,
    "rejectionReason" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PartnerLeadReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupportCase" (
    "id" TEXT NOT NULL,
    "caseNumber" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" "SupportCaseStatus" NOT NULL DEFAULT 'NEW',
    "priority" "SupportCasePriority" NOT NULL DEFAULT 'NORMAL',
    "severity" "SupportCaseSeverity" NOT NULL DEFAULT 'S3_MEDIUM',
    "channel" "SupportCaseChannel" NOT NULL DEFAULT 'INTERNAL',
    "customerAccountId" TEXT,
    "tenantId" TEXT,
    "requesterName" TEXT,
    "requesterEmail" TEXT,
    "requesterUserId" TEXT,
    "assignedToUserId" TEXT,
    "assignedTeam" TEXT,
    "firstResponseDueAt" TIMESTAMP(3),
    "resolutionDueAt" TIMESTAMP(3),
    "firstRespondedAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "resolutionSummary" TEXT,
    "rootCause" TEXT,
    "customerUpdate" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupportCase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupportCaseTimeline" (
    "id" TEXT NOT NULL,
    "supportCaseId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "actorType" TEXT NOT NULL,
    "actorId" TEXT,
    "message" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupportCaseTimeline_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupportCaseCommunication" (
    "id" TEXT NOT NULL,
    "supportCaseId" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "channel" "SupportCaseChannel" NOT NULL,
    "recipientEmail" TEXT,
    "subject" TEXT,
    "body" TEXT NOT NULL,
    "deliveryStatus" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupportCaseCommunication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupportCaseIncident" (
    "id" TEXT NOT NULL,
    "supportCaseId" TEXT NOT NULL,
    "errorLogId" TEXT NOT NULL,
    "linkedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupportCaseIncident_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "ContractTemplateVersion" ADD CONSTRAINT "ContractTemplateVersion_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ContractTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ContractTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_customerAccountId_fkey" FOREIGN KEY ("customerAccountId") REFERENCES "CustomerAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractVersion" ADD CONSTRAINT "ContractVersion_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractVersion" ADD CONSTRAINT "ContractVersion_templateVersionId_fkey" FOREIGN KEY ("templateVersionId") REFERENCES "ContractTemplateVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractDocument" ADD CONSTRAINT "ContractDocument_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractDocument" ADD CONSTRAINT "ContractDocument_contractVersionId_fkey" FOREIGN KEY ("contractVersionId") REFERENCES "ContractVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractPlaceholderValue" ADD CONSTRAINT "ContractPlaceholderValue_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformApprovalRequest" ADD CONSTRAINT "PlatformApprovalRequest_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformApprovalStep" ADD CONSTRAINT "PlatformApprovalStep_approvalRequestId_fkey" FOREIGN KEY ("approvalRequestId") REFERENCES "PlatformApprovalRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformApprovalAction" ADD CONSTRAINT "PlatformApprovalAction_approvalRequestId_fkey" FOREIGN KEY ("approvalRequestId") REFERENCES "PlatformApprovalRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformApprovalAction" ADD CONSTRAINT "PlatformApprovalAction_approvalStepId_fkey" FOREIGN KEY ("approvalStepId") REFERENCES "PlatformApprovalStep"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SignatureRequest" ADD CONSTRAINT "SignatureRequest_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SignatureRequest" ADD CONSTRAINT "SignatureRequest_contractVersionId_fkey" FOREIGN KEY ("contractVersionId") REFERENCES "ContractVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SignatureRecipient" ADD CONSTRAINT "SignatureRecipient_signatureRequestId_fkey" FOREIGN KEY ("signatureRequestId") REFERENCES "SignatureRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SignatureEvidence" ADD CONSTRAINT "SignatureEvidence_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "SignatureRecipient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractTimeline" ADD CONSTRAINT "ContractTimeline_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerInquiry" ADD CONSTRAINT "PartnerInquiry_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerOnboardingApplication" ADD CONSTRAINT "PartnerOnboardingApplication_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerOnboardingSubmission" ADD CONSTRAINT "PartnerOnboardingSubmission_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "PartnerOnboardingApplication"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerPortalUser" ADD CONSTRAINT "PartnerPortalUser_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerLeadReview" ADD CONSTRAINT "PartnerLeadReview_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerLeadReview" ADD CONSTRAINT "PartnerLeadReview_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportCase" ADD CONSTRAINT "SupportCase_customerAccountId_fkey" FOREIGN KEY ("customerAccountId") REFERENCES "CustomerAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportCase" ADD CONSTRAINT "SupportCase_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportCaseTimeline" ADD CONSTRAINT "SupportCaseTimeline_supportCaseId_fkey" FOREIGN KEY ("supportCaseId") REFERENCES "SupportCase"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportCaseCommunication" ADD CONSTRAINT "SupportCaseCommunication_supportCaseId_fkey" FOREIGN KEY ("supportCaseId") REFERENCES "SupportCase"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportCaseIncident" ADD CONSTRAINT "SupportCaseIncident_supportCaseId_fkey" FOREIGN KEY ("supportCaseId") REFERENCES "SupportCase"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportCaseIncident" ADD CONSTRAINT "SupportCaseIncident_errorLogId_fkey" FOREIGN KEY ("errorLogId") REFERENCES "ErrorLog"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Legally significant signed versions, immutable documents, and signature evidence
-- are protected at the database layer as well as in the application service.
CREATE OR REPLACE FUNCTION prevent_locked_contract_version_change()
RETURNS trigger AS $$
BEGIN
  IF OLD."lockedAt" IS NOT NULL OR OLD."status" = 'SIGNED' THEN
    RAISE EXCEPTION 'Signed or locked contract versions are immutable';
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER contract_version_immutable
BEFORE UPDATE OR DELETE ON "ContractVersion"
FOR EACH ROW EXECUTE FUNCTION prevent_locked_contract_version_change();

CREATE OR REPLACE FUNCTION prevent_immutable_contract_document_change()
RETURNS trigger AS $$
BEGIN
  IF OLD."isImmutable" THEN
    RAISE EXCEPTION 'Immutable contract documents cannot be changed or deleted';
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER contract_document_immutable
BEFORE UPDATE OR DELETE ON "ContractDocument"
FOR EACH ROW EXECUTE FUNCTION prevent_immutable_contract_document_change();

CREATE OR REPLACE FUNCTION prevent_signature_evidence_change()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Signature evidence is immutable';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER signature_evidence_immutable
BEFORE UPDATE OR DELETE ON "SignatureEvidence"
FOR EACH ROW EXECUTE FUNCTION prevent_signature_evidence_change();
