-- Phase 2 extends the preserved Partner and Contract architecture additively.
-- Existing records, signed versions, signature evidence, and historical attribution remain intact.

CREATE TYPE "PartnerAccountStatus" AS ENUM ('NOT_PROVISIONED', 'INVITED', 'ACTIVE', 'SUSPENDED', 'DISABLED');
CREATE TYPE "PartnerReferralLinkStatus" AS ENUM ('ACTIVE', 'DISABLED', 'EXPIRED', 'REGENERATED');
CREATE TYPE "LeadAttributionStatus" AS ENUM ('DIRECT', 'ATTRIBUTED', 'INVALID_CODE', 'INACTIVE_PARTNER', 'EXPIRED_LINK', 'DISABLED_LINK', 'CORRECTED');
CREATE TYPE "ContractSigningMode" AS ENUM ('SEQUENTIAL', 'PARALLEL', 'MIXED');
CREATE TYPE "ContractPartyType" AS ENUM ('PLATFORM', 'PARTNER', 'CUSTOMER', 'LEAD', 'TENANT', 'INDIVIDUAL', 'EXTERNAL_ORGANIZATION');
CREATE TYPE "ContractPartyRole" AS ENUM ('PROVIDER', 'PARTNER', 'CUSTOMER', 'CLIENT', 'REFERRER', 'AUTHORIZED_SIGNATORY', 'WITNESS', 'GUARANTOR', 'OTHER');
CREATE TYPE "ContractFieldType" AS ENUM ('TEXT', 'TEXTAREA', 'DATE', 'NUMBER', 'CURRENCY', 'PERCENTAGE', 'DROPDOWN', 'CHECKBOX', 'EMAIL', 'PHONE', 'ADDRESS', 'LOOKUP', 'SIGNATURE', 'INITIALS');

ALTER TYPE "PartnerStatus" ADD VALUE IF NOT EXISTS 'INQUIRY';
ALTER TYPE "PartnerStatus" ADD VALUE IF NOT EXISTS 'MORE_INFORMATION_REQUIRED';
ALTER TYPE "PartnerStatus" ADD VALUE IF NOT EXISTS 'APPROVED_AWAITING_AGREEMENT';
ALTER TYPE "PartnerStatus" ADD VALUE IF NOT EXISTS 'AGREEMENT_IN_PROGRESS';
ALTER TYPE "PartnerStatus" ADD VALUE IF NOT EXISTS 'AGREEMENT_EXECUTED';
ALTER TYPE "PartnerStatus" ADD VALUE IF NOT EXISTS 'ONBOARDING_PENDING';
ALTER TYPE "PartnerStatus" ADD VALUE IF NOT EXISTS 'INACTIVE';

ALTER TYPE "ContractType" ADD VALUE IF NOT EXISTS 'MASTER_PARTNER_AGREEMENT';
ALTER TYPE "ContractType" ADD VALUE IF NOT EXISTS 'COMMISSION_ADDENDUM';
ALTER TYPE "ContractType" ADD VALUE IF NOT EXISTS 'TERRITORY_ADDENDUM';
ALTER TYPE "ContractType" ADD VALUE IF NOT EXISTS 'REFERRAL_ADDENDUM';
ALTER TYPE "ContractType" ADD VALUE IF NOT EXISTS 'MASTER_SERVICES_AGREEMENT';
ALTER TYPE "ContractType" ADD VALUE IF NOT EXISTS 'SUBSCRIPTION_AGREEMENT';
ALTER TYPE "ContractType" ADD VALUE IF NOT EXISTS 'DATA_PROCESSING_AGREEMENT';
ALTER TYPE "ContractType" ADD VALUE IF NOT EXISTS 'SLA';
ALTER TYPE "ContractType" ADD VALUE IF NOT EXISTS 'STATEMENT_OF_WORK';
ALTER TYPE "ContractType" ADD VALUE IF NOT EXISTS 'AMENDMENT';
ALTER TYPE "ContractType" ADD VALUE IF NOT EXISTS 'RENEWAL';
ALTER TYPE "ContractType" ADD VALUE IF NOT EXISTS 'TERMINATION';

ALTER TYPE "ContractStatus" ADD VALUE IF NOT EXISTS 'APPROVED_FOR_SENDING';
ALTER TYPE "ContractStatus" ADD VALUE IF NOT EXISTS 'SENT';
ALTER TYPE "ContractStatus" ADD VALUE IF NOT EXISTS 'VIEWED';
ALTER TYPE "ContractStatus" ADD VALUE IF NOT EXISTS 'FULLY_EXECUTED';
ALTER TYPE "ContractStatus" ADD VALUE IF NOT EXISTS 'DECLINED';
ALTER TYPE "ContractStatus" ADD VALUE IF NOT EXISTS 'VOIDED';
ALTER TYPE "ContractStatus" ADD VALUE IF NOT EXISTS 'SUPERSEDED';

ALTER TABLE "Partner" ADD COLUMN "legalName" TEXT;
ALTER TABLE "Partner" ADD COLUMN "accountStatus" "PartnerAccountStatus" NOT NULL DEFAULT 'NOT_PROVISIONED';
ALTER TABLE "Partner" ADD COLUMN "applicationSnapshot" JSONB;
ALTER TABLE "Partner" ADD COLUMN "applicationSubmittedAt" TIMESTAMP(3);
ALTER TABLE "Partner" ADD COLUMN "applicationSource" TEXT;

ALTER TABLE "PartnerInquiry" ADD COLUMN "submissionHash" TEXT;
ALTER TABLE "PartnerInquiry" ADD COLUMN "originalSubmission" JSONB;
ALTER TABLE "PartnerInquiry" ADD COLUMN "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "PartnerInquiry" ADD COLUMN "lastRetryAt" TIMESTAMP(3);
UPDATE "PartnerInquiry"
SET "originalSubmission" = jsonb_build_object(
  'type', "type", 'companyName', "companyName", 'contactFirstName', "contactFirstName",
  'contactLastName', "contactLastName", 'email', "email", 'phone', "phone",
  'country', "country", 'website', "website", 'message', "message", 'source', "source",
  'consentAcceptedAt', "consentAcceptedAt"
)
WHERE "originalSubmission" IS NULL;
ALTER TABLE "PartnerInquiry" ALTER COLUMN "originalSubmission" SET NOT NULL;
CREATE UNIQUE INDEX "PartnerInquiry_submissionHash_key" ON "PartnerInquiry"("submissionHash");
CREATE INDEX "PartnerInquiry_submittedAt_idx" ON "PartnerInquiry"("submittedAt");

-- Consolidate preserved inquiry rows into the canonical Partner lifecycle without deleting snapshots.
INSERT INTO "Partner" (
  "id", "code", "type", "displayName", "companyName", "contactFirstName", "contactLastName",
  "email", "phone", "country", "website", "defaultCommissionRate", "currencyCode", "status",
  "accountStatus", "applicationSnapshot", "applicationSubmittedAt", "applicationSource", "createdAt", "updatedAt"
)
SELECT
  i."id",
  'DP-P-' || upper(substr(replace(i."id", '-', ''), 1, 10)),
  i."type",
  COALESCE(NULLIF(i."companyName", ''), trim(i."contactFirstName" || ' ' || i."contactLastName")),
  i."companyName", i."contactFirstName", i."contactLastName", lower(i."email"), i."phone", i."country", i."website",
  0, 'USD', 'INQUIRY', 'NOT_PROVISIONED', i."originalSubmission", i."submittedAt", COALESCE(i."source", 'public-website'),
  i."createdAt", i."updatedAt"
FROM "PartnerInquiry" i
WHERE i."partnerId" IS NULL
ON CONFLICT ("id") DO NOTHING;
UPDATE "PartnerInquiry" SET "partnerId" = "id" WHERE "partnerId" IS NULL;
UPDATE "Partner" p SET
  "applicationSnapshot" = COALESCE(p."applicationSnapshot", i."originalSubmission"),
  "applicationSubmittedAt" = COALESCE(p."applicationSubmittedAt", i."submittedAt"),
  "applicationSource" = COALESCE(p."applicationSource", i."source")
FROM "PartnerInquiry" i
WHERE i."partnerId" = p."id";

CREATE TABLE "PartnerReferralLink" (
  "id" TEXT NOT NULL,
  "partnerId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "targetPath" TEXT NOT NULL DEFAULT '/request-demo',
  "campaignName" TEXT,
  "isDefault" BOOLEAN NOT NULL DEFAULT false,
  "status" "PartnerReferralLinkStatus" NOT NULL DEFAULT 'ACTIVE',
  "expiresAt" TIMESTAMP(3),
  "createdById" TEXT,
  "lastUsedAt" TIMESTAMP(3),
  "submissionCount" INTEGER NOT NULL DEFAULT 0,
  "replacedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PartnerReferralLink_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PartnerReferralLink_code_key" ON "PartnerReferralLink"("code");
CREATE INDEX "PartnerReferralLink_partnerId_status_idx" ON "PartnerReferralLink"("partnerId", "status");
CREATE INDEX "PartnerReferralLink_partnerId_isDefault_idx" ON "PartnerReferralLink"("partnerId", "isDefault");
CREATE INDEX "PartnerReferralLink_expiresAt_status_idx" ON "PartnerReferralLink"("expiresAt", "status");
ALTER TABLE "PartnerReferralLink" ADD CONSTRAINT "PartnerReferralLink_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PartnerReferralLink" ADD CONSTRAINT "PartnerReferralLink_replacedById_fkey" FOREIGN KEY ("replacedById") REFERENCES "PartnerReferralLink"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "PartnerReferralLink" ("id", "partnerId", "name", "code", "targetPath", "isDefault", "status", "createdAt", "updatedAt")
SELECT
  md5(p."id" || ':default-referral'), p."id", 'Default referral link',
  'DP-P-' || upper(substr(md5(p."id" || ':referral-code'), 1, 10)), '/request-demo', true, 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Partner" p
WHERE p."status" IN ('ACTIVE', 'FULLY_SIGNED', 'APPROVED_FOR_ACTIVATION')
ON CONFLICT ("code") DO NOTHING;

ALTER TABLE "Lead" ADD COLUMN "partnerReferralLinkId" TEXT;
ALTER TABLE "Lead" ADD COLUMN "referralCodeSnapshot" TEXT;
ALTER TABLE "Lead" ADD COLUMN "referralSource" TEXT;
ALTER TABLE "Lead" ADD COLUMN "referredAt" TIMESTAMP(3);
ALTER TABLE "Lead" ADD COLUMN "attributionStatus" "LeadAttributionStatus" NOT NULL DEFAULT 'DIRECT';
UPDATE "Lead" l SET
  "partnerReferralLinkId" = r."id", "referralCodeSnapshot" = r."code", "referralSource" = 'legacy-partner-attribution',
  "referredAt" = l."createdAt", "attributionStatus" = 'ATTRIBUTED'
FROM "PartnerReferralLink" r
WHERE l."partnerId" = r."partnerId" AND r."isDefault" = true AND l."partnerId" IS NOT NULL;
CREATE INDEX "Lead_partnerReferralLinkId_idx" ON "Lead"("partnerReferralLinkId");
CREATE INDEX "Lead_attributionStatus_referredAt_idx" ON "Lead"("attributionStatus", "referredAt");
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_partnerReferralLinkId_fkey" FOREIGN KEY ("partnerReferralLinkId") REFERENCES "PartnerReferralLink"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "LeadAttributionCorrection" (
  "id" TEXT NOT NULL, "leadId" TEXT NOT NULL, "previousPartnerId" TEXT, "correctedPartnerId" TEXT,
  "previousReferralLinkId" TEXT, "correctedReferralLinkId" TEXT, "previousReferralCode" TEXT,
  "correctedReferralCode" TEXT, "reason" TEXT NOT NULL, "changedById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LeadAttributionCorrection_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "LeadAttributionCorrection_leadId_createdAt_idx" ON "LeadAttributionCorrection"("leadId", "createdAt");
CREATE INDEX "LeadAttributionCorrection_previousPartnerId_idx" ON "LeadAttributionCorrection"("previousPartnerId");
CREATE INDEX "LeadAttributionCorrection_correctedPartnerId_idx" ON "LeadAttributionCorrection"("correctedPartnerId");
ALTER TABLE "LeadAttributionCorrection" ADD CONSTRAINT "LeadAttributionCorrection_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LeadAttributionCorrection" ADD CONSTRAINT "LeadAttributionCorrection_previousPartnerId_fkey" FOREIGN KEY ("previousPartnerId") REFERENCES "Partner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LeadAttributionCorrection" ADD CONSTRAINT "LeadAttributionCorrection_correctedPartnerId_fkey" FOREIGN KEY ("correctedPartnerId") REFERENCES "Partner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CustomerAccount" ADD COLUMN "originatingPartnerId" TEXT;
ALTER TABLE "CustomerAccount" ADD COLUMN "originatingReferralLinkId" TEXT;
ALTER TABLE "CustomerAccount" ADD COLUMN "referralCodeSnapshot" TEXT;
UPDATE "CustomerAccount" c SET
  "originatingPartnerId" = l."partnerId", "originatingReferralLinkId" = l."partnerReferralLinkId", "referralCodeSnapshot" = l."referralCodeSnapshot"
FROM "Lead" l WHERE c."leadId" = l."id";
CREATE INDEX "CustomerAccount_originatingPartnerId_idx" ON "CustomerAccount"("originatingPartnerId");
CREATE INDEX "CustomerAccount_originatingReferralLinkId_idx" ON "CustomerAccount"("originatingReferralLinkId");
ALTER TABLE "CustomerAccount" ADD CONSTRAINT "CustomerAccount_originatingPartnerId_fkey" FOREIGN KEY ("originatingPartnerId") REFERENCES "Partner"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CustomerAccount" ADD CONSTRAINT "CustomerAccount_originatingReferralLinkId_fkey" FOREIGN KEY ("originatingReferralLinkId") REFERENCES "PartnerReferralLink"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Tenant" ADD COLUMN "originatingPartnerId" TEXT;
ALTER TABLE "Tenant" ADD COLUMN "originatingLeadId" TEXT;
ALTER TABLE "Tenant" ADD COLUMN "originatingReferralLinkId" TEXT;
ALTER TABLE "Tenant" ADD COLUMN "referralCodeSnapshot" TEXT;
UPDATE "Tenant" t SET
  "originatingPartnerId" = c."originatingPartnerId", "originatingLeadId" = c."leadId",
  "originatingReferralLinkId" = c."originatingReferralLinkId", "referralCodeSnapshot" = c."referralCodeSnapshot"
FROM "CustomerAccount" c WHERE t."customerAccountId" = c."id";
CREATE INDEX "Tenant_originatingPartnerId_idx" ON "Tenant"("originatingPartnerId");
CREATE INDEX "Tenant_originatingLeadId_idx" ON "Tenant"("originatingLeadId");
CREATE INDEX "Tenant_originatingReferralLinkId_idx" ON "Tenant"("originatingReferralLinkId");
ALTER TABLE "Tenant" ADD CONSTRAINT "Tenant_originatingPartnerId_fkey" FOREIGN KEY ("originatingPartnerId") REFERENCES "Partner"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Tenant" ADD CONSTRAINT "Tenant_originatingLeadId_fkey" FOREIGN KEY ("originatingLeadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "PartnerTimeline" (
  "id" TEXT NOT NULL, "partnerId" TEXT NOT NULL, "eventType" TEXT NOT NULL, "actorType" TEXT NOT NULL,
  "actorId" TEXT, "message" TEXT NOT NULL, "metadata" JSONB, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PartnerTimeline_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "PartnerTimeline_partnerId_createdAt_idx" ON "PartnerTimeline"("partnerId", "createdAt");
ALTER TABLE "PartnerTimeline" ADD CONSTRAINT "PartnerTimeline_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ContractTemplate" ADD COLUMN "documentMode" "ContractDocumentSource" NOT NULL DEFAULT 'EDITOR';
ALTER TABLE "ContractTemplate" ADD COLUMN "signingMode" "ContractSigningMode" NOT NULL DEFAULT 'MIXED';
ALTER TABLE "ContractTemplate" ADD COLUMN "lifecycleGatePurpose" TEXT;
ALTER TABLE "ContractTemplateVersion" ADD COLUMN "fieldDefinitions" JSONB;
ALTER TABLE "ContractTemplateVersion" ADD COLUMN "partyDefinitions" JSONB;
ALTER TABLE "ContractTemplateVersion" ADD COLUMN "signingConfig" JSONB;
ALTER TABLE "ContractTemplateVersion" ADD COLUMN "lifecycleGatePurpose" TEXT;
ALTER TABLE "ContractTemplateVersion" ADD COLUMN "sourceFileName" TEXT;
ALTER TABLE "ContractTemplateVersion" ADD COLUMN "sourceMimeType" TEXT;
ALTER TABLE "ContractTemplateVersion" ADD COLUMN "sourceStorageKey" TEXT;
ALTER TABLE "ContractTemplateVersion" ADD COLUMN "sourceSha256" TEXT;

ALTER TABLE "Contract" ADD COLUMN "lifecycleGatePurpose" TEXT;
ALTER TABLE "Contract" ADD COLUMN "isGoverningAgreement" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Contract" ADD COLUMN "signingMode" "ContractSigningMode" NOT NULL DEFAULT 'MIXED';
ALTER TABLE "Contract" ADD COLUMN "effectiveFrom" TIMESTAMP(3);
ALTER TABLE "Contract" ADD COLUMN "effectiveUntil" TIMESTAMP(3);
ALTER TABLE "Contract" ADD COLUMN "amendsContractId" TEXT;
ALTER TABLE "Contract" ADD COLUMN "renewsContractId" TEXT;
ALTER TABLE "Contract" ADD COLUMN "supersedesContractId" TEXT;
ALTER TABLE "Contract" ADD COLUMN "subscriptionId" TEXT;
UPDATE "Contract" SET "effectiveFrom" = "effectiveDate", "effectiveUntil" = "expiryDate";
CREATE INDEX "Contract_amendsContractId_idx" ON "Contract"("amendsContractId");
CREATE INDEX "Contract_renewsContractId_idx" ON "Contract"("renewsContractId");
CREATE INDEX "Contract_supersedesContractId_idx" ON "Contract"("supersedesContractId");
CREATE INDEX "Contract_subscriptionId_idx" ON "Contract"("subscriptionId");
CREATE INDEX "Contract_lifecycleGatePurpose_status_idx" ON "Contract"("lifecycleGatePurpose", "status");
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_amendsContractId_fkey" FOREIGN KEY ("amendsContractId") REFERENCES "Contract"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_renewsContractId_fkey" FOREIGN KEY ("renewsContractId") REFERENCES "Contract"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_supersedesContractId_fkey" FOREIGN KEY ("supersedesContractId") REFERENCES "Contract"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ContractVersion" ADD COLUMN "frozenMergeValues" JSONB;
ALTER TABLE "ContractVersion" ADD COLUMN "renderedAt" TIMESTAMP(3);

CREATE TABLE "ContractRelatedRecord" (
  "id" TEXT NOT NULL, "contractId" TEXT NOT NULL, "entityType" TEXT NOT NULL, "entityId" TEXT NOT NULL,
  "relationshipType" TEXT NOT NULL DEFAULT 'RELATED', "metadata" JSONB, "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ContractRelatedRecord_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ContractRelatedRecord_contract_entity_relation_key" ON "ContractRelatedRecord"("contractId", "entityType", "entityId", "relationshipType");
CREATE INDEX "ContractRelatedRecord_entityType_entityId_idx" ON "ContractRelatedRecord"("entityType", "entityId");
ALTER TABLE "ContractRelatedRecord" ADD CONSTRAINT "ContractRelatedRecord_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
INSERT INTO "ContractRelatedRecord" ("id", "contractId", "entityType", "entityId", "relationshipType")
SELECT md5("id" || ':partner'), "id", 'Partner', "partnerId", 'PRIMARY' FROM "Contract" WHERE "partnerId" IS NOT NULL
UNION ALL SELECT md5("id" || ':customer'), "id", 'CustomerAccount', "customerAccountId", 'PRIMARY' FROM "Contract" WHERE "customerAccountId" IS NOT NULL
UNION ALL SELECT md5("id" || ':lead'), "id", 'Lead', "relatedLeadId", 'RELATED' FROM "Contract" WHERE "relatedLeadId" IS NOT NULL
UNION ALL SELECT md5("id" || ':tenant'), "id", 'Tenant', "tenantId", 'RELATED' FROM "Contract" WHERE "tenantId" IS NOT NULL
ON CONFLICT DO NOTHING;

CREATE TABLE "ContractParty" (
  "id" TEXT NOT NULL, "contractId" TEXT NOT NULL, "partyType" "ContractPartyType" NOT NULL,
  "role" "ContractPartyRole" NOT NULL, "name" TEXT NOT NULL, "legalName" TEXT, "email" TEXT, "phone" TEXT,
  "organizationId" TEXT, "isPrimary" BOOLEAN NOT NULL DEFAULT false, "status" TEXT NOT NULL DEFAULT 'PENDING',
  "signingOrder" INTEGER NOT NULL DEFAULT 1, "metadata" JSONB, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "ContractParty_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ContractParty_contractId_signingOrder_idx" ON "ContractParty"("contractId", "signingOrder");
CREATE INDEX "ContractParty_contractId_partyType_role_idx" ON "ContractParty"("contractId", "partyType", "role");
ALTER TABLE "ContractParty" ADD CONSTRAINT "ContractParty_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
INSERT INTO "ContractParty" ("id", "contractId", "partyType", "role", "name", "isPrimary", "status", "signingOrder", "createdAt", "updatedAt")
SELECT md5("id" || ':platform-party'), "id", 'PLATFORM', 'PROVIDER', 'DijiPeople', true, 'PENDING', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP FROM "Contract"
UNION ALL
SELECT md5("id" || ':counterparty'), "id",
  CASE WHEN "partnerId" IS NOT NULL THEN 'PARTNER'::"ContractPartyType"
       WHEN "customerAccountId" IS NOT NULL THEN 'CUSTOMER'::"ContractPartyType"
       WHEN "relatedLeadId" IS NOT NULL THEN 'LEAD'::"ContractPartyType"
       WHEN "tenantId" IS NOT NULL THEN 'TENANT'::"ContractPartyType"
       ELSE 'EXTERNAL_ORGANIZATION'::"ContractPartyType" END,
  CASE WHEN "partnerId" IS NOT NULL THEN 'PARTNER'::"ContractPartyRole" ELSE 'CUSTOMER'::"ContractPartyRole" END,
  "counterpartyName", true, 'PENDING', 2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP FROM "Contract";

CREATE TABLE "ContractFieldPlacement" (
  "id" TEXT NOT NULL, "contractId" TEXT NOT NULL, "contractVersionId" TEXT NOT NULL, "partyId" TEXT,
  "recipientId" TEXT, "fieldKey" TEXT NOT NULL, "fieldType" "ContractFieldType" NOT NULL, "pageNumber" INTEGER NOT NULL,
  "x" DECIMAL(10,4) NOT NULL, "y" DECIMAL(10,4) NOT NULL, "width" DECIMAL(10,4) NOT NULL, "height" DECIMAL(10,4) NOT NULL,
  "isRequired" BOOLEAN NOT NULL DEFAULT true, "value" TEXT, "status" TEXT NOT NULL DEFAULT 'PENDING', "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ContractFieldPlacement_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ContractFieldPlacement_version_field_key" ON "ContractFieldPlacement"("contractVersionId", "fieldKey");
CREATE INDEX "ContractFieldPlacement_contractId_pageNumber_idx" ON "ContractFieldPlacement"("contractId", "pageNumber");
CREATE INDEX "ContractFieldPlacement_recipientId_idx" ON "ContractFieldPlacement"("recipientId");
CREATE INDEX "ContractFieldPlacement_partyId_idx" ON "ContractFieldPlacement"("partyId");
ALTER TABLE "ContractFieldPlacement" ADD CONSTRAINT "ContractFieldPlacement_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ContractFieldPlacement" ADD CONSTRAINT "ContractFieldPlacement_contractVersionId_fkey" FOREIGN KEY ("contractVersionId") REFERENCES "ContractVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "SignatureRequest" ADD COLUMN "signingMode" "ContractSigningMode" NOT NULL DEFAULT 'MIXED';
ALTER TABLE "SignatureRequest" ADD COLUMN "voidReason" TEXT;
ALTER TABLE "SignatureRecipient" ADD COLUMN "partyId" TEXT;
ALTER TABLE "SignatureRecipient" ADD COLUMN "isRequired" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "SignatureRecipient" ADD COLUMN "tokenRevokedAt" TIMESTAMP(3);
CREATE INDEX "SignatureRecipient_partyId_status_idx" ON "SignatureRecipient"("partyId", "status");
UPDATE "SignatureRecipient" r SET "partyId" = p."id"
FROM "SignatureRequest" s, "ContractParty" p
WHERE r."signatureRequestId" = s."id" AND p."contractId" = s."contractId"
  AND p."partyType" <> 'PLATFORM' AND r."partyId" IS NULL;
ALTER TABLE "SignatureRecipient" ADD CONSTRAINT "SignatureRecipient_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "ContractParty"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "SignatureEvidence" ADD COLUMN "consentVersion" TEXT NOT NULL DEFAULT '1';
ALTER TABLE "SignatureEvidence" ADD COLUMN "signerEmail" TEXT;
ALTER TABLE "SignatureEvidence" ADD COLUMN "signerRole" TEXT;
ALTER TABLE "SignatureEvidence" ADD COLUMN "partyId" TEXT;
ALTER TABLE "SignatureEvidence" ADD COLUMN "agreementVersion" INTEGER;
ALTER TABLE "SignatureEvidence" ADD COLUMN "localSignedAt" TEXT;
